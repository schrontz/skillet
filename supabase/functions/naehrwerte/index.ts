// Skillet: Nährwerte eines Rezepts aus dem Bundeslebensmittelschlüssel (BLS 4.0) berechnen.
//
// Die Zahlen kommen aus der BLS-Tabelle, nicht von der KI. Gemini hilft nur bei zwei Dingen:
//   1. Suchbegriffe im BLS-Stil finden und schätzen, wie viel Gramm eine Einheit wiegt
//   2. aus den gefundenen Kandidaten den passenden Eintrag wählen
// Beides wird in zutat_wissen gespeichert - bekannte Zutaten brauchen danach keine KI mehr.
import { type Bls, type Wissen, type Zutat, FESTE_GRAMM, normEinheit, normName, rechneZutat, schluessel, summiere } from './logik.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODELL = 'gemini-3.1-flash-lite';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUCH_PROMPT = `Du bereitest die Zutaten eines Rezepts für eine Nährwertberechnung mit dem
deutschen Bundeslebensmittelschlüssel (BLS) vor. Du bekommst je Zutat i, menge, einheit, name.

Für JEDE Zutat:
- vernachlaessigbar: true NUR für Salz, Pfeffer, Wasser, Eiswürfel und getrocknete Gewürze oder
  Kräuter in Gewürzmengen (Prise, Messerspitze, bis etwa 2 TL). Sonst false.
- suchbegriffe: zwei kurze Suchbegriffe im Stil des BLS. Der BLS benennt Lebensmittel so:
  "Hähnchen Brust, ohne Haut, roh", "Speisezwiebel roh", "Hühnerei roh", "Teigwaren eifrei, roh",
  "Reis poliert, roh", "Tomate geschält, Konserve", "Kidneybohne reif, Konserve, abgetropft",
  "Schlagsahne mind. 30 % Fett", "Weizen Mehl, Type 405", "Schwein Bauchspeck, Rohpökelware, geräuchert",
  "Rind Gulasch (Bug) roh", "Kartoffel geschält, roh", "Vollmilch frisch, 3,5 % Fett", "Butter".
  Nimm den Zustand, in dem die Zutat ins Gericht geht: meist roh; Dosenware als Konserve;
  Nudeln und Reis trocken (roh). Bei vernachlaessigbar: leere Liste.
- gramm_pro_einheit: Gewicht in Gramm für EINE angegebene Einheit. Einheit leer = ein Stück.
  Dosen: Abtropfgewicht, wenn man sie üblicherweise abtropft (Bohnen, Mais, Kichererbsen),
  sonst die Füllmenge (gehackte Tomaten: 400). EL Öl oder Mehl etwa 10, TL etwa 4, ml Flüssigkeit
  etwa 1 (Öl 0,9). Fehlt die Menge, schätze die übliche Gesamtmenge für das Rezept.
  Bei vernachlaessigbar: 0.
- annahme: sehr kurz, was du angenommen hast, z. B. "1 mittelgroße Zwiebel ≈ 100 g",
  "1 Dose = 250 g abgetropft", "2 EL ≈ 20 g". Bei Gramm-Angaben leer.
- unsicher: true, wenn die Menge fehlt oder stark schwanken kann ("1 Schuss", "etwas",
  "1 Bund", "nach Belieben"), sonst false.

Antworte nur mit JSON:
{"zutaten":[{"i":0,"vernachlaessigbar":false,"suchbegriffe":["",""],"gramm_pro_einheit":0,"annahme":"","unsicher":false}]}`;

const WAHL_PROMPT = `Du ordnest Rezept-Zutaten Einträgen des Bundeslebensmittelschlüssels (BLS) zu.
Je Zutat bekommst du eine Liste von Kandidaten (code, name). Wähle genau den Kandidaten, der der
Zutat so entspricht, wie sie ins Gericht geht:
- Grundlebensmittel statt fertiger Gerichte oder Produkte mit weiteren Zutaten
- roh statt zubereitet, außer die Zutat sagt etwas anderes (z. B. "gekochte Kartoffeln")
- bei Dosenware den Konserven-Eintrag
Passt kein Kandidat wirklich, antworte mit null - lieber null als ein falsches Lebensmittel.
Verwende nur Codes aus den Kandidaten.

