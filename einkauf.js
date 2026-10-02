// Teil von Skillet - Einkaufsliste: Zutaten eines Rezepts an Nest übergeben
//
// Skillet schreibt NICHT selbst in Nests Datenbank. Es baut nur einen Link
// mit einer Zutat pro Zeile. Nest öffnet damit eine Karte je Zutat, und du
// bestätigst dort mit deinem Nest-Login. Das Format der Zeilen ist
// deshalb genau das, was Nests Zeilen-Erkennung versteht: "500 g Mehl".

const NEST_URL = 'https://schrontz.github.io/nest/';

// Einheiten, die Nest kennt - so geschrieben, wie Nests Einheiten-Wörterbuch
// sie erkennt. Seit Okt. 2026 auch Dose, Bund, Glas, Flasche, Becher.
const NEST_EINHEITEN = {
  g: 'g', gr: 'g', gramm: 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg',
  ml: 'ml', milliliter: 'ml',
  l: 'l', liter: 'l',
  'stück': 'Stück', stueck: 'Stück', stk: 'Stück', st: 'Stück',
  packung: 'Packung', packungen: 'Packung', 'päckchen': 'Packung', pck: 'Packung',
  dose: 'Dose', dosen: 'Dose', bund: 'Bund', glas: 'Glas', 'gläser': 'Glas',
  flasche: 'Flasche', flaschen: 'Flasche', becher: 'Becher'
};

// Was man stückweise kauft: Mengen werden aufgerundet (1,2 Dosen -> 2 Dose)
const GANZE_EINHEITEN = ['Stück', 'Packung', 'Dose', 'Bund', 'Glas', 'Flasche', 'Becher'];

// Weitere Gebinde, die Nest nicht als Einheit kennt: Menge und Wort bleiben im
// Namen stehen ("1 Netz Zwiebeln")
const GEBINDE = ['tüte', 'tüten', 'netz', 'knolle', 'knollen'];

// Kocheinheiten, die man nicht kauft: nur den Namen schicken ("2 EL Paprika" -> "Paprika")
// Alles andere Unbekannte landet ebenfalls nur mit dem Namen auf der Liste.

// Was meist im Haus ist - standardmäßig abgewählt
const MEIST_ZUHAUSE = ['salz', 'pfeffer', 'wasser', 'zucker', 'öl', 'olivenöl'];

function einkaufZahl(wert) {
  const gerundet = wert >= 10 ? Math.round(wert) : Math.round(wert * 10) / 10;
  return String(gerundet).replace('.', ',');
}

// Eine Zutat (strukturiert) in eine Zeile für Nest übersetzen
function nestZeile(z, faktor) {
  const name = (z.name || '').trim();
  if (!name) return null;
  if (z.menge === null || z.menge === undefined || isNaN(z.menge)) return name;

  const menge = einkaufZahl(z.menge * faktor);
  const einheit = (z.einheit || '').toLowerCase().replace(/[.()]/g, '').trim();

  // Stückzahlen und Gebinde kauft man ganz: 1,2 Zwiebeln -> 2 Zwiebeln
  const ganz = einkaufZahl(Math.ceil(z.menge * faktor - 0.001));

  if (!einheit) return `${ganz} ${name}`;
  const nestEinheit = NEST_EINHEITEN[einheit];
  if (nestEinheit) return `${GANZE_EINHEITEN.includes(nestEinheit) ? ganz : menge} ${nestEinheit} ${name}`;
  if (GEBINDE.includes(einheit)) return `${ganz} ${z.einheit.trim()} ${name}`;
  return name;
}

// Freitext-Zutaten (ältere oder getippte Rezepte) grob zerlegen, damit sie gleich behandelt werden
function zerlegeFreitextZutat(zeile) {
  const text = zeile.trim();
  const treffer = text.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zÄÖÜäöüß.]+)?\s+(.*)$/);
  if (!treffer) return { menge: null, einheit: null, name: text };
  const menge = parseFloat(treffer[1].replace(',', '.'));
  const wort = (treffer[2] || '').toLowerCase().replace(/\./g, '');
  const bekannteEinheit = NEST_EINHEITEN[wort] || GEBINDE.includes(wort) ||
    ['el', 'tl', 'prise', 'prisen', 'msp', 'schuss', 'tasse', 'tassen', 'zehe', 'zehen', 'scheibe', 'scheiben', 'blatt', 'würfel'].includes(wort);
  if (bekannteEinheit) return { menge, einheit: treffer[2], name: treffer[3] };
  return { menge, einheit: null, name: `${treffer[2] || ''} ${treffer[3]}`.trim() };
}

