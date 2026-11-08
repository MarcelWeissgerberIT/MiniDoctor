# BattleBot auf Steam: Plan und Entscheidungen

Stand: November 2026, Prototyp 0.5 (fünf Missionen, Lanze, Drohne, interaktive Displays).

## Positionierung

**Was das Spiel ist:** eine Cockpit-Mech-Simulation. Man sitzt in einem 5 m hohen Kampfroboter, fährt ihn nach Checkliste hoch und kämpft mit echten Prozeduren, physikalischer Ballistik und einer kleinen Lanze aus KI-Mechs.

**Die Lücke:** Zwischen den Action-Mech-Spielen (MechWarrior 5, Armored Core) und den Hardcore-Simulationen (DCS, Steel Battalion) gibt es kaum etwas. BattleBot ist „DCS für Mechs, aber in einer Stunde erlernbar“.

**Alleinstellungsmerkmale**, die auf der Store-Seite vorne stehen:

1. Kaltstart nach Checkliste: Batterie, APU, Generatoren, Hydraulik, Reaktor, Gyro.
2. Echte Cockpit-Displays zum Anklicken: Zielliste, Taktikkarte, Drohnenkamera.
3. Physikalische Gefechte: Granaten fliegen wirklich, Panzerung hängt von der Trefferrichtung ab, Systeme fallen aus.
4. Aufklärungsdrohne und Steilangriff über Deckung.
5. Lanze mit Funkverkehr und Gesichtern im Display.

**Zielgruppen:**

- Simulationsspieler (DCS, Microsoft Flight Simulator, Nuclear Option)
- Mech-Fans (MechWarrior, BattleTech)
- Steel-Battalion-Nostalgiker

**Vergleichstitel als Preisanker:** Nuclear Option, Carrier Command 2, Sprocket, Highfleet, MechWarrior 5. Diese Titel liegen grob zwischen 15 und 30 €.

**Entscheidung:** Early Access zu 14,99 €, Version 1.0 zu 19,99 €.

## Release-Weg (Entscheidung)

1. **Steam-Seite früh live schalten.** Wunschlisten sind der wichtigste Hebel für die Sichtbarkeit zum Start. Dafür braucht es Kapselbilder, 5 Screenshots, einen kurzen Teaser und die KI-Offenlegung.
2. **Kostenlose Demo** mit Mission 1 (Grundausbildung) und Mission 2, rechtzeitig zu einem **Steam Next Fest**.
3. **Early Access**, sobald etwa 6 bis 8 Stunden Inhalt da sind (Kampagne mit Werkstatt).
4. **1.0** mit zweitem Mech, englischer Sprachausgabe und Missionseditor.

## In diesem Update umgesetzt

| Bereich | Umsetzung |
|---|---|
| Tutorial | Komplette Grundausbildung in der Basis: Kaltstart, Laufen, Displays, Schießbahn (Kanone, MG, Rakete über die Karte), Drohne und Steilangriff, Brandübung, Lanzenbefehle, Außenansicht |
| Bedienung | Displays öffnen und anklicken: Zielliste mit Filtern, Zuweisen, Taktikkarte mit Klick-Zielen, Drohnenseite; Tab für das nächste Ziel |
| Neues Feature | Aufklärungsdrohne: Start, Suchkreis, Markieren, Rückkehr, Laden, Abschuss möglich |
| Pause-Menü | Esc (Maus verlassen) oder P: Fortsetzen, Einstellungen, Erfolge, Steuerung, Neustart, Hauptmenü |
| Einstellungen | Grafikqualität, Sichtfeld, Mausempfindlichkeit, Y-Invertierung, Kopf- und Kabinenbewegung (gegen Reiseübelkeit), Lautstärke, Funklautstärke, Untertitel; gespeichert |
| Erfolge | 14 Erfolge mit festen IDs; die Meldung kommt im Spiel, eine Desktop-Hülle kann sie über `window.steam.activateAchievement(id)` an Steamworks weitergeben |
| Stabilität | Gangdynamik stabil auch bei niedriger Bildrate (vorher konnte die Kamera bei unter 20 fps ausfallen) |

