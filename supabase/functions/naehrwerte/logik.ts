// Reine Rechenlogik für die Nährwerte - ohne Netz, damit sie sich lokal testen lässt.

export type Zutat = { menge: number | null; einheit: string | null; name: string };

export type Wissen = {
  name_norm: string;
  einheit_norm: string;
  bls_code: string | null;
  gramm_pro_einheit: number | null;
  annahme: string | null;
  unsicher: boolean;
  quelle: 'ki' | 'hand';
  vernachlaessigbar?: boolean;
};

export type Bls = { code: string; name: string; kcal: number; eiweiss: number; kh: number; fett: number };

const EINHEIT_SYNONYME: Record<string, string> = {
  'stück': '', stueck: '', stk: '', st: '',
  gramm: 'g', gr: 'g', g: 'g',
  kg: 'kg', kilo: 'kg', kilogramm: 'kg',
  ml: 'ml', milliliter: 'ml', l: 'l', liter: 'l', cl: 'cl', zentiliter: 'cl', dl: 'dl', deziliter: 'dl',
  el: 'el', 'esslöffel': 'el', tl: 'tl', 'teelöffel': 'tl',
  dosen: 'dose', 'gläser': 'glas', zehen: 'zehe', scheiben: 'scheibe', prisen: 'prise',
  packungen: 'packung', 'päckchen': 'packung', pck: 'packung',
};

// Feste Umrechnungen - hier braucht es keine Schätzung.
// Flüssigkeiten: 1 ml ≈ 1 g (Öl ist etwas leichter, Sirup schwerer - als Richtwert genau genug).
// Vorher kamen ml/l aus der KI-Schätzung; einmal stand dort „100 g pro ml“ (100 ml Saft = 10 kg).
export const FESTE_GRAMM: Record<string, number> = { g: 1, kg: 1000, ml: 1, cl: 10, dl: 100, l: 1000 };

export function normName(name: string): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normEinheit(einheit: string | null): string {
  const e = (einheit || '').toLowerCase().replace(/[.()]/g, '').trim();
  return e in EINHEIT_SYNONYME ? EINHEIT_SYNONYME[e] : e;
}

export function schluessel(z: Zutat): string {
  return normName(z.name) + '|' + normEinheit(z.einheit);
}

const r1 = (x: number) => Math.round(x * 10) / 10;

// Eine Zutat ausrechnen. Ohne Menge zählt gramm_pro_einheit als geschätzte Gesamtmenge.
export function rechneZutat(z: Zutat, w: Wissen | undefined, b: Bls | undefined) {
  const basis = {
    name: z.name, menge: z.menge, einheit: z.einheit,
    annahme: w?.annahme || null,
    unsicher: !!w?.unsicher || z.menge === null || z.menge === undefined,
    quelle: w?.quelle || 'ki',
  };
  if (!w) return { ...basis, status: 'unbekannt' as const };
  if (w.vernachlaessigbar || w.gramm_pro_einheit === 0) return { ...basis, unsicher: false, status: 'vernachlaessigbar' as const };
  if (!w.bls_code || !b) return { ...basis, status: 'nicht_gefunden' as const };

  const gpe = FESTE_GRAMM[normEinheit(z.einheit)] ?? w.gramm_pro_einheit ?? 0;
  const gramm = (z.menge ?? 1) * gpe;
  const f = gramm / 100;
  return {
    ...basis,
    status: 'ok' as const,
    gramm: Math.round(gramm),
    bls_code: b.code,
    bls_name: b.name,
    je100: { kcal: +b.kcal, eiweiss: +b.eiweiss, kh: +b.kh, fett: +b.fett },
    kcal: Math.round(b.kcal * f),
    eiweiss: r1(b.eiweiss * f),
    kh: r1(b.kh * f),
    fett: r1(b.fett * f),
  };
}

export function summiere(zeilen: any[]) {
  const s = { kcal: 0, eiweiss: 0, kh: 0, fett: 0 };
  for (const z of zeilen) {
    if (z.status !== 'ok') continue;
    s.kcal += z.kcal; s.eiweiss += z.eiweiss; s.kh += z.kh; s.fett += z.fett;
  }
  return { kcal: Math.round(s.kcal), eiweiss: r1(s.eiweiss), kh: r1(s.kh), fett: r1(s.fett) };
}
