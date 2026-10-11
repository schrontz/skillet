# BLS-Daten für die Nährwerte

Quelle: Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut, https://www.blsdb.de (kostenlos).
Die Excel-Datei liegt nicht im Repo (14 MB).

1. Schema anlegen: `supabase/naehrwerte.sql` (als Migration in Supabase).
2. `python3 claude/bls/bls_aufbereiten.py BLS_4_0_Daten_2025_DE.xlsx` -> `bls_sauber.csv` (7.140 Zeilen).
   Werte unter der Nachweisgrenze (`<LOD`, `TR` …) werden 0; nicht bestimmte (`-`) bei kcal/Eiweiß/Fett/KH 0, sonst leer.
3. CSV in `public.bls_lebensmittel` einspielen (Spalten wie in der CSV; `gericht` rechnet die Datenbank selbst).

Bei einer neuen BLS-Version: Tabelle leeren und neu einspielen. `zutat_wissen` verweist auf die Codes –
fällt ein Code weg, vorher die betroffenen Zeilen in `zutat_wissen` löschen (werden dann neu gelernt).