Antworte nur mit JSON: {"wahl":[{"i":0,"code":"G480100"}]}`;

async function gemini(system: string, daten: unknown) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: JSON.stringify(daten) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    },
  );
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Keine gültige Antwort von Gemini: ' + JSON.stringify(data.error || data).slice(0, 300));
  return JSON.parse(text);
}

async function rest(pfad: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Datenbank (${pfad.split('?')[0]}): ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const inListe = (werte: string[]) =>
  encodeURIComponent('(' + werte.map(w => '"' + w.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + ')');

// Unbekannte Zutaten mit Gemini und der BLS-Suche einordnen
async function lerneZutaten(neue: Zutat[]): Promise<Wissen[]> {
  const a = await gemini(SUCH_PROMPT, neue.map((z, i) => ({ i, menge: z.menge, einheit: z.einheit, name: z.name })));
  const vorbereitet = new Map<number, any>((a.zutaten || []).map((x: any) => [x.i, x]));

  // Kandidaten je Zutat aus beiden Suchbegriffen, ohne Doppelte
  const kandidaten = new Map<number, { code: string; name: string }[]>();
  await Promise.all(neue.map(async (_z, i) => {
    const v = vorbereitet.get(i);
    if (!v || v.vernachlaessigbar) return;
    const gesehen = new Map<string, { code: string; name: string }>();
    for (const begriff of (v.suchbegriffe || []).slice(0, 3)) {
      if (!begriff) continue;
      const treffer = await rest('rpc/bls_kandidaten', { method: 'POST', body: JSON.stringify({ suche: begriff, anzahl: 6 }) });
      for (const t of treffer) if (!gesehen.has(t.code)) gesehen.set(t.code, { code: t.code, name: t.name });
    }
    kandidaten.set(i, [...gesehen.values()]);
  }));

  const anfragen = [...kandidaten.entries()].filter(([, k]) => k.length > 0)
    .map(([i, k]) => ({ i, zutat: [neue[i].menge, neue[i].einheit, neue[i].name].filter(x => x !== null && x !== '').join(' '), kandidaten: k }));
  const gewaehlt = new Map<number, string | null>();
  if (anfragen.length > 0) {
    const b = await gemini(WAHL_PROMPT, anfragen);
    for (const w of b.wahl || []) {
      const erlaubt = kandidaten.get(w.i)?.some(k => k.code === w.code);
      gewaehlt.set(w.i, erlaubt ? w.code : null);
    }
  }

  return neue.map((z, i) => {
    const v = vorbereitet.get(i) || {};
    const fest = FESTE_GRAMM[normEinheit(z.einheit)];
    return {
      name_norm: normName(z.name),
      einheit_norm: normEinheit(z.einheit),
      bls_code: v.vernachlaessigbar ? null : (gewaehlt.get(i) ?? null),
      gramm_pro_einheit: v.vernachlaessigbar ? 0 : (fest ?? (Number(v.gramm_pro_einheit) || null)),
      annahme: v.vernachlaessigbar ? 'vernachlässigbar' : (fest ? null : (v.annahme || null)),
      unsicher: !!v.unsicher,
      quelle: 'ki' as const,
    };
  });
}

export async function berechne(zutatenRoh: Zutat[]) {
  const zutaten = zutatenRoh.filter(z => z && z.name && z.name.trim())
    .map(z => ({ menge: typeof z.menge === 'number' && isFinite(z.menge) ? z.menge : null, einheit: z.einheit || null, name: z.name.trim() }));

  // 1. Was schon bekannt ist
  const namen = [...new Set(zutaten.map(z => normName(z.name)))];
  const bekannt = new Map<string, Wissen>();
  if (namen.length) {
    const rows: Wissen[] = await rest(`zutat_wissen?select=*&name_norm=in.${inListe(namen)}`);
    for (const w of rows) bekannt.set(w.name_norm + '|' + w.einheit_norm, w);
  }

  // 2. Neues lernen (je Schlüssel nur einmal)
  const neueMap = new Map<string, Zutat>();
  for (const z of zutaten) if (!bekannt.has(schluessel(z)) && !neueMap.has(schluessel(z))) neueMap.set(schluessel(z), z);
  let gelernt = 0;
  if (neueMap.size > 0) {
    const neu = await lerneZutaten([...neueMap.values()]);
    for (const w of neu) bekannt.set(w.name_norm + '|' + w.einheit_norm, w);
    await rest('zutat_wissen?on_conflict=name_norm,einheit_norm', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(neu),
    });
    gelernt = neu.length;
  }

  // 3. BLS-Werte holen und rechnen
  const codes = [...new Set([...bekannt.values()].map(w => w.bls_code).filter(Boolean) as string[])];
  const bls = new Map<string, Bls>();
  if (codes.length) {
    const rows: Bls[] = await rest(`bls_lebensmittel?select=code,name,kcal,eiweiss,kh,fett&code=in.${inListe(codes)}`);
    for (const b of rows) bls.set(b.code, b);
  }
  const zeilen = zutaten.map(z => {
    const w = bekannt.get(schluessel(z));
    return rechneZutat(z, w, w?.bls_code ? bls.get(w.bls_code) : undefined);
  });
  return { zeilen, summe: summiere(zeilen), gelernt };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { recipe_id, zutaten, stand } = await req.json();
    if (!Array.isArray(zutaten) || zutaten.length === 0) {
      return new Response(JSON.stringify({ error: 'Keine Zutaten übergeben' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { zeilen, summe, gelernt } = await berechne(zutaten.slice(0, 60));
    const naehrwerte = { version: 1, stand: stand || null, berechnet_am: new Date().toISOString(), quelle: 'BLS 4.0', summe, zutaten: zeilen };
    if (recipe_id) {
      await rest(`recipes?id=eq.${encodeURIComponent(recipe_id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ naehrwerte }) });
    }
    return new Response(JSON.stringify({ ...naehrwerte, gelernt }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
