// Teil von Skillet - Kochen: ein Modus für beides
//   nach Rezept: Schritt für Schritt, Timer, Bildschirm bleibt an
//   frei:        einfach erzählen, was man macht (ein Satz oder alles auf einmal) - am Ende wird daraus ein Rezept

let kochmodusRezept = null;
let kochmodusSchrittIndex = 0;
let kochmodusOhneRezept = false;
let wakeLock = null;
let timerInterval = null;
let timerEndAt = null; // Zeitstempel (ms), zu dem der Timer abläuft
let alarmActive = false;
let alarmSoundInterval = null;

// ---- Notizen beim freien Kochen: bleiben auf dem Gerät, bis daraus ein Rezept gespeichert ist ----
// (Schlüssel vom früheren Freestyle-Modus - schon diktierte Schritte gehen so nicht verloren)
const FREI_NOTIZEN_KEY = 'skillet_freestyle_schnipsel';

function ladeFreiNotizen() {
  try { return JSON.parse(localStorage.getItem(FREI_NOTIZEN_KEY)) || []; } catch (e) { return []; }
}

function speichereFreiNotizen(liste) {
  try { localStorage.setItem(FREI_NOTIZEN_KEY, JSON.stringify(liste)); } catch (e) { /* dann eben nur bis zum Neuladen */ }
}

function leereFreiNotizen() {
  speichereFreiNotizen([]);
}

function freiNotizHinzufuegen() {
  const feld = document.getElementById('frei-eingabe');
  const text = (feld?.value || '').trim();
  if (!text) { feld?.focus(); return; }
  const liste = ladeFreiNotizen();
  liste.push({ text, zeit: new Date().toISOString() });
  speichereFreiNotizen(liste);
  feld.value = '';
  saveKochmodusSession();
  renderKochmodusOverlay();
  const notizen = document.getElementById('frei-notizen');
  if (notizen) notizen.scrollTop = notizen.scrollHeight;
}

function freiNotizLoeschen(index) {
  const liste = ladeFreiNotizen();
  liste.splice(index, 1);
  speichereFreiNotizen(liste);
  renderKochmodusOverlay();
}

// ---- Session in localStorage merken, damit ein versehentliches Neuladen nicht alles verwirft ----
function saveKochmodusSession() {
  const session = {
    active: true,
    recipeId: kochmodusRezept ? kochmodusRezept.id : null,
    ohneRezept: kochmodusOhneRezept,
    schrittIndex: kochmodusSchrittIndex,
    entwurf: document.getElementById('frei-eingabe')?.value || '',
    timerEndAt
  };
  try { localStorage.setItem('skillet_kochmodus_session', JSON.stringify(session)); } catch (e) { /* egal, dann eben nicht */ }
}

function clearKochmodusSession() {
  try { localStorage.removeItem('skillet_kochmodus_session'); } catch (e) {}
}

