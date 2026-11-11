// Teil von Skillet - Kochtagebuch: wann was gekocht wurde, wie es war, was nächstes Mal anders soll.
// Daraus: "3× gekocht · vor 9 Tagen · 👍" im Kochbuch, der Zettel beim nächsten Kochen und die Vorschläge.

const TAGEBUCH_KOPF = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
let tagebuchCache = null; // neueste zuerst

async function ladeTagebuch(neu = false) {
  if (tagebuchCache && !neu) return tagebuchCache;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/kochtagebuch?select=id,recipe_id,titel,frei,gekocht_am,bewertung,notiz&order=gekocht_am.desc&limit=1000`, { headers: TAGEBUCH_KOPF });
    if (!res.ok) throw new Error(res.status);
    tagebuchCache = await res.json();
  } catch (e) {
    tagebuchCache = tagebuchCache || []; // ohne Tagebuch läuft alles weiter, nur ohne Statistik
  }
  return tagebuchCache;
}

async function tagebuchEintragen(eintrag) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kochtagebuch`, {
    method: 'POST',
    headers: { ...TAGEBUCH_KOPF, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(eintrag)
  });
  if (!res.ok) throw new Error('Speichern ging nicht (' + res.status + ')');
  const [zeile] = await res.json();
  if (tagebuchCache) { tagebuchCache.unshift(zeile); tagebuchSortieren(); }
  return zeile;
}

// Frei gekocht und danach als Rezept gespeichert: Eintrag mit dem neuen Rezept verbinden
async function tagebuchMitRezeptVerbinden(eintragId, rezept) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/kochtagebuch?id=eq.${eintragId}`, {
      method: 'PATCH',
      headers: { ...TAGEBUCH_KOPF, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ recipe_id: rezept.id, titel: rezept.titel })
    });
    const e = tagebuchCache && tagebuchCache.find(x => x.id === eintragId);
    if (e) { e.recipe_id = rezept.id; e.titel = rezept.titel; }
  } catch (e) { /* Statistik fehlt dann für dieses eine Mal - kein Beinbruch */ }
}

// Eintrag ändern (Bewertung, Notiz, Datum) - im Cache gleich mit
async function tagebuchAktualisieren(id, aenderung) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kochtagebuch?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...TAGEBUCH_KOPF, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(aenderung)
  });
  if (!res.ok) throw new Error('Speichern ging nicht (' + res.status + ')');
  const e = tagebuchCache && tagebuchCache.find(x => x.id === id);
  if (e) Object.assign(e, aenderung);
  tagebuchSortieren();
}

async function tagebuchLoeschen(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kochtagebuch?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...TAGEBUCH_KOPF, Prefer: 'return=minimal' }
  });
  if (!res.ok) throw new Error('Löschen ging nicht (' + res.status + ')');
  if (tagebuchCache) tagebuchCache = tagebuchCache.filter(x => x.id !== id);
}

function tagebuchSortieren() {
  if (tagebuchCache) tagebuchCache.sort((a, b) => new Date(b.gekocht_am) - new Date(a.gekocht_am));
}

// Heute schon dasselbe Rezept eingetragen? Dann wird der neue Eintrag damit zusammengelegt
function tagebuchHeute(recipeId, jetzt = new Date()) {
  if (!recipeId) return null;
  return (tagebuchCache || []).find(e => e.recipe_id === recipeId && tageHer(e.gekocht_am, jetzt) === 0) || null;
}

// Zwei Notizen zusammenführen, ohne denselben Text doppelt
function notizenZusammen(alt, neu) {
  const a = (alt || '').trim(), n = (neu || '').trim();
  if (!a) return n || null;
  if (!n || a.includes(n)) return a;
  return a + '\n' + n;
}

const TAG_MS = 24 * 60 * 60 * 1000;

function tageHer(iso, jetzt = new Date()) {
  const a = new Date(iso); a.setHours(0, 0, 0, 0);
  const b = new Date(jetzt); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / TAG_MS);
}

function vorWann(iso, jetzt = new Date()) {
  const t = tageHer(iso, jetzt);
  if (t <= 0) return 'heute';
  if (t === 1) return 'gestern';
  if (t < 14) return `vor ${t} Tagen`;
  if (t < 60) return `vor ${Math.round(t / 7)} Wochen`;
  const m = Math.round(t / 30);
  return m < 12 ? `vor ${m} Monaten` : 'vor über einem Jahr';
}

const BEWERTUNG_ZEICHEN = { gern: '👍', geht_so: '😐', nein: '👎' };

// Alles, was das Tagebuch über ein Rezept weiß
function kochStatistik(recipeId) {
  const eintraege = (tagebuchCache || []).filter(e => e.recipe_id === recipeId);
  const mitBewertung = eintraege.find(e => e.bewertung);
  const mitNotiz = eintraege.find(e => e.notiz && e.notiz.trim());
  return {
    anzahl: eintraege.length,
    zuletzt: eintraege[0] ? eintraege[0].gekocht_am : null,
    bewertung: mitBewertung ? mitBewertung.bewertung : null,
    notiz: mitNotiz ? { text: mitNotiz.notiz.trim(), am: mitNotiz.gekocht_am } : null
  };
}

function kochMetaText(recipeId) {
  const s = kochStatistik(recipeId);
  if (!s.anzahl) return '';
  return `${s.anzahl}× gekocht · ${s.anzahl === 1 ? '' : 'zuletzt '}${vorWann(s.zuletzt)}`;
}

// Zettel vom letzten Mal (für Rezept-Karte und Kochbildschirm)
function zettelHtml(recipeId, klasse) {
  const n = kochStatistik(recipeId).notiz;
  if (!n) return '';
  return `<div class="${klasse}"><b>📝 Letztes Mal notiert</b> <span>(${vorWann(n.am)})</span><div>${htmlSicher(n.text)}</div></div>`;
}

// ---- Vorschläge: ohne KI, nur aus Kochbuch und Tagebuch ----
// 👍 und lange nicht gekocht steigen, gerade erst gekocht und 👎 fallen raus.
// Ein kleiner, täglich wechselnder Zufall sorgt dafür, dass nicht jeden Tag dasselbe oben steht.
function tagesZufall(text, jetzt) {
  const tag = jetzt.toISOString().slice(0, 10);
  let h = 2166136261;
  for (const c of text + tag) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h % 1000) / 1000; // 0 … 1
}

function kochVorschlaege(rezepte, jetzt = new Date()) {
  const liste = [];
  for (const r of rezepte || []) {
    const s = kochStatistik(r.id);
    if (s.bewertung === 'nein') continue;
    let score, grund;
    if (!s.anzahl) {
      score = 2.5;
      grund = '✨ Noch nie gekocht';
    } else {
      const tage = tageHer(s.zuletzt, jetzt);
      if (tage < 4) continue; // gerade erst gegessen
      score = Math.min(tage, 60) / 10;
      if (s.bewertung === 'gern') score += 4;
      if (s.bewertung === 'geht_so') score += 0.5;
      if (s.anzahl >= 3) score += 0.5;
      if (s.bewertung === 'gern') grund = `👍 mochtest du · ${vorWann(s.zuletzt, jetzt)}`;
      else if (tage >= 21) grund = `Lange nicht gekocht · ${vorWann(s.zuletzt, jetzt)}`;
      else grund = `Zuletzt ${vorWann(s.zuletzt, jetzt)}`;
    }
    score += tagesZufall(r.id, jetzt) * 1.5;
    liste.push({ rezept: r, grund, score });
  }
  return liste.sort((a, b) => b.score - a.score);
}
