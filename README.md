# BattleBot

Ein 3D-Ego-Shooter im Browser: Du sitzt im Cockpit von **BB-07**, einem 70-Tonnen-Kampfroboter (Mech), mitten in einem Krieg. Wie in einem Flugzeug- oder Panzercockpit ist die Sicht nach draußen auf einen schmalen Panzerglasschlitz und zwei seitliche Sichtblöcke begrenzt.

*A browser first-person mech game. You pilot a 70-tonne combat robot from a cramped, rusty cockpit with a narrow armoured visor.*

**Stand: Prototyp 0.1 – das Cockpit.** Waffen und Gegner folgen in den nächsten Schritten.

## Starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Logik-Tests (Mech-Bewegung, Schritte, Kollisionen)
npm run build    # statischer Build in dist/
```

Bei jedem Push auf `main` baut und veröffentlicht GitHub Actions das Spiel auf GitHub Pages.

## Das Cockpit

- **Panzerhülle** aus olivgrünen, rostigen Stahlplatten, genieteten Spanten, Diamant-Riffelblech am Boden, Hydraulikleitungen und Kabelbäumen.
- **Sichtschlitz** aus drei verschmutzten Panzerglasscheiben (Kratzer, Staub, Schlieren), getrennt durch Stahlstreben, dazu zwei kleine seitliche Sichtblöcke. Der Kopf lässt sich nur begrenzt drehen (±105° seitlich, 38° hoch, 62° runter).
- **Drei Röhren-Multifunktionsdisplays** (grüner Phosphor, Scanlines, Bildwölbung):
  - *Mech Status*: Schadensbild der Baugruppen, Reaktor, Hitze, Kühlmittel, Hydraulik.
  - *Kamera*: Live-Bild der Bugkamera mit 4-fach-Zoom, Kompassband, Entfernungsmesser, Nachtsicht.
  - *Taktik*: Radar mit Sweep, Strukturen, Brände und feindliche Kontakte (500/1000 m).
- **Analoge Instrumente** (Reaktor, Hydraulikdruck, Temperatur, Geschwindigkeit) mit gedämpften Zeigern, die bei jedem Schritt zittern.
- **Head-up-Display** auf einer Combiner-Glasscheibe: Kompass, Geschwindigkeit, Schubhebel, Kopfdrehung, Warnungen.
- **Bedienbare Schalter und Knöpfe** (Fadenkreuz + Klick): Kabinenlicht, HUD, Nachtsicht, Optik, Radarreichweite, Gyro-Stabilisator, Kühlmittelpumpe, Hydraulik, Generatoren, Master Caution u. a. Pumpe aus → Überhitzung mit Alarm; Hydraulik aus → der Mech kommt kaum noch vom Fleck; alle Generatoren aus → Cockpit wird dunkel.
- **Joystick und Schubhebel** bewegen sich mit den Eingaben.
- **Licht**: Tageslicht fällt mit weichen Schatten durch den Sichtschlitz, warme Deckenleuchte, rote Fußraumbeleuchtung, grünes Display-Streulicht, rote Alarmleuchte mit Drahtkäfig; Artillerieblitze erhellen kurz die Kabine. Staub schwebt in der Luft und wird bei jedem Schritt aufgewirbelt.
- **Startsequenz**: Relais, flackerndes Licht, Displays booten, Zeigertest, HUD.

## Draußen

Ein zerbombtes Stadtrandgebiet: Krater, ausgebrannte Panzerwracks, Gebäuderuinen, Panzersperren-Linien, verkohlte Bäume, Trümmer, brennende Feuer mit Rauchsäulen, Ascheflocken, Leuchtspurgarben und Artillerieeinschläge am Horizont (mit Donner, verzögert um die Schallgeschwindigkeit). Dahinter ein 360°-Panorama einer brennenden Stadt.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Maus | umsehen (Klick fängt die Maus ein) |
| W / S | Schubhebel vor / zurück (bis −30 % rückwärts) |
| X / Leertaste | Schub auf null |
| A / D | Mech drehen |
| Linksklick | Schalter unter dem Fadenkreuz betätigen |
| L / H / N / O | Kabinenlicht / HUD / Nachtsicht / Optik |
| R | Radarreichweite |
| G | Gyro-Stabilisator (dämpft Schwanken und Erschütterungen) |
| Q | Master Caution quittieren |
| C | Blick zentrieren |
| M | Ton an/aus |
| F1 / Tab | Hilfe |

## Ressourcen: Higgsfield + Meshy

Alle Grafiken, Modelle und Sounds wurden für dieses Projekt generiert:

| Was | Werkzeug | Dateien |
|---|---|---|
| Konzeptbild / Titelbild | Higgsfield (GPT Image 2.6) | `public/assets/ui/keyart.webp` |
| PBR-Texturen: lackierter Panzerstahl mit Rost, genietete Platten, Riffelblech, Konsolenlack, Warnstreifen, Beton, Schlachtfeldboden | Higgsfield (GPT Image 2.6) | `public/assets/tex/*_c.webp` |
| Glas-Schmutz, Rauch- und Feuer-Sprites | Higgsfield (GPT Image 2.6) | `public/assets/fx/` |
| Warnschilder und Typenschild (Decals) | Higgsfield (GPT Image 2.6, transparent) | `public/assets/decals/` |
| 360°-Stadtpanorama | Higgsfield (Nano Banana 2.1, 4:1) | `public/assets/sky/` |
| 3D-Modelle: Pilotensitz, Joystick, Schubhebel, Funkgerät, Feuerlöscher, Panzerwrack, Gebäuderuine, Panzersperre | **Meshy 7 Image-to-3D** (über Higgsfield, mit PBR), Vorlagen von GPT Image 2.6 | `public/assets/models/*.glb` |
| Cockpit-Brummen, Schlachtlärm, Mech-Schritt, Servo, Hochfahren | Higgsfield (Mirelo SFX) | `public/assets/audio/` |

`tools/process-assets.mjs` macht daraus spielfertige Dateien: Normal-Maps und gepackte ORM-Maps (Ambient Occlusion, Rauheit, Metallanteil) werden aus den Farbtexturen abgeleitet (Rost = rau und nicht-metallisch, blanker Stahl = metallisch), Texturen werden nahtlos gemacht, das Panorama wird horizontal nahtlos überblendet, die Decals ausgeschnitten und die GLBs mit WebP-Texturen und Meshopt komprimiert. Die Rohdateien liegen in `assets-src/` (nicht im Repo).

Das Cockpit selbst (Hülle, Armaturen, Displays, Schalter, Leitungen) ist in Three.js aus Primitiven aufgebaut und mit diesen Texturen belegt, die Meshy-Modelle sind darin platziert.

## Technik

- **Three.js** + Vite, keine weiteren Laufzeit-Abhängigkeiten.
- Zwei Szenen: Schlachtfeld (Nahebene 0,4 m, Fernebene 7 km) und Cockpit (Nahebene 2 cm) werden nacheinander mit gelöschtem Tiefenpuffer gerendert – keine Z-Fighting-Probleme trotz riesiger Spannweite.
- Pilotenkopf hängt an einer Feder: bei jedem Schritt des 70-t-Mechs sackt der Blick ab, das Cockpit rüttelt, Instrumente zittern.
- Nachbearbeitung: MSAA, Bloom, Farbgrading mit Vignette und chromatischer Aberration, ACES-Tonemapping, Filmkorn.
- Bildbasierte Beleuchtung aus dem Panorama für realistische Metallreflexe.

```
src/
  main.js              Spielablauf, Kamera-Rig, Systeme (Reaktor, Hitze, Hydraulik)
  logic/mech.js        reine Bewegungslogik (getestet)
  cockpit/cockpit.js   Cockpit-Aufbau und Beleuchtung
  cockpit/instruments.js  Rundinstrumente, Kippschalter, Leuchttaster, Alarmleuchte
  cockpit/displays.js  Röhrendisplays (Status, Kamera, Taktik)
  cockpit/hud.js       Head-up-Display
  world/world.js       Gelände, Panorama, Ruinen, Wracks
  world/effects.js     Feuer, Rauch, Asche, Leuchtspur, Artillerie
  audio.js  post.js  input.js  ui.js  assets.js  geom.js
```
