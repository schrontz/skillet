// Teil von Skillet - Startbildschirm: "Was kochst du heute?"
// Vorschlag mit Grund (ohne KI, aus Kochbuch und Tagebuch), zwei weitere Ideen, die beiden Kacheln, zuletzt gekocht.
// Zahlen-Badges nur, wo etwas offen ist (wie in Nest): hier angefangene Notizen vom freien Kochen

let startVorschlaege = [];
let startVorschlagNr = 0;

function setzeKachel(bereich, info, zahl) {
  const infoEl = document.getElementById('kachel-info-' + bereich);
  if (infoEl && info !== undefined) infoEl.textContent = info;
  const zahlEl = document.getElementById('kachel-zahl-' + bereich);
  if (zahlEl) {
    zahlEl.textContent = zahl || '';
    zahlEl.style.display = zahl ? 'grid' : 'none';
  }
}

async function ladeKachelInfos() {
  document.getElementById('start-datum').textContent =
    new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const notizen = ladeFreiNotizen().length;
  setzeKachel('kochen',
    notizen ? `Frei kochen: ${notizen} ${notizen === 1 ? 'Notiz' : 'Notizen'} offen` : 'mit Rezept oder frei',
    notizen);

  try {
    await loadRecipes(); // lädt auch das Tagebuch
  } catch (e) {
    setzeKachel('recipes', '');
    return;
  }
  setzeKachel('recipes', allRecipesCache.length ? `${allRecipesCache.length} gespeichert` : 'Noch keine Rezepte');
  startVorschlaege = kochVorschlaege(allRecipesCache);
  startVorschlagNr = 0;
  renderStartVorschlag();
  renderZuletztGekocht();
}

function vorschlagMeta(r) {
  const teile = [];
  if (r.basis_portionen) teile.push(`${r.basis_portionen} Portionen`);
  const kcal = kcalProPortion(r);
  if (kcal !== null) teile.push(`${kcal} kcal`);
  const s = kochStatistik(r.id);
  if (s.anzahl) teile.push(`${s.anzahl}× gekocht`);
  return teile.join(' · ');
}

function renderStartVorschlag() {
  const box = document.getElementById('start-vorschlag');
  if (!startVorschlaege.length) {
    box.innerHTML = allRecipesCache.length
      ? ''
      : `<div class="vorschlag"><div class="vorschlag-meta">Noch keine Rezepte. Leg unter „Rezepte“ dein erstes an – oder koch einfach frei, daraus wird eins.</div></div>`;
    return;
  }
  const n = startVorschlaege.length;
  const haupt = startVorschlaege[startVorschlagNr % n];
  const weitere = [1, 2].map(i => startVorschlaege[(startVorschlagNr + i) % n]).filter((v, i, a) => n > i + 1 && v !== haupt);
  const r = haupt.rezept;
  box.innerHTML = `
    <div class="vorschlag">
      <span class="vorschlag-grund">${htmlSicher(haupt.grund)}</span>
      <button type="button" class="vorschlag-titel" onclick="oeffneRezept('${r.id}')">${htmlSicher(r.titel)}</button>
      <div class="vorschlag-meta">${htmlSicher(vorschlagMeta(r))}</div>
      <div class="vorschlag-knoepfe">
        <button type="button" class="btn-haupt nur-handy" onclick="kochenMitRezept('${r.id}')">Kochen</button>
        <button type="button" class="btn-umriss" onclick="vorschlagEinkauf('${r.id}')">🛒 Einkauf</button>
        ${n > 1 ? `<button type="button" class="ikon-knopf" onclick="andererVorschlag()" aria-label="Andere Idee" title="Andere Idee">↻</button>` : ''}
      </div>
    </div>
    ${weitere.length ? `
      <div class="gruppe-titel">Oder vielleicht</div>
      <div class="weitere">${weitere.map(v => `
        <button type="button" onclick="oeffneRezept('${v.rezept.id}')">${htmlSicher(v.rezept.titel)}<span>${htmlSicher(v.grund)}</span></button>`).join('')}
      </div>` : ''}`;
}

function andererVorschlag() {
  startVorschlagNr = (startVorschlagNr + 1) % Math.max(startVorschlaege.length, 1);
  renderStartVorschlag();
}

function vorschlagEinkauf(id) {
  oeffneRezept(id);
  zeigeKartenPanel(id, 'einkauf');
}

function renderZuletztGekocht() {
  const box = document.getElementById('start-zuletzt');
  const eintraege = (tagebuchCache || []).slice(0, 3);
  if (!eintraege.length) { box.innerHTML = ''; return; }
  box.innerHTML = `
    <div class="gruppe-titel">Zuletzt gekocht</div>
    <div class="zuletzt">${eintraege.map(e => {
      const r = e.recipe_id && allRecipesCache.find(x => x.id === e.recipe_id);
      const titel = r ? r.titel : e.titel;
      return `<button type="button" class="zuletzt-zeile"${r ? ` onclick="oeffneRezept('${r.id}')"` : ' disabled'}>
        <span>${htmlSicher(titel)}</span><small>${vorWann(e.gekocht_am)}${e.bewertung ? ' · ' + BEWERTUNG_ZEICHEN[e.bewertung] : ''}</small></button>`;
    }).join('')}</div>`;
}
