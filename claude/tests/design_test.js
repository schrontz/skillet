const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const DIR = process.argv[2] || '/tmp/sk';
const OUT = process.argv[3] || '/tmp/test';
let ok = 0, fail = 0;
const check = (cond, msg) => { if (cond) { ok++; console.log('OK   ' + msg); } else { fail++; console.log('FAIL ' + msg); } };

const techniques = [
 {id:'t1',name:'Scharf anbraten (Sautieren)',kurzbeschreibung:'Bei hoher Hitze bräunen.',kernkriterien:['a'],typische_fehler:['Pfanne zu kalt'],root_kategorie:'Hitzeführung & Garmethoden'},
 {id:'t2',name:'Deglasieren',kurzbeschreibung:'Bratensatz lösen.',kernkriterien:['a'],typische_fehler:['zu spät'],root_kategorie:'Sauce & Bindung'}];
const recipes = [
 {id:'r1',titel:'Gulasch nach Omas Art',zutaten:'1000 g Rindergulasch',anleitung:'1. Anbraten',anleitung_schritte:['Fleisch scharf anbraten','Zwiebeln dazu','2 Stunden schmoren'],quelle_url:'https://www.chefkoch.de/rezepte/1/gulasch.html',kopie_von:null,basis_portionen:6,zutaten_strukturiert:[{menge:1000,einheit:'g',name:'Rindergulasch'},{menge:3,einheit:null,name:'Zwiebeln'},{menge:2,einheit:'EL',name:'Paprikapulver "edelsüß"'},{menge:null,einheit:null,name:'Salz'}],erstellt_am:'2026-09-03'},
 {id:'r2',titel:'Jans Gulasch',zutaten:'',anleitung:'Alles in einen Topf',anleitung_schritte:null,quelle_url:null,kopie_von:'r1',basis_portionen:null,zutaten_strukturiert:null,erstellt_am:'2026-09-02'},
 {id:'r3',titel:'Pfifferling-Sauce mit sehr langem Titel zum Testen der Umbrüche',zutaten:'',anleitung:'',anleitung_schritte:null,quelle_url:null,kopie_von:null,basis_portionen:4,zutaten_strukturiert:null,erstellt_am:'2026-08-01'}];

