// Teil von Skillet - Konfiguration und Navigation. Module: shared, recipes, einkauf, naehrwerte, kochmodus, start, init

  const SUPABASE_URL = "https://isqbuagacqnmeephathu.supabase.co";
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcWJ1YWdhY3FubWVlcGhhdGh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NjU4MTcsImV4cCI6MjEwMTA0MTgxN30.pcRqIk3DMfhCsOgrln56qAnyNJBlJIG0shmy69TlREA";
  // =====================================================

  // ---- Navigation wie in Nest: Startbildschirm, darunter nur noch der Bereich Rezepte ----
  // Kochen läuft als schwebende Karte + Vollbild (kochmodus.js), braucht keinen eigenen Bereich.
  const SECTION_TITLES = { recipes: 'Rezepte' };
  const SECTION_LOADERS = { recipes: () => loadRecipes() };

  function openSection(section) {
    if (!SECTION_TITLES[section]) return;

    document.getElementById('start-view').style.display = 'none';
    document.getElementById('bereich-kopf').style.display = 'flex';
    document.getElementById('bereich-titel').textContent = SECTION_TITLES[section];
    Object.keys(SECTION_TITLES).forEach(s => {
      const view = document.getElementById('view-' + s);
      if (view) view.style.display = s === section ? 'block' : 'none';
    });

    if (SECTION_LOADERS[section]) SECTION_LOADERS[section]();
    window.scrollTo(0, 0);

    try { localStorage.setItem('skillet_active_section', section); } catch (e) { /* localStorage evtl. nicht verfügbar - kein Beinbruch */ }
  }

  function zeigeStart() {
    Object.keys(SECTION_TITLES).forEach(s => {
      const view = document.getElementById('view-' + s);
      if (view) view.style.display = 'none';
    });
    document.getElementById('bereich-kopf').style.display = 'none';
    document.getElementById('start-view').style.display = 'block';
    window.scrollTo(0, 0);
    if (typeof ladeKachelInfos === 'function') ladeKachelInfos();

    try { localStorage.setItem('skillet_active_section', 'start'); } catch (e) {}
  }
