// Teil von Skillet - Kochmodus (v1: ein Timer, Schritt-Navigation, Always-on Screen, Notiz-Handoff)

let kochmodusRezept = null;
let kochmodusSchrittIndex = 0;
let kochmodusOhneRezept = false;
let wakeLock = null;
let timerInterval = null;
let timerRemaining = 0; // Sekunden

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
    inhalt = `
      <div style="text-align:center; font-size:0.9rem; opacity:0.7; margin-bottom:10px;">Schritt ${kochmodusSchrittIndex + 1} von ${schritte.length}</div>
      <div style="font-size:1.6rem; text-align:center; padding:0 20px; line-height:1.4;">${aktuell}</div>
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

    ${zutatenHtml}

    <div style="flex:1; display:flex; align-items:center; justify-content:center; min-height:80px;">
      ${inhalt}
    </div>

    <details style="margin:0 20px 10px;">
      <summary style="cursor:pointer; opacity:0.8;">Notiz</summary>
      <textarea id="kochmodus-notiz" placeholder="Fällt dir grad was auf?" style="width:100%; min-height:60px; margin-top:8px; padding:8px; border-radius:6px; border:1px solid #555; background:#2a2420; color:#f0ebe3; font-family:inherit; box-sizing:border-box;"></textarea>
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
}

// ---- Timer (v1: ein einzelner Timer) ----
function timerStart() {
  if (timerInterval) return; // läuft schon
  if (timerRemaining <= 0) {
    const minuten = parseFloat(document.getElementById('timer-minuten').value);
    if (!minuten) return;
    timerRemaining = Math.round(minuten * 60);
  }
  timerInterval = setInterval(() => {
    timerRemaining--;
    updateTimerAnzeige();
    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      timerAlarm();
    }
  }, 1000);
}

function timerReset() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerRemaining = 0;
  updateTimerAnzeige();
}

function updateTimerAnzeige() {
  const el = document.getElementById('timer-anzeige');
  if (!el) return;
  if (timerRemaining > 0 || timerInterval) {
    const m = Math.floor(timerRemaining / 60);
    const s = timerRemaining % 60;
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
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
  timerRemaining = 0;
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityForWakeLock);
  document.getElementById('kochmodus-overlay').style.display = 'none';

  if (mitHandoff) {
    handoffZuReflexion(kochmodusRezept ? kochmodusRezept.id : null, notiz);
  } else {
    showTab('kochen');
  }
}

// ---- Übergabe an die Reflexion ----
async function handoffZuReflexion(recipeId, notiz) {
  await loadRecipesForReflect();
  if (recipeId) {
    document.getElementById('reflect-recipe-select').value = recipeId;
    onReflectRecipeChange();
  }
  showTab('reflect');
  if (notiz) document.getElementById('beschreibung').value = notiz;
}
