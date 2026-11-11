// Teil von Skillet - siehe index.html für die anderen Module (shared.js, recipes.js, reflect.js, progress-history.js, init.js)

  // Werte sicher in HTML-Attribute/Text schreiben (z. B. Zutaten mit Anführungszeichen)
  function htmlSicher(wert) {
    return String(wert ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function addZutatRow(menge = '', einheit = '', name = '') {
    const container = document.getElementById('zutaten-rows');
    const row = document.createElement('div');
    row.className = 'zutat-row';
    row.innerHTML = `
      <input type="number" step="any" placeholder="Menge" value="${htmlSicher(menge)}" class="zutat-menge">
      <input type="text" placeholder="Einheit" value="${htmlSicher(einheit)}" class="zutat-einheit" list="einheiten-liste" autocomplete="off">
      <input type="text" placeholder="Zutat" value="${htmlSicher(name)}" class="zutat-name">
      <button type="button" class="zeile-weg" onclick="this.parentElement.remove()" aria-label="Zutat entfernen">×</button>
    `;
    container.appendChild(row);
  }

  function clearZutatenRows() {
    document.getElementById('zutaten-rows').innerHTML = '';
  }

  function getZutatenFromForm() {
    return Array.from(document.querySelectorAll('#zutaten-rows .zutat-row')).map(row => {
      const menge = row.querySelector('.zutat-menge').value;
      const einheit = row.querySelector('.zutat-einheit').value.trim();
      const name = row.querySelector('.zutat-name').value.trim();
      return { menge: menge ? parseFloat(menge) : null, einheit: einheit || null, name };
    }).filter(z => z.name);
  }

  // ---- Dynamische Schritt-Zeilen (Pfeil-Buttons statt Drag-and-drop) ----
  function addSchrittRow(text = '') {
    const container = document.getElementById('schritte-rows');
    const row = document.createElement('div');
    row.className = 'schritt-row';
    row.innerHTML = `
      <span class="schritt-nr"></span>
      <textarea class="schritt-text" placeholder="Schritt beschreiben...">${htmlSicher(text)}</textarea>
      <div class="schritt-knoepfe">
        <button type="button" onclick="moveSchrittRow(this, -1)" aria-label="nach oben">↑</button>
        <button type="button" onclick="moveSchrittRow(this, 1)" aria-label="nach unten">↓</button>
        <button type="button" onclick="this.closest('.schritt-row').remove(); renumberSchritte();" aria-label="Schritt entfernen">×</button>
      </div>
    `;
    container.appendChild(row);
    renumberSchritte();
  }

  function clearSchritteRows() {
    document.getElementById('schritte-rows').innerHTML = '';
  }

  function renumberSchritte() {
    document.querySelectorAll('#schritte-rows .schritt-row .schritt-nr').forEach((el, i) => {
      el.textContent = (i + 1) + '.';
    });
  }

  function moveSchrittRow(btnEl, direction) {
    const row = btnEl.closest('.schritt-row');
    if (direction === -1 && row.previousElementSibling) {
      row.parentElement.insertBefore(row, row.previousElementSibling);
    } else if (direction === 1 && row.nextElementSibling) {
      row.parentElement.insertBefore(row.nextElementSibling, row);
    }
    renumberSchritte();
  }

  function getSchritteFromForm() {
    return Array.from(document.querySelectorAll('#schritte-rows .schritt-text'))
      .map(t => t.value.trim())
      .filter(Boolean);
  }


  // ---- Schwebende Karte (wie in Nest): Rezept ansehen ODER anlegen/bearbeiten ----
  // Eigener Eintrag im Browser-Verlauf, damit die Zurück-Taste die Karte schließt
  // statt die App zu verlassen. ✕ geht deshalb über history.back().
  let rezeptKarteModus = null; // 'detail' | 'formular' | null (zu)

  function rezeptKarteOffen() {
    return document.getElementById('rezept-ueberlagerung').style.display === 'block';
  }

  function zeigeRezeptKarte(modus, titel) {
    const ueber = document.getElementById('rezept-ueberlagerung');
    const warOffen = rezeptKarteOffen();
    rezeptKarteModus = modus;
    document.getElementById('rezept-karte-titel').textContent = titel;
    document.getElementById('rezept-karte-detail').style.display = modus === 'detail' ? 'block' : 'none';
    document.getElementById('rezept-add-form').style.display = modus === 'formular' ? 'block' : 'none';
    document.getElementById('kochen-auswahl').style.display = modus === 'kochen' ? 'block' : 'none';
    ueber.style.display = 'block';
    ueber.scrollTop = 0;
    document.body.classList.add('karte-offen');
    if (!warOffen) history.pushState({ skilletKarte: true }, '');
  }

  function versteckeRezeptKarte() {
    document.getElementById('rezept-ueberlagerung').style.display = 'none';
    document.getElementById('rezept-karte-detail').innerHTML = '';
    document.body.classList.remove('karte-offen');
    rezeptKarteModus = null;
  }

  function rezeptKarteZu() {
    if (!rezeptKarteOffen()) return;
    if (history.state && history.state.skilletKarte) history.back(); // popstate versteckt die Karte
    else versteckeRezeptKarte();
  }

  window.addEventListener('popstate', () => { if (rezeptKarteOffen()) versteckeRezeptKarte(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && rezeptKarteOffen()) rezeptKarteZu(); });

  // Formular in der Karte zeigen. Titel und Import-Feld richten sich danach,
  // ob neu angelegt oder ein bestehendes Rezept bearbeitet wird.
  function oeffneRezeptFormular() {
    const titel = editingOriginalId ? 'Rezept bearbeiten' : (editingCopyOf ? 'Als Kopie bearbeiten' : 'Neues Rezept');
    document.getElementById('rezept-import-block').style.display = (editingOriginalId || editingCopyOf) ? 'none' : 'block';
    zeigeRezeptKarte('formular', titel);
  }

  // Eingaben bleiben beim Schließen erhalten (wie früher beim Zuklappen)
  function schliesseRezeptFormular() {
    if (rezeptKarteModus === 'formular') rezeptKarteZu();
  }

  function oeffneNeuesRezept() {
    document.getElementById('recipe-status-line').textContent = '';
    document.getElementById('import-status-line').textContent = '';
    oeffneRezeptFormular();
  }

  // Bereich Rezepte öffnen und das Formular als Karte zeigen -
  // für Import, Freestyle, Diktat aus dem Kochmodus und Bearbeiten
  function zeigeRezeptFormular() {
    if (document.getElementById('view-recipes').style.display !== 'block') openSection('recipes');
    oeffneRezeptFormular();
  }

  // Kurzer Hinweis über der Liste, damit man sieht, dass das Speichern geklappt hat
  function zeigeGespeichertHinweis(titel) {
    const el = document.getElementById('detect-card');
    if (!el) return;
    el.innerHTML = `<div class="card muted gespeichert-hinweis">✅ „${htmlSicher(titel)}“ gespeichert.</div>`;
    clearTimeout(zeigeGespeichertHinweis.timer);
    zeigeGespeichertHinweis.timer = setTimeout(() => { el.innerHTML = ''; }, 5000);
  }

  // ---- Ganzes Rezept diktieren oder einfügen: Gemini sortiert in Titel, Zutaten, Schritte ----
  // Wird auch beim freien Kochen genutzt (kochmodus.js), dort mit den gesammelten Notizen.
  async function rezeptTextAuswerten(text) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-recipe-from-text`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function formularAusAuswertung(data) {
    document.getElementById('recipe-titel-input').value = data.titel || '';
    document.getElementById('recipe-portionen-input').value = data.basisPortionen || '';
    clearZutatenRows();
    (data.zutatenStrukturiert || []).forEach(z => addZutatRow(z.menge, z.einheit, z.name));
    if (document.querySelectorAll('#zutaten-rows .zutat-row').length === 0) addZutatRow();
    clearSchritteRows();
    (data.anleitungSchritte || []).forEach(s => addSchrittRow(s));
    if (document.querySelectorAll('#schritte-rows .schritt-row').length === 0) addSchrittRow();
  }

  async function rezeptAusDiktat() {
    const feld = document.getElementById('rezept-diktat-input');
    const text = feld.value.trim();
    if (!text) { feld.focus(); return; }
    const status = document.getElementById('rezept-diktat-status');
    const btn = document.getElementById('rezept-diktat-btn');
    btn.disabled = true;
    status.textContent = 'Rezept wird zusammengesetzt …';
    try {
      formularAusAuswertung(await rezeptTextAuswerten(text));
      feld.value = '';
      status.textContent = '';
      document.getElementById('recipe-status-line').textContent = 'Bitte prüfen, dann unten speichern.';
      document.getElementById('recipe-titel-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      status.textContent = 'Das hat nicht geklappt: ' + e.message;
    }
    btn.disabled = false;
  }

  // ---- Rezept von einer Webseite importieren ----
  let pendingImportUrl = null;

  async function importRecipeFromUrl() {
    const url = document.getElementById('import-url-input').value.trim();
    if (!url) return;

    const statusLine = document.getElementById('import-status-line');
    statusLine.textContent = "Importiere...";

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });
      const data = await res.json();

      if (data.error) {
        statusLine.textContent = "Fehler: " + data.error;
        return;
      }

      document.getElementById('recipe-titel-input').value = data.titel || "";
      document.getElementById('recipe-portionen-input').value = data.basisPortionen || "";

      clearZutatenRows();
      if (data.zutatenStrukturiert && data.zutatenStrukturiert.length > 0) {
        data.zutatenStrukturiert.forEach(z => addZutatRow(z.menge, z.einheit, z.name));
      } else if (data.zutaten) {
        // kein strukturiertes Ergebnis -> jede Zeile des Freitexts als Zutat ohne Menge übernehmen
        data.zutaten.split("\n").filter(Boolean).forEach(z => addZutatRow('', '', z.trim()));
      }
      if (document.querySelectorAll('#zutaten-rows .zutat-row').length === 0) addZutatRow();

      clearSchritteRows();
      if (data.anleitung) {
        // "1. ...", "2. ..." am Zeilenanfang abtrennen, falls vorhanden
        data.anleitung.split("\n").filter(Boolean).forEach(zeile => {
          addSchrittRow(zeile.replace(/^\d+\.\s*/, '').trim());
        });
      }
      if (document.querySelectorAll('#schritte-rows .schritt-row').length === 0) addSchrittRow();

      pendingImportUrl = url;

      const quelle = data.source === "structured" ? "strukturierte Daten" : "KI-Extraktion";
      statusLine.textContent = `Importiert (${quelle}). Bitte prüfen und ggf. anpassen, dann unten speichern.`;
      document.getElementById('import-url-input').value = "";
    } catch (e) {
      statusLine.textContent = "Verbindungsfehler: " + e.message;
    }
  }

  // ---- Rezept speichern ----
  async function submitRecipe() {
    const titel = document.getElementById('recipe-titel-input').value.trim();
    const zutatenListe = getZutatenFromForm();
    const schritteListe = getSchritteFromForm();
    if (!titel) return;

    // Freitext-Versionen ableiten (für Technik-Erkennung und Abwärtskompatibilität)
    const zutaten = zutatenListe.map(z => [z.menge, z.einheit, z.name].filter(Boolean).join(' ')).join('\n');
    const anleitung = schritteListe.map((s, i) => `${i + 1}. ${s}`).join('\n');

    const btn = document.getElementById('recipe-submit-btn');
    const statusLine = document.getElementById('recipe-status-line');
    btn.disabled = true;
    statusLine.textContent = "Speichere...";

    try {
      if (editingOriginalId) {
        await updateOriginalRecipe(editingOriginalId, titel, zutaten, anleitung, zutatenListe, schritteListe);
        return;
      }

      let kopieVonId = editingCopyOf ? editingCopyOf.id : null;
      let hinweisOriginalWeg = false;

      let res = await insertRecipe(titel, zutaten, anleitung, kopieVonId, zutatenListe, schritteListe);

      if (!res.ok) {
        const errText = await res.text();
        const isFkFehler = errText.includes('recipes_kopie_von_fkey') || errText.includes('23503');

        if (isFkFehler && kopieVonId) {
          // Original wurde inzwischen gelöscht - ohne Verweis nochmal versuchen
          hinweisOriginalWeg = true;
          res = await insertRecipe(titel, zutaten, anleitung, null, zutatenListe, schritteListe);
        }

        if (!res.ok) {
          const err = await res.text();
          statusLine.textContent = "Fehler: " + err;
          btn.disabled = false;
          return;
        }
      }

      const [savedRecipe] = await res.json();
      document.getElementById('recipe-titel-input').value = "";
      clearZutatenRows(); addZutatRow();
      clearSchritteRows(); addSchrittRow();
      document.getElementById('recipe-portionen-input').value = "";
      document.getElementById('edit-mode-banner').style.display = 'none';
      document.getElementById('edit-mode-mengen-hinweis').textContent = '';
      editingCopyOf = null;
      pendingImportUrl = null;
      schliesseRezeptFormular();
      statusLine.textContent = hinweisOriginalWeg ? "Gespeichert (ohne Kopie-Verweis, Original war weg)." : "Gespeichert!";
      // Aus frei Gekochtem entstanden: die Notizen haben ihren Zweck erfüllt
      if (window.pendingFreiNotizenLoeschen) {
        window.pendingFreiNotizenLoeschen = false;
        if (typeof leereFreiNotizen === 'function') leereFreiNotizen();
      }
      if (window.pendingTagebuchEintrag) {
        tagebuchMitRezeptVerbinden(window.pendingTagebuchEintrag, savedRecipe);
        window.pendingTagebuchEintrag = null;
      }
      await loadRecipes();
      zeigeGespeichertHinweis(savedRecipe.titel);
      naehrwerteImHintergrund(savedRecipe);
    } catch (e) {
      statusLine.textContent = "Verbindungsfehler: " + e.message;
    }
    btn.disabled = false;
  }

  // ---- Original direkt aktualisieren (kein neues Rezept, kein Kopie-Verweis) ----
  async function updateOriginalRecipe(id, titel, zutaten, anleitung, zutatenListe, schritteListe) {
    const btn = document.getElementById('recipe-submit-btn');
    const statusLine = document.getElementById('recipe-status-line');
    const manuellePortionen = document.getElementById('recipe-portionen-input').value;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        titel,
        zutaten,
        anleitung,
        basis_portionen: manuellePortionen ? parseInt(manuellePortionen, 10) : null,
        zutaten_strukturiert: zutatenListe && zutatenListe.length > 0 ? zutatenListe : null,
        anleitung_schritte: schritteListe && schritteListe.length > 0 ? schritteListe : null
      })
    });

    if (!res.ok) {
      const err = await res.text();
      statusLine.textContent = "Fehler: " + err;
      btn.disabled = false;
      return;
    }

    const [savedRecipe] = await res.json();
    document.getElementById('recipe-titel-input').value = "";
    clearZutatenRows(); addZutatRow();
    clearSchritteRows(); addSchrittRow();
    document.getElementById('recipe-portionen-input').value = "";
    document.getElementById('edit-mode-banner').style.display = 'none';
    editingOriginalId = null;
    schliesseRezeptFormular();
    statusLine.textContent = "Gespeichert!";
    await loadRecipes();
    zeigeGespeichertHinweis(savedRecipe.titel);
    naehrwerteImHintergrund(savedRecipe);
    btn.disabled = false;
  }

  // ---- Hilfsfunktion: Insert-Request für ein Rezept ----
  function insertRecipe(titel, zutaten, anleitung, kopieVonId, zutatenListe, schritteListe) {
    const manuellePortionen = document.getElementById('recipe-portionen-input').value;
    return fetch(`${SUPABASE_URL}/rest/v1/recipes`, {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        titel,
        zutaten,
        anleitung,
        kopie_von: kopieVonId,
        quelle_url: editingCopyOf ? editingCopyOf.quelle_url : (pendingImportUrl || null),
        basis_portionen: manuellePortionen ? parseInt(manuellePortionen, 10) : null,
        zutaten_strukturiert: zutatenListe && zutatenListe.length > 0 ? zutatenListe : null,
        anleitung_schritte: schritteListe && schritteListe.length > 0 ? schritteListe : null
      })
    });
  }

  // ---- Rezepte laden ----
  let allRecipesCache = [];

  async function loadRecipes() {
    const listEl = document.getElementById('recipe-list');
    listEl.innerHTML = `<div class="muted">Lade Rezepte...</div>`;
    const tagebuchLaden = ladeTagebuch(true); // parallel: wann zuletzt gekocht, 👍

    const spalten = 'id,titel,zutaten,anleitung,anleitung_schritte,quelle_url,kopie_von,basis_portionen,zutaten_strukturiert,erstellt_am';
    const kopf = { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } };
    let res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=${spalten},naehrwerte&order=erstellt_am.desc`, kopf);
    // Gibt es die Spalte "naehrwerte" (noch) nicht, die Liste trotzdem laden - nur eben ohne Nährwerte
    if (!res.ok) res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=${spalten}&order=erstellt_am.desc`, kopf);
    const data = await res.json();
    allRecipesCache = data;
    await tagebuchLaden;

    if (!data.length) {
      listEl.innerHTML = `<div class="muted">Noch keine Rezepte gespeichert.</div>`;
      document.getElementById('rezept-filter').innerHTML = '';
      return;
    }

    renderRezeptListe();
  }

  // ---- Filter fürs Kochbuch ----
  const REZEPT_FILTER = [
    ['alle', 'Alle', () => true],
    ['lieblinge', '👍 Lieblinge', s => s.bewertung === 'gern'],
    ['lange', 'Lange her', s => s.anzahl > 0 && tageHer(s.zuletzt) >= 30],
    ['neu', 'Nie gekocht', s => s.anzahl === 0]
  ];
  let rezeptFilter = 'alle';

  function setzeRezeptFilter(wert) {
    rezeptFilter = wert;
    renderRezeptListe();
  }

  function renderRezeptListe() {
    const listEl = document.getElementById('recipe-list');
    const data = allRecipesCache;
    const titelById = Object.fromEntries(data.map(r => [r.id, r.titel]));
    const [, , passt] = REZEPT_FILTER.find(f => f[0] === rezeptFilter) || REZEPT_FILTER[0];

    document.getElementById('rezept-filter').innerHTML = REZEPT_FILTER.map(([wert, text]) =>
      `<button type="button" class="filter-chip${wert === rezeptFilter ? ' an' : ''}" onclick="setzeRezeptFilter('${wert}')">${text}</button>`).join('');

    const gefiltert = data.filter(r => passt(kochStatistik(r.id)));
    if (!gefiltert.length) {
      listEl.innerHTML = `<div class="muted leer-hinweis">${
        rezeptFilter === 'lieblinge' ? 'Noch keine Lieblinge – nach dem Kochen bei „Wieder kochen?“ auf 👍 tippen.'
        : rezeptFilter === 'lange' ? 'Nichts, was länger als einen Monat her ist.'
        : 'Alles schon mal gekocht. 💪'}</div>`;
      return;
    }
    listEl.innerHTML = gefiltert.map(r => {
      const bew = kochStatistik(r.id).bewertung;
      return `
      <div class="rezept-karte" data-id="${r.id}" onclick="oeffneRezept('${r.id}')">
        <div class="rezept-titel">${bew ? `<span class="rezept-bewertung" title="Wieder kochen?">${BEWERTUNG_ZEICHEN[bew]}</span>` : ''}${htmlSicher(r.titel)}</div>
        <div class="rezept-meta">${htmlSicher(rezeptMeta(r, titelById))}</div>
      </div>`;
    }).join('');
  }

  // Kurze Zusatzzeile unter dem Titel: wie oft gekocht, Portionen, Herkunft
  function rezeptMeta(r, titelById) {
    const teile = [];
    const gekocht = kochMetaText(r.id);
    if (gekocht) teile.push(gekocht);
    if (r.basis_portionen) teile.push(`${r.basis_portionen} Portionen`);
    const kcal = kcalProPortion(r);
    if (kcal !== null) teile.push(`${kcal} kcal`);
    if (r.kopie_von && titelById[r.kopie_von]) teile.push(`Kopie von „${titelById[r.kopie_von]}“`);
    else if (r.quelle_url) {
      try { teile.push('aus ' + new URL(r.quelle_url).hostname.replace(/^www\./, '')); } catch (e) {}
    }
    return teile.join(' · ');
  }

  // Meta-Zeile in der Karte: wie in der Liste, die Quelle aber als Link
  function rezeptMetaHtml(r) {
    const teile = [];
    const gekocht = kochMetaText(r.id);
    if (gekocht) teile.push(`<button type="button" class="meta-knopf" onclick="zeigeKartenPanel('${r.id}', 'verlauf')" aria-label="Kochverlauf ansehen und bearbeiten">${gekocht}</button>`);
    if (r.basis_portionen) teile.push(`${r.basis_portionen} Portionen`);
    const kcal = kcalProPortion(r);
    if (kcal !== null) teile.push(`${kcal} kcal pro Portion`);
    const original = r.kopie_von && allRecipesCache.find(x => x.id === r.kopie_von);
    if (original) teile.push(`Kopie von „${htmlSicher(original.titel)}“`);
    if (r.quelle_url) {
      let host = 'Original';
      try { host = new URL(r.quelle_url).hostname.replace(/^www\./, ''); } catch (e) {}
      teile.push(`<a href="${htmlSicher(r.quelle_url)}" target="_blank" rel="noopener">${htmlSicher(host)} ↗</a>`);
    }
    return teile.join(' · ');
  }

  // ---- Rezept als schwebende Karte öffnen ----
  function oeffneRezept(id) {
    const r = allRecipesCache.find(rec => rec.id === id);
    if (!r) return;
    const hatStrukturierteZutaten = r.zutaten_strukturiert && r.zutaten_strukturiert.length > 0 && r.basis_portionen;
    const nurPortionenOhneStruktur = r.basis_portionen && !hatStrukturierteZutaten;
    const hatSchritte = r.anleitung_schritte && r.anleitung_schritte.length > 0;
    const meta = rezeptMetaHtml(r);

    document.getElementById('rezept-karte-detail').innerHTML = `
      <div id="recipe-detail-${id}" class="rezept-detail">
        ${meta ? `<div class="karte-meta">${meta}</div>` : ''}
        <div class="reiter" role="tablist">
          <button type="button" class="aktiv" data-reiter="zutaten" onclick="zeigeReiter('${id}', 'zutaten')">Zutaten</button>
          <button type="button" data-reiter="zubereitung" onclick="zeigeReiter('${id}', 'zubereitung')">Zubereitung</button>
          <button type="button" data-reiter="naehrwerte" onclick="zeigeReiter('${id}', 'naehrwerte')">Nährwerte</button>
        </div>

        <div class="reiter-inhalt" data-reiter="zutaten">
          ${zettelHtml(id, 'karte-zettel')}
          ${hatStrukturierteZutaten
            ? `<div class="portion-steuerung">
                 <button class="mini-rund" onclick="changePortionen('${id}', -1)" aria-label="weniger Portionen">−</button>
                 <span><b id="portionen-anzeige-${id}">${r.basis_portionen}</b> Portionen</span>
                 <button class="mini-rund" onclick="changePortionen('${id}', 1)" aria-label="mehr Portionen">+</button>
               </div>
               <div id="zutaten-liste-${id}"></div>
               <div class="muted" style="font-size:0.78rem; margin-top:4px;">Tipp auf eine Menge: weniger davon → der Rest rechnet sich mit. Andere Einheit → wird gespeichert.</div>`
            : `${nurPortionenOhneStruktur ? `<div class="muted" style="margin-bottom:4px;">Für ${r.basis_portionen} Portionen</div>` : ''}
               <div style="white-space:pre-wrap; font-size:0.92rem;">${htmlSicher(r.zutaten) || '<span class="muted">(keine Zutaten gespeichert)</span>'}</div>`}
        </div>

        <div class="reiter-inhalt" data-reiter="zubereitung" style="display:none;">
          ${hatSchritte
            ? `<ol class="schritt-liste">${r.anleitung_schritte.map(s => `<li>${htmlSicher(s)}</li>`).join('')}</ol>`
            : `<div style="white-space:pre-wrap; font-size:0.92rem;">${htmlSicher(r.anleitung) || '<span class="muted">(keine Anleitung gespeichert)</span>'}</div>`}
        </div>

        <div class="reiter-inhalt" data-reiter="naehrwerte" id="naehrwerte-${id}" style="display:none;"></div>

        <div class="karten-aktionen">
          <button class="btn-haupt nur-handy" onclick="kochenAusKarte('${id}')">Kochen</button>
          <button type="button" class="ikon-knopf" data-panel="einkauf" onclick="zeigeKartenPanel('${id}', 'einkauf')" aria-label="Einkaufsliste" title="Einkaufsliste">🛒</button>
          <button type="button" class="ikon-knopf" data-panel="bearbeiten" onclick="zeigeKartenPanel('${id}', 'bearbeiten')" aria-label="Bearbeiten" title="Bearbeiten">✎</button>
          <button type="button" class="ikon-knopf" data-panel="mehr" onclick="zeigeKartenPanel('${id}', 'mehr')" aria-label="Mehr" title="Mehr">⋯</button>
        </div>
        <div id="einkauf-${id}" class="einkauf-box" style="display:none;"></div>
        <div id="bearbeiten-wahl-${id}" class="karten-panel" style="display:none;">
          <div style="font-size:0.88rem;">Wie möchtest du bearbeiten?</div>
          <div class="aktionen">
            <button class="btn-klein" onclick="startEditOriginal('${id}')">Original ändern</button>
            <button class="btn-klein" onclick="startEditAsCopy('${id}')">Als Kopie</button>
          </div>
        </div>
        <div id="verlauf-${id}" class="karten-panel" style="display:none;"></div>
        <div id="mehr-${id}" class="karten-panel" style="display:none;">
          <button class="btn-klein" style="color:var(--accent);" onclick="deleteRecipe('${id}')">Rezept löschen</button>
        </div>
      </div>
    `;
    zeigeRezeptKarte('detail', r.titel);
    if (hatStrukturierteZutaten) {
      aktuellePortionen[id] = r.basis_portionen;
      renderZutatenListe(id);
    }
  }

  function zeigeReiter(id, reiter) {
    const box = document.getElementById(`recipe-detail-${id}`);
    box.querySelectorAll('.reiter button').forEach(b => b.classList.toggle('aktiv', b.dataset.reiter === reiter));
    box.querySelectorAll('.reiter-inhalt').forEach(el => el.style.display = el.dataset.reiter === reiter ? 'block' : 'none');
    if (reiter === 'naehrwerte') zeigeNaehrwerte(id);
  }

  // Einkaufsliste, Bearbeiten-Wahl und "Mehr" klappen unter der Knopfleiste auf - immer nur eins
  function zeigeKartenPanel(id, welches) {
    const panels = { einkauf: `einkauf-${id}`, bearbeiten: `bearbeiten-wahl-${id}`, mehr: `mehr-${id}`, verlauf: `verlauf-${id}` };
    const warOffen = document.getElementById(panels[welches]).style.display === 'block';
    Object.values(panels).forEach(pid => document.getElementById(pid).style.display = 'none');
    document.querySelectorAll(`#recipe-detail-${id} .ikon-knopf`).forEach(b => b.classList.remove('an'));
    if (warOffen) return;

    document.getElementById(panels[welches]).style.display = 'block';
    document.querySelector(`#recipe-detail-${id} .ikon-knopf[data-panel="${welches}"]`)?.classList.add('an');
    if (welches === 'einkauf') renderEinkauf(id);
    if (welches === 'verlauf') renderKochVerlauf(id);
    document.getElementById(panels[welches]).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function kochenAusKarte(id) {
    rezeptKarteZu();
    startKochmodus(id);
  }

  // ---- Portionen ändern und Zutatenliste neu berechnen ----
  let aktuellePortionen = {};

  function changePortionen(id, delta) {
    const neu = Math.max(1, Math.round(((aktuellePortionen[id] || 1) + delta) * 10) / 10);
    aktuellePortionen[id] = neu;
    document.getElementById(`portionen-anzeige-${id}`).textContent = zahlDeutsch(neu);
    renderZutatenListe(id);
    if (typeof renderEinkauf === 'function') renderEinkauf(id); // offene Einkaufsliste mit umrechnen
  }

  function zahlDeutsch(wert) {
    return String(wert).replace('.', ',');
  }

  // sinnvoll runden: bei kleinen Mengen 1 Nachkommastelle, sonst ganze Zahl
  function mengeRunden(menge) {
    return menge < 10 ? Math.round(menge * 10) / 10 : Math.round(menge);
  }

  function renderZutatenListe(id) {
    const r = allRecipesCache.find(rec => rec.id === id);
    const faktor = aktuellePortionen[id] / r.basis_portionen;
    const listEl = document.getElementById(`zutaten-liste-${id}`);

    listEl.innerHTML = r.zutaten_strukturiert.map((z, index) => {
      if (z.menge === null || z.menge === undefined) {
        return `<div class="zutat-zeile"><span>${htmlSicher(z.name)}</span><span class="menge">${htmlSicher(z.einheit || '')}</span></div>`;
      }
      const anzeige = mengeRunden(z.menge * faktor);
      return `<div class="zutat-zeile">
        <span>${htmlSicher(z.name)}</span>
        <span class="menge"><button type="button" class="menge-knopf" data-id="${id}" data-index="${index}" data-basis="${z.menge}" data-wert="${anzeige}"
          data-einheit="${htmlSicher(z.einheit || '')}" onclick="mengeBearbeiten(this)"
          aria-label="Menge ${htmlSicher(z.name)} ändern">${zahlDeutsch(anzeige)}${z.einheit ? ' ' + htmlSicher(z.einheit) : ''}</button></span>
      </div>`;
    }).join('') + `<div id="zutat-hinweis-${id}" class="zutat-hinweis" role="status"></div>`;
  }

  // Tipp auf eine Menge: Menge und Einheit werden zu Eingabefeldern.
  // Nur die Menge geändert → alles andere rechnet sich mit (nur für jetzt, wie bisher).
  // Einheit geändert (1 Stück → 30 g) → wird im Rezept gespeichert.
  function mengeBearbeiten(knopf) {
    const { id, index, wert, basis } = knopf.dataset;
    const alteEinheit = knopf.dataset.einheit;
    const span = knopf.parentElement;
    span.classList.add('menge-edit');
    span.innerHTML = `<input type="number" step="any" inputmode="decimal" class="me-menge" value="${wert}" aria-label="neue Menge">`
      + `<input type="text" class="me-einheit" list="einheiten-liste" autocomplete="off" value="${htmlSicher(alteEinheit)}" placeholder="Einheit" aria-label="Einheit">`
      + `<button type="button" class="me-ok" aria-label="Übernehmen">✓</button>`;
    const menge = span.querySelector('.me-menge');
    const einheit = span.querySelector('.me-einheit');
    const hinweis = document.getElementById(`zutat-hinweis-${id}`);
    let fertig = false;

    const uebernehmen = () => {
      if (fertig) return;
      fertig = true;
      const neueEinheit = einheit.value.trim();
      const neueMenge = parseFloat(String(menge.value).replace(',', '.'));
      if (neueEinheit !== alteEinheit.trim()) {
        einheitSpeichern(id, parseInt(index, 10), isFinite(neueMenge) && neueMenge > 0 ? neueMenge : null, neueEinheit);
      } else if (neueMenge > 0 && neueMenge !== parseFloat(wert)) {
        scaleByZutat({ dataset: { id, basis }, value: neueMenge });
      } else {
        renderZutatenListe(id);
      }
    };
    const zeigeHinweis = () => {
      if (hinweis) hinweis.textContent = einheit.value.trim() !== alteEinheit.trim()
        ? 'Neue Einheit – wird im Rezept gespeichert.' : '';
    };
    [menge, einheit].forEach(el => el.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); uebernehmen(); }
      if (e.key === 'Escape') { e.stopPropagation(); fertig = true; renderZutatenListe(id); } // nur abbrechen, Karte bleibt offen
    }));
    einheit.addEventListener('input', zeigeHinweis);
    span.querySelector('.me-ok').addEventListener('click', uebernehmen);
    // Woanders hingetippt: übernehmen (zwischen Menge und Einheit wechseln zählt nicht)
    span.addEventListener('focusout', () => setTimeout(() => {
      if (document.body.contains(span) && !span.contains(document.activeElement)) uebernehmen();
    }, 0));
    // Häufige Einheiten zum Antippen unter der Zeile (die Vorschlagsliste zeigt nur, was zum Getippten passt).
    // mousedown verhindern: so bleibt der Fokus im Feld und das Antippen zählt nicht als „woanders hin“.
    const chips = document.createElement('div');
    chips.className = 'einheit-chips';
    chips.innerHTML = EINHEITEN_SCHNELL.map(e => `<button type="button" data-einheit="${e}">${e}</button>`).join('');
    chips.addEventListener('mousedown', e => e.preventDefault());
    chips.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      einheit.value = b.dataset.einheit;
      zeigeHinweis();
      menge.focus();
      menge.select();
    });
    span.closest('.zutat-zeile').after(chips);
    menge.focus();
    menge.select();
  }

  const EINHEITEN_SCHNELL = ['g', 'ml', 'EL', 'TL', 'Stück', 'Prise', 'Bund', 'Dose'];

  // Neue Einheit fürs Rezept speichern. Die angezeigte Menge gilt für die gerade gewählten Portionen,
  // gespeichert wird sie für die Grundportionen.
  async function einheitSpeichern(id, index, menge, einheit) {
    const r = allRecipesCache.find(rec => rec.id === id);
    if (!r || !r.zutaten_strukturiert[index]) return;
    const faktor = (aktuellePortionen[id] || r.basis_portionen) / r.basis_portionen;
    const vorher = r.zutaten_strukturiert.map(z => ({ ...z }));
    const z = r.zutaten_strukturiert[index];
    z.menge = menge === null ? null : Math.round(menge / faktor * 100) / 100;
    z.einheit = einheit || null;
    const zutatenText = r.zutaten_strukturiert.map(x => [x.menge, x.einheit, x.name].filter(Boolean).join(' ')).join('\n');
    renderZutatenListe(id);
    const hinweis = () => document.getElementById(`zutat-hinweis-${id}`);
    if (hinweis()) hinweis().textContent = 'Speichere …';
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`, {
        method: 'PATCH',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ zutaten_strukturiert: r.zutaten_strukturiert, zutaten: zutatenText })
      });
      if (!res.ok) throw new Error(res.status);
      r.zutaten = zutatenText;
      if (hinweis()) hinweis().textContent = `✓ Gespeichert: ${z.name} jetzt ${einheit ? 'in ' + einheit : 'ohne Einheit'}.`;
      naehrwerteImHintergrund(r); // Nährwerte passen nicht mehr - im Hintergrund neu rechnen
    } catch (e) {
      r.zutaten_strukturiert = vorher;
      renderZutatenListe(id);
      if (hinweis()) hinweis().textContent = 'Speichern hat nicht geklappt – bist du online?';
    }
  }

  // ---- Kochverlauf in der Karte: ansehen, korrigieren, löschen ----
  const BEWERTUNG_TEXT = { gern: '👍 Gern', geht_so: 'Geht so', nein: '👎' };

  function verlaufDatum(iso) {
    const d = new Date(iso);
    const mitJahr = d.getFullYear() !== new Date().getFullYear();
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', ...(mitJahr ? { year: 'numeric' } : {}) });
  }

  // yyyy-mm-dd in lokaler Zeit (für <input type="date">)
  function lokalesDatum(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }

  function renderKochVerlauf(id, bearbeiteId = null) {
    const box = document.getElementById(`verlauf-${id}`);
    if (!box) return;
    const eintraege = (tagebuchCache || []).filter(e => e.recipe_id === id);
    if (!eintraege.length) { box.innerHTML = '<div class="muted">Noch nicht gekocht.</div>'; return; }
    box.innerHTML = `<div class="verlauf-titel">Gekocht</div>` + eintraege.map(e => e.id === bearbeiteId ? `
      <div class="verlauf-eintrag bearbeiten" data-eintrag="${e.id}" data-bewertung="${e.bewertung || ''}">
        <label class="vb-zeile">Wann <input type="date" class="vb-datum" value="${lokalesDatum(new Date(e.gekocht_am))}" max="${lokalesDatum(new Date())}"></label>
        <div class="vb-pillen">${Object.entries(BEWERTUNG_TEXT).map(([wert, text]) =>
          `<button type="button" class="vb-pille${e.bewertung === wert ? ' an' : ''}" data-wert="${wert}" onclick="verlaufBewerten(this)" aria-pressed="${e.bewertung === wert}">${text}</button>`).join('')}</div>
        <textarea class="vb-notiz" placeholder="Was soll nächstes Mal anders?">${htmlSicher(e.notiz || '')}</textarea>
        <div class="vb-knoepfe">
          <button type="button" class="btn-klein vb-speichern" onclick="verlaufSpeichern('${id}', '${e.id}')">Speichern</button>
          <button type="button" class="btn-klein" onclick="renderKochVerlauf('${id}')">Abbrechen</button>
          <button type="button" class="btn-dezent vb-loeschen" onclick="verlaufLoeschen(this, '${id}', '${e.id}')">Löschen</button>
        </div>
        <div class="vb-status" role="status"></div>
      </div>` : `
      <div class="verlauf-eintrag">
        <div class="verlauf-kopf">
          <span class="verlauf-datum">${verlaufDatum(e.gekocht_am)} <small>${vorWann(e.gekocht_am)}</small></span>
          <span class="verlauf-bewertung">${BEWERTUNG_ZEICHEN[e.bewertung] || ''}</span>
          <button type="button" class="verlauf-aendern" onclick="renderKochVerlauf('${id}', '${e.id}')" aria-label="Eintrag vom ${verlaufDatum(e.gekocht_am)} bearbeiten">✎</button>
        </div>
        ${e.notiz && e.notiz.trim() ? `<div class="verlauf-notiz">${htmlSicher(e.notiz.trim())}</div>` : ''}
      </div>`).join('');
  }

  function verlaufBewerten(knopf) {
    const box = knopf.closest('.verlauf-eintrag');
    const neu = box.dataset.bewertung === knopf.dataset.wert ? '' : knopf.dataset.wert; // nochmal tippen = keine Bewertung
    box.dataset.bewertung = neu;
    box.querySelectorAll('.vb-pille').forEach(b => {
      b.classList.toggle('an', b.dataset.wert === neu);
      b.setAttribute('aria-pressed', b.dataset.wert === neu);
    });
  }

  async function verlaufSpeichern(id, eintragId) {
    const box = document.querySelector(`#verlauf-${id} [data-eintrag="${eintragId}"]`);
    const e = (tagebuchCache || []).find(x => x.id === eintragId);
    if (!box || !e) return;
    const aenderung = {
      bewertung: box.dataset.bewertung || null,
      notiz: box.querySelector('.vb-notiz').value.trim() || null
    };
    const datum = box.querySelector('.vb-datum').value;
    if (datum && datum !== lokalesDatum(new Date(e.gekocht_am))) {
      const [j, m, t] = datum.split('-').map(Number);
      aenderung.gekocht_am = new Date(j, m - 1, t, 19, 0).toISOString(); // Uhrzeit egal - abends gekocht
    }
    box.querySelector('.vb-speichern').disabled = true;
    try {
      await tagebuchAktualisieren(eintragId, aenderung);
      kochVerlaufGeaendert(id);
    } catch (err) {
      box.querySelector('.vb-speichern').disabled = false;
      box.querySelector('.vb-status').textContent = 'Speichern hat nicht geklappt – bist du online?';
    }
  }

  // Löschen in zwei Schritten statt Bestätigungsfenster
  async function verlaufLoeschen(knopf, id, eintragId) {
    if (!knopf.classList.contains('sicher')) {
      knopf.classList.add('sicher');
      knopf.textContent = 'Wirklich löschen?';
      return;
    }
    knopf.disabled = true;
    try {
      await tagebuchLoeschen(eintragId);
      kochVerlaufGeaendert(id);
    } catch (err) {
      knopf.disabled = false;
      knopf.closest('.verlauf-eintrag').querySelector('.vb-status').textContent = 'Löschen hat nicht geklappt – bist du online?';
    }
  }

  // Nach einer Änderung: Verlauf, Zeile oben in der Karte, Zettel und Kochbuch-Liste auffrischen
  function kochVerlaufGeaendert(id) {
    renderKochVerlauf(id);
    const detail = document.getElementById(`recipe-detail-${id}`);
    const r = allRecipesCache.find(x => x.id === id);
    if (detail && r) {
      let metaEl = detail.querySelector('.karte-meta');
      const meta = rezeptMetaHtml(r);
      if (!metaEl && meta) { metaEl = document.createElement('div'); metaEl.className = 'karte-meta'; detail.prepend(metaEl); }
      if (metaEl) metaEl.innerHTML = meta;
      const zettelAlt = detail.querySelector('.karte-zettel');
      const zettelNeu = zettelHtml(id, 'karte-zettel');
      if (zettelAlt) zettelAlt.outerHTML = zettelNeu;
      else if (zettelNeu) detail.querySelector('.reiter-inhalt[data-reiter="zutaten"]').insertAdjacentHTML('afterbegin', zettelNeu);
    }
    if (!kochStatistik(id).anzahl) zeigeKartenPanel(id, 'verlauf'); // letzter Eintrag weg: Panel zu
    renderRezeptListe();
  }

  // ---- Skalierung über eine einzelne Zutat statt über Portionen (z. B. "hab nur 400g statt 500g") ----
  function scaleByZutat(inputEl) {
    const id = inputEl.dataset.id;
    const basisMenge = parseFloat(inputEl.dataset.basis);
    const neueMenge = parseFloat(inputEl.value);
    if (!neueMenge || !basisMenge) return;

    const r = allRecipesCache.find(rec => rec.id === id);
    const faktor = neueMenge / basisMenge;
    aktuellePortionen[id] = Math.round(r.basis_portionen * faktor * 10) / 10;
    document.getElementById(`portionen-anzeige-${id}`).textContent = zahlDeutsch(aktuellePortionen[id]);
    renderZutatenListe(id);
    if (typeof renderEinkauf === 'function') renderEinkauf(id); // offene Einkaufsliste mit umrechnen
  }

  // ---- Bearbeiten als Kopie ODER direkt am Original ----
  let editingCopyOf = null;
  let editingOriginalId = null;

  function befuelleFormularAusRezept(r) {
    document.getElementById('recipe-titel-input').value = r.titel;
    document.getElementById('recipe-portionen-input').value = r.basis_portionen || '';

    clearZutatenRows();
    if (r.zutaten_strukturiert && r.zutaten_strukturiert.length > 0) {
      r.zutaten_strukturiert.forEach(z => addZutatRow(z.menge, z.einheit, z.name));
    } else if (r.zutaten) {
      r.zutaten.split("\n").filter(Boolean).forEach(z => addZutatRow('', '', z.trim()));
    }
    if (document.querySelectorAll('#zutaten-rows .zutat-row').length === 0) addZutatRow();

    clearSchritteRows();
    if (r.anleitung_schritte && r.anleitung_schritte.length > 0) {
      r.anleitung_schritte.forEach(s => addSchrittRow(s));
    } else if (r.anleitung) {
      r.anleitung.split("\n").filter(Boolean).forEach(zeile => addSchrittRow(zeile.replace(/^\d+\.\s*/, '').trim()));
    }
    if (document.querySelectorAll('#schritte-rows .schritt-row').length === 0) addSchrittRow();
  }

  function startEditAsCopy(id) {
    const r = allRecipesCache.find(rec => rec.id === id);
    editingCopyOf = { id: r.id, quelle_url: r.quelle_url || null };
    editingOriginalId = null;
    befuelleFormularAusRezept(r);

    document.getElementById('edit-mode-text').innerHTML =
      `Du bearbeitest eine Kopie von "<span id="edit-mode-original-title">${htmlSicher(r.titel)}</span>". Wird als neues, eigenständiges Rezept gespeichert.`;
    document.getElementById('edit-mode-banner').style.display = 'block';
    zeigeRezeptFormular();
  }

  function startEditOriginal(id) {
    const r = allRecipesCache.find(rec => rec.id === id);
    editingOriginalId = id;
    editingCopyOf = null;
    befuelleFormularAusRezept(r);

    document.getElementById('edit-mode-text').innerHTML =
      `Du änderst "<span id="edit-mode-original-title">${htmlSicher(r.titel)}</span>" direkt - keine Kopie, das Original wird überschrieben.`;
    document.getElementById('edit-mode-banner').style.display = 'block';
    zeigeRezeptFormular();
  }

  function cancelEditCopy() {
    editingCopyOf = null;
    editingOriginalId = null;
    document.getElementById('edit-mode-banner').style.display = 'none';
    document.getElementById('recipe-titel-input').value = '';
    clearZutatenRows(); addZutatRow();
    clearSchritteRows(); addSchrittRow();
    document.getElementById('recipe-portionen-input').value = '';
    schliesseRezeptFormular();
  }

  // ---- Rezept löschen ----
  async function deleteRecipe(id) {
    if (!confirm('Dieses Rezept wirklich löschen? Zugehörige Techniken/dein Fortschritt bleiben erhalten.')) return;

    await fetch(`${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    rezeptKarteZu();
    loadRecipes();
  }

