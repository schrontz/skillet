// Teil von Skillet - Nährwerte je Rezept (Reiter "Nährwerte" in der Rezept-Karte)
//
// Die Zahlen stammen aus dem Bundeslebensmittelschlüssel (BLS 4.0). Die Edge Function
// "naehrwerte" ordnet die Zutaten zu und schätzt Mengen wie "2 Zwiebeln"; das Ergebnis
// wird am Rezept gespeichert (recipes.naehrwerte). Ändern sich die Zutaten, passt der
// "Stand" nicht mehr und es wird beim nächsten Öffnen neu gerechnet.

const NW_FARBEN = { eiweiss: '#b5522f', kh: '#e0b25e', fett: '#6f8f5e' };
const laufendeNaehrwerte = {};

// Zutaten, wie sie gerechnet werden: strukturiert, sonst aus dem Freitext zerlegt
function naehrwertZutaten(r) {
  if (r.zutaten_strukturiert && r.zutaten_strukturiert.length > 0) {
    return r.zutaten_strukturiert.filter(z => z && z.name)
      .map(z => ({ menge: z.menge ?? null, einheit: z.einheit || null, name: z.name }));
  }
  return (r.zutaten || '').split('\n').map(z => z.trim()).filter(Boolean).map(zerlegeFreitextZutat);
}

// Kurzer Fingerabdruck der Zutaten - ändert er sich, sind die Nährwerte veraltet
function naehrwertStand(r) {
  const text = JSON.stringify(naehrwertZutaten(r).map(z =>
    [z.menge ?? null, (z.einheit || '').trim().toLowerCase(), (z.name || '').trim().toLowerCase()]));
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return 'v1-' + h.toString(36) + '-' + text.length;
}

function naehrwerteAktuell(r) {
  return !!(r && r.naehrwerte && r.naehrwerte.summe && r.naehrwerte.stand === naehrwertStand(r));
}

function kcalProPortion(r) {
  if (!naehrwerteAktuell(r) || !r.basis_portionen) return null;
  return Math.round(r.naehrwerte.summe.kcal / r.basis_portionen);
}

// Reiter geöffnet: anzeigen, oder rechnen, falls noch nichts (Aktuelles) da ist
function zeigeNaehrwerte(id) {
  const r = allRecipesCache.find(x => x.id === id);
  const el = document.getElementById(`naehrwerte-${id}`);
  if (!r || !el) return;
  if (naehrwertZutaten(r).length === 0) {
    el.innerHTML = `<div class="muted">Für dieses Rezept sind keine Zutaten gespeichert.</div>`;
    return;
  }
  if (naehrwerteAktuell(r)) renderNaehrwerte(id);
  else berechneNaehrwerte(id);
}

async function berechneNaehrwerte(id) {
  const r = allRecipesCache.find(x => x.id === id);
  const el = document.getElementById(`naehrwerte-${id}`);
  if (el) el.innerHTML = `
    <div class="nw-laden">
      <div class="nw-kreisel" aria-hidden="true"></div>
      <div>Nährwerte werden berechnet …</div>
      <div class="muted">Beim ersten Mal kann das bis zu 30 Sekunden dauern. Danach kennt Skillet die Zutaten.</div>
    </div>`;
  try {
    const ergebnis = await naehrwerteAnfragen(r);
    r.naehrwerte = ergebnis;
    renderRezeptListe();
    if (document.getElementById(`naehrwerte-${id}`)) renderNaehrwerte(id);
    aktualisiereKartenMeta(id);
  } catch (e) {
    const el2 = document.getElementById(`naehrwerte-${id}`);
    if (el2) el2.innerHTML = `
      <div class="muted" style="margin-bottom:0.5rem;">${htmlSicher(naehrwertFehlerText(e.message))}</div>
      <details class="nw-technik"><summary>Technische Details</summary><div>${htmlSicher(e.message)}</div></details>
      <button class="btn-umriss" onclick="berechneNaehrwerte('${id}')">Nochmal versuchen</button>`;
  }
}

// Verständliche Meldung statt Fehlercodes
function naehrwertFehlerText(meldung) {
  const m = String(meldung || '');
  if (/overloaded|UNAVAILABLE|\b503\b|high demand/i.test(m)) return 'Gemini ist gerade überlastet. Versuch es in ein paar Minuten nochmal.';
  if (/RESOURCE_EXHAUSTED|\b429\b|quota/i.test(m)) return 'Das Tageskontingent für Gemini ist gerade aufgebraucht. Versuch es später nochmal.';
  if (/PGRST205|schema cache|does not exist/i.test(m)) return 'Die Nährwert-Datenbank ist noch nicht eingerichtet.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung. Bist du online?';
  return 'Die Berechnung hat nicht geklappt.';
}

