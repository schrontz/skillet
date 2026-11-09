// Teil von Skillet - Startbildschirm: Datum und Infos in den beiden Kacheln
// Zahlen-Badges nur, wo etwas offen ist (wie in Nest): hier angefangene Notizen vom freien Kochen

function setzeKachel(bereich, info, zahl) {
  const infoEl = document.getElementById('kachel-info-' + bereich);
  if (infoEl && info !== undefined) infoEl.textContent = info;
  const zahlEl = document.getElementById('kachel-zahl-' + bereich);
  if (zahlEl) {
    zahlEl.textContent = zahl || '';
    zahlEl.style.display = zahl ? 'grid' : 'none';
  }
}

function ladeKachelInfos() {
  document.getElementById('start-datum').textContent =
    new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const notizen = ladeFreiNotizen().length;
  setzeKachel('kochen',
    notizen ? `Frei kochen: ${notizen} ${notizen === 1 ? 'Notiz' : 'Notizen'} offen` : 'mit Rezept oder frei',
    notizen);

  fetch(`${SUPABASE_URL}/rest/v1/recipes?select=id`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
    .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(rezepte => setzeKachel('recipes', rezepte.length ? `${rezepte.length} gespeichert` : 'Noch keine Rezepte'))
    .catch(() => setzeKachel('recipes', ''));
}
