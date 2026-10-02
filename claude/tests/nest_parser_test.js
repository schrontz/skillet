// Gegenprobe: Skillets Einkaufszeilen durch Nests echte Zeilen-Erkennung schicken.
// Erwartet Nest unter /tmp/nest-git und Skillet unter /tmp/skillet-git.
const fs = require('fs');
// Nests echte Zeilen-Erkennung aus js/liste.js laden
const nest = fs.readFileSync('/tmp/nest-git/js/liste.js', 'utf8');
const a = nest.indexOf('const EINHEIT_WOERTER'), b = nest.indexOf('function toggleMehrereForm');
eval(nest.slice(a, b).replace('const EINHEIT_WOERTER', 'var EINHEIT_WOERTER'));
// Skillets Übersetzung laden
global.aktuellePortionen = {}; global.htmlSicher = x => x;
eval(fs.readFileSync('/tmp/skillet-git/einkauf.js', 'utf8').replace(/^const /gm, 'var '));
const faelle = [
  [{menge:1000,einheit:'g',name:'Rindergulasch'}, 0.4],
  [{menge:3,einheit:null,name:'Zwiebeln'}, 0.4],
  [{menge:2,einheit:'EL',name:'Paprikapulver edelsüß'}, 1],
  [{menge:200,einheit:'ml',name:'Sahne'}, 1.5],
  [{menge:1.5,einheit:'l',name:'Brühe'}, 1],
  [{menge:1,einheit:'Dose',name:'gehackte Tomaten'}, 2],
  [{menge:1,einheit:'Bund',name:'Petersilie'}, 1],
  [{menge:2,einheit:'Zehen',name:'Knoblauch'}, 1],
  [{menge:1,einheit:'Päckchen',name:'Backpulver'}, 1],
  [{menge:3,einheit:'Stück',name:'Eier'}, 0.5],
  [{menge:null,einheit:null,name:'Salz'}, 1],
  [{menge:250,einheit:'g',name:'Mehl (Type 405)'}, 1],
];
for (const [z, f] of faelle) {
  const zeile = nestZeile(z, f);
  const n = zerlegeZeile(zeile);
  console.log(`${JSON.stringify(z.menge)} ${z.einheit||''} ${z.name} ×${f}`.padEnd(42) + ` -> "${zeile}"`.padEnd(34) + ` -> Nest: ${n.menge ?? '–'} | ${n.einheit ?? '(Nest-Standard)'} | ${n.name}`);
}
console.log('\nFreitext:');
for (const t of ['500 g Mehl', '2 EL Olivenöl', '3 Eier', 'Salz und Pfeffer', '1 Bund Schnittlauch', '0,5 l Milch']) {
  const zeile = nestZeile(zerlegeFreitextZutat(t), 1);
  const n = zerlegeZeile(zeile);
  console.log(`"${t}"`.padEnd(24) + ` -> "${zeile}"`.padEnd(26) + ` -> Nest: ${n.menge ?? '–'} | ${n.einheit ?? '(Nest-Standard)'} | ${n.name}`);
}
console.log('\nMeist zuhause:', ['Salz','1 Olivenöl','Pfeffer, schwarz','Zucker','Zuckerschoten','2 Zwiebeln'].map(x => `${x}=${istMeistZuhause(x)}`).join(', '));
