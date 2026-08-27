// Teil von Skillet - Kochmodus (v1: ein Timer, Schritt-Navigation, Always-on Screen, Notiz-Handoff)

let kochmodusRezept = null;
let kochmodusSchrittIndex = 0;
let kochmodusOhneRezept = false;
let wakeLock = null;
let timerInterval = null;
let timerEndAt = null; // Zeitstempel (ms), zu dem der Timer abläuft
let alarmActive = false;
let alarmSoundInterval = null;

// ---- Session in localStorage merken, damit ein versehentliches Neuladen nicht alles verwirft ----
function saveKochmodusSession() {
  const notiz = document.getElementById('kochmodus-notiz')?.value || '';
  const session = {
    active: true,
    recipeId: kochmodusRezept ? kochmodusRezept.id : null,
    ohneRezept: kochmodusOhneRezept,
    schrittIndex: kochmodusSchrittIndex,
    notiz,
    timerEndAt
  };
  try { localStorage.setItem('skillet_kochmodus_session', JSON.stringify(session)); } catch (e) { /* egal, dann eben nicht */ }
}

function clearKochmodusSession() {
  try { localStorage.removeItem('skillet_kochmodus_session'); } catch (e) {}
}

async function restoreKochmodusSessionIfAny() {
  let raw;
  try { raw = localStorage.getItem('skillet_kochmodus_session'); } catch (e) { return; }
  if (!raw) return;

  let session;
  try { session = JSON.parse(raw); } catch (e) { return; }
  if (!session || !session.active) return;

  kochmodusOhneRezept = session.ohneRezept;
  kochmodusSchrittIndex = session.schrittIndex || 0;
  kochmodusRezept = null;

  if (session.recipeId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/recipes?select=id,titel,zutaten_strukturiert,anleitung,anleitung_schritte&id=eq.${session.recipeId}`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
      );
      const [r] = await res.json();
      kochmodusRezept = r || null;
    } catch (e) { /* Rezept evtl. gelöscht - Kochmodus läuft dann einfach ohne Rezeptbezug weiter */ }
  }

  timerEndAt = (session.timerEndAt && session.timerEndAt > Date.now()) ? session.timerEndAt : null;
  if (timerEndAt) timerInterval = setInterval(tickTimer, 250);

  renderKochmodusOverlay();
  const notizFeld = document.getElementById('kochmodus-notiz');
  if (notizFeld && session.notiz) notizFeld.value = session.notiz;

  document.getElementById('kochmodus-overlay').style.display = 'flex';
  requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityForWakeLock);
}

// ---- Start-Ansicht ----
function kochmodusMitRezept(mitRezept) {
  document.getElementById('kochmodus-rezept-auswahl').style.display = mitRezept ? 'block' : 'none';
  kochmodusOhneRezept = !mitRezept;
  if (mitRezept) loadKochmodusRezepte();
}

async function loadKochmodusRezepte() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=id,titel&order=erstellt_am.desc`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
  });
  const recipes = await res.json();
  const select = document.getElementById('kochmodus-recipe-select');
  select.innerHTML = recipes.map(r => `<option value="${r.id}">${r.titel}</option>`).join('');
}