async function neueSeite(browser, width, storage) {
  const page = await browser.newPage({ viewport: { width, height: 700 }, deviceScaleFactor: 2 });
  page.fehler = [];
  page.calls = [];
  page.on('pageerror', e => page.fehler.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME|Failed to load resource/.test(m.text())) page.fehler.push(m.text()); });
  if (storage) await page.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  await page.route('**/*supabase.co/**', route => {
    const req = route.request(); const u = req.url(); const m = req.method();
    page.calls.push(m + ' ' + u.replace(/^.*supabase\.co/, ''));
    let body = [];
    if (u.includes('/functions/v1/import-recipe')) body = {source:'structured',titel:'Importiertes Rezept',zutaten:'2 Eier',zutatenStrukturiert:[{menge:2,einheit:null,name:'Eier'}],anleitung:'1. Braten',basisPortionen:2};
    else if (u.includes('/functions/v1/extract-recipe-from-text')) {
      page.extraktTexte = (page.extraktTexte || []).concat([JSON.parse(req.postData() || '{}').text]);
      body = page.extraktFehler ? { error: 'Gemini antwortet nicht' } : {titel:'Diktiertes Rezept',zutatenStrukturiert:[{menge:2,einheit:null,name:'Zwiebeln'}],anleitungSchritte:['Zwiebeln schneiden','Anschwitzen'],basisPortionen:null};
    }
    else if (u.includes('/functions/v1/naehrwerte')) {
      const anfrage = JSON.parse(req.postData() || '{}');
      page.nwAnfragen = (page.nwAnfragen || []).concat([anfrage]);
      body = page.nwFehler ? { error: 'Error: Gemini: 503 UNAVAILABLE The model is overloaded. Please try again later.' } : {
        version: 1, stand: anfrage.stand, quelle: 'BLS 4.0', berechnet_am: '2026-10-11T12:00:00Z',
        summe: { kcal: 1302, eiweiss: 203.6, kh: 18.3, fett: 45.6 },
        zutaten: [
          { name: 'Rindergulasch', menge: 1000, einheit: 'g', status: 'ok', gramm: 1000, bls_code: 'U1', bls_name: 'Rind Gulasch (Bug) roh', annahme: null, unsicher: false, quelle: 'ki', je100: { kcal: 120, eiweiss: 20, kh: 0, fett: 4.5 }, kcal: 1200, eiweiss: 200, kh: 0, fett: 45 },
          { name: 'Zwiebeln', menge: 3, einheit: null, status: 'ok', gramm: 300, bls_code: 'G480100', bls_name: 'Speisezwiebel roh', annahme: '1 Zwiebel ≈ 100 g', unsicher: false, quelle: 'ki', je100: { kcal: 34, eiweiss: 1.2, kh: 6.1, fett: 0.2 }, kcal: 102, eiweiss: 3.6, kh: 18.3, fett: 0.6 },
          { name: 'Paprikapulver "edelsüß"', menge: 2, einheit: 'EL', status: 'vernachlaessigbar', unsicher: false },
          { name: 'Salz', menge: null, einheit: null, status: 'vernachlaessigbar', unsicher: false }
        ]
      };
    }
    else if (u.includes('/kochtagebuch')) {
      page.tagebuch = page.tagebuch || [];
      if (m === 'GET') body = [...page.tagebuch].sort((a, b) => (a.gekocht_am < b.gekocht_am ? 1 : -1));
      else if (m === 'POST') {
        if (page.tagebuchFehler) { route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"kaputt"}' }); return; }
        const neu = { id: 'kt' + (page.tagebuch.length + 1), gekocht_am: new Date().toISOString(), ...JSON.parse(req.postData() || '{}') };
        page.tagebuch.push(neu); page.tagebuchPosts = (page.tagebuchPosts || []).concat([neu]); body = [neu];
      } else if (m === 'PATCH') {
        const id = u.match(/id=eq\.([^&]+)/)[1]; const e = page.tagebuch.find(x => x.id === id);
        Object.assign(e, JSON.parse(req.postData() || '{}')); page.tagebuchPatches = (page.tagebuchPatches || []).concat([{ id, ...JSON.parse(req.postData() || '{}') }]); body = [];
      }
    }
    else if (u.includes('zutat_wissen')) { page.wissen = (page.wissen || []).concat([JSON.parse(req.postData() || '{}')]); body = []; }
    else if (u.includes('/functions/v1/detect-techniques')) body = {erkannte_technik_ids:['t1'],neue_technik_vorschlag:null};
    else if (u.includes('recipe_techniques')) body = m === 'GET' ? [{techniques:{name:'Scharf anbraten (Sautieren)'}},{techniques:{name:'Deglasieren'}}] : [];
    else if (u.includes('technique_progress')) body = [{level:1},{level:0}];
    else if (u.includes('/reflections')) body = u.includes('limit=1') && u.includes('recipe_id') ? [{id:'x'}] : [{id:'f1',erstellt_am:'2026-09-28T10:00:00Z',ergebnis:'sauber_bestaetigt',finaler_output:{kriterien_bewertung:[]},techniques:{name:'Deglasieren'},recipes:{titel:'Gulasch'}}];
    else if (u.includes('/techniques')) body = techniques;
    else if (u.includes('/recipes')) {
      if (m === 'PATCH' && u.includes('id=eq.')) { const id = u.match(/id=eq\.([^&]+)/)[1]; body = [{...recipes.find(r => r.id === id), ...JSON.parse(req.postData() || '{}'), id}]; }
      else if (m === 'POST' || m === 'PATCH') body = [{id:'neu1', ...JSON.parse(req.postData() || '{}')}];
      else if (u.includes('id=eq.')) body = recipes.filter(r => u.includes('id=eq.' + r.id));
      else body = recipes;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return page;
}
const tageZurueck = (t) => new Date(Date.now() - t * 864e5).toISOString();
const beispielTagebuch = () => [
  { id: 'a1', recipe_id: 'r1', titel: 'Gulasch nach Omas Art', frei: false, gekocht_am: tageZurueck(35), bewertung: 'gern', notiz: 'Etwas zu flüssig – weniger Brühe' },
  { id: 'a2', recipe_id: 'r1', titel: 'Gulasch nach Omas Art', frei: false, gekocht_am: tageZurueck(80), bewertung: null, notiz: null },
  { id: 'a3', recipe_id: 'r1', titel: 'Gulasch nach Omas Art', frei: false, gekocht_am: tageZurueck(120), bewertung: 'geht_so', notiz: null },
  { id: 'a4', recipe_id: 'r2', titel: 'Jans Gulasch', frei: false, gekocht_am: tageZurueck(2), bewertung: null, notiz: null },
  { id: 'a5', recipe_id: null, titel: 'Frei gekocht', frei: true, gekocht_am: tageZurueck(1), bewertung: 'gern', notiz: null }
];
const kein_seitlich = async (page, w) => (await page.evaluate(() => document.documentElement.scrollWidth)) <= w;
const sichtbar = (page, sel) => page.isVisible(sel);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ---- 1. Erster Start (leerer Speicher), 320 px ----
  let p = await neueSeite(browser, 320);
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(600);
  check(await sichtbar(p, '#start-view'), 'Erster Start zeigt den Startbildschirm');
  check(!(await sichtbar(p, '#bereich-kopf')), 'Kein Bereichskopf auf dem Start');
  check((await p.textContent('.start-frage')) === 'Was kochst du heute?', 'Start fragt "Was kochst du heute?"');
  check(await p.locator('#start-view .kachel').count() === 2, 'Nur noch zwei Kacheln: Kochen und Rezepte');
  check(await p.locator('#kachel-reflect, #kachel-progress, #kachel-history, #view-reflect, #view-progress, #view-history').count() === 0, 'Lernteil (Reflektieren, Fortschritt, Verlauf) ist weg');
  check((await p.textContent('#kachel-info-recipes')) === '3 gespeichert', 'Rezepte-Kachel: 3 gespeichert');
  check(await p.locator('#kachel-zahl-recipes').count() === 0, 'Rezepte-Kachel ohne Zahlen-Badge (nichts Offenes)');
  check(!(await sichtbar(p, '#kachel-zahl-kochen')) && (await p.textContent('#kachel-info-kochen')) === 'mit Rezept oder frei', 'Kochen ohne offene Notizen: keine Zahl');
  check(!p.calls.some(c => /techniques|reflections|technique_progress/.test(c)), 'Keine Abfragen mehr an Techniken oder Reflexionen');
  check((await p.textContent('#start-datum')).length > 5, 'Datum steht im Kopf');
  check(await kein_seitlich(p, 320), 'Start: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n1_start.png', fullPage: true });

  // ---- 2. Rezepte: Liste lädt sofort, Formular zu ----
  await p.click('#kachel-recipes'); await p.waitForTimeout(400);
  check((await p.textContent('#bereich-titel')) === 'Rezepte', 'Bereichstitel "Rezepte"');
  check(!(await p.textContent('#recipe-list')).includes('Lade Rezepte'), 'Rezeptliste ist geladen (Bug "Lade Rezepte..." behoben)');
  check(await p.locator('.rezept-karte').count() === 3, 'Drei Rezeptkarten');
  check(!(await sichtbar(p, '#rezept-add-form')), 'Formular ist zugeklappt');
  const meta = await p.locator('.rezept-meta').allTextContents();
  check(meta[0].includes('6 Portionen') && meta[0].includes('chefkoch.de'), 'Meta-Zeile: Portionen und Herkunft');
  check(meta[1].includes('Kopie von'), 'Meta-Zeile: Kopie von');
  check(await kein_seitlich(p, 320), 'Rezeptliste: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n2_liste.png', fullPage: true });

  // ---- 3. Rezept als schwebende Karte ----
  const vorher = await p.evaluate(() => history.length);
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(400);
  check(await sichtbar(p, '#rezept-ueberlagerung'), 'Rezept öffnet als schwebende Karte');
  check((await p.textContent('#rezept-karte-titel')) === 'Gulasch nach Omas Art', 'Kartentitel ist der Rezepttitel');
  check(await p.evaluate(() => getComputedStyle(document.getElementById('rezept-ueberlagerung')).backdropFilter.includes('blur')), 'Hintergrund ist unscharf');
  check(await p.evaluate(() => document.body.classList.contains('karte-offen')), 'Seite darunter ist gesperrt');
  check(await p.evaluate(() => history.length) === vorher + 1, 'Karte legt einen Verlaufs-Eintrag an (Zurück-Taste)');
  check((await p.textContent('#recipe-detail-r1 .karte-meta')).includes('6 Portionen') && await p.locator('#recipe-detail-r1 .karte-meta a').count() === 1, 'Meta-Zeile mit Portionen und Link zum Original');
  check(await sichtbar(p, '#zutaten-liste-r1') && !(await sichtbar(p, '#recipe-detail-r1 .schritt-liste')), 'Reiter Zutaten ist offen, Zubereitung zu');
  check((await p.textContent('#recipe-detail-r1')).includes('Paprikapulver "edelsüß"'), 'Anführungszeichen im Zutatennamen werden korrekt angezeigt');
  check(await p.locator('#zutaten-liste-r1 input').count() === 0 && (await p.textContent('#zutaten-liste-r1 .menge-knopf >> nth=0')).trim() === '1000 g', 'Mengen als Text statt Eingabefeld ("1000 g")');
  await p.click('#recipe-detail-r1 .mini-rund >> nth=0'); await p.waitForTimeout(150);
  check((await p.textContent('#portionen-anzeige-r1')) === '5', 'Portionen − : 6 -> 5');
  check((await p.textContent('#zutaten-liste-r1 .menge-knopf >> nth=0')).trim() === '833 g', 'Gulasch auf 5 Portionen: 833 g');
  await p.click('#zutaten-liste-r1 .menge-knopf >> nth=0'); await p.waitForTimeout(100);
  check(await p.locator('#zutaten-liste-r1 input').count() === 1 && await p.evaluate(() => document.activeElement.matches('#zutaten-liste-r1 input')), 'Tipp auf die Menge macht daraus ein Eingabefeld mit Fokus');
  await p.fill('#zutaten-liste-r1 input', '400'); await p.dispatchEvent('#zutaten-liste-r1 input', 'change'); await p.waitForTimeout(150);
  check((await p.textContent('#zutaten-liste-r1 .menge-knopf >> nth=1')).trim() === '1,2', 'Nur 400 g Fleisch: Zwiebeln 1,2');
  check((await p.textContent('#portionen-anzeige-r1')) === '2,4', 'Portionen folgen: 2,4');
  await p.click('#zutaten-liste-r1 .menge-knopf >> nth=1'); await p.waitForTimeout(100);
  await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(100);
  check(await p.locator('#zutaten-liste-r1 input').count() === 0 && (await p.textContent('#zutaten-liste-r1 .menge-knopf >> nth=1')).trim() === '1,2', 'Ohne Änderung wegtippen: wieder Text, nichts umgerechnet');
  await p.click('#recipe-detail-r1 .reiter >> text=Zubereitung'); await p.waitForTimeout(200);
  check(await p.locator('#recipe-detail-r1 .schritt-liste li').count() === 3 && !(await sichtbar(p, '#zutaten-liste-r1')), 'Reiter Zubereitung: drei Schritte, Zutaten ausgeblendet');
  check(await p.locator('#recipe-detail-r1 [id^="recipe-techniques"]').count() === 0, 'Keine Techniken mehr im Reiter Zubereitung');
  check(await kein_seitlich(p, 320), 'Karte: nichts ragt seitlich heraus');
  const kbox = await p.locator('.karte-schwebend').boundingBox();
  check(kbox.x >= 8 && kbox.x + kbox.width <= 312, 'Karte hat links und rechts Rand (' + Math.round(kbox.x) + ' px)');
  await p.screenshot({ path: OUT + '/n3_detail.png' });
  await p.click('#recipe-detail-r1 .reiter >> text=Zutaten'); await p.waitForTimeout(100);
  await p.screenshot({ path: OUT + '/n3b_zutaten.png' });
  await p.goBack(); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#rezept-ueberlagerung')) && await sichtbar(p, '#view-recipes'), 'Zurück-Taste schließt die Karte, Liste bleibt');
  check(!(await p.evaluate(() => document.body.classList.contains('karte-offen'))), 'Seite ist wieder frei');
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  await p.click('#rezept-ueberlagerung .karte-zu'); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#rezept-ueberlagerung')) && await p.evaluate(() => !(history.state && history.state.skilletKarte)), '✕ schließt und räumt den Verlaufs-Eintrag weg');
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#rezept-ueberlagerung')), 'Escape schließt die Karte');

  // ---- 3b. Neues Rezept als Karte ----
  await p.click('#rezept-add-toggle'); await p.waitForTimeout(300);
  check((await p.textContent('#rezept-karte-titel')) === 'Neues Rezept' && await sichtbar(p, '#rezept-add-form') && await sichtbar(p, '#import-url-input'), '"+ Rezept hinzufügen" öffnet die Karte "Neues Rezept" mit Import');
  check(await kein_seitlich(p, 320), 'Neues Rezept: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n4b_neu.png' });
  await p.goBack(); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#rezept-ueberlagerung')), 'Zurück schließt "Neues Rezept"');

  // ---- 4. Bearbeiten -> Original ----
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  const laengeDetail = await p.evaluate(() => history.length);
  await p.click('#recipe-detail-r1 .ikon-knopf[data-panel="bearbeiten"]'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#bearbeiten-wahl-r1'), '✎ zeigt die Wahl Original/Kopie');
  await p.click('#recipe-detail-r1 .ikon-knopf[data-panel="mehr"]'); await p.waitForTimeout(150);
  check(!(await sichtbar(p, '#bearbeiten-wahl-r1')) && await sichtbar(p, '#mehr-r1'), 'Immer nur ein Bereich unter der Knopfleiste offen');
  await p.click('#recipe-detail-r1 .ikon-knopf[data-panel="bearbeiten"]'); await p.waitForTimeout(300);
  await p.click('#bearbeiten-wahl-r1 >> text=Original ändern'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#rezept-add-form') && (await p.textContent('#rezept-karte-titel')) === 'Rezept bearbeiten', 'Karte wechselt zu "Rezept bearbeiten"');
  check(!(await sichtbar(p, '#import-url-input')), 'Beim Bearbeiten kein Import-Feld');
  check(await p.evaluate(() => history.length) === laengeDetail, 'Ansehen → Bearbeiten bleibt ein einziger Verlaufs-Eintrag');
  check(await p.inputValue('#recipe-titel-input') === 'Gulasch nach Omas Art', 'Titel im Formular');
  check(await p.locator('#zutaten-rows .zutat-row').count() === 4, 'Vier Zutatenzeilen im Formular');
  check(await p.inputValue('#zutaten-rows .zutat-name >> nth=2') === 'Paprikapulver "edelsüß"', 'Anführungszeichen bleiben im Eingabefeld erhalten');
  check(await kein_seitlich(p, 320), 'Formular: Zutatenzeilen ragen nicht heraus (Bug behoben)');
  const zeile = await p.locator('#zutaten-rows .zutat-row >> nth=0').boundingBox();
  const karte = await p.locator('.karte-schwebend').boundingBox();
  check(zeile.x + zeile.width <= karte.x + karte.width + 0.5, 'Zutatenzeile bleibt innerhalb der Karte');
  await p.screenshot({ path: OUT + '/n4_formular.png' });
  await p.click('#recipe-submit-btn'); await p.waitForTimeout(600);
  check(p.calls.some(c => c.startsWith('PATCH /rest/v1/recipes?id=eq.r1')), 'Speichern schickt PATCH ans Original');
  check(!(await sichtbar(p, '#rezept-ueberlagerung')), 'Karte schließt nach dem Speichern');
  check(await p.evaluate(() => !(history.state && history.state.skilletKarte)), 'Nach dem Speichern kein Karten-Eintrag mehr im Verlauf');

  // ---- 4b. Löschen über ⋯ ----
  p.once('dialog', d => d.accept());
  await p.click('.rezept-karte >> nth=2'); await p.waitForTimeout(300);
  await p.click('#recipe-detail-r3 .ikon-knopf[data-panel="mehr"]'); await p.waitForTimeout(150);
  await p.click('#mehr-r3 >> text=Rezept löschen'); await p.waitForTimeout(500);
  check(p.calls.some(c => c.startsWith('DELETE /rest/v1/recipes?id=eq.r3')) && !(await sichtbar(p, '#rezept-ueberlagerung')), 'Löschen über ⋯ löscht und schließt die Karte');

  // ---- 4c. Nach dem Speichern rechnet Skillet die Nährwerte im Hintergrund ----
  check((p.nwAnfragen || []).some(a => a.recipe_id === 'r1' && a.zutaten.length === 4 && /^v2-/.test(a.stand)), 'Nach dem Speichern: Nährwerte im Hintergrund angefragt (mit Zutaten und Stand)');

  // ---- 5. Zurück zum Start ----
  await p.click('#bereich-kopf .rund-knopf'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#start-view'), '‹ führt zurück zum Start');
  check(!(await sichtbar(p, '#view-recipes')), 'Rezepte-Bereich ist ausgeblendet');

  // ---- 6. Kochen-Karte: nach Rezept oder frei ----
  await p.click('#kachel-kochen'); await p.waitForTimeout(400);
  check(await sichtbar(p, '#kochen-auswahl') && (await p.textContent('#rezept-karte-titel')) === 'Kochen', 'Kachel "Kochen" öffnet die schwebende Karte "Kochen"');
  check(await p.locator('#koch-rezepte .koch-rezept').count() === 3, 'Karte listet die Rezepte');
  await p.fill('#koch-suche', 'jans'); await p.waitForTimeout(100);
  check(await p.locator('#koch-rezepte .koch-rezept').count() === 1 && (await p.textContent('#koch-rezepte')).includes('Jans Gulasch'), 'Suche filtert die Rezepte');
  await p.fill('#koch-suche', 'xyz'); await p.waitForTimeout(100);
  check((await p.textContent('#koch-rezepte')).includes('Nichts gefunden'), 'Suche ohne Treffer: Hinweis');
  await p.fill('#koch-suche', '');
  check(await kein_seitlich(p, 320), 'Kochen-Karte: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n5_kochen_karte.png' });
  await p.goBack(); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#rezept-ueberlagerung')), 'Zurück schließt die Kochen-Karte');

  // ---- 7. Frei kochen: Notizen, auch alles auf einmal, am Ende ein Rezept ----
  await p.click('#kachel-kochen'); await p.waitForTimeout(300);
  await p.click('#koch-frei-knopf'); await p.waitForTimeout(400);
  check(await sichtbar(p, '#kochmodus-overlay') && !(await sichtbar(p, '#rezept-ueberlagerung')), '"Frei kochen" öffnet den Kochbildschirm, Karte ist zu');
  check((await p.textContent('#kochmodus-overlay .koch-kopf')).includes('Frei kochen') && await sichtbar(p, '#timer-minuten'), 'Kopf "Frei kochen", Timer ist da');
  check(await p.evaluate(() => document.getElementById('frei-eingabe').tagName) === 'TEXTAREA', 'Eingabe ist mehrzeilig (Textfeld)');
  await p.fill('#frei-eingabe', 'Zwei Zwiebeln geschnitten'); await p.click('text=+ Notiz'); await p.waitForTimeout(150);
  const lang = 'Dann 500 g Hähnchen dazu, scharf angebraten.\nEine Dose Bohnen und eine Dose Tomaten rein, 20 Minuten köcheln lassen, am Ende ein Schuss Sahne.';
  await p.fill('#frei-eingabe', lang); await p.click('text=+ Notiz'); await p.waitForTimeout(150);
  check(await p.locator('.frei-notiz').count() === 2, 'Zwei Notizen – die zweite ist ein ganzer Absatz');
  check((await p.textContent('.frei-notiz >> nth=1')).includes('Sahne') && await p.evaluate(() => getComputedStyle(document.querySelector('.frei-notiz > div')).whiteSpace) === 'pre-wrap', 'Langes Diktat bleibt als eine Notiz, Zeilenumbrüche bleiben');
  await p.fill('#frei-eingabe', 'Noch nicht abgeschickt');
  check(await kein_seitlich(p, 320), 'Frei kochen: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n6b_frei.png' });
  // Neuladen: alles wieder da
  await p.reload(); await p.waitForTimeout(700);
  check(await sichtbar(p, '#kochmodus-overlay') && await p.locator('.frei-notiz').count() === 2 && (await p.inputValue('#frei-eingabe')) === 'Noch nicht abgeschickt', 'Nach Neuladen: Kochbildschirm, Notizen und Entwurf sind wieder da');
  // Notiz löschen
  await p.click('.frei-notiz >> nth=0 >> button'); await p.waitForTimeout(100);
  check(await p.locator('.frei-notiz').count() === 1 && (await p.inputValue('#frei-eingabe')) === 'Noch nicht abgeschickt', 'Notiz löschen, der Entwurf bleibt stehen');
  // Fertig → Fertig-Bildschirm
  await p.click('#koch-fertig'); await p.waitForTimeout(300);
  check((await p.textContent('#kochmodus-overlay .fertig')).includes('Fertig!') && (await p.textContent('.fertig-gericht')) === 'Frei gekocht', 'Fertig öffnet den Fertig-Bildschirm');
  check(await p.locator('.frei-notiz').count() === 0 && await p.evaluate(() => ladeFreiNotizen().length) === 2, 'Entwurf wurde zur Notiz (2 Notizen)');
  check((await p.textContent('.fertig')).includes('Als Rezept speichern?') && (await p.textContent('.fertig-pille.an >> nth=0')).includes('Ja, speichern'), 'Frei gekocht: "Als Rezept speichern?" mit Ja vorausgewählt');
  check(await p.locator('#fertig-motivator').count() === 0, 'Frei gekocht: noch kein "Gegessen → Motivator" (es gibt noch kein Rezept)');
  check(await kein_seitlich(p, 320), 'Fertig-Bildschirm: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n6c_fertig_frei.png' });
  await p.click('.fertig-pille >> text=Gern'); await p.waitForTimeout(100);
  // Zusammensetzen schlägt fehl: bleibt, Eintrag nicht doppelt
  p.extraktFehler = true;
  await p.click('#fertig-speichern'); await p.waitForTimeout(500);
  check(await sichtbar(p, '#kochmodus-overlay') && (await p.textContent('#fertig-status')).includes('Notizen sind noch da'), 'Fehler beim Zusammensetzen: Fertig-Bildschirm bleibt, Notizen sind noch da');
  check((p.tagebuchPosts || []).length === 1 && p.tagebuchPosts[0].frei === true && p.tagebuchPosts[0].bewertung === 'gern' && p.tagebuchPosts[0].recipe_id === null, 'Tagebuch: frei gekocht mit 👍 eingetragen');
  p.extraktFehler = false;
  await p.click('#fertig-speichern'); await p.waitForTimeout(600);
  check((p.tagebuchPosts || []).length === 1, 'Zweiter Versuch trägt nicht doppelt ins Tagebuch ein');
  const extrakt = p.extraktTexte[p.extraktTexte.length - 1] || '';
  check(extrakt.includes('1. Dann 500 g Hähnchen') && extrakt.includes('2. Noch nicht abgeschickt'), 'Gemini bekommt die Notizen in Reihenfolge');
  check(!(await sichtbar(p, '#kochmodus-overlay')) && await sichtbar(p, '#rezept-add-form') && (await p.textContent('#rezept-karte-titel')) === 'Neues Rezept', 'Dann: Formular-Karte mit dem neuen Rezept');
  check(await p.inputValue('#recipe-titel-input') === 'Diktiertes Rezept' && !(await sichtbar(p, '#rezept-import-block')), 'Formular ausgefüllt, ohne Import-Feld');
  check(await p.evaluate(() => ladeFreiNotizen().length) === 2, 'Notizen bleiben, bis das Rezept gespeichert ist');
  await p.click('#recipe-submit-btn'); await p.waitForTimeout(700);
  check(p.calls.some(c => c.startsWith('POST /rest/v1/recipes')) && await p.evaluate(() => ladeFreiNotizen().length) === 0, 'Nach dem Speichern: Rezept angelegt, Notizen geleert');
  check((p.tagebuchPatches || []).some(x => x.id === p.tagebuchPosts[0].id && x.recipe_id === 'neu1' && x.titel === 'Diktiertes Rezept'), 'Tagebuch-Eintrag wird mit dem neuen Rezept verbunden');
  check(!p.calls.some(c => c.includes('detect-techniques')), 'Keine Technik-Erkennung mehr nach dem Speichern');
  check((await p.textContent('#detect-card')).includes('gespeichert'), 'Hinweis "gespeichert" über der Liste');
  check(p.fehler.length === 0, 'Keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 7a. Frei kochen, aber kein Rezept daraus ----
  p = await neueSeite(browser, 320, { skillet_freestyle_schnipsel: JSON.stringify([{ text: 'Reste-Pfanne mit Ei', zeit: tageZurueck(0) }]) });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  await p.click('#kachel-kochen'); await p.waitForTimeout(300);
  await p.click('#koch-frei-knopf'); await p.waitForTimeout(400);
  await p.click('#koch-fertig'); await p.waitForTimeout(200);
  await p.click('.fertig-pille >> text=Nein'); await p.waitForTimeout(100);
  check((await p.textContent('.fertig')).includes('Die Notizen werden dann gelöscht'), '"Nein" erklärt, dass die Notizen gelöscht werden');
  await p.click('.fertig-pille >> text=Geht so'); await p.waitForTimeout(100);
  check(await sichtbar(p, '#fertig-notiz'), '"Geht so" öffnet die Notiz fürs nächste Mal');
  await p.click('#fertig-speichern'); await p.waitForTimeout(500);
  check(!(await sichtbar(p, '#kochmodus-overlay')) && await sichtbar(p, '#start-view') && await p.evaluate(() => ladeFreiNotizen().length) === 0, 'Fertig ohne Rezept: zurück zum Start, Notizen gelöscht');
  check(!p.extraktTexte, 'Kein Gemini-Aufruf, wenn kein Rezept gewünscht');
  check((await p.textContent('#start-zuletzt')).includes('Frei gekocht') && (await p.textContent('#start-zuletzt')).includes('heute'), 'Start: "Zuletzt gekocht" zeigt es mit "heute"');
  check(p.fehler.length === 0, 'Frei ohne Rezept: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 7b. Ganzes Rezept diktieren im Formular ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  await p.click('#rezept-add-toggle'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#rezept-diktat-input') && await p.evaluate(() => document.getElementById('rezept-diktat-input').tagName) === 'TEXTAREA', '"Neues Rezept": Feld zum Diktieren des ganzen Rezepts');
  await p.fill('#rezept-diktat-input', 'Zwiebeln schneiden, anschwitzen, fertig. Zwei Zwiebeln.');
  await p.click('#rezept-diktat-btn'); await p.waitForTimeout(500);
  check(await p.inputValue('#recipe-titel-input') === 'Diktiertes Rezept' && await p.locator('#zutaten-rows .zutat-row').count() === 1 && await p.locator('#schritte-rows .schritt-row').count() === 2, 'Daraus wird Titel, Zutat und zwei Schritte');
  check((await p.inputValue('#rezept-diktat-input')) === '' && (p.extraktTexte || []).includes('Zwiebeln schneiden, anschwitzen, fertig. Zwei Zwiebeln.'), 'Diktat wird geschickt und das Feld geleert');
  await p.screenshot({ path: OUT + '/n4c_diktat.png' });
  check(p.fehler.length === 0, 'Diktat: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 7c. Alter Stand im Speicher: Notizen aus Freestyle, letzter Bereich "Reflektieren" ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'reflect', skillet_freestyle_schnipsel: JSON.stringify([{ text: 'Alte Notiz', zeit: '2026-10-01T18:00:00Z' }]) });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  check(await sichtbar(p, '#start-view'), 'Gespeicherter Bereich "Reflektieren" gibt es nicht mehr: Start');
  check((await p.textContent('#kachel-zahl-kochen')) === '1' && (await p.textContent('#kachel-info-kochen')).includes('1 Notiz offen'), 'Alte Freestyle-Notizen tauchen als offene Notiz bei Kochen auf');
  await p.click('#kachel-kochen'); await p.waitForTimeout(300);
  check((await p.textContent('#koch-frei-knopf')).includes('1 Notiz vom letzten Mal'), 'Kochen-Karte: "Weiter machen" mit der alten Notiz');
  check(p.fehler.length === 0, 'Alter Stand: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 8. Neuladen merkt sich den Bereich ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  check((await p.textContent('#bereich-titel')) === 'Rezepte' && !(await sichtbar(p, '#start-view')), 'Nach Neuladen: wieder in Rezepte');
  check(await p.locator('.rezept-karte').count() === 3, 'Nach Neuladen: Liste geladen');
  await p.close();

  // ---- 9. Teilen aus dem Browser (Share Target) ----
  p = await neueSeite(browser, 320);
  await p.goto('file://' + DIR + '/index.html?shared_text=' + encodeURIComponent('Schau mal https://example.com/rezept')); await p.waitForTimeout(900);
  check(await sichtbar(p, '#rezept-add-form') && await sichtbar(p, '#rezept-ueberlagerung'), 'Geteilter Link öffnet die Formular-Karte');
  check(await p.inputValue('#recipe-titel-input') === 'Importiertes Rezept', 'Geteilter Link wird importiert');
  check(p.fehler.length === 0, 'Share: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 10. Kochen aus dem Rezept: Zettel, "Was war anders?", Fertig-Bildschirm ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  p.tagebuch = beispielTagebuch();
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  check((await p.textContent('#recipe-detail-r1 .karte-zettel')).includes('Etwas zu flüssig'), 'Rezept-Karte: Zettel vom letzten Mal');
  check((await p.textContent('#recipe-detail-r1 .karte-meta')).includes('3× gekocht · zuletzt vor 5 Wochen'), 'Rezept-Karte: 3× gekocht · zuletzt vor 5 Wochen');
  await p.click('#recipe-detail-r1 >> text=Kochen'); await p.waitForTimeout(500);
  check(await sichtbar(p, '#kochmodus-overlay'), '"Kochen" startet den Kochbildschirm');
  check(!(await sichtbar(p, '#rezept-ueberlagerung')), 'Rezept-Karte ist beim Kochen zu');
  check((await p.textContent('#kochmodus-overlay')).includes('Gulasch nach Omas Art') && (await p.textContent('#kochmodus-overlay')).includes('Schritt 1 von 3'), 'Kochbildschirm zeigt das gewählte Rezept, Schritt 1 von 3');
  check((await p.textContent('.koch-zettel')).includes('Etwas zu flüssig') && (await p.textContent('.koch-zettel')).includes('vor 5 Wochen'), 'Kochbildschirm: Zettel "Letztes Mal notiert" oben');
  await p.click('#kochmodus-overlay button[aria-label="Nächster Schritt"]'); await p.waitForTimeout(100);
  check((await p.textContent('#kochmodus-overlay')).includes('Schritt 2 von 3'), 'Pfeil → nächster Schritt');
  await p.click('.koch-anders-box summary'); await p.fill('#koch-anders', 'Heute 4 Zwiebeln');
  await p.click('#kochmodus-overlay button[aria-label="Nächster Schritt"]'); await p.waitForTimeout(100);
  check((await p.inputValue('#koch-anders')) === 'Heute 4 Zwiebeln' && (await p.textContent('#kochmodus-overlay')).includes('Schritt 3 von 3'), '"Was war anders?" bleibt beim Schrittwechsel stehen');
  check(await kein_seitlich(p, 320), 'Kochen nach Rezept: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n6_kochmodus.png' });
  await p.reload(); await p.waitForTimeout(800);
  check((await p.inputValue('#koch-anders')) === 'Heute 4 Zwiebeln' && (await p.textContent('#kochmodus-overlay')).includes('Schritt 3 von 3'), 'Nach Neuladen: Schritt und Notiz sind wieder da');
  await p.click('#kochmodus-overlay .koch-haupt'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#fertig-notiz') && (await p.inputValue('#fertig-notiz')) === 'Heute 4 Zwiebeln', 'Fertig-Bildschirm: Notiz vom Kochen ist schon drin');
  check(await sichtbar(p, '#fertig-motivator') && (await p.textContent('#fertig-motivator')).includes('Nährwerte rechnen'), 'Nach Rezept: "Gegessen" mit Nährwerte-rechnen-und-eintragen');
  check(!(await p.textContent('.fertig')).includes('Als Rezept speichern'), 'Nach Rezept: keine Frage nach "Als Rezept speichern"');
  await p.click('.fertig-pille >> text=Geht so'); await p.waitForTimeout(100);
  await p.click('.fertig-zurueck'); await p.waitForTimeout(200);
  check(await sichtbar(p, '#koch-anders') && (await p.textContent('#kochmodus-overlay')).includes('Schritt 3 von 3'), '"Zurück zum Kochen" geht zurück an dieselbe Stelle');
  await p.click('#kochmodus-overlay .koch-haupt'); await p.waitForTimeout(200);
  await p.click('.fertig-pille >> text=Geht so'); await p.waitForTimeout(100);
  await p.click('#fertig-motivator button'); await p.waitForTimeout(400);
  check(await p.locator('#fertig-motivator a.motivator-knopf').count() === 1, 'Nährwerte gerechnet: Link zu Motivator erscheint');
  await p.screenshot({ path: OUT + '/n6d_fertig_rezept.png' });
  // Tagebuch kaputt: Hinweis, nichts geht verloren
  p.tagebuchFehler = true;
  await p.click('#fertig-speichern'); await p.waitForTimeout(400);
  check(await sichtbar(p, '#kochmodus-overlay') && (await p.textContent('#fertig-status')).includes('nochmal versuchen'), 'Tagebuch-Fehler: Fertig-Bildschirm bleibt mit Hinweis');
  p.tagebuchFehler = false;
  await p.click('#fertig-speichern'); await p.waitForTimeout(600);
  const post = (p.tagebuchPosts || [])[0] || {};
  check(post.recipe_id === 'r1' && post.bewertung === 'geht_so' && post.notiz === 'Heute 4 Zwiebeln' && post.frei === false, 'Tagebuch: Rezept, "Geht so" und Notiz gespeichert ' + JSON.stringify(post));
  check(!(await sichtbar(p, '#kochmodus-overlay')) && await sichtbar(p, '#start-view'), 'Danach: zurück zum Start');
  check((await p.textContent('.zuletzt-zeile >> nth=0')).includes('Gulasch nach Omas Art') && (await p.textContent('.zuletzt-zeile >> nth=0')).includes('heute'), 'Start: "Zuletzt gekocht" hat das Gulasch von heute oben');
  check(!p.calls.some(c => /reflections|techniques/.test(c)), 'Keine Reflexion mehr nach dem Kochen');
  // × ohne Tagebuch
  await p.click('#kachel-kochen'); await p.waitForTimeout(300);
  await p.click('#koch-rezepte .koch-rezept >> nth=0'); await p.waitForTimeout(500);
  await p.click('#kochmodus-overlay .koch-kopf button'); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#kochmodus-overlay')) && (p.tagebuchPosts || []).length === 1, '× schließt ohne Tagebuch-Eintrag');
  check(p.fehler.length === 0, 'Kochen: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 10b. Start mit Vorschlägen und Kochbuch mit Filtern ----
  p = await neueSeite(browser, 320);
  p.tagebuch = beispielTagebuch();
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(700);
  const grund = await p.textContent('.vorschlag-grund');
  const titel = await p.textContent('.vorschlag-titel');
  check(['Gulasch nach Omas Art', 'Pfifferling-Sauce mit sehr langem Titel zum Testen der Umbrüche'].includes(titel), 'Vorschlag: 👍-Rezept oder nie gekochtes (' + titel + ')');
  check(titel !== 'Jans Gulasch' && !(await p.textContent('#start-vorschlag')).includes('Jans Gulasch'), 'Vor 2 Tagen Gekochtes wird nicht vorgeschlagen');
  const alleGruende = await p.evaluate(() => kochVorschlaege(allRecipesCache).map(v => v.rezept.id + ':' + v.grund));
  check(alleGruende.some(g => g === 'r1:👍 mochtest du · vor 5 Wochen') && alleGruende.some(g => g === 'r3:✨ Noch nie gekocht') && alleGruende.length === 2, 'Gründe: "👍 mochtest du · vor 5 Wochen" und "✨ Noch nie gekocht" ' + JSON.stringify(alleGruende));
  check(await p.locator('.weitere button').count() === 1, 'Darunter "Oder vielleicht" mit der anderen Idee');
  await p.click('button[aria-label="Andere Idee"]'); await p.waitForTimeout(100);
  check((await p.textContent('.vorschlag-titel')) !== titel, '↻ zeigt eine andere Idee');
  check(await p.locator('.zuletzt-zeile').count() === 3 && (await p.textContent('.zuletzt-zeile >> nth=0')).includes('Frei gekocht') && (await p.textContent('.zuletzt-zeile >> nth=0')).includes('gestern'), 'Zuletzt gekocht: drei Einträge, neuester oben (gestern)');
  check(await kein_seitlich(p, 320), 'Start mit Vorschlag: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n1_start.png', fullPage: true });
  await p.click('.vorschlag-knoepfe >> text=Einkauf'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#rezept-ueberlagerung') && await p.locator('.einkauf-box:visible').count() === 1, '🛒 Einkauf öffnet das Rezept mit der Einkaufsliste');
  await p.goBack(); await p.waitForTimeout(300);
  await p.click('#kachel-recipes'); await p.waitForTimeout(500);
  check((await p.textContent('.rezept-karte >> nth=0')).includes('👍') && (await p.textContent('.rezept-karte >> nth=0 >> .rezept-meta')).startsWith('3× gekocht · zuletzt vor 5 Wochen'), 'Kochbuch: 👍 und "3× gekocht · zuletzt vor 5 Wochen"');
  check((await p.textContent('.rezept-karte >> nth=1 >> .rezept-meta')).startsWith('1× gekocht · vor 2 Tagen'), 'Einmal gekocht: "1× gekocht · vor 2 Tagen"');
  for (const [chip, anzahl, name] of [['👍 Lieblinge', 1, 'Lieblinge'], ['Lange her', 1, 'Lange her'], ['Nie gekocht', 1, 'Nie gekocht'], ['Alle', 3, 'Alle']]) {
    await p.click(`.filter-chip >> text=${chip}`); await p.waitForTimeout(100);
    check(await p.locator('.rezept-karte').count() === anzahl, `Filter ${name}: ${anzahl}`);
  }
  check(await kein_seitlich(p, 320), 'Kochbuch mit Filtern: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n2_liste.png', fullPage: true });
  check(p.fehler.length === 0, 'Vorschläge: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 10c. Leeres Tagebuch ----
  p = await neueSeite(browser, 320);
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(600);
  check(await p.locator('.zuletzt-zeile').count() === 0, 'Ohne Tagebuch: kein "Zuletzt gekocht"');
  check(await p.locator('.vorschlag-titel').count() === 1, 'Ohne Tagebuch: trotzdem ein Vorschlag (nie gekochte Rezepte)');
  check(p.fehler.length === 0, 'Leeres Tagebuch: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 12. Einkaufsliste an Nest ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  await p.addInitScript(() => {
    window.__geoeffnet = [];
    window.open = (url) => { window.__geoeffnet.push(url); return null; };
    window.__kopiert = null;
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__kopiert = t; } } });
  });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  await p.click('#zutaten-liste-r1 .menge-knopf >> nth=0'); await p.fill('#zutaten-liste-r1 input', '400'); await p.dispatchEvent('#zutaten-liste-r1 input', 'change'); await p.waitForTimeout(150);
  await p.click('#recipe-detail-r1 .ikon-knopf[data-panel="einkauf"]'); await p.waitForTimeout(200);
  const zeilen = await p.locator('#einkauf-r1 .einkauf-zeile span').allTextContents();
  check(JSON.stringify(zeilen) === JSON.stringify(['400 g Rindergulasch', '2 Zwiebeln', 'Paprikapulver "edelsüß"', 'Salz']), 'Einkaufsliste mit umgerechneten Mengen: ' + JSON.stringify(zeilen));
  check(!(await p.isChecked('#einkauf-r1 .einkauf-haken >> nth=3')), 'Salz ist abgewählt');
  check((await p.textContent('#einkauf-r1')).includes('2,4 Portionen'), 'Hinweis auf eingestellte Portionen');
  check(await kein_seitlich(p, 320), 'Einkaufsliste: nichts ragt seitlich heraus');
  // Knöpfe dürfen nicht über den Kartenrand laufen (wird von scrollWidth nicht erkannt)
  const ueberstand = await p.evaluate(() => {
    const box = document.getElementById('recipe-detail-r1').getBoundingClientRect();
    return [...document.querySelectorAll('#recipe-detail-r1 button')].filter(b => b.offsetParent && b.getBoundingClientRect().right > box.right + 0.5).map(b => b.textContent.trim());
  });
  check(ueberstand.length === 0, 'Alle Knöpfe bleiben innerhalb der Karte ' + JSON.stringify(ueberstand));
  await p.screenshot({ path: OUT + '/n8_einkauf.png', fullPage: false });
  await p.click('#recipe-detail-r1 .mini-rund >> nth=1'); await p.waitForTimeout(150);
  check((await p.textContent('#einkauf-r1 .einkauf-zeile >> nth=0')).includes('567 g'), 'Portionen ändern rechnet die offene Einkaufsliste mit um (3,4 Portionen)');
  await p.click('#einkauf-r1 >> text=An Nest senden'); await p.waitForTimeout(150);
  const url = (await p.evaluate(() => window.__geoeffnet))[0] || '';
  const params = new URL(url).searchParams;
  check(url.startsWith('https://schrontz.github.io/nest/?'), 'Link geht an Nest');
  check(params.get('einkauf') === '567 g Rindergulasch\n2 Zwiebeln\nPaprikapulver "edelsüß"', 'Link enthält genau die gewählten Zeilen');
  check(params.get('rezept') === 'Gulasch nach Omas Art', 'Link enthält den Rezepttitel');
  await p.uncheck('#einkauf-r1 .einkauf-haken >> nth=1');
  await p.click('#einkauf-r1 >> text=Stattdessen kopieren'); await p.waitForTimeout(150);
  check((await p.evaluate(() => window.__kopiert)) === '567 g Rindergulasch\nPaprikapulver "edelsüß"', 'Kopieren nimmt nur die angehakten Zeilen');
  // Rezept ohne strukturierte Zutaten
  await p.click('#rezept-ueberlagerung .karte-zu'); await p.waitForTimeout(300);
  await p.click('.rezept-karte >> nth=1'); await p.waitForTimeout(200);
  await p.click('#recipe-detail-r2 .ikon-knopf[data-panel="einkauf"]'); await p.waitForTimeout(200);
  check((await p.textContent('#einkauf-r2')).includes('keine Zutaten'), 'Rezept ohne Zutaten: klarer Hinweis');
  check(p.fehler.length === 0, 'Einkaufsliste: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 13. Nährwerte ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  check(!(await p.textContent('.rezept-karte >> nth=0')).includes('kcal'), 'Liste: ohne Nährwerte keine kcal');
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  check(await p.locator('#recipe-detail-r1 .reiter button').count() === 3, 'Drei Reiter');
  const reiterOk = await p.evaluate(() => [...document.querySelectorAll('#recipe-detail-r1 .reiter button')].every(b => b.scrollWidth <= b.clientWidth + 1));
  check(reiterOk, 'Reiterbeschriftungen passen auf 320 px');
  await p.click('#recipe-detail-r1 .reiter >> text=Nährwerte'); await p.waitForTimeout(400);
  check((p.nwAnfragen || []).length === 1, 'Reiter Nährwerte rechnet beim ersten Öffnen');
  check((await p.textContent('#naehrwerte-r1 .nw-mitte')).includes('217'), 'Pro Portion: 1302 kcal / 6 = 217 kcal');
  const leg = await p.locator('#naehrwerte-r1 .nw-legende').innerText();
  check(leg.includes('34 g') && leg.includes('63 %') && leg.includes('5 %') && leg.includes('32 %'), 'Legende: 34 g Eiweiß, Anteile 63/5/32 % ' + JSON.stringify(leg));
  check((await p.textContent('#recipe-detail-r1 .karte-meta')).includes('217 kcal pro Portion'), 'Kopfzeile der Karte zeigt kcal pro Portion');
  check((await p.textContent('.rezept-karte >> nth=0')).includes('217 kcal'), 'Liste zeigt jetzt 217 kcal');
  check((await p.textContent('#naehrwerte-r1')).includes('Bundeslebensmittelschlüssel'), 'Quelle BLS steht drunter');
  check((await p.textContent('#naehrwerte-r1 .nw-egal')).includes('Salz'), 'Salz und Paprikapulver als "nicht mitgerechnet"');
  check(await kein_seitlich(p, 320), 'Nährwerte: nichts ragt seitlich heraus');
  await p.click('#naehrwerte-r1 summary'); await p.waitForTimeout(150);
  check(await p.locator('#naehrwerte-r1 .nw-zeile').count() === 2, 'Aufschlüsselung: zwei gerechnete Zutaten');
  check((await p.textContent('#naehrwerte-r1 .nw-zeile >> nth=1')).includes('1 Zwiebel ≈ 100 g'), 'Annahme wird gezeigt');
  await p.screenshot({ path: OUT + '/n9_naehrwerte.png' });
  // Gramm korrigieren
  await p.click('#nw-gramm-r1-1 .menge-knopf'); await p.waitForTimeout(100);
  await p.fill('#nw-gramm-r1-1 input', '450'); await p.press('#nw-gramm-r1-1 input', 'Enter'); await p.waitForTimeout(300);
  check((await p.textContent('#naehrwerte-r1 .nw-mitte')).includes('226'), 'Zwiebeln auf 450 g: (1200+153)/6 = 226 kcal');
  check(p.calls.some(c => c.startsWith('PATCH /rest/v1/recipes?id=eq.r1')), 'Korrektur wird am Rezept gespeichert');
  const gelernt = (p.wissen || [])[0] || {};
  check(gelernt.name_norm === 'zwiebeln' && gelernt.einheit_norm === '' && gelernt.gramm_pro_einheit === 150 && gelernt.quelle === 'hand', 'Skillet merkt sich: 1 Zwiebel = 150 g (von Hand) ' + JSON.stringify(gelernt));
  check((await p.textContent('#naehrwerte-r1')).includes('von dir korrigiert'), 'Zeile zeigt "von dir korrigiert"');
  // Wieder öffnen: keine neue Anfrage
  await p.click('#rezept-ueberlagerung .karte-zu'); await p.waitForTimeout(300);
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  await p.click('#recipe-detail-r1 .reiter >> text=Nährwerte'); await p.waitForTimeout(300);
  check((p.nwAnfragen || []).length === 1 && (await p.textContent('#naehrwerte-r1 .nw-mitte')).includes('226'), 'Aktuelle Nährwerte werden nicht neu angefragt');
  // Fehlerfall: Rezept ohne Portionen, Gemini streikt
  await p.click('#rezept-ueberlagerung .karte-zu'); await p.waitForTimeout(300);
  p.nwFehler = true;
  await p.click('.rezept-karte >> nth=1'); await p.waitForTimeout(300);
  await p.click('#recipe-detail-r2 .reiter >> text=Nährwerte'); await p.waitForTimeout(300);
  check((await p.textContent('#naehrwerte-r2')).includes('keine Zutaten'), 'Rezept ohne Zutaten: Hinweis statt Anfrage');
  await p.click('#rezept-ueberlagerung .karte-zu'); await p.waitForTimeout(300);
  await p.evaluate(() => { const r = allRecipesCache.find(x => x.id === 'r3'); r.zutaten = '2 Eier\n100 g Mehl'; });
  await p.click('.rezept-karte >> nth=2'); await p.waitForTimeout(300);
  await p.click('#recipe-detail-r3 .reiter >> text=Nährwerte'); await p.waitForTimeout(400);
  check((await p.textContent('#naehrwerte-r3')).includes('Gemini ist gerade überlastet') && await p.locator('#naehrwerte-r3 >> text=Nochmal versuchen').count() === 1, 'Fehler: verständliche Meldung ("überlastet") und "Nochmal versuchen"');
  check(!(await p.isVisible('#naehrwerte-r3 .nw-technik div')) && (await p.textContent('#naehrwerte-r3 .nw-technik div')).includes('503'), 'Fehlercode nur eingeklappt unter "Technische Details"');
  check(await p.evaluate(() => naehrwertFehlerText('Datenbank (zutat_wissen): 404 {"code":"PGRST205"}')) === 'Die Nährwert-Datenbank ist noch nicht eingerichtet.', 'Fehlende Tabelle: eigene Meldung');
  const letzte = p.nwAnfragen[p.nwAnfragen.length - 1];
  check(JSON.stringify(letzte.zutaten) === JSON.stringify([{menge:2,einheit:null,name:'Eier'},{menge:100,einheit:'g',name:'Mehl'}]), 'Freitext-Zutaten werden zerlegt geschickt ' + JSON.stringify(letzte.zutaten));
  p.nwFehler = false;
  await p.click('#naehrwerte-r3 >> text=Nochmal versuchen'); await p.waitForTimeout(400);
  check((await p.textContent('#naehrwerte-r3 .nw-mitte')).includes('326') && (await p.textContent('#naehrwerte-r3')).includes('Pro Portion (Rezept für 4)'), 'Nochmal versuchen klappt (4 Portionen: 326 kcal)');
  check(p.fehler.length === 0, 'Nährwerte: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 14. Datenbank ohne Spalte "naehrwerte": Liste lädt trotzdem ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  await p.route(/rest\/v1\/recipes\?select=.*naehrwerte/, route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column recipes.naehrwerte does not exist' }) }));
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  check(await p.locator('.rezept-karte').count() === 3, 'Ohne Spalte naehrwerte: Rezeptliste lädt trotzdem');
  check(p.calls.some(c => c.startsWith('GET /rest/v1/recipes?select=') && !c.includes('naehrwerte')), 'Zweiter Versuch ohne die Spalte wurde wirklich gemacht');
  check(p.fehler.length === 0, 'Ohne Spalte naehrwerte: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 11. Desktop: Kochen verborgen, Rezepte breit ----
  p = await neueSeite(browser, 1000);
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  check(!(await sichtbar(p, '#kachel-kochen')), 'Desktop: Kochen-Kachel verborgen (Kochen ist fürs Handy)');
  const rb = await p.locator('#kachel-recipes').boundingBox(), sb = await p.locator('.kachel-raster').boundingBox();
  check(Math.abs(rb.width - sb.width) < 2, 'Desktop: Rezepte-Kachel nutzt die volle Breite');
  await p.click('#kachel-recipes'); await p.waitForTimeout(300); await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#recipe-detail-r1 >> text=Kochen')), 'Desktop: "Kochen"-Knopf verborgen');
  const dbox = await p.locator('.karte-schwebend').boundingBox();
  check(dbox.width <= 481 && Math.abs((dbox.x + dbox.width / 2) - 500) < 10, 'Desktop: Karte mittig, höchstens 480 px breit');
  const ik = await p.locator('#recipe-detail-r1 .ikon-knopf').count();
  check(ik === 3, 'Desktop: drei kleine Knöpfe da');
  await p.screenshot({ path: OUT + '/n7_desktop.png' });
  await p.close();

  await browser.close();
  console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
  console.log(fail === 0 ? 'ALLE TESTS BESTANDEN' : 'ES GIBT FEHLER');
})();
