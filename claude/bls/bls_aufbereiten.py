# BLS 4.0 (Excel von blsdb.de) -> bls_sauber.csv mit den Spalten, die Skillet braucht.
# Aufruf: python3 bls_aufbereiten.py BLS_4_0_Daten_2025_DE.xlsx
import csv, sys
import openpyxl

SPALTEN = {
    'code': 'BLS Code', 'name': 'Lebensmittelbezeichnung', 'name_en': 'Food name',
    'kcal': 'ENERCC Energie (Kilokalorien) [kcal/100g]', 'eiweiss': 'PROT625 Protein (Nx6,25) [g/100g]',
    'fett': 'FAT Fett [g/100g]', 'kh': 'CHO Kohlenhydrate, verfügbar [g/100g]',
    'ballast': 'FIBT Ballaststoffe, gesamt [g/100g]', 'zucker': 'SUGAR Zucker (Mono- und Disaccharide), gesamt [g/100g]',
    'ges_fett': 'FASAT Fettsäuren, gesättigt, gesamt [g/100g]', 'salz': 'NACL Salz (Natriumchlorid) [g/100g]',
}
KERN = {'kcal', 'eiweiss', 'fett', 'kh'}
NULL_WERTE = {'<LOD', '<LOQ', '<LOD or <LOQ', 'TR'}  # unter Nachweisgrenze / Spuren -> 0

ws = openpyxl.load_workbook(sys.argv[1], read_only=True).active
zeilen = ws.iter_rows(values_only=True)
kopf = next(zeilen)
idx = {k: kopf.index(v) for k, v in SPALTEN.items()}
with open('bls_sauber.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(SPALTEN)); w.writeheader()
    for z in zeilen:
        if not z[idx['code']]:
            continue
        r = {k: z[i] for k, i in idx.items()}
        for k in SPALTEN:
            if k in ('code', 'name', 'name_en'):
                continue
            v = r[k]
            if isinstance(v, (int, float)):
                continue
            # "-" = nicht bestimmt: bei den Kernwerten 0, sonst leer
            r[k] = 0 if v in NULL_WERTE or k in KERN else None
        w.writerow(r)
