// Teil von Skillet - siehe index.html für die anderen Module (shared.js, recipes.js, reflect.js, progress-history.js, init.js)

  loadTechniques();
  addZutatRow();
  addSchrittRow();

  // ---- Letzten aktiven Bereich wiederherstellen (übersteht ein versehentliches Neuladen) ----
  (function restoreLastSection() {
    let letzteSektion;
    try { letzteSektion = localStorage.getItem('skillet_active_section'); } catch (e) {}
    if (letzteSektion && document.getElementById('view-' + letzteSektion)) {
      openSection(letzteSektion);
    }
  })();

  // ---- Laufende Kochmodus-Session wiederherstellen, falls vorhanden ----
  restoreKochmodusSessionIfAny();

  // ---- Geteilte URL empfangen (Web Share Target API) ----
  (function handleSharedUrl() {
    const params = new URLSearchParams(window.location.search);
    const geteilteUrl = params.get('shared_url') || params.get('shared_text') || '';
    // manche Apps legen den Link in "text" statt "url" ab - grob nach http(s) suchen
    const urlMatch = geteilteUrl.match(/https?:\/\/\S+/);
    if (urlMatch) {
      openSection('recipes');
      document.getElementById('import-url-input').value = urlMatch[0];
      // kurze Verzögerung, damit die Rezepte-Ansicht sicher aufgebaut ist
      setTimeout(() => importRecipeFromUrl(), 300);
      // URL-Parameter aus der Adresszeile entfernen, damit ein Neuladen nicht erneut importiert
      window.history.replaceState({}, '', window.location.pathname);
    }
  })();