// ---- Kochmodus starten ----
async function startKochmodus() {
  kochmodusSchrittIndex = 0;
  kochmodusRezept = null;

  if (!kochmodusOhneRezept) {
    const recipeId = document.getElementById('kochmodus-recipe-select').value;
    if (recipeId) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/recipes?select=id,titel,zutaten_strukturiert,anleitung,anleitung_schritte&id=eq.${recipeId}`,
        { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
      );
      const [r] = await res.json();
      kochmodusRezept = r;
    }
  }

  renderKochmodusOverlay();
  document.getElementById('kochmodus-overlay').style.display = 'flex';
  requestWakeLock();
  document.addEventListener('visibilitychange', handleVisibilityForWakeLock);
  saveKochmodusSession();
}

// ---- Schriftgröße an Textlänge anpassen, damit kein Text oben/unten abgeschnitten wird ----
function schrittFontSize(text) {
  const laenge = (text || '').length;
  if (laenge > 220) return '1.05rem';
  if (laenge > 140) return '1.25rem';
  if (laenge > 80) return '1.4rem';
  return '1.6rem';
}

// ---- Overlay rendern ----
function renderKochmodusOverlay() {
  const overlay = document.getElementById('kochmodus-overlay');
  const hatSchritte = kochmodusRezept && kochmodusRezept.anleitung_schritte && kochmodusRezept.anleitung_schritte.length > 0;
  const titel = kochmodusRezept ? kochmodusRezept.titel : 'Freies Kochen';

  let inhalt = '';
  if (hatSchritte) {
    const schritte = kochmodusRezept.anleitung_schritte;
    const aktuell = schritte[kochmodusSchrittIndex];
    const groesse = schrittFontSize(aktuell);
    inhalt = `
      <div style="text-align:center; font-size:0.9rem; opacity:0.7; margin-bottom:10px;">Schritt ${kochmodusSchrittIndex + 1} von ${schritte.length}</div>
      <div style="font-size:${groesse}; text-align:center; padding:0 20px; line-height:1.4;">${aktuell}</div>
    `;
  } else if (kochmodusRezept && kochmodusRezept.anleitung) {
    inhalt = `<div style="text-align:center; opacity:0.85; padding:0 20px; white-space:pre-wrap; font-size:1.05rem;">${kochmodusRezept.anleitung}</div>`;
  } else {
    inhalt = `<div style="text-align:center; opacity:0.7; padding:0 20px;">Kein Rezepttext hinterlegt.</div>`;
  }

  const zutatenHtml = (kochmodusRezept && kochmodusRezept.zutaten_strukturiert && kochmodusRezept.zutaten_strukturiert.length > 0)
    ? `<details style="margin:10px 20px;">
         <summary style="cursor:pointer; opacity:0.8;">Zutaten anzeigen</summary>
         <div style="margin-top:8px; font-size:0.9rem; opacity:0.9;">
           ${kochmodusRezept.zutaten_strukturiert.map(z => `<div>${[z.menge, z.einheit, z.name].filter(Boolean).join(' ')}</div>`).join('')}
         </div>
       </details>`
    : '';

  overlay.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px;">
      <div style="font-weight:600;">${titel}</div>
      <button onclick="beendeKochmodus(false)" style="width:auto; background:none; border:none; color:#f0ebe3; font-size:1.4rem; cursor:pointer; line-height:1;">×</button>
    </div>

    <div style="display:flex; align-items:center; justify-content:center; gap:10px; padding:0 20px 10px;">
      <input type="number" id="timer-minuten" min="1" placeholder="Min" style="width:60px; padding:6px; border-radius:6px; border:1px solid #555; background:#2a2420; color:#f0ebe3;">
      <button onclick="timerStart()" style="width:auto; padding:6px 14px; border-radius:6px; border:1px solid #555; background:none; color:#f0ebe3; cursor:pointer;">Start</button>
      <span id="timer-anzeige" style="font-size:1.2rem; font-variant-numeric:tabular-nums; min-width:52px; text-align:center;">--:--</span>
      <button onclick="timerReset()" style="width:auto; padding:6px 10px; border-radius:6px; border:1px solid #555; background:none; color:#f0ebe3; cursor:pointer;">↺</button>
    </div>

    ${alarmActive ? `
      <div onclick="stopAlarm()" style="background:var(--accent); color:white; text-align:center; padding:14px; margin:0 20px 10px; border-radius:8px; font-weight:600; cursor:pointer;">
        ⏰ Timer fertig! Antippen zum Stoppen
      </div>
    ` : ''}

    ${zutatenHtml}

    <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow-y:auto; min-height:80px; padding:10px 0;">
      ${inhalt}
    </div>

    <details style="margin:0 20px 10px;">
      <summary style="cursor:pointer; opacity:0.8;">Notiz</summary>
      <textarea id="kochmodus-notiz" placeholder="Fällt dir grad was auf?" oninput="saveKochmodusSession()" style="width:100%; min-height:60px; margin-top:8px; padding:8px; border-radius:6px; border:1px solid #555; background:#2a2420; color:#f0ebe3; font-family:inherit; box-sizing:border-box;"></textarea>
    </details>

    ${hatSchritte ? `
      <div style="display:flex; height:90px;">
        <button onclick="kochmodusSchritt(-1)" style="flex:1; background:#2a2420; border:none; border-top:1px solid #444; color:#f0ebe3; font-size:1.6rem; cursor:pointer;">←</button>
        <button onclick="kochmodusSchritt(1)" style="flex:1; background:#2a2420; border:none; border-left:1px solid #444; border-top:1px solid #444; color:#f0ebe3; font-size:1.6rem; cursor:pointer;">→</button>
      </div>
    ` : ''}

    <button onclick="beendeKochmodus(true)" class="primary" style="margin:10px 20px 20px;">Fertig – zur Reflexion</button>
  `;

  updateTimerAnzeige();
}

function kochmodusSchritt(delta) {
  const schritte = kochmodusRezept.anleitung_schritte;
  const notizVorher = document.getElementById('kochmodus-notiz')?.value || '';
  kochmodusSchrittIndex = Math.max(0, Math.min(schritte.length - 1, kochmodusSchrittIndex + delta));
  renderKochmodusOverlay();
  const notizFeld = document.getElementById('kochmodus-notiz');
  if (notizFeld) notizFeld.value = notizVorher; // Notiz bleibt beim Schritt-Wechsel erhalten
  saveKochmodusSession();
}

// ---- Timer (v1: ein einzelner Timer, zeitstempel-basiert) ----
function timerStart() {
  if (timerInterval) return; // läuft schon
  if (!timerEndAt) {
    const minuten = parseFloat(document.getElementById('timer-minuten').value);
    if (!minuten) return;
    timerEndAt = Date.now() + minuten * 60000;
  }
  timerInterval = setInterval(tickTimer, 250);
  saveKochmodusSession();
}

function tickTimer() {
  const remaining = Math.round((timerEndAt - Date.now()) / 1000);
  updateTimerAnzeige(remaining);
  if (remaining <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    timerEndAt = null;
    startAlarm();
    saveKochmodusSession();
  }
}

function timerReset() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerEndAt = null;
  if (alarmActive) stopAlarm();
  updateTimerAnzeige(0);
  saveKochmodusSession();
}

