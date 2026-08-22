// Teil von Skillet - siehe index.html für die anderen Module (shared.js, recipes.js, reflect.js, progress-history.js, init.js)

  let currentReflectionId = null;
  let currentTechniqueId = null;
  let currentReflectRecipeId = null;

  function onTechniqueSelectChange() {
    // aktuell nur Platzhalter für spätere Erweiterungen, Sichtbarkeit steuert onReflectRecipeChange
  }

  // ---- Rezepte für die Reflexions-Auswahl laden ----
  async function loadRecipesForReflect() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=id,titel&order=erstellt_am.desc`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    const recipes = await res.json();
    const select = document.getElementById('reflect-recipe-select');
    const previousValue = select.value;
    select.innerHTML = `<option value="">Kein Rezept / freie Auswahl</option>` +
      recipes.map(r => `<option value="${r.id}">${r.titel}</option>`).join('');
    select.value = previousValue;
  }

  // ---- Bei Rezept-Auswahl: nur noch Titel-Feld ein-/ausblenden (Filterung entfällt, wird zum Kontext-Hinweis für K2) ----
  function onReflectRecipeChange() {
    const recipeId = document.getElementById('reflect-recipe-select').value;
    currentReflectRecipeId = recipeId || null;

    // Titel-Feld nur relevant, wenn kein Rezept gewählt ist (K4: Auto-Anlage eines Rezepts)
    document.getElementById('auto-titel-wrapper').style.display = recipeId ? 'none' : 'block';
  }

  // ---- Auto-Erkennungs-Zustand (K2-K4) ----
  let autoQueue = [];
  let autoQueueIndex = 0;
  let autoRecipeId = null;
  let autoBeschreibung = "";
  let autoVorschlag = null;

  // ---- Hilfsfunktion: ein reflect-technique-Aufruf ----
  async function callReflectTechnique(technique_id, beschreibung_text, reflection_id, recipe_id) {
    const body = { technique_id, modus: "voll", beschreibung_text };
    if (reflection_id) body.reflection_id = reflection_id;
    if (!reflection_id && recipe_id) body.recipe_id = recipe_id;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/reflect-technique`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  // ---- Reflexion absenden (Rückfrage-Runde, explizite Technik, oder Auto-Erkennung starten) ----
  async function submitReflection() {
    const beschreibungInput = document.getElementById('beschreibung').value.trim();
    if (!beschreibungInput) return;

    const btn = document.getElementById('submit-btn');
    const statusLine = document.getElementById('status-line');
    btn.disabled = true;

    try {
      // Fall 1: laufende Rückfrage-Runde (egal ob manuell oder Teil der Auto-Queue)
      if (currentReflectionId) {
        statusLine.textContent = "Wird ausgewertet...";
        const data = await callReflectTechnique(currentTechniqueId, beschreibungInput, currentReflectionId, null);
        if (data.error) { statusLine.textContent = "Fehler: " + data.error; btn.disabled = false; return; }
        document.getElementById('beschreibung').value = "";

        if (!data.abgeschlossen) {
          currentReflectionId = data.reflection_id;
          renderResult(data.ergebnis_dieser_runde, false);
          statusLine.textContent = "Bitte beantworte die Rückfrage unten.";
        } else {
          renderResult(data.finaler_output, true, data.ergebnis, data.progress);
          currentReflectionId = null;
          if (autoQueue.length > 0) { await advanceAutoQueue(statusLine); }
          else { statusLine.textContent = "Reflexion abgeschlossen."; }
        }
        btn.disabled = false;
        return;
      }

      // Fall 2: explizite Technik gewählt -> Auto-Modus umgehen, normaler Einzel-Ablauf
      const gewaehlteTechnik = document.getElementById('technique-select').value;
      if (gewaehlteTechnik) {
        statusLine.textContent = "Wird ausgewertet...";
        const data = await callReflectTechnique(gewaehlteTechnik, beschreibungInput, null, currentReflectRecipeId);
        if (data.error) { statusLine.textContent = "Fehler: " + data.error; btn.disabled = false; return; }
        currentTechniqueId = gewaehlteTechnik;
        document.getElementById('beschreibung').value = "";

        if (!data.abgeschlossen) {
          currentReflectionId = data.reflection_id;
          renderResult(data.ergebnis_dieser_runde, false);
          statusLine.textContent = "Bitte beantworte die Rückfrage unten.";
        } else {
          renderResult(data.finaler_output, true, data.ergebnis, data.progress);
          statusLine.textContent = "Reflexion abgeschlossen.";
        }
        btn.disabled = false;
        return;
      }

      // Fall 3: Auto-Erkennung starten (K2)
      statusLine.textContent = "Erkenne Techniken...";
      document.getElementById('auto-detect-info').textContent = "";
      document.getElementById('reflect-vorschlag-card').innerHTML = "";

      const detectRes = await fetch(`${SUPABASE_URL}/functions/v1/detect-techniques-reflection`, {
        method: "POST",
        headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ beschreibung_text: beschreibungInput, recipe_id: currentReflectRecipeId || undefined })
      });
      const detectData = await detectRes.json();

      if (detectData.error) { statusLine.textContent = "Fehler: " + detectData.error; btn.disabled = false; return; }
      if (!detectData.erkannte_technik_ids || detectData.erkannte_technik_ids.length === 0) {
        statusLine.textContent = "Keine bekannte Technik erkannt. Du kannst oben auch manuell eine Technik wählen.";
        btn.disabled = false;
        return;
      }

      autoQueue = detectData.erkannte_technik_ids;
      autoQueueIndex = 0;
      autoBeschreibung = beschreibungInput;
      autoVorschlag = detectData.neue_technik_vorschlag || null;

      // Rezept bestimmen: gewähltes nehmen, oder neu anlegen (K4)
      if (currentReflectRecipeId) {
        autoRecipeId = currentReflectRecipeId;
      } else {
        const titelInput = document.getElementById('auto-titel-input').value.trim();
        const titel = titelInput || `Spontan gekocht - ${new Date().toLocaleDateString('de-DE')}`;
        const recipeRes = await fetch(`${SUPABASE_URL}/rest/v1/recipes`, {
          method: "POST",
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ titel, anleitung: beschreibungInput, zutaten: null })
        });
        const [neuesRezept] = await recipeRes.json();
        autoRecipeId = neuesRezept.id;
        currentReflectRecipeId = autoRecipeId;
        loadRecipesForReflect();
      }

      // Erkannte Techniken mit dem Rezept verknüpfen (nur die, die noch fehlen)
      const existingRes = await fetch(`${SUPABASE_URL}/rest/v1/recipe_techniques?select=technique_id&recipe_id=eq.${autoRecipeId}`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
      });
      const existingIds = new Set((await existingRes.json()).map(r => r.technique_id));
      const neueVerknuepfungen = autoQueue.filter(id => !existingIds.has(id)).map(id => ({ recipe_id: autoRecipeId, technique_id: id }));
      if (neueVerknuepfungen.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/recipe_techniques`, {
          method: "POST",
          headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(neueVerknuepfungen)
        });
      }

      document.getElementById('beschreibung').value = "";
      await startQueueItem(statusLine);
    } catch (e) {
      statusLine.textContent = "Verbindungsfehler: " + e.message;
    }
    btn.disabled = false;
  }

  // ---- Aktuelles Element der Auto-Queue starten ----
  async function startQueueItem(statusLine) {
    const techId = autoQueue[autoQueueIndex];
    const techName = techniques.find(t => t.id === techId)?.name || techId;
    document.getElementById('auto-detect-info').textContent = `Technik ${autoQueueIndex + 1} von ${autoQueue.length}: ${techName}`;
    statusLine.textContent = "Wird ausgewertet...";

    currentTechniqueId = techId;
    const data = await callReflectTechnique(techId, autoBeschreibung, null, autoRecipeId);
    if (data.error) { statusLine.textContent = "Fehler: " + data.error; return; }

    if (!data.abgeschlossen) {
      currentReflectionId = data.reflection_id;
      renderResult(data.ergebnis_dieser_runde, false);
      statusLine.textContent = "Bitte beantworte die Rückfrage unten.";
    } else {
      currentReflectionId = null;
      renderResult(data.finaler_output, true, data.ergebnis, data.progress);
      await advanceAutoQueue(statusLine);
    }
  }

  // ---- Nach Abschluss einer Technik: nächste starten, oder fertig ----
  async function advanceAutoQueue(statusLine) {
    autoQueueIndex++;
    if (autoQueueIndex < autoQueue.length) {
      await startQueueItem(statusLine);
    } else {
      document.getElementById('auto-detect-info').textContent = `Alle ${autoQueue.length} erkannten Techniken reflektiert.`;
      statusLine.textContent = "Fertig!";
      if (autoVorschlag) {
        renderNeueTechnikVorschlag(autoVorschlag, autoRecipeId, 'reflect-vorschlag-card');
      }
      loadRecipes();
      autoQueue = [];
      autoQueueIndex = 0;
      autoRecipeId = null;
      autoVorschlag = null;
    }
  }

  // ---- Ergebnis darstellen ----
  let renderResultKriterienListe = [];
  let quickAntworten = {};

  function renderResult(output, abgeschlossen, ergebnis, progress) {
    const card = document.getElementById('result-card');
    let html = `<div class="card">`;
    renderResultKriterienListe = output.kriterien_bewertung || [];
    quickAntworten = {};

    const aktuelleTechnik = techniques.find(t => t.id === currentTechniqueId);
    if (aktuelleTechnik) {
      html += `
        <div style="margin-bottom:10px;">
          <a href="#" onclick="event.preventDefault(); toggleSteckbriefInfo();" style="color: var(--accent); font-size:0.85rem;">ℹ️ Warum diese Kriterien?</a>
          <div id="steckbrief-info-box" style="display:none; margin-top:8px; padding:10px 12px; background: var(--bg); border-radius:8px;">
            ${steckbriefHtml(aktuelleTechnik)}
          </div>
        </div>
      `;
    }

    if (output.kriterien_bewertung && output.kriterien_bewertung.length > 0) {
      html += output.kriterien_bewertung.map((k, idx) => {
        const zeigtButtons = !abgeschlossen && k.status === 'unklar';
        return `
        <div class="kriterium" style="${zeigtButtons ? 'flex-direction:column; align-items:flex-start; gap:6px;' : ''}">
          <span>${k.kriterium}</span>
          ${zeigtButtons
            ? `<div style="display:flex; gap:6px;">
                 <button type="button" onclick="setQuickAntwort(${idx}, 'ja', this)" style="width:auto; padding:4px 12px; font-size:0.85rem; border-radius:6px; border:1px solid var(--border); background:none; cursor:pointer;">Ja</button>
                 <button type="button" onclick="setQuickAntwort(${idx}, 'nein', this)" style="width:auto; padding:4px 12px; font-size:0.85rem; border-radius:6px; border:1px solid var(--border); background:none; cursor:pointer;">Nein</button>
                 <button type="button" onclick="setQuickAntwort(${idx}, 'unsicher', this)" style="width:auto; padding:4px 12px; font-size:0.85rem; border-radius:6px; border:1px solid var(--border); background:none; cursor:pointer;">Weiß nicht</button>
               </div>`
            : `<span class="badge ${k.status}">${k.status.replace('_', ' ')}</span>`}
        </div>
      `;
      }).join('');
    }

    if (output.fehler_erkannt && output.fehler_erkannt.length > 0) {
      html += `<div class="fehler-liste"><strong>Beobachtung:</strong> ${output.fehler_erkannt.join(' ')}</div>`;
    }

    if (output.gesamteinschaetzung) {
      html += `<p style="margin-top:14px;">${output.gesamteinschaetzung}</p>`;
    }

    if (!abgeschlossen && output.rueckfrage) {
      html += `<div class="rueckfrage-box"><strong>Rückfrage:</strong> ${output.rueckfrage}</div>`;
    }

    if (!abgeschlossen && output.kriterien_bewertung?.some(k => k.status === 'unklar')) {
      html += `
        <div style="margin-top:10px;">
          <textarea id="quick-antwort-notiz" placeholder="Weitere Anmerkungen (optional)" style="min-height:60px; width:100%; padding:8px; border-radius:8px; border:1px solid var(--border); font-family:inherit;"></textarea>
          <button class="primary" style="margin-top:8px;" onclick="submitQuickAntworten()">Antwort senden</button>
        </div>
      `;
    }

    if (abgeschlossen) {
      const labels = {
        sauber_bestaetigt: "✅ Sauber bestätigt",
        unklar_geblieben: "❔ Unklar geblieben",
        fehler_erkannt: "⚠️ Fehler erkannt",
        technischer_fehler: "⚠️ Technischer Fehler"
      };
      html += `<p style="margin-top:14px; font-weight:600;">${labels[ergebnis] || ergebnis}</p>`;
      if (progress) {
        html += `<p class="muted">Level ${progress.level} · ${progress.sauber_bestaetigt_count}x sauber bestätigt · ${progress.angewendet_count}x angewendet</p>`;
      }
    }

    html += `</div>`;
    card.innerHTML = html;
  }

  // ---- Steckbrief-Info in der Reflexion auf-/zuklappen ----
  function toggleSteckbriefInfo() {
    const box = document.getElementById('steckbrief-info-box');
    if (box) box.style.display = box.style.display === 'block' ? 'none' : 'block';
  }

  // ---- Ja/Nein/Weiß-nicht-Auswahl merken, Button optisch hervorheben ----
  function setQuickAntwort(idx, wert, btnEl) {
    const kriteriumText = renderResultKriterienListe[idx]?.kriterium;
    if (!kriteriumText) return;
    quickAntworten[idx] = { text: kriteriumText, wert };

    btnEl.parentElement.querySelectorAll('button').forEach(b => {
      b.style.background = 'none';
      b.style.color = 'var(--ink)';
      b.style.borderColor = 'var(--border)';
    });
    btnEl.style.background = 'var(--accent)';
    btnEl.style.color = 'white';
    btnEl.style.borderColor = 'var(--accent)';
  }

  // ---- Aus den Ja/Nein-Antworten einen Antworttext zusammensetzen und absenden ----
  function submitQuickAntworten() {
    const praefix = { ja: 'Ja', nein: 'Nein', unsicher: 'Unsicher' };
    const zeilen = Object.values(quickAntworten).map(a => `${praefix[a.wert]}: ${a.text}`);

    const notizEl = document.getElementById('quick-antwort-notiz');
    const notiz = notizEl ? notizEl.value.trim() : '';
    if (notiz) zeilen.push(notiz);

    if (zeilen.length === 0) return; // nichts ausgewählt und keine Notiz -> nichts zu senden

    document.getElementById('beschreibung').value = zeilen.join('\n');
    submitReflection();
  }

  // ---- Fortschritt laden ----