// Eine Anfrage je Rezept gleichzeitig - der Hintergrund-Lauf nach dem Speichern und
// ein schnell geöffneter Reiter teilen sich dieselbe
function naehrwerteAnfragen(r) {
  const stand = naehrwertStand(r);
  const laufend = laufendeNaehrwerte[r.id];
  if (laufend && laufend.stand === stand) return laufend.promise;
  const promise = (async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/naehrwerte`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: r.id, zutaten: naehrwertZutaten(r), stand })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  })();
  laufendeNaehrwerte[r.id] = { stand, promise };
  promise.finally(() => { if (laufendeNaehrwerte[r.id]?.promise === promise) delete laufendeNaehrwerte[r.id]; }).catch(() => {});
  return promise;
}

// Nach dem Speichern: still im Hintergrund rechnen, Liste danach auffrischen
function naehrwerteImHintergrund(rezept) {
  if (!rezept || !rezept.id || naehrwertZutaten(rezept).length === 0) return;
  naehrwerteAnfragen(rezept).then(ergebnis => {
    const r = allRecipesCache.find(x => x.id === rezept.id);
    if (r && naehrwertStand(r) === ergebnis.stand) {
      r.naehrwerte = ergebnis;
      renderRezeptListe();
      if (document.getElementById(`naehrwerte-${r.id}`)?.style.display === 'block') renderNaehrwerte(r.id);
      aktualisiereKartenMeta(r.id);
    }
  }).catch(() => { /* wird beim Öffnen des Reiters nochmal versucht */ });
}

function aktualisiereKartenMeta(id) {
  const metaEl = document.querySelector(`#recipe-detail-${id} .karte-meta`);
  const r = allRecipesCache.find(x => x.id === id);
  if (metaEl && r) metaEl.innerHTML = rezeptMetaHtml(r);
}

function nwZahl(x, stellen = 0) {
  const f = Math.pow(10, stellen);
  return String(Math.round(x * f) / f).replace('.', ',');
}

function renderNaehrwerte(id) {
  const r = allRecipesCache.find(x => x.id === id);
  const el = document.getElementById(`naehrwerte-${id}`);
  const nw = r.naehrwerte;
  const teiler = r.basis_portionen || 1;
  const p = {
    kcal: nw.summe.kcal / teiler, eiweiss: nw.summe.eiweiss / teiler,
    kh: nw.summe.kh / teiler, fett: nw.summe.fett / teiler
  };

  // Anteile an den Kalorien: Eiweiß und Kohlenhydrate 4 kcal/g, Fett 9 kcal/g
  const kE = p.eiweiss * 4, kK = p.kh * 4, kF = p.fett * 9, kSum = kE + kK + kF;
  let pE = 0, pK = 0, pF = 0;
  if (kSum > 0) {
    pE = Math.round(kE / kSum * 100); pF = Math.round(kF / kSum * 100); pK = 100 - pE - pF;
  }
  const kreis = kSum > 0
    ? `conic-gradient(${NW_FARBEN.eiweiss} 0 ${pE}%, ${NW_FARBEN.kh} ${pE}% ${pE + pK}%, ${NW_FARBEN.fett} ${pE + pK}% 100%)`
    : 'var(--linie)';

  const zeilen = nw.zutaten || [];
  const ok = zeilen.map((z, i) => ({ ...z, i })).filter(z => z.status === 'ok');
  const fehlt = zeilen.filter(z => z.status === 'nicht_gefunden' || z.status === 'unbekannt');
  const egal = zeilen.filter(z => z.status === 'vernachlaessigbar');
  const geschaetzt = ok.some(z => z.unsicher) || ok.some(z => z.annahme && z.quelle !== 'hand');

  el.innerHTML = `
    <div class="nw-oben">
      <div class="nw-kreis" style="background:${kreis}" role="img"
        aria-label="Eiweiß ${pE} %, Kohlenhydrate ${pK} %, Fett ${pF} % der Kalorien">
        <div class="nw-mitte"><b>${nwZahl(p.kcal)}</b><span>kcal</span></div>
      </div>
      <div class="nw-legende">
        <div><i style="background:${NW_FARBEN.eiweiss}"></i>Eiweiß<b>${nwZahl(p.eiweiss)} g</b><span>${pE} %</span></div>
        <div><i style="background:${NW_FARBEN.kh}"></i>Kohlenhydr.<b>${nwZahl(p.kh)} g</b><span>${pK} %</span></div>
        <div><i style="background:${NW_FARBEN.fett}"></i>Fett<b>${nwZahl(p.fett)} g</b><span>${pF} %</span></div>
      </div>
    </div>
    <div class="nw-unter">
      ${r.basis_portionen ? `Pro Portion (Rezept für ${r.basis_portionen}).` : 'Für das ganze Rezept – trag beim Bearbeiten Portionen ein, dann siehst du die Werte pro Portion.'}
      ${geschaetzt ? '<span class="nw-schaetzung">Mengen teils geschätzt</span>' : ''}
    </div>
    ${fehlt.length ? `<div class="nw-fehlt">Nicht gefunden, nicht mitgerechnet: ${fehlt.map(z => htmlSicher(z.name)).join(', ')}</div>` : ''}

    <details class="nw-details">
      <summary>Woher die Werte kommen <span class="muted">(ganzes Rezept)</span></summary>
      ${ok.map(z => `
        <div class="nw-zeile">
          <div class="nw-name">
            ${z.unsicher ? '<span class="nw-ca" title="geschätzt">≈</span> ' : ''}${htmlSicher(z.name)}
            <small>${htmlSicher(z.bls_name)}${z.annahme && z.quelle !== 'hand' ? ' · ' + htmlSicher(z.annahme) : ''}${z.quelle === 'hand' ? ' · von dir korrigiert' : ''}</small>
          </div>
          <div class="nw-werte">
            <span id="nw-gramm-${id}-${z.i}"><button type="button" class="menge-knopf" onclick="grammAendern('${id}', ${z.i})" aria-label="Gramm für ${htmlSicher(z.name)} ändern">${z.gramm} g</button></span>
            <small>${z.kcal} kcal</small>
          </div>
        </div>`).join('')}
      ${egal.length ? `<div class="nw-egal">Nicht mitgerechnet (kaum Kalorien): ${egal.map(z => htmlSicher(z.name)).join(', ')}</div>` : ''}
      <div class="nw-tipp">Stimmt eine Menge nicht? Tipp auf die Gramm. Skillet merkt sich das für diese Zutat.</div>
    </details>
    <div class="nw-quelle">Nährwerte: Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut. Richtwerte, keine exakte Messung.</div>
  `;
}

// Gramm einer Zutat von Hand korrigieren: Rezept neu summieren, Wissen für die Zukunft merken
function grammAendern(id, index) {
  const span = document.getElementById(`nw-gramm-${id}-${index}`);
  const r = allRecipesCache.find(x => x.id === id);
  const z = r.naehrwerte.zutaten[index];
  span.innerHTML = `<input type="number" step="any" inputmode="decimal" value="${z.gramm}" aria-label="Gramm"> g`;
  const input = span.querySelector('input');
  let fertig = false;
  const uebernehmen = async () => {
    if (fertig) return;
    fertig = true;
    const gramm = parseFloat(input.value);
    if (!(gramm >= 0) || gramm === z.gramm) { renderNaehrwerte(id); return; }
    await speichereGramm(r, index, gramm);
  };
  input.addEventListener('change', uebernehmen);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  input.addEventListener('blur', uebernehmen);
  input.focus();
  input.select();
}

async function speichereGramm(r, index, gramm) {
  const nw = r.naehrwerte;
  const z = nw.zutaten[index];
  const f = gramm / 100;
  const r1 = x => Math.round(x * 10) / 10;
  Object.assign(z, {
    gramm: Math.round(gramm), quelle: 'hand', unsicher: false,
    kcal: Math.round(z.je100.kcal * f), eiweiss: r1(z.je100.eiweiss * f), kh: r1(z.je100.kh * f), fett: r1(z.je100.fett * f)
  });
  const s = { kcal: 0, eiweiss: 0, kh: 0, fett: 0 };
  nw.zutaten.filter(x => x.status === 'ok').forEach(x => { s.kcal += x.kcal; s.eiweiss += x.eiweiss; s.kh += x.kh; s.fett += x.fett; });
  nw.summe = { kcal: Math.round(s.kcal), eiweiss: r1(s.eiweiss), kh: r1(s.kh), fett: r1(s.fett) };
  renderNaehrwerte(r.id);
  renderRezeptListe();
  aktualisiereKartenMeta(r.id);

  const kopf = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/recipes?id=eq.${r.id}`, {
      method: 'PATCH', headers: { ...kopf, Prefer: 'return=minimal' }, body: JSON.stringify({ naehrwerte: nw })
    });
    // Bei g/kg ist die Umrechnung fest - da gibt es nichts zu lernen
    const einheit = nwEinheitNorm(z.einheit);
    if (einheit !== 'g' && einheit !== 'kg') {
      await fetch(`${SUPABASE_URL}/rest/v1/zutat_wissen?on_conflict=name_norm,einheit_norm`, {
        method: 'POST',
        headers: { ...kopf, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          name_norm: z.name.toLowerCase().replace(/\s+/g, ' ').trim(), einheit_norm: einheit,
          bls_code: z.bls_code, gramm_pro_einheit: gramm / (z.menge || 1),
          annahme: null, unsicher: false, quelle: 'hand', aktualisiert_am: new Date().toISOString()
        })
      });
    }
  } catch (e) { /* Anzeige stimmt schon; beim nächsten Mal wird ggf. neu gerechnet */ }
}

// Gleiche Regeln wie in der Edge Function (logik.ts)
function nwEinheitNorm(einheit) {
  const e = (einheit || '').toLowerCase().replace(/[.()]/g, '').trim();
  const syn = {
    'stück': '', stueck: '', stk: '', st: '', gramm: 'g', gr: 'g', kilo: 'kg', kilogramm: 'kg',
    milliliter: 'ml', liter: 'l', 'esslöffel': 'el', 'teelöffel': 'tl', dosen: 'dose', 'gläser': 'glas',
    zehen: 'zehe', scheiben: 'scheibe', prisen: 'prise', packungen: 'packung', 'päckchen': 'packung', pck: 'packung'
  };
  return e in syn ? syn[e] : e;
}