async function ladeKochRezept(id) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/recipes?select=id,titel,zutaten_strukturiert,anleitung,anleitung_schritte&id=eq.${id}`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
  );
  const [r] = await res.json();
  return r || null;
}

async function restoreKochmodusSessionIfAny() {
  let raw;
  try { raw = localStorage.getItem('skillet_kochmodus_session'); } catch (e) { return; }
  if (!raw) return;

  let session;
  try { session = JSON.parse(raw); } catch (e) { return; }
  if (!session || !session.active) return;

  kochmodusOhneRezept = !!session.ohneRezept;
  kochmodusSchrittIndex = session.schrittIndex || 0;
  kochmodusRezept = null;
  if (session.recipeId) {
    try { kochmodusRezept = await ladeKochRezept(session.recipeId); }
    catch (e) { /* Rezept evtl. gelöscht - dann ohne Rezeptbezug weiter */ }
  }

  timerEndAt = (session.timerEndAt && session.timerEndAt > Date.now()) ? session.timerEndAt : null;
  if (timerEndAt) timerInterval = setInterval(tickTimer, 250);

  zeigeKochOverlay();
  const feld = document.getElementById('frei-eingabe');
  if (feld && session.entwurf) feld.value = session.entwurf;
}

// ---- Einstieg: Karte "Kochen" - nach Rezept oder frei ----
async function oeffneKochenKarte() {
  const box = document.getElementById('kochen-auswahl');
  const notizen = ladeFreiNotizen().length;
  box.innerHTML = `
    <div class="koch-wahl">
      <div class="koch-wahl-kopf"><span class="koch-wahl-ico">📖</span><div><b>Nach Rezept</b><span>Schritt für Schritt, mit Timer</span></div></div>
      <input type="search" id="koch-suche" placeholder="Rezept suchen …" oninput="renderKochRezeptListe()" autocomplete="off">
      <div id="koch-rezepte" class="koch-rezepte"><div class="muted">Lade Rezepte …</div></div>
    </div>
    <button type="button" class="koch-wahl koch-wahl-frei" id="koch-frei-knopf" onclick="startFreiKochen()">
      <span class="koch-wahl-ico">🎙️</span>
      <div><b>Frei kochen</b><span>${notizen
        ? `Weiter machen – ${notizen} ${notizen === 1 ? 'Notiz' : 'Notizen'} vom letzten Mal`
        : 'Einfach erzählen, was du machst – wird am Ende zum Rezept'}</span></div>
    </button>`;
  zeigeRezeptKarte('kochen', 'Kochen');
  if (!allRecipesCache.length) await loadRecipes();
  renderKochRezeptListe();
}

function renderKochRezeptListe() {
  const el = document.getElementById('koch-rezepte');
  if (!el) return;
  const suche = (document.getElementById('koch-suche')?.value || '').trim().toLowerCase();
  const treffer = allRecipesCache.filter(r => !suche || (r.titel || '').toLowerCase().includes(suche));
  if (!allRecipesCache.length) { el.innerHTML = `<div class="muted">Noch keine Rezepte gespeichert.</div>`; return; }
  if (!treffer.length) { el.innerHTML = `<div class="muted">Nichts gefunden.</div>`; return; }
  el.innerHTML = treffer.slice(0, 30).map(r => {
    const teile = [];
    if (r.basis_portionen) teile.push(`${r.basis_portionen} Port.`);
    const kcal = typeof kcalProPortion === 'function' ? kcalProPortion(r) : null;
    if (kcal !== null) teile.push(`${kcal} kcal`);
    return `<button type="button" class="koch-rezept" onclick="kochenMitRezept('${r.id}')">
      <span>${htmlSicher(r.titel)}</span><small>${teile.join(' · ')}</small></button>`;
  }).join('');
}

function kochenMitRezept(id) {
  rezeptKarteZu();
  startKochmodus(id);
}

function startFreiKochen() {
  rezeptKarteZu();
  kochmodusOhneRezept = true;
  startKochmodus();
}

// ---- Kochen starten ----
// direktRezeptId: mit Rezept (aus der Kochen-Karte oder der Rezept-Karte); ohne: frei kochen
async function startKochmodus(direktRezeptId) {
  kochmodusSchrittIndex = 0;
  kochmodusRezept = null;
  if (direktRezeptId) {
    kochmodusOhneRezept = false;
    kochmodusRezept = await ladeKochRezept(direktRezeptId);
  } else {
    kochmodusOhneRezept = true;
  }
  zeigeKochOverlay();
  saveKochmodusSession();
}

function zeigeKochOverlay() {
  renderKochmodusOverlay();
  document.getElementById('kochmodus-overlay').style.display = 'flex';
  requestWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityForWakeLock);
  document.addEventListener('visibilitychange', handleVisibilityForWakeLock);
}

// ---- Schriftgröße an Textlänge anpassen, damit kein Text oben/unten abgeschnitten wird ----
function schrittFontSize(text) {
  const laenge = (text || '').length;
  if (laenge > 220) return '1.05rem';
  if (laenge > 140) return '1.25rem';
  if (laenge > 80) return '1.4rem';
  return '1.6rem';
}

function zeitKurz(iso) {
  try { return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
}

// ---- Overlay rendern ----
function renderKochmodusOverlay() {
  const overlay = document.getElementById('kochmodus-overlay');
  const entwurf = document.getElementById('frei-eingabe')?.value; // Eingabe überlebt das Neuzeichnen (z. B. Timer-Alarm)
  const frei = kochmodusOhneRezept || !kochmodusRezept;
  const titel = frei ? 'Frei kochen' : kochmodusRezept.titel;

  const timerHtml = `
    <div class="koch-timer">
      <input type="number" id="timer-minuten" min="1" placeholder="Min" inputmode="numeric">
      <button type="button" onclick="timerStart()">Start</button>
      <span id="timer-anzeige">--:--</span>
      <button type="button" onclick="timerReset()" aria-label="Timer zurücksetzen">↺</button>
    </div>
    ${alarmActive ? `<div class="koch-alarm" onclick="stopAlarm()">⏰ Timer fertig! Antippen zum Stoppen</div>` : ''}`;

  let mitte = '';
  let unten = '';
  if (frei) {
    const notizen = ladeFreiNotizen();
    mitte = `
      <div id="frei-notizen" class="frei-notizen">
        ${notizen.length
          ? notizen.map((n, i) => `
            <div class="frei-notiz">
              <div><small>${zeitKurz(n.zeit)}</small>${htmlSicher(n.text)}</div>
              <button type="button" onclick="freiNotizLoeschen(${i})" aria-label="Notiz löschen">×</button>
            </div>`).join('')
          : `<div class="frei-leer">Erzähl einfach, was du machst – Satz für Satz oder alles auf einmal. Pausen sind egal.</div>`}
      </div>`;
    unten = `
      <div class="frei-tipp">Tipp: Mikrofon-Taste der Tastatur 🎤</div>
      <textarea id="frei-eingabe" class="frei-eingabe" placeholder="Was machst du gerade?" oninput="saveKochmodusSession()"></textarea>
      <div class="koch-knoepfe">
        <button type="button" class="koch-zweit" onclick="freiNotizHinzufuegen()">+ Notiz</button>
        <button type="button" class="koch-haupt" id="koch-fertig" onclick="beendeKochmodus(true)">Fertig</button>
      </div>
      <div class="koch-status" id="koch-status"></div>`;
  } else {
    const schritte = kochmodusRezept.anleitung_schritte || [];
    if (schritte.length) {
      const aktuell = schritte[kochmodusSchrittIndex];
      mitte = `
        <div class="koch-mitte">
          <div class="koch-schritt-nr">Schritt ${kochmodusSchrittIndex + 1} von ${schritte.length}</div>
          <div class="koch-schritt" style="font-size:${schrittFontSize(aktuell)};">${htmlSicher(aktuell)}</div>
        </div>
        <div class="koch-pfeile">
          <button type="button" onclick="kochmodusSchritt(-1)" aria-label="Schritt zurück">←</button>
          <button type="button" onclick="kochmodusSchritt(1)" aria-label="Nächster Schritt">→</button>
        </div>`;
    } else {
      mitte = `<div class="koch-mitte"><div class="koch-text">${htmlSicher(kochmodusRezept.anleitung) || 'Kein Rezepttext hinterlegt.'}</div></div>`;
    }
    unten = `<div class="koch-knoepfe"><button type="button" class="koch-haupt" onclick="beendeKochmodus(true)">Fertig</button></div>`;
  }

  const zutatenHtml = (!frei && kochmodusRezept.zutaten_strukturiert && kochmodusRezept.zutaten_strukturiert.length > 0)
    ? `<details class="koch-zutaten">
         <summary>Zutaten anzeigen</summary>
         <div>${kochmodusRezept.zutaten_strukturiert.map(z => `<div>${htmlSicher([z.menge, z.einheit, z.name].filter(v => v !== null && v !== undefined && v !== '').join(' '))}</div>`).join('')}</div>
       </details>`
    : '';

  overlay.innerHTML = `
    <div class="koch-kopf">
      <div>${htmlSicher(titel)}</div>
      <button type="button" onclick="beendeKochmodus(false)" aria-label="Kochen beenden">×</button>
    </div>
    ${timerHtml}
    ${zutatenHtml}
    ${mitte}
    ${unten}`;

  if (entwurf) document.getElementById('frei-eingabe').value = entwurf;
  updateTimerAnzeige();
}

function kochmodusSchritt(delta) {
  const schritte = kochmodusRezept.anleitung_schritte;
  kochmodusSchrittIndex = Math.max(0, Math.min(schritte.length - 1, kochmodusSchrittIndex + delta));
  renderKochmodusOverlay();
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

// ---- Kochen beenden ----
// mitAbschluss=false (×): einfach schließen - Notizen vom freien Kochen bleiben für später
// mitAbschluss=true (Fertig): nach Rezept → Rezepte mit "Gegessen?"; frei → aus den Notizen ein Rezept machen
async function beendeKochmodus(mitAbschluss) {
  if (mitAbschluss && (kochmodusOhneRezept || !kochmodusRezept)) {
    const ok = await freiZuRezept();
    if (!ok) return; // Fehler: Kochbildschirm bleibt offen, nichts geht verloren
  }

  const rezeptId = kochmodusRezept ? kochmodusRezept.id : null;
  clearInterval(timerInterval);
  timerInterval = null;
  timerEndAt = null;
  if (alarmActive) stopAlarm();
  releaseWakeLock();
  document.removeEventListener('visibilitychange', handleVisibilityForWakeLock);
  document.getElementById('kochmodus-overlay').style.display = 'none';
  clearKochmodusSession();

  if (mitAbschluss && rezeptId && !kochmodusOhneRezept) {
    openSection('recipes');
    if (typeof zeigeMotivatorKarte === 'function') zeigeMotivatorKarte(rezeptId);
  }
}

// Notizen → Gemini → ausgefülltes Formular zum Prüfen. Gibt true zurück, wenn es weitergehen kann.
async function freiZuRezept() {
  // Was noch im Eingabefeld steht, gehört dazu
  if ((document.getElementById('frei-eingabe')?.value || '').trim()) freiNotizHinzufuegen();
  const notizen = ladeFreiNotizen();
  if (notizen.length === 0) return true; // nichts notiert - einfach beenden

  const status = document.getElementById('koch-status');
  const knopf = document.getElementById('koch-fertig');
  if (knopf) knopf.disabled = true;
  if (status) status.textContent = 'Rezept wird zusammengesetzt …';

  const text = 'Notizen in der Reihenfolge, in der gekocht wurde:\n' + notizen.map((n, i) => `${i + 1}. ${n.text}`).join('\n');
  try {
    const data = await rezeptTextAuswerten(text);
    // Ein angefangenes Bearbeiten darf das neue Rezept nicht überschreiben
    editingOriginalId = null;
    editingCopyOf = null;
    pendingImportUrl = null;
    document.getElementById('edit-mode-banner').style.display = 'none';
    formularAusAuswertung(data);
    window.pendingFreiNotizenLoeschen = true; // erst nach dem Speichern löschen
    setTimeout(() => {
      zeigeRezeptFormular();
      document.getElementById('rezept-import-block').style.display = 'none';
      document.getElementById('recipe-status-line').textContent = 'Aus deinen Notizen – bitte prüfen, dann speichern.';
    }, 0);
    return true;
  } catch (e) {
    if (status) status.textContent = 'Das hat nicht geklappt: ' + e.message + ' – deine Notizen sind noch da.';
    if (knopf) knopf.disabled = false;
    return false;
  }
}