## Was für den Steam-Start noch fehlt (priorisiert)

### Muss vor Early Access

1. **Desktop-Build mit Electron und steamworks.js**: Overlay, Erfolge, Cloud-Speicherstand, Start über Steam.
   - Entscheidung für Electron statt Tauri: Electron rendert WebGL überall mit Chromium. Tauri nutzt unter Linux und auf dem Steam Deck WebKitGTK, und das ist für dieses Spiel zu langsam.
   - Die Spiellogik bleibt unverändert; der Build lädt den Vite-Ordner `dist/`.
2. **Englische Lokalisierung**: Oberfläche und Untertitel. Die deutsche Sprachausgabe bleibt, englische Stimmen folgen später.
   - Deutschsprachige Spieler sind nur ein kleiner Teil des Steam-Publikums; ohne Englisch fehlt der Großteil des Markts.
   - Technisch heißt das: alle Texte in Sprachdateien auslagern.
3. **Freie Tastenbelegung und Gamepad**, inklusive Steam Input und Steam Deck: Steuerknüppel-Layout, Radialmenü für die Displays.
4. **Kampagne statt Einzelmissionen**: 12 bis 15 Missionen. Dazwischen eine Werkstatt für Reparatur, Munition, Ausrüstung (Raketentyp, MG, zweite Drohne, Panzerplatten) und Fortschritt.
5. **Neue Gegner**:
   - feindliche Mechs (Pflicht für ein Mech-Spiel)
   - Infanterie mit Panzerabwehrwaffen
   - Kampfhubschrauber
   - Artillerie mit Beobachter
   - Störsender, die Drohne und Radar behindern
6. **Musik**: Hauptmenü, Spannung, Gefecht, Sieg und Niederlage, dazu ein besserer Soundmix.
7. **Leistung**: 60 fps auf dem Steam Deck, Grafik-Presets mit Schatten- und Effektstufen.
8. **Rechtliches**:
   - Steam verlangt eine Offenlegung KI-generierter Inhalte. In diesem Projekt sind alle Bilder, Modelle, Stimmen und Geräusche mit Higgsfield bzw. Meshy erzeugt.
   - Vor dem Verkauf die kommerziellen Nutzungsrechte der jeweiligen Pläne prüfen.
   - Impressum und Datenschutz für die Store-Seite.
9. **Store-Seite**:
   - Kapselbilder in allen geforderten Formaten
   - mindestens 5 Screenshots
   - Trailer mit 60 bis 90 Sekunden; das Einstiegsvideo und Cockpit-Aufnahmen sind dafür ein guter Anfang
   - Beschreibung auf Deutsch und Englisch
   - Tags: Mech, Simulation, Cockpit, Taktik, Singleplayer

### Soll bis 1.0

- Zweiter Mech (leichter Späher) und eine Ausrüstungswahl vor der Mission.
- Nacht- und Wettermissionen; die Nachtsicht gibt es schon.
- Bestenlisten über die Missionszeit, Fotomodus und Wiederholungskamera.
- Missionseditor mit Steam Workshop.
- Englische Sprachausgabe für den Ausbilder und die Lanze.

## Vorgeschlagener Ablauf

| Phase | Inhalt |
|---|---|
| 1 | Desktop-Build, Englisch, Tastenbelegung und Gamepad, Steam-Seite live (Wunschlisten sammeln) |
| 2 | Kampagne mit Werkstatt, feindliche Mechs, Musik, Demo fertig |
| 3 | Demo im Next Fest, Feedback einarbeiten, Early Access |

## Kosten und Abgaben (zur Orientierung)

- Steam Direct: einmalige Gebühr pro Spiel; sie wird nach den ersten Umsätzen erstattet. Den aktuellen Betrag zeigt Steamworks.
- Umsatzbeteiligung von Valve: im Standardfall 30 %.
- Die Store-Assets können mit denselben Werkzeugen entstehen wie das Spiel. Die Kapselbilder brauchen dabei sauber gesetzte Typografie; das Logo am besten von Hand.