function updateTimerAnzeige(remainingOverride) {
  const el = document.getElementById('timer-anzeige');
  if (!el) return;
  const remaining = remainingOverride !== undefined
    ? remainingOverride
    : (timerEndAt ? Math.round((timerEndAt - Date.now()) / 1000) : 0);
  if (remaining > 0) {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else {
    el.textContent = '--:--';
  }
}

function timerAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 400);
  } catch (e) { /* Web Audio nicht verfügbar - kein Beep, kein Absturz */ }
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
}

// ---- Alarm läuft wiederholt (Ton + Vibration + Blinken), bis aktiv bestätigt ----
function startAlarm() {
  if (alarmActive) return;
  alarmActive = true;
  document.getElementById('kochmodus-overlay').classList.add('kochmodus-alarm');
  renderKochmodusOverlay();
  timerAlarm();
  alarmSoundInterval = setInterval(timerAlarm, 1200);
}

function stopAlarm() {
  alarmActive = false;
  clearInterval(alarmSoundInterval);
  alarmSoundInterval = null;
  if (navigator.vibrate) navigator.vibrate(0); // laufende Vibration stoppen
  document.getElementById('kochmodus-overlay').classList.remove('kochmodus-alarm');
  renderKochmodusOverlay();
}

// ---- Always-on Screen (Wake Lock API) ----
async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    console.log('Wake Lock nicht verfügbar:', e);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release();
    wakeLock = null;
  }
}

function handleVisibilityForWakeLock() {
  const overlayOffen = document.getElementById('kochmodus-overlay').style.display === 'flex';
  if (document.visibilityState === 'visible' && overlayOffen) {
    requestWakeLock();
  }
}