function istMeistZuhause(zeile) {
  const wort = zeile.toLowerCase().replace(/^[\d,.\s]+(g|kg|ml|l|stück|packung)?\s*/, '').trim();
  const erstesWort = wort.split(/[\s,(]/)[0];
  return MEIST_ZUHAUSE.includes(erstesWort);
}

// Zeilen für ein Rezept - mit den gerade eingestellten Portionen
function einkaufZeilen(r) {
  if (r.zutaten_strukturiert && r.zutaten_strukturiert.length > 0) {
    const faktor = (r.basis_portionen && aktuellePortionen[r.id])
      ? aktuellePortionen[r.id] / r.basis_portionen : 1;
    return r.zutaten_strukturiert.map(z => nestZeile(z, faktor)).filter(Boolean);
  }
  return (r.zutaten || '').split('\n').map(z => z.trim()).filter(Boolean)
    .map(z => nestZeile(zerlegeFreitextZutat(z), 1)).filter(Boolean);
}

function toggleEinkauf(id) {
  const el = document.getElementById(`einkauf-${id}`);
  if (el.style.display === 'block') { el.style.display = 'none'; return; }
  el.style.display = 'block';
  renderEinkauf(id);
}

// Wird auch nach dem Umrechnen der Portionen aufgerufen
function renderEinkauf(id) {
  const el = document.getElementById(`einkauf-${id}`);
  if (!el || el.style.display !== 'block') return;
  const r = allRecipesCache.find(rec => rec.id === id);
  const zeilen = einkaufZeilen(r);

  if (zeilen.length === 0) {
    el.innerHTML = `<div class="muted">Für dieses Rezept sind keine Zutaten gespeichert.</div>`;
    return;
  }

  const portionen = aktuellePortionen[id] || r.basis_portionen;
  el.innerHTML = `
    <div class="muted" style="margin-bottom:0.3rem;">${portionen ? `Mengen für ${String(portionen).replace('.', ',')} Portionen. ` : ''}Was du schon hast, einfach abwählen.</div>
    ${zeilen.map((z, i) => `
      <label class="einkauf-zeile">
        <input type="checkbox" class="einkauf-haken" data-zeile="${htmlSicher(z)}" ${istMeistZuhause(z) ? '' : 'checked'}>
        <span>${htmlSicher(z)}</span>
      </label>`).join('')}
    <button class="btn-haupt" onclick="sendeAnNest('${id}')">An Nest senden</button>
    <div class="zentriert"><button class="btn-dezent" onclick="kopiereEinkauf('${id}')">Stattdessen kopieren</button></div>
    <div class="status-line" id="einkauf-status-${id}"></div>
  `;
}

function gewaehlteEinkaufZeilen(id) {
  return Array.from(document.querySelectorAll(`#einkauf-${id} .einkauf-haken:checked`)).map(cb => cb.dataset.zeile);
}

function sendeAnNest(id) {
  const zeilen = gewaehlteEinkaufZeilen(id);
  const status = document.getElementById(`einkauf-status-${id}`);
  if (zeilen.length === 0) { status.textContent = 'Nichts ausgewählt.'; return; }
  const r = allRecipesCache.find(rec => rec.id === id);
  const link = `${NEST_URL}?einkauf=${encodeURIComponent(zeilen.join('\n'))}&rezept=${encodeURIComponent(r.titel)}`;
  window.open(link, '_blank', 'noopener');
  status.textContent = 'Nest ist geöffnet – dort die Zutaten nacheinander bestätigen.';
}

async function kopiereEinkauf(id) {
  const zeilen = gewaehlteEinkaufZeilen(id);
  const status = document.getElementById(`einkauf-status-${id}`);
  if (zeilen.length === 0) { status.textContent = 'Nichts ausgewählt.'; return; }
  const text = zeilen.join('\n');
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Ältere Browser: über ein verstecktes Textfeld kopieren
    const feld = document.createElement('textarea');
    feld.value = text;
    document.body.appendChild(feld);
    feld.select();
    document.execCommand('copy');
    feld.remove();
  }
  status.textContent = `${zeilen.length} Zutaten kopiert.`;
}
