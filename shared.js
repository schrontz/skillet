// Teil von Skillet - siehe index.html für die anderen Module (shared.js, recipes.js, reflect.js, progress-history.js, init.js)

  const SUPABASE_URL = "https://isqbuagacqnmeephathu.supabase.co";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcWJ1YWdhY3FubWVlcGhhdGh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NjU4MTcsImV4cCI6MjEwMTA0MTgxN30.pcRqIk3DMfhCsOgrln56qAnyNJBlJIG0shmy69TlREA";
  // =====================================================

  let techniques = [];

  // ---- Zwei-Ebenen-Navigation: Kategorie (Kochen/Lernen) + Akkordeon-Unterbereich ----
  const SECTION_CATEGORY = {
    recipes: 'kochen', kochmodus: 'kochen', freestyle: 'kochen',
    reflect: 'lernen', progress: 'lernen', history: 'lernen'
  };
  const CATEGORY_SECTIONS = {
    kochen: ['recipes', 'kochmodus', 'freestyle'],
    lernen: ['reflect', 'progress', 'history']
  };
  const SECTION_LOADERS = {
    recipes: () => loadRecipes(),
    progress: () => loadProgress(),
    reflect: () => loadRecipesForReflect(),
    history: () => loadHistory()
    // kochmodus, freestyle: keine Ladefunktion nötig
  };

  function openSection(section) {
    const category = SECTION_CATEGORY[section];
    if (!category) return;

    document.getElementById('category-kochen').style.display = category === 'kochen' ? 'block' : 'none';
    document.getElementById('category-lernen').style.display = category === 'lernen' ? 'block' : 'none';
    document.getElementById('cat-kochen').classList.toggle('active', category === 'kochen');
    document.getElementById('cat-lernen').classList.toggle('active', category === 'lernen');

    CATEGORY_SECTIONS[category].forEach(s => {
      const body = document.getElementById('view-' + s);
      const header = document.getElementById('header-' + s);
      if (body) body.style.display = s === section ? 'block' : 'none';
      if (header) header.classList.toggle('active', s === section);
    });

    if (SECTION_LOADERS[section]) SECTION_LOADERS[section]();

    try { localStorage.setItem('skillet_active_section', section); } catch (e) { /* localStorage evtl. nicht verfügbar - kein Beinbruch */ }
  }


  async function loadTechniques() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/techniques?select=id,name,kurzbeschreibung,kernkriterien,typische_fehler,root_kategorie&order=name.asc`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    });
    techniques = await res.json();
    renderTechniqueOptions(techniques);
  }

  // ---- Wiederverwendbarer Steckbrief-Baustein (Reflexion + Fortschritt nutzen das gleiche) ----
  function steckbriefHtml(technique) {
    if (!technique) return '<div class="muted">Kein Steckbrief verfügbar.</div>';
    return `
      ${technique.root_kategorie ? `<div class="muted" style="font-size:0.8rem; margin-bottom:6px;">${technique.root_kategorie}</div>` : ''}
      ${technique.kurzbeschreibung ? `<p style="margin:0 0 10px;">${technique.kurzbeschreibung}</p>` : ''}
      ${technique.typische_fehler && technique.typische_fehler.length > 0
        ? `<div style="font-size:0.85rem; font-weight:600; margin-bottom:4px;">Typische Fehler</div>
           <div class="fehler-liste">${technique.typische_fehler.join(' ')}</div>`
        : ''}
    `;
  }

  // ---- Techniken-Dropdown befüllen (volle oder gefilterte Liste) ----
  function renderTechniqueOptions(list) {
    const select = document.getElementById('technique-select');
    select.innerHTML = `<option value="">Automatisch erkennen lassen</option>` +
      list.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  }

  // ---- Titel-Feld nur relevant, wenn kein Rezept gewählt ist ----

  function renderNeueTechnikVorschlag(vorschlag, recipeId, containerId = 'detect-card') {
    const box = document.createElement('div');
    box.className = 'card';
    box.id = 'neue-technik-card';
    box.innerHTML = `
      <div style="margin-bottom:8px;">💡 <strong>Neue Technik vorgeschlagen: ${vorschlag.name}</strong></div>
      <div class="muted" style="margin-bottom:14px;">${vorschlag.begruendung}</div>
      <div style="display:flex; gap:8px;">
        <button class="primary" style="width:auto; flex:1;" onclick="generateTechniqueSteckbrief('${vorschlag.name.replace(/'/g, "\\'")}', '${recipeId}')">Steckbrief erstellen</button>
        <button style="width:auto; flex:1; background:none; border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="document.getElementById('neue-technik-card').remove()">Ignorieren</button>
      </div>
    `;
    document.getElementById(containerId).appendChild(box);
  }

  // ---- Steckbrief-Entwurf generieren lassen (nutzt B3-Prompt via Edge Function) ----
  async function generateTechniqueSteckbrief(name, recipeId) {
    const box = document.getElementById('neue-technik-card');
    box.innerHTML = `<div class="muted">Steckbrief wird erstellt...</div>`;

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-technique`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ name })
      });
      const steckbrief = await res.json();

      if (steckbrief.error) {
        box.innerHTML = `<div>Fehler: ${steckbrief.error}</div>`;
        return;
      }

      box.innerHTML = `
        <div style="margin-bottom:8px;"><strong>${steckbrief.name}</strong></div>
        ${steckbrief.root_kategorie
          ? `<div class="muted" style="margin-bottom:8px;">Kategorie: ${steckbrief.root_kategorie}</div>`
          : `<div class="fehler-liste" style="margin-bottom:8px;">Keine Root-Kategorie passt: ${steckbrief.root_kategorie_hinweis || 'kein Hinweis angegeben'}</div>`}
        <div class="muted" style="margin-bottom:10px;">${steckbrief.kurzbeschreibung}</div>
        <div style="font-size:0.88rem; font-weight:600; margin-top:8px;">Kernkriterien</div>
        ${steckbrief.kernkriterien.map(k => `<div class="kriterium"><span>${k}</span></div>`).join('')}
        <div style="font-size:0.88rem; font-weight:600; margin-top:10px;">Typische Fehler</div>
        <div class="fehler-liste">${steckbrief.typische_fehler.join(' ')}</div>
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="primary" style="width:auto; flex:1;" id="save-technique-btn">Speichern</button>
          <button style="width:auto; flex:1; background:none; border:1px solid var(--border); border-radius:8px; cursor:pointer;" onclick="document.getElementById('neue-technik-card').remove()">Verwerfen</button>
        </div>
      `;
      document.getElementById('save-technique-btn').onclick = () => saveNewTechnique(steckbrief, recipeId);
    } catch (e) {
      box.innerHTML = `<div>Verbindungsfehler: ${e.message}</div>`;
    }
  }

  // ---- Neue Technik final speichern + dem Rezept zuordnen ----
  async function saveNewTechnique(steckbrief, recipeId) {
    const box = document.getElementById('neue-technik-card');
    box.innerHTML = `<div class="muted">Speichere...</div>`;

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/techniques`, {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          name: steckbrief.name,
          kurzbeschreibung: steckbrief.kurzbeschreibung,
          kernkriterien: steckbrief.kernkriterien,
          typische_fehler: steckbrief.typische_fehler,
          voraussetzungen: steckbrief.voraussetzungen || [],
          root_kategorie: steckbrief.root_kategorie || null
        })
      });
      const [newTechnique] = await res.json();

      await fetch(`${SUPABASE_URL}/rest/v1/recipe_techniques`, {
        method: "POST",
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ recipe_id: recipeId, technique_id: newTechnique.id })
      });

      await loadTechniques(); // globale Liste aktualisieren, damit sie überall auftaucht
      box.innerHTML = `<div class="muted">✅ "${newTechnique.name}" wurde angelegt und zugeordnet.</div>`;
    } catch (e) {
      box.innerHTML = `<div>Fehler beim Speichern: ${e.message}</div>`;
    }
  }

  // ---- Bestätigte Techniken in recipe_techniques speichern ----
