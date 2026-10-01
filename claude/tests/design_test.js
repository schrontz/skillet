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
    else if (u.includes('/functions/v1/extract-recipe-from-text')) body = {titel:'Diktiertes Rezept',zutatenStrukturiert:[{menge:2,einheit:null,name:'Zwiebeln'}],anleitungSchritte:['Zwiebeln schneiden','Anschwitzen'],basisPortionen:null};
    else if (u.includes('/functions/v1/detect-techniques')) body = {erkannte_technik_ids:['t1'],neue_technik_vorschlag:null};
    else if (u.includes('recipe_techniques')) body = m === 'GET' ? [{techniques:{name:'Scharf anbraten (Sautieren)'}},{techniques:{name:'Deglasieren'}}] : [];
    else if (u.includes('technique_progress')) body = [{level:1},{level:0}];
    else if (u.includes('/reflections')) body = u.includes('limit=1') && u.includes('recipe_id') ? [{id:'x'}] : [{id:'f1',erstellt_am:'2026-09-28T10:00:00Z',ergebnis:'sauber_bestaetigt',finaler_output:{kriterien_bewertung:[]},techniques:{name:'Deglasieren'},recipes:{titel:'Gulasch'}}];
    else if (u.includes('/techniques')) body = techniques;
    else if (u.includes('/recipes')) {
      if (m === 'POST' || m === 'PATCH') body = [{id:'neu1', ...JSON.parse(req.postData() || '{}')}];
      else if (u.includes('id=eq.')) body = recipes.filter(r => u.includes('id=eq.' + r.id));
      else body = recipes;
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return page;
}
const kein_seitlich = async (page, w) => (await page.evaluate(() => document.documentElement.scrollWidth)) <= w;
const sichtbar = (page, sel) => page.isVisible(sel);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ---- 1. Erster Start (leerer Speicher), 320 px ----
  let p = await neueSeite(browser, 320);
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(600);
  check(await sichtbar(p, '#start-view'), 'Erster Start zeigt den Startbildschirm');
  check(!(await sichtbar(p, '#bereich-kopf')), 'Kein Bereichskopf auf dem Start');
  check((await p.textContent('#kachel-info-recipes')).includes('Gulasch nach Omas Art'), 'Rezepte-Kachel zeigt das neueste Rezept');
  check(await p.locator('#kachel-zahl-recipes').count() === 0, 'Rezepte-Kachel ohne Zahlen-Badge (nichts Offenes)');
  check((await p.textContent('#kachel-info-progress')).includes('1 von 2'), 'Fortschritt-Kachel: 1 von 2 Techniken');
  check((await p.textContent('#kachel-info-history')).includes('Deglasieren'), 'Verlauf-Kachel zeigt letzte Reflexion');
  check(!(await sichtbar(p, '#kachel-zahl-freestyle')), 'Freestyle ohne offene Schritte: keine Zahl');
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

  // ---- 3. Detail ----
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(400);
  check(await sichtbar(p, '#recipe-detail-r1'), 'Detail klappt auf');
  check(await p.locator('#recipe-techniques-r1 .chip').count() === 2, 'Techniken als zwei Etiketten');
  check(await p.locator('#recipe-detail-r1 .schritt-liste li').count() === 3, 'Drei Zubereitungsschritte');
  check((await p.textContent('#recipe-detail-r1')).includes('Paprikapulver "edelsüß"'), 'Anführungszeichen im Zutatennamen werden korrekt angezeigt');
  await p.click('#recipe-detail-r1 .mini-rund >> nth=0'); await p.waitForTimeout(150);
  check((await p.textContent('#portionen-anzeige-r1')) === '5', 'Portionen − : 6 -> 5');
  check(await p.inputValue('#zutaten-liste-r1 input >> nth=0') === '833', 'Gulasch auf 5 Portionen: 833 g');
  await p.fill('#zutaten-liste-r1 input >> nth=0', '400'); await p.dispatchEvent('#zutaten-liste-r1 input >> nth=0', 'change'); await p.waitForTimeout(150);
  check(await p.inputValue('#zutaten-liste-r1 input >> nth=1') === '1.2', 'Nur 400 g Fleisch: Zwiebeln 1.2');
  check(await kein_seitlich(p, 320), 'Detail: nichts ragt seitlich heraus');
  await p.screenshot({ path: OUT + '/n3_detail.png', fullPage: true });

  // ---- 4. Bearbeiten -> Original ----
  await p.click('#recipe-detail-r1 >> text=Bearbeiten'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#bearbeiten-wahl-r1'), 'Bearbeiten zeigt die Wahl Original/Kopie');
  check((await p.textContent('#reflexions-hinweis-r1')).includes('Schon reflektiert'), 'Hinweis bei schon reflektiertem Rezept');
  await p.click('#bearbeiten-wahl-r1 >> text=Original ändern'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#rezept-add-form'), 'Formular geht beim Bearbeiten auf');
  check(await p.inputValue('#recipe-titel-input') === 'Gulasch nach Omas Art', 'Titel im Formular');
  check(await p.locator('#zutaten-rows .zutat-row').count() === 4, 'Vier Zutatenzeilen im Formular');
  check(await p.inputValue('#zutaten-rows .zutat-name >> nth=2') === 'Paprikapulver "edelsüß"', 'Anführungszeichen bleiben im Eingabefeld erhalten');
  check(await kein_seitlich(p, 320), 'Formular: Zutatenzeilen ragen nicht heraus (Bug behoben)');
  const zeile = await p.locator('#zutaten-rows .zutat-row >> nth=0').boundingBox();
  const karte = await p.locator('#rezept-add-form .card >> nth=1').boundingBox();
  check(zeile.x + zeile.width <= karte.x + karte.width + 0.5, 'Zutatenzeile bleibt innerhalb der Karte');
  await p.screenshot({ path: OUT + '/n4_formular.png', fullPage: true });
  await p.click('#recipe-submit-btn'); await p.waitForTimeout(600);
  check(p.calls.some(c => c.startsWith('PATCH /rest/v1/recipes?id=eq.r1')), 'Speichern schickt PATCH ans Original');
  check(!(await sichtbar(p, '#rezept-add-form')), 'Formular klappt nach dem Speichern zu');

  // ---- 5. Zurück zum Start ----
  await p.click('#bereich-kopf .rund-knopf'); await p.waitForTimeout(300);
  check(await sichtbar(p, '#start-view'), '‹ führt zurück zum Start');
  check(!(await sichtbar(p, '#view-recipes')), 'Rezepte-Bereich ist ausgeblendet');

  // ---- 6. Freestyle: Schritt hinzufügen, Zahl auf der Kachel ----
  await p.click('#kachel-freestyle'); await p.waitForTimeout(200);
  await p.fill('#freestyle-schnipsel-input', 'Zwei Zwiebeln geschnitten'); await p.click('text=+ Schritt hinzufügen');
  await p.click('#bereich-kopf .rund-knopf'); await p.waitForTimeout(200);
  check((await p.textContent('#kachel-zahl-freestyle')) === '1' && await sichtbar(p, '#kachel-zahl-freestyle'), 'Freestyle-Kachel zeigt 1 offenen Schritt');
  await p.click('#kachel-freestyle'); await p.waitForTimeout(200);
  await p.click('#freestyle-zusammensetzen-btn'); await p.waitForTimeout(500);
  check((await p.textContent('#bereich-titel')) === 'Rezepte' && await sichtbar(p, '#rezept-add-form'), 'Zusammensetzen öffnet Rezepte mit offenem Formular');
  check(await p.inputValue('#recipe-titel-input') === 'Diktiertes Rezept', 'Diktiertes Rezept im Formular');

  // ---- 7. Lernen-Bereiche ----
  for (const [kachel, titel, sel] of [['#kachel-reflect','Reflektieren','#beschreibung'],['#kachel-progress','Fortschritt','#progress-list .progress-item'],['#kachel-history','Verlauf','#history-list .progress-item']]) {
    await p.evaluate(() => zeigeStart()); await p.waitForTimeout(150);
    await p.click(kachel); await p.waitForTimeout(400);
    check((await p.textContent('#bereich-titel')) === titel && await p.locator(sel).first().isVisible(), `${titel} öffnet sich und zeigt Inhalt`);
    check(await kein_seitlich(p, 320), `${titel}: nichts ragt seitlich heraus`);
  }
  await p.screenshot({ path: OUT + '/n5_reflektieren.png', fullPage: false });
  check(p.fehler.length === 0, 'Keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
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
  check(await sichtbar(p, '#rezept-add-form'), 'Geteilter Link öffnet das Formular');
  check(await p.inputValue('#recipe-titel-input') === 'Importiertes Rezept', 'Geteilter Link wird importiert');
  check(p.fehler.length === 0, 'Share: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 10. Kochen aus dem Rezept ----
  p = await neueSeite(browser, 320, { skillet_active_section: 'recipes' });
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  await p.click('#recipe-detail-r1 >> text=Kochen'); await p.waitForTimeout(500);
  check(await sichtbar(p, '#kochmodus-overlay'), '"Kochen" startet den Kochmodus');
  check((await p.textContent('#kochmodus-overlay')).includes('Gulasch nach Omas Art') && (await p.textContent('#kochmodus-overlay')).includes('Schritt 1 von 3'), 'Kochmodus zeigt das gewählte Rezept, Schritt 1 von 3');
  await p.screenshot({ path: OUT + '/n6_kochmodus.png' });
  check(p.fehler.length === 0, 'Kochen: keine JavaScript-Fehler (' + p.fehler.join(' | ') + ')');
  await p.close();

  // ---- 11. Desktop: Kochmodus verborgen, Freestyle breit ----
  p = await neueSeite(browser, 1000);
  await p.goto('file://' + DIR + '/index.html'); await p.waitForTimeout(500);
  check(!(await sichtbar(p, '#kachel-kochmodus')), 'Desktop: Kochmodus-Kachel verborgen');
  const fb = await p.locator('#kachel-freestyle').boundingBox(), rb = await p.locator('#kachel-recipes').boundingBox();
  check(Math.abs(fb.width - rb.width) < 2, 'Desktop: Freestyle-Kachel nutzt die volle Breite');
  await p.click('#kachel-recipes'); await p.waitForTimeout(300); await p.click('.rezept-karte >> nth=0'); await p.waitForTimeout(300);
  check(!(await sichtbar(p, '#recipe-detail-r1 >> text=Kochen')), 'Desktop: "Kochen"-Knopf verborgen');
  await p.screenshot({ path: OUT + '/n7_desktop.png' });
  await p.close();

  await browser.close();
  console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen`);
  console.log(fail === 0 ? 'ALLE TESTS BESTANDEN' : 'ES GIBT FEHLER');
})();
