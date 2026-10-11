# Skillet: Test-Suiten

Nicht Teil der App. Prüfen die Oberfläche mit Beispieldaten (Supabase-Aufrufe werden abgefangen) auf 320 px, 1000 px und beim Neuladen/Teilen.

```bash
node claude/tests/design_test.js /pfad/zum/skillet-klon /ausgabe/fuer/screenshots
```

- Playwright global unter `/home/claude/.npm-global/lib/node_modules/playwright`, Chromium unter `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Bei anderer Umgebung die Pfade in der Suite anpassen.
- Erwartung: Ende mit „ALLE TESTS BESTANDEN“.
- Neue Supabase-Abfragen im Client müssen in der Attrappe (`page.route`) ergänzt werden.
- `naehrwerte_logik_test.ts` prüft die Rechenlogik der Edge Function `naehrwerte` (Einheiten, feste Umrechnung g/kg, geschätzte Mengen, Summen): `node --experimental-strip-types claude/tests/naehrwerte_logik_test.ts`.
- `design_test.js` stubbt auch `/functions/v1/naehrwerte` und `zutat_wissen`; Abschnitt 13 prüft den Reiter Nährwerte (Kreis, Anteile, Korrektur, Fehlerfall).
