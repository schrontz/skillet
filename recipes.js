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
      <input type="text" placeholder="Einheit" value="${htmlSicher(einheit)}" class="zutat-einheit">
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
      statusLine.textContent = hinweisOriginalWeg
        ? "Original wurde inzwischen gelöscht - als eigenständiges Rezept gespeichert. Erkenne Techniken..."
        : "Gespeichert! Erkenne verwendete Techniken...";
      loadRecipes();

      if (window.pendingKochmodusHandoff) {
        window.pendingKochmodusHandoff = false;
        const notiz = window.pendingKochmodusNotiz || '';
        window.pendingKochmodusNotiz = null;
        setTimeout(() => handoffZuReflexion(savedRecipe.id, notiz), 600);
      }

      naehrwerteImHintergrund(savedRecipe);
      await detectAndConfirmTechniques(savedRecipe, titel, zutaten, anleitung);
      statusLine.textContent = hinweisOriginalWeg ? "Gespeichert (ohne Kopie-Verweis, Original war weg)." : "Gespeichert!";
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
    statusLine.textContent = "Gespeichert! Erkenne verwendete Techniken...";
    loadRecipes();
    naehrwerteImHintergrund(savedRecipe);

    await detectAndConfirmTechniques(savedRecipe, titel, zutaten, anleitung);
    statusLine.textContent = "Gespeichert!";
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

  // ---- Techniken erkennen lassen und zur Bestätigung anzeigen ----

  async function detectAndConfirmTechniques(recipe, titel, zutaten, anleitung) {
    const detectCard = document.getElementById('detect-card');
    detectCard.innerHTML = `<div class="card muted">Techniken werden erkannt...</div>`;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/detect-techniques`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ recipe_id: recipe.id, titel, zutaten, anleitung })
      });
      const data = await res.json();

      if (data.error) {
        detectCard.innerHTML = `<div class="card">Erkennung fehlgeschlagen: ${data.error}</div>`;
        return;
      }

      const erkannt = new Set(data.erkannte_technik_ids || []);
      // techniques ist bereits global geladen (aus loadTechniques)
      detectCard.innerHTML = `
        <div class="card">
          <div style="margin-bottom:10px;">Erkannte Techniken für <strong>${titel}</strong> – bitte prüfen:</div>
          ${techniques.map(t => `
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0; margin:0; color:var(--ink); font-size:0.92rem; cursor:pointer;">
              <input type="checkbox" class="detect-checkbox" value="${t.id}" ${erkannt.has(t.id) ? 'checked' : ''}>
              ${t.name}
            </label>
          `).join('')}
          <button class="primary" onclick="confirmTechniques('${recipe.id}')">Bestätigen</button>
        </div>
      `;

      if (data.neue_technik_vorschlag) {
        renderNeueTechnikVorschlag(data.neue_technik_vorschlag, recipe.id);
      }
    } catch (e) {
      detectCard.innerHTML = `<div class="card">Verbindungsfehler bei der Erkennung: ${e.message}</div>`;
    }
  }

  // ---- Vorschlag für neue Technik anzeigen (Anlegen/Ignorieren) ----

  async function confirmTechniques(recipeId) {
    const checked = Array.from(document.querySelectorAll('.detect-checkbox:checked')).map(cb => cb.value);
    const detectCard = document.getElementById('detect-card');

    try {
      // Bestehende Zuordnungen für dieses Rezept vorher entfernen - wichtig beim Bearbeiten
      // des Originals, sonst gäbe es einen Konflikt mit schon vorhandenen Zuordnungen
      await fetch(`${SUPABASE_URL}/rest/v1/recipe_techniques?recipe_id=eq.${recipeId}`, {
        method: "DELETE",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      });

      if (checked.length === 0) {
        detectCard.innerHTML = `<div class="card muted">Keine Techniken zugeordnet.</div>`;
        return;
      }

      const rows = checked.map(technique_id => ({ recipe_id: recipeId, technique_id }));
      const res = await fetch(`${SUPABASE_URL}/rest/v1/recipe_techniques`, {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify(rows)
      });

      if (!res.ok) {
        const err = await res.text();
        detectCard.innerHTML = `<div class="card">Fehler beim Speichern: ${err}</div>`;
        return;
      }

      detectCard.innerHTML = `<div class="card muted">✅ ${rows.length} Technik(en) zugeordnet.</div>`;
    } catch (e) {
      detectCard.innerHTML = `<div class="card">Verbindungsfehler: ${e.message}</div>`;
    }
  }

  // ---- Rezepte laden ----
  let allRecipesCache = [];

  async function loadRecipes() {
    const listEl = document.getElementById('recipe-list');
    listEl.innerHTML = `<div class="muted">Lade Rezepte...</div>`;

    const spalten = 'id,titel,zutaten,anleitung,anleitung_schritte,quelle_url,kopie_von,basis_portionen,zutaten_strukturiert,erstellt_am';
    const kopf = { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } };
    let res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=${spalten},naehrwerte&order=erstellt_am.desc`, kopf);
    // Gibt es die Spalte "naehrwerte" (noch) nicht, die Liste trotzdem laden - nur eben ohne Nährwerte
    if (!res.ok) res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=${spalten}&order=erstellt_am.desc`, kopf);
    const data = await res.json();
    allRecipesCache = data;

    if (!data.length) {
      listEl.innerHTML = `<div class="muted">Noch keine Rezepte gespeichert.</div>`;
      return;
    }

    renderRezeptListe();
  }

  function renderRezeptListe() {
    const listEl = document.getElementById('recipe-list');
    const data = allRecipesCache;
    const titelById = Object.fromEntries(data.map(r => [r.id, r.titel]));

    listEl.innerHTML = data.map(r => `
      <div class="rezept-karte" data-id="${r.id}" onclick="oeffneRezept('${r.id}')">
        <div class="rezept-titel">${htmlSicher(r.titel)}</div>
        <div class="rezept-meta">${htmlSicher(rezeptMeta(r, titelById))}</div>
      </div>
    `).join('');
  }

  // Kurze Zusatzzeile unter dem Titel: Portionen, Herkunft
  function rezeptMeta(r, titelById) {
    const teile = [];
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
          ${hatStrukturierteZutaten
            ? `<div class="portion-steuerung">
                 <button class="mini-rund" onclick="changePortionen('${id}', -1)" aria-label="weniger Portionen">−</button>
                 <span><b id="portionen-anzeige-${id}">${r.basis_portionen}</b> Portionen</span>
                 <button class="mini-rund" onclick="changePortionen('${id}', 1)" aria-label="mehr Portionen">+</button>
               </div>
               <div id="zutaten-liste-${id}"></div>
               <div class="muted" style="font-size:0.78rem; margin-top:4px;">Tipp: Tipp auf eine Menge, wenn du weniger davon hast – der Rest rechnet sich mit.</div>`
            : `${nurPortionenOhneStruktur ? `<div class="muted" style="margin-bottom:4px;">Für ${r.basis_portionen} Portionen</div>` : ''}
               <div style="white-space:pre-wrap; font-size:0.92rem;">${htmlSicher(r.zutaten) || '<span class="muted">(keine Zutaten gespeichert)</span>'}</div>`}
        </div>

        <div class="reiter-inhalt" data-reiter="zubereitung" style="display:none;">
          ${hatSchritte
            ? `<ol class="schritt-liste">${r.anleitung_schritte.map(s => `<li>${htmlSicher(s)}</li>`).join('')}</ol>`
            : `<div style="white-space:pre-wrap; font-size:0.92rem;">${htmlSicher(r.anleitung) || '<span class="muted">(keine Anleitung gespeichert)</span>'}</div>`}
          <div class="abschnitt">Techniken</div>
          <div id="recipe-techniques-${id}" class="chips"><span class="muted">Lade...</span></div>
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
          <div id="reflexions-hinweis-${id}"></div>
          <div class="aktionen">
            <button class="btn-klein" onclick="startEditOriginal('${id}')">Original ändern</button>
            <button class="btn-klein" onclick="startEditAsCopy('${id}')">Als Kopie</button>
          </div>
        </div>
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
    loadRecipeTechniquesForDetail(id);
  }

  function zeigeReiter(id, reiter) {
    const box = document.getElementById(`recipe-detail-${id}`);
    box.querySelectorAll('.reiter button').forEach(b => b.classList.toggle('aktiv', b.dataset.reiter === reiter));
    box.querySelectorAll('.reiter-inhalt').forEach(el => el.style.display = el.dataset.reiter === reiter ? 'block' : 'none');
    if (reiter === 'naehrwerte') zeigeNaehrwerte(id);
  }

  // Einkaufsliste, Bearbeiten-Wahl und "Mehr" klappen unter der Knopfleiste auf - immer nur eins
  function zeigeKartenPanel(id, welches) {
    const panels = { einkauf: `einkauf-${id}`, bearbeiten: `bearbeiten-wahl-${id}`, mehr: `mehr-${id}` };
    const warOffen = document.getElementById(panels[welches]).style.display === 'block';
    Object.values(panels).forEach(pid => document.getElementById(pid).style.display = 'none');
    document.querySelectorAll(`#recipe-detail-${id} .ikon-knopf`).forEach(b => b.classList.remove('an'));
    if (warOffen) return;

    document.getElementById(panels[welches]).style.display = 'block';
    document.querySelector(`#recipe-detail-${id} .ikon-knopf[data-panel="${welches}"]`).classList.add('an');
    if (welches === 'einkauf') renderEinkauf(id);
    if (welches === 'bearbeiten') warnFallsReflektiert(id);
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

    listEl.innerHTML = r.zutaten_strukturiert.map(z => {
      if (z.menge === null || z.menge === undefined) {
        return `<div class="zutat-zeile"><span>${htmlSicher(z.name)}</span><span class="menge">${htmlSicher(z.einheit || '')}</span></div>`;
      }
      const anzeige = mengeRunden(z.menge * faktor);
      return `<div class="zutat-zeile">
        <span>${htmlSicher(z.name)}</span>
        <span class="menge"><button type="button" class="menge-knopf" data-id="${id}" data-basis="${z.menge}" data-wert="${anzeige}"
          data-einheit="${htmlSicher(z.einheit || '')}" onclick="mengeBearbeiten(this)"
          aria-label="Menge ${htmlSicher(z.name)} ändern">${zahlDeutsch(anzeige)}${z.einheit ? ' ' + htmlSicher(z.einheit) : ''}</button></span>
      </div>`;
    }).join('');
  }

  // Tipp auf eine Menge: wird zum Eingabefeld, die Eingabe rechnet alles andere um
  function mengeBearbeiten(knopf) {
    const span = knopf.parentElement;
    span.innerHTML = `<input type="number" step="any" inputmode="decimal" value="${knopf.dataset.wert}"
      data-basis="${knopf.dataset.basis}" data-id="${knopf.dataset.id}" aria-label="neue Menge"> ${knopf.dataset.einheit}`;
    const input = span.querySelector('input');
    input.addEventListener('change', () => scaleByZutat(input));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('blur', () => { if (document.body.contains(input)) renderZutatenListe(input.dataset.id); });
    input.focus();
    input.select();
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

  // ---- Verknüpfte Techniken für die Detailansicht laden ----
  async function loadRecipeTechniquesForDetail(recipeId) {
    const el = document.getElementById(`recipe-techniques-${recipeId}`);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/recipe_techniques?select=techniques(name)&recipe_id=eq.${recipeId}`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const rows = await res.json();
    const names = rows.map(r => r.techniques?.name).filter(Boolean);
    el.innerHTML = names.length
      ? names.map(n => `<span class="chip">${htmlSicher(n)}</span>`).join('')
      : '<span class="muted">(keine zugeordnet)</span>';
  }

  // ---- Hinweis, falls das Rezept schon reflektiert wurde (Original-Änderung würde den Verlauf "veralten") ----
  async function warnFallsReflektiert(recipeId) {
    const el = document.getElementById(`reflexions-hinweis-${recipeId}`);
    if (!el) return;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/reflections?select=id&recipe_id=eq.${recipeId}&limit=1`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const rows = await res.json();
    if (rows.length > 0) {
      el.innerHTML = `<div class="muted" style="font-size:0.8rem;">Schon reflektiert: Wenn du das Original änderst, bleibt dein Verlauf auf dem alten Stand. Bei größeren Änderungen ist eine Kopie klarer.</div>`;
    }
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

  // ---- Techniken laden ----
