// Teil von Skillet - Startbildschirm: Datum und Infos in den Kacheln

const START_HEADERS = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

function setzeKachel(bereich, info, zahl) {
  const infoEl = document.getElementById('kachel-info-' + bereich);
  if (infoEl && info !== undefined) infoEl.textContent = info;
  const zahlEl = document.getElementById('kachel-zahl-' + bereich);
  if (zahlEl) {
    zahlEl.textContent = zahl || '';
    zahlEl.style.display = zahl ? 'grid' : 'none';
  }
}

async function holeJson(pfad) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, { headers: START_HEADERS });
  if (!res.ok) throw new Error('Status ' + res.status);
  return res.json();
}

function ladeKachelInfos() {
  document.getElementById('start-datum').textContent =
    new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  // Freestyle: offene Diktat-Schritte liegen nur auf diesem Gerät
  let offeneSchritte = 0;
  try { offeneSchritte = (JSON.parse(localStorage.getItem('skillet_freestyle_schnipsel')) || []).length; } catch (e) {}
  setzeKachel('freestyle',
    offeneSchritte ? `${offeneSchritte} ${offeneSchritte === 1 ? 'Schritt' : 'Schritte'} diktiert` : 'Rezept Schritt für Schritt diktieren',
    offeneSchritte);

  // Jede Kachel einzeln laden: fällt eine Abfrage aus, bleiben die anderen stehen
  holeJson('recipes?select=titel&order=erstellt_am.desc')
    .then(rezepte => setzeKachel('recipes',
      rezepte.length ? `Zuletzt: ${rezepte[0].titel}` : 'Noch keine Rezepte',
      rezepte.length))
    .catch(() => setzeKachel('recipes', ''));

  Promise.all([holeJson('techniques?select=id'), holeJson('technique_progress?select=level')])
    .then(([alle, fortschritt]) => {
      const abLevel1 = fortschritt.filter(p => p.level >= 1).length;
      setzeKachel('progress', `${abLevel1} von ${alle.length} Techniken ab Level 1`);
    })
    .catch(() => setzeKachel('progress', ''));

  holeJson('reflections?select=erstellt_am,techniques(name)&finaler_output=not.is.null&order=erstellt_am.desc&limit=1')
    .then(([letzte]) => {
      if (!letzte) { setzeKachel('history', 'Noch keine Reflexionen'); return; }
      const datum = new Date(letzte.erstellt_am).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
      setzeKachel('history', `Zuletzt: ${letzte.techniques?.name || 'Reflexion'}, ${datum}`);
    })
    .catch(() => setzeKachel('history', ''));
}
