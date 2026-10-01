// Teil von Skillet - Freestyle: Rezept Schritt für Schritt diktieren, am Ende zusammensetzen

const FREESTYLE_STORAGE_KEY = 'skillet_freestyle_schnipsel';

function ladeFreestyleSchnipsel() {
  try {
    return JSON.parse(localStorage.getItem(FREESTYLE_STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function speichereFreestyleSchnipsel(liste) {
  try { localStorage.setItem(FREESTYLE_STORAGE_KEY, JSON.stringify(liste)); } catch (e) { /* dann eben nur im Speicher */ }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderFreestyleSchnipsel() {
  const liste = ladeFreestyleSchnipsel();
  const el = document.getElementById('freestyle-schnipsel-liste');
  const btn = document.getElementById('freestyle-zusammensetzen-btn');
  if (!el) return;

  if (liste.length === 0) {
    el.innerHTML = `<div class="muted" style="font-size:0.85rem;">Noch keine Schritte.</div>`;
  } else {
    el.innerHTML = liste.map((s, i) => `
      <div class="kriterium" style="align-items:flex-start; gap:8px;">
        <span><span class="muted">${i + 1}.</span> ${escapeHtml(s.text)}</span>
        <button type="button" onclick="loescheFreestyleSchnipsel(${i})" title="Schritt löschen"
          style="width:auto; padding:2px 8px; background:none; border:1px solid var(--border); border-radius:4px; cursor:pointer; flex-shrink:0;">×</button>
      </div>
    `).join('');
  }
  if (btn) btn.disabled = liste.length === 0;
}

function addFreestyleSchnipsel() {
  const input = document.getElementById('freestyle-schnipsel-input');
  const text = input.value.trim();
  if (!text) return;

  const liste = ladeFreestyleSchnipsel();
  liste.push({ text, zeit: new Date().toISOString() });
  speichereFreestyleSchnipsel(liste);

  input.value = '';
  document.getElementById('freestyle-status').textContent = '';
  renderFreestyleSchnipsel();
}

function loescheFreestyleSchnipsel(index) {
  const liste = ladeFreestyleSchnipsel();
  liste.splice(index, 1);
  speichereFreestyleSchnipsel(liste);
  renderFreestyleSchnipsel();
}

function neuAnfangenFreestyle() {
  if (ladeFreestyleSchnipsel().length > 0 && !confirm('Alle diktierten Schritte löschen?')) return;
  speichereFreestyleSchnipsel([]);
  document.getElementById('freestyle-status').textContent = '';
  renderFreestyleSchnipsel();
}

async function setzeFreestyleRezeptZusammen() {
  // Falls noch etwas im Eingabefeld steht, das nicht hinzugefügt wurde: mitnehmen
  if (document.getElementById('freestyle-schnipsel-input').value.trim()) addFreestyleSchnipsel();

  const liste = ladeFreestyleSchnipsel();
  if (liste.length === 0) return;

  const statusEl = document.getElementById('freestyle-status');
  const btn = document.getElementById('freestyle-zusammensetzen-btn');
  btn.disabled = true;
  statusEl.textContent = 'Rezept wird zusammengesetzt...';

  const text = 'Notizen in der Reihenfolge, in der gekocht wurde:\n' +
    liste.map((s, i) => `${i + 1}. ${s.text}`).join('\n');

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-recipe-from-text`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.error) { statusEl.textContent = 'Fehler: ' + data.error; btn.disabled = false; return; }

    document.getElementById('recipe-titel-input').value = data.titel || '';
    document.getElementById('recipe-portionen-input').value = data.basisPortionen || '';

    clearZutatenRows();
    (data.zutatenStrukturiert || []).forEach(z => addZutatRow(z.menge, z.einheit, z.name));
    if (document.querySelectorAll('#zutaten-rows .zutat-row').length === 0) addZutatRow();

    clearSchritteRows();
    (data.anleitungSchritte || []).forEach(s => addSchrittRow(s));
    if (document.querySelectorAll('#schritte-rows .schritt-row').length === 0) addSchrittRow();

    // Schritte bewusst NICHT löschen - erst wenn du "Neu anfangen" tippst.
    // So geht nichts verloren, falls du das Rezept nicht direkt speicherst.
    statusEl.textContent = 'Fertig. Deine Schritte bleiben gespeichert, bis du "Neu anfangen" tippst.';
    btn.disabled = false;

    openSection('recipes');
    document.getElementById('recipe-status-line').textContent = 'Bitte prüfen, dann unten speichern.';
    document.getElementById('recipe-titel-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    statusEl.textContent = 'Verbindungsfehler: ' + e.message;
    btn.disabled = false;
  }
}

renderFreestyleSchnipsel();
