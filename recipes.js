// Teil von Skillet - siehe index.html für die anderen Module (shared.js, recipes.js, reflect.js, progress-history.js, init.js)

  function addZutatRow(menge = '', einheit = '', name = '') {
    const container = document.getElementById('zutaten-rows');
    const row = document.createElement('div');
    row.className = 'zutat-row';
    row.style = 'display:flex; gap:6px; margin-bottom:6px; align-items:center;';
    row.innerHTML = `
      <input type="number" step="any" placeholder="Menge" value="${menge ?? ''}" class="zutat-menge" style="width:70px; padding:8px; border-radius:6px; border:1px solid var(--border); font-family:inherit;">
      <input type="text" placeholder="Einheit" value="${einheit ?? ''}" class="zutat-einheit" style="width:70px; padding:8px; border-radius:6px; border:1px solid var(--border); font-family:inherit;">
      <input type="text" placeholder="Zutat" value="${name ?? ''}" class="zutat-name" style="flex:1; padding:8px; border-radius:6px; border:1px solid var(--border); font-family:inherit;">
      <button type="button" onclick="this.parentElement.remove()" style="width:auto; padding:6px 10px; background:none; border:1px solid var(--border); border-radius:6px; cursor:pointer;">×</button>
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
    row.style = 'display:flex; gap:6px; margin-bottom:6px; align-items:flex-start;';
    row.innerHTML = `
      <span class="schritt-nr muted" style="padding-top:10px; width:22px; flex-shrink:0;"></span>
      <textarea class="schritt-text" placeholder="Schritt beschreiben..." style="flex:1; min-height:50px; padding:8px; border-radius:6px; border:1px solid var(--border); font-family:inherit;">${text}</textarea>
      <div style="display:flex; flex-direction:column; gap:2px;">
        <button type="button" onclick="moveSchrittRow(this, -1)" style="width:auto; padding:2px 8px; background:none; border:1px solid var(--border); border-radius:4px; cursor:pointer;">↑</button>
        <button type="button" onclick="moveSchrittRow(this, 1)" style="width:auto; padding:2px 8px; background:none; border:1px solid var(--border); border-radius:4px; cursor:pointer;">↓</button>
        <button type="button" onclick="this.closest('.schritt-row').remove(); renumberSchritte();" style="width:auto; padding:2px 8px; background:none; border:1px solid var(--border); border-radius:4px; cursor:pointer;">×</button>
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

      await detectAndConfirmTechniques(savedRecipe, titel, zutaten, anleitung);
      statusLine.textContent = hinweisOriginalWeg ? "Gespeichert (ohne Kopie-Verweis, Original war weg)." : "Gespeichert!";
    } catch (e) {
      statusLine.textContent = "Verbindungsfehler: " + e.message;
    }
    btn.disabled = false;
  }

  // ---- Freestyle: Rezept diktieren/tippen, unabhängig vom Kochmodus ----
  async function extrahiereFreestyleRezept() {
    const text = document.getElementById('freestyle-diktat-text').value.trim();
    if (!text) return;
    const statusEl = document.getElementById('freestyle-status');
    statusEl.textContent = "Rezept wird erkannt...";

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-recipe-from-text`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (data.error) { statusEl.textContent = "Fehler: " + data.error; return; }

      document.getElementById('recipe-titel-input').value = data.titel || "";
      document.getElementById('recipe-portionen-input').value = data.basisPortionen || "";

      clearZutatenRows();
      (data.zutatenStrukturiert || []).forEach(z => addZutatRow(z.menge, z.einheit, z.name));
      if (document.querySelectorAll('#zutaten-rows .zutat-row').length === 0) addZutatRow();

      clearSchritteRows();
      (data.anleitungSchritte || []).forEach(s => addSchrittRow(s));
      if (document.querySelectorAll('#schritte-rows .schritt-row').length === 0) addSchrittRow();

      document.getElementById('freestyle-diktat-text').value = "";
      statusEl.textContent = "";
      openSection('recipes');
      document.getElementById('recipe-status-line').textContent = "Bitte prüfen, dann unten speichern.";
      document.getElementById('recipe-titel-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      statusEl.textContent = "Verbindungsfehler: " + e.message;
    }
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
            <label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:0.92rem; cursor:pointer;">
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
    const rows = checked.map(technique_id => ({ recipe_id: recipeId, technique_id }));

    const detectCard = document.getElementById('detect-card');

    if (rows.length === 0) {
      detectCard.innerHTML = `<div class="card muted">Keine Techniken zugeordnet.</div>`;
      return;
    }

    try {
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

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/recipes?select=id,titel,zutaten,anleitung,anleitung_schritte,quelle_url,kopie_von,basis_portionen,zutaten_strukturiert,erstellt_am&order=erstellt_am.desc`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    );
    const data = await res.json();
    allRecipesCache = data;

    if (!data.length) {
      listEl.innerHTML = `<div class="muted">Noch keine Rezepte gespeichert.</div>`;
      return;
    }

    const titelById = Object.fromEntries(data.map(r => [r.id, r.titel]));

    listEl.innerHTML = data.map(r => `
      <div class="progress-item" style="align-items: flex-start; flex-direction: column; cursor:pointer;" onclick="toggleRecipeDetail('${r.id}')">
        <div style="font-weight:600;">${r.titel}</div>
        ${r.kopie_von && titelById[r.kopie_von] ? `<div class="muted" style="font-size:0.8rem;">Kopie von "${titelById[r.kopie_von]}"</div>` : ''}
        ${r.zutaten ? `<div class="muted" style="margin-top:4px;">${r.zutaten}</div>` : ''}
        <div id="recipe-detail-${r.id}" style="display:none; width:100%; margin-top:10px;" onclick="event.stopPropagation()"></div>
      </div>
    `).join('');
  }

  // ---- Detail aufklappen/zuklappen ----
  function toggleRecipeDetail(id) {
    const detailEl = document.getElementById(`recipe-detail-${id}`);
    const isOpen = detailEl.style.display === 'block';
    // alle anderen offenen Details schließen, damit die Liste übersichtlich bleibt
    document.querySelectorAll('[id^="recipe-detail-"]').forEach(el => el.style.display = 'none');

    if (isOpen) return; // war offen -> jetzt zu, fertig

    const r = allRecipesCache.find(rec => rec.id === id);
    const hatStrukturierteZutaten = r.zutaten_strukturiert && r.zutaten_strukturiert.length > 0 && r.basis_portionen;
    const nurPortionenOhneStruktur = r.basis_portionen && !hatStrukturierteZutaten;

    detailEl.innerHTML = `
      <div style="border-top:1px solid var(--border); padding-top:10px;">
        <div style="font-size:0.88rem; font-weight:600;">Zutaten</div>
        ${hatStrukturierteZutaten
          ? `<div style="display:flex; align-items:center; gap:10px; margin:6px 0;">
               <span class="muted" style="font-size:0.85rem;">Portionen:</span>
               <button style="width:auto; padding:2px 10px; background:none; border:1px solid var(--border); border-radius:6px; cursor:pointer;" onclick="changePortionen('${id}', -1)">-</button>
               <span id="portionen-anzeige-${id}" style="font-weight:600;">${r.basis_portionen}</span>
               <button style="width:auto; padding:2px 10px; background:none; border:1px solid var(--border); border-radius:6px; cursor:pointer;" onclick="changePortionen('${id}', 1)">+</button>
             </div>
             <div class="muted" style="font-size:0.78rem; margin-bottom:4px;">Tipp: Du kannst auch direkt eine Zutaten-Menge unten ändern, um danach umzurechnen.</div>
             <div id="zutaten-liste-${id}"></div>`
          : `${nurPortionenOhneStruktur ? `<div class="muted" style="font-size:0.85rem; margin-bottom:4px;">Für ${r.basis_portionen} Portionen (keine automatische Mengenumrechnung, da Zutaten nicht strukturiert erfasst)</div>` : ''}
             <div class="muted" style="white-space:pre-wrap; margin-bottom:10px;">${r.zutaten || '(keine Zutaten gespeichert)'}</div>`}
        <div style="font-size:0.88rem; font-weight:600; margin-top:10px;">Anleitung</div>
        ${r.anleitung_schritte && r.anleitung_schritte.length > 0
          ? `<ol style="padding-left:20px; margin:0 0 10px;">${r.anleitung_schritte.map(s => `<li style="margin-bottom:6px;">${s}</li>`).join('')}</ol>`
          : `<div class="muted" style="white-space:pre-wrap; margin-bottom:10px;">${r.anleitung || '(keine Anleitung gespeichert)'}</div>`}
        <div style="font-size:0.88rem; font-weight:600;">Techniken</div>
        <div id="recipe-techniques-${id}" class="muted">Lade...</div>
        ${r.quelle_url ? `<div style="margin-top:8px;"><a href="${r.quelle_url}" target="_blank" style="color: var(--accent); font-size:0.85rem;">Quelle öffnen</a></div>` : ''}
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button style="width:auto; flex:1; padding:8px 12px; background:none; border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="startEditAsCopy('${id}')">Bearbeiten (als Kopie)</button>
          <button style="width:auto; flex:1; padding:8px 12px; background:none; border:1px solid var(--accent); color:var(--accent); border-radius:8px; cursor:pointer;" onclick="deleteRecipe('${id}')">Löschen</button>
        </div>
      </div>
    `;
    detailEl.style.display = 'block';
    if (hatStrukturierteZutaten) {
      aktuellePortionen[id] = r.basis_portionen;
      renderZutatenListe(id);
    }
    loadRecipeTechniquesForDetail(id);
  }

  // ---- Portionen ändern und Zutatenliste neu berechnen ----
  let aktuellePortionen = {};

  function changePortionen(id, delta) {
    const neu = Math.max(1, (aktuellePortionen[id] || 1) + delta);
    aktuellePortionen[id] = neu;
    document.getElementById(`portionen-anzeige-${id}`).textContent = neu;
    renderZutatenListe(id);
  }

  function renderZutatenListe(id) {
    const r = allRecipesCache.find(rec => rec.id === id);
    const faktor = aktuellePortionen[id] / r.basis_portionen;
    const listEl = document.getElementById(`zutaten-liste-${id}`);

    listEl.innerHTML = r.zutaten_strukturiert.map(z => {
      if (z.menge === null || z.menge === undefined) {
        return `<div class="kriterium"><span>${z.name}</span></div>`;
      }
      const neueMenge = z.menge * faktor;
      // sinnvoll runden: bei kleinen Mengen 1 Nachkommastelle, sonst ganze Zahl
      const anzeige = neueMenge < 10 ? Math.round(neueMenge * 10) / 10 : Math.round(neueMenge);
      return `<div class="kriterium">
        <span>${z.name}</span>
        <span>
          <input type="number" step="any" value="${anzeige}" data-basis="${z.menge}" data-id="${id}"
            onchange="scaleByZutat(this)"
            style="width:60px; padding:2px 4px; border-radius:4px; border:1px solid var(--border); text-align:right; font-family:inherit;">
          ${z.einheit || ''}
        </span>
      </div>`;
    }).join('');
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
    document.getElementById(`portionen-anzeige-${id}`).textContent = aktuellePortionen[id];
    renderZutatenListe(id);
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
    el.textContent = names.length ? names.join(', ') : '(keine zugeordnet)';
  }

  // ---- Bearbeiten als Kopie: Formular befüllen ----
  let editingCopyOf = null;

  function startEditAsCopy(id) {
    const r = allRecipesCache.find(rec => rec.id === id);
    editingCopyOf = { id: r.id, quelle_url: r.quelle_url || null };

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

    document.getElementById('edit-mode-original-title').textContent = r.titel;
    document.getElementById('edit-mode-banner').style.display = 'block';

    document.getElementById('recipe-titel-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cancelEditCopy() {
    editingCopyOf = null;
    document.getElementById('edit-mode-banner').style.display = 'none';
    document.getElementById('recipe-titel-input').value = '';
    clearZutatenRows(); addZutatRow();
    clearSchritteRows(); addSchrittRow();
    document.getElementById('recipe-portionen-input').value = '';
  }

  // ---- Rezept löschen ----
  async function deleteRecipe(id) {
    if (!confirm('Dieses Rezept wirklich löschen? Zugehörige Techniken/dein Fortschritt bleiben erhalten.')) return;

    await fetch(`${SUPABASE_URL}/rest/v1/recipes?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    loadRecipes();
  }

  // ---- Techniken laden ----