// ---- Kochmodus beenden ----
function beendeKochmodus(mitHandoff) {
  const notiz = document.getElementById('kochmodus-notiz')?.value.trim() || '';

  clearInterval(timerInterval);
  timerInterval = null;
  timerEndAt = null;
  if (alarmActive) stopAlarm();
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityForWakeLock);
  document.getElementById('kochmodus-overlay').style.display = 'none';
  clearKochmodusSession();

  if (!mitHandoff) {
    openSection('kochmodus');
    return;
  }

  if (kochmodusRezept) {
    handoffZuReflexion(kochmodusRezept.id, notiz);
  } else {
    fragRezeptDiktat(notiz);
  }
}

// ---- Nach rezeptlosem Kochen: fragen, ob daraus ein vollständiges Rezept werden soll ----
function fragRezeptDiktat(notiz) {
  window.pendingKochmodusNotiz = notiz;
  openSection('recipes');

  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'kochmodus-diktat-card';
  card.innerHTML = `
    <div style="margin-bottom:10px;">Du hast frei gekocht – möchtest du daraus ein Rezept machen?</div>
    <div style="display:flex; gap:8px;">
      <button onclick="starteRezeptDiktat()" class="primary" style="width:auto; flex:1; margin-top:0;">Ja, diktieren</button>
      <button onclick="handoffOhneRezept()" style="width:auto; flex:1; background:none; border:1px solid var(--border); border-radius:8px; cursor:pointer;">Nein, weiter zur Reflexion</button>
    </div>
  `;
  document.getElementById('view-recipes').prepend(card);
}

function handoffOhneRezept() {
  document.getElementById('kochmodus-diktat-card')?.remove();
  handoffZuReflexion(null, window.pendingKochmodusNotiz || '');
  window.pendingKochmodusNotiz = null;
}

function starteRezeptDiktat() {
  const card = document.getElementById('kochmodus-diktat-card');
  card.innerHTML = `
    <div style="margin-bottom:8px; font-weight:600;">Diktier oder tippe dein Rezept</div>
    <div class="muted" style="margin-bottom:8px; font-size:0.85rem;">Was hast du reingetan, wie viel, in welcher Reihenfolge? (Mikrofon-Taste deiner Tastatur nutzen)</div>
    <textarea id="kochmodus-diktat-text" style="min-height:120px; width:100%; padding:8px; border-radius:8px; border:1px solid var(--border); font-family:inherit; box-sizing:border-box;"></textarea>
    <button class="primary" style="margin-top:10px;" onclick="extrahiereRezeptDiktat()">Rezept erstellen</button>
    <div class="status-line" id="kochmodus-diktat-status"></div>
  `;
}

async function extrahiereRezeptDiktat() {
  const text = document.getElementById('kochmodus-diktat-text').value.trim();
  if (!text) return;
  const statusEl = document.getElementById('kochmodus-diktat-status');
  statusEl.textContent = "Rezept wird erkannt...";

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/extract-recipe-from-text`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.error) { statusEl.textContent = "Fehler: " + data.error; return; }

    document.getElementById('kochmodus-diktat-card')?.remove();

    document.getElementById('recipe-titel-input').value = data.titel || "";
    document.getElementById('recipe-portionen-input').value = data.basisPortionen || "";

    clearZutatenRows();
    (data.zutatenStrukturiert || []).forEach(z => addZutatRow(z.menge, z.einheit, z.name));
    if (document.querySelectorAll('#zutaten-rows .zutat-row').length === 0) addZutatRow();

    clearSchritteRows();
    (data.anleitungSchritte || []).forEach(s => addSchrittRow(s));
    if (document.querySelectorAll('#schritte-rows .schritt-row').length === 0) addSchrittRow();

    window.pendingKochmodusHandoff = true; // signalisiert submitRecipe: nach dem Speichern zur Reflexion weiterleiten
    document.getElementById('recipe-status-line').textContent = "Bitte prüfen, dann unten speichern.";
    document.getElementById('recipe-titel-input').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) {
    statusEl.textContent = "Verbindungsfehler: " + e.message;
  }
}

// ---- Übergabe an die Reflexion ----
async function handoffZuReflexion(recipeId, notiz) {
  await loadRecipesForReflect();
  if (recipeId) {
    document.getElementById('reflect-recipe-select').value = recipeId;
    onReflectRecipeChange();
  }
  openSection('reflect');
  if (notiz) document.getElementById('beschreibung').value = notiz;
}
