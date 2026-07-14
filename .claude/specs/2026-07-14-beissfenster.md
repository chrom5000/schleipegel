# Spec: Beißfenster (Angel-Prognose)

**Ziel:** Leichte, kartenlose Seite `angeln.html`: pro Schlei-Zielfischart ein
ehrliches „Beißfenster" für die nächsten 48 h aus Saison, Wassertemperatur,
Licht/Dämmerung, Wind, Luftdrucktrend, Pegel-Trend (Einstrom) und Mondphase.

## Entscheidungen

- **Kein Rechtsteil.** Das Tool nennt keine Schonzeiten, Mindestmaße oder
  Befischungsregeln. Stattdessen an drei Stellen (Disclaimer-Chip, Info-Dialog,
  Footer der Startseite) der Hinweis: Schonzeiten, Mindestmaße und örtliche
  Regeln **selbst recherchieren** (amtliche Quellen des Landes SH).
- **Arten (Schlei-belegt):** Hering (Frühjahrslauf Kappeln), Hornhecht
  (Mai/Juni), Meerforelle, Zander (trübe Breiten), Barsch, Hecht, Aal
  (Sommernächte), Plattfisch/Flunder (Mündung).
- **Heuristik, transparent:** Score = Saisonkurve × Temperaturfenster ×
  Licht × Wind × Druckstabilität × Boni (Einstrom, Mond). Die UI zeigt die
  Faktoren einzeln (✓/~/✗ mit Begründung), nicht nur die Zahl — „Fenster",
  keine „Prognose". Keine Fangdaten-Kalibrierung möglich; steht im Dialog.
- **Daten:** Open-Meteo ICON-D2 (Wind, Temperatur, Wolken, Regen,
  Luftdruck; `past_days=1` für Trends) an einem Mittelpunkt (Arnis),
  Marine-API-SST (Ostsee vor Schleimünde, klar so beschriftet),
  PEGELONLINE Kappeln (W, P1D) für den Einstrom-Trend, Sonnenlauf/Mondphase
  clientseitig. Kein MapLibre, kein Backend.
- **UI:** dunkler Werkzeug-Look wie der Regattaplaner. „Jetzt"-Leiste
  (Bedingungs-Chips), Artenkarten sortiert nach bestem Fenster, je Karte
  48-h-Timeline (Canvas) mit Dämmerungsbändern + markiertem Top-Fenster,
  Faktorenliste, Ortstipp und Uferhinweis aus der Windrichtung.
  Einstieg: Hero-Chip + Footer-Link; `__BUILD__`-sed um `angeln.html` ergänzen.
