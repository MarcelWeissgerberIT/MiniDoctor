# BattleBot

Ein 3D-Ego-Shooter im Browser: Du steuerst **BB-07**, einen 5 Meter hohen und 18 Tonnen schweren Kampfroboter (Mech), mitten in einem Krieg – außen verdreckter, rostiger Stahl, innen ein modernes, dunkles Cockpit. Wie in einem Flugzeug- oder Panzercockpit ist die Sicht nach draußen auf die Panzerglaskanzel und zwei seitliche Sichtblöcke begrenzt.

*A browser first-person mech game. You board a 5 m combat robot, bring it up from cold and dark and walk it out of a forward base.*

**Stand: Prototyp 0.4 – Missionskatalog mit fünf Einsätzen, Waffen, Gegnern, Außenansicht und einer eigenen Lanze aus verbündeten Mechs.**

## Missionskatalog

| # | Mission | Typ | Inhalt |
|---|---|---|---|
| 1 | Kalt & dunkel | Einweisung | Einsteigen, Mech nach Checkliste hochfahren, laufen lernen |
| 2 | Feuertaufe | Verteidigung | Waffen scharf machen, zwei Panzerwellen an der Panzersperre abwehren |
| 3 | Schulter an Schulter | Lanze · Verteidigung | Mit Hammer 2 und Hammer 3: Befehle lernen, zwei Wellen (9 Fahrzeuge) abwehren |
| 4 | Depotschlag | Lanze · Angriff | Mit der Lanze zum Feinddepot (700 m NO), Wachen ausschalten, 4 Depotziele zerstören, Verstärkung abwehren |
| 5 | Spähtrupp | Aufklärung | Allein vier Fahrzeuge in den Ruinen mit dem Raketensucher markieren, ohne entdeckt zu werden; danach Artillerieschlag und Rückkehr |

Das Titelmenü zeigt alle Missionen mit Typ, Schwierigkeit, Lanzengröße und – nach einem Sieg – einem Haken mit der besten Zeit (im Browser gespeichert).

## Funk mit Gesicht

Wer funkt, erscheint als Videoverbindung auf dem linken Display: der Ausbilder aus dem Kommandobunker, Hammer 2 und Hammer 3 aus ihren Cockpits – mit Kanalanzeige, LIVE-Marke, Pegel und kurzem Bildaufbau mit Störstreifen. Die Porträts sind mit GPT Image 2.6 erzeugt, die sprechenden Clips mit **Higgsfield Intone** (lippensynchron zu echten Funksprüchen aus dem Spiel). Ohne Hauptstrom bleibt das Display dunkel.

## Deckung und Sichtlinien

Geschossen wird nur bei freier Sicht: Gebäuderuinen und Geländekuppen blockieren (Sandsäcke, Panzersperren und Fässer nicht). Panzer ohne Sicht auf ihr Ziel fahren um das Hindernis herum zu einer neuen Schussposition, Flügelmänner treten aus der Deckung, und auch der Raketensucher schaltet nur auf, was der Pilot sehen kann. Nach erfülltem Auftrag stellt der Feind das Feuer ein.

## Realistische Gefechte

- **Echte Granaten:** Panzer und Schützenpanzer schießen keine Würfeltreffer mehr. Jede Granate fliegt mit Mündungsgeschwindigkeit (Kampfpanzer 800 m/s, SPz 1000 m/s) durch die Welt, schlägt in Ruinen und Boden ein und trifft nur, wenn sie den Mech wirklich erwischt. Der Richtschütze hält vor (Flugzeit × geschätzte Geschwindigkeit, ±40 % Schätzfehler), streut mit der Entfernung und führt der Bewegung nur verzögert nach. Wer läuft und die Richtung wechselt, wird etwa halb so oft getroffen wie ein stehender Mech (gemessen auf 350–400 m: ca. 30–37 % stehend, 12–16 % in Bewegung). Knapp vorbeifliegende Granaten hört man pfeifen.
- **Trefferzonen:** Wo die Granate einschlägt, entscheidet über das Bauteil – Beine unten, Torso in der Mitte, Arme außen, der kleine Sensorkopf oben.
- **Panzerung nach Richtung:** Der Mech ist vorne dicker gepanzert (×0,8) als hinten (×1,35). Bei den Panzern zählt es noch mehr: Front ×0,5, Seite ×1, Heck ×1,6, Turmfront ×0,6. Lenkraketen (Hohlladung) hängen weniger davon ab. Neben dem Fadenkreuz zeigt das HMD, wo der eigene Treffer saß, z. B. `HECK ×1.6` – flankieren lohnt sich.
- **Drehbare Türme:** Der Kampfpanzer-Turm ist vom Fahrgestell getrennt und schwenkt eigenständig (0,7 rad/s). Ein Panzer kann seitlich fahren und dabei mit dem Rohr auf dich zielen; gefeuert wird erst, wenn der Turm auf dem Ziel steht.
- **Taktische Gegner:** Ein angeschlagener Panzer (unter 50 %) wirft eine weiße **Nebelwand**, zieht sich hinter die nächste große Ruine zurück und versucht danach, dich von der Flanke zu fassen. Nebel blockiert die Sicht in beide Richtungen und reißt die Raketenaufschaltung ab, eine schon fliegende Rakete fliegt blind weiter.
- **Systemschäden:** Treffer können Systeme hinter der Panzerung ausschalten (Ausfälle stehen rot im HMD):
  - Kopf: **Optik** (Kamera und Zoom tot) oder **Sensoren** (Radar nur noch 250 m, kein Datalink: Zielmarken nur in Sicht und unter 600 m)
  - Torso: **Gyro** (keine Stabilisierung, die Kanone streut stärker) oder **Kühlung** (Kanone und Reaktor laufen heißer)
  - linker Arm: **Raketenwerfer** blockiert
  - Beine: **Hydraulik** (nur noch 70 % Geschwindigkeit)

## Die Lanze: verbündete Mechs

In den Lanzen-Missionen laufen **Hammer 2** und **Hammer 3** neben dir: dieselben 5-m-Mechs (geriggtes Meshy-Modell mit eigener Gehanimation, leicht anders lackiert), mit grüner IFF-Leuchte, 30-mm-Kanone und Raketen. Sie suchen sich selbst Ziele in Reichweite, melden sich mit eigenen Funkstimmen („Kontakt“, „Ziel zerstört“, „Ich werde getroffen“) und können ausfallen.

| Taste | Befehl |
|---|---|
| B | Folgen (Formation links und rechts hinter dir) |
| V | Position halten |
| T | Dein aufgeschaltetes – oder das anvisierte – Ziel angreifen |

Feindliche Fahrzeuge wählen ihr Ziel unter allen Mechs der Lanze. Das Helmdisplay zeigt den Zustand der Lanze und grüne Markierungen über den Flügelmännern, das Taktik-Radar zeigt sie in Hellblau. Eigenbeschuss stoppt an ihnen – und sie beschweren sich.

## Mission 1 · Einweisung: Kalt & dunkel

1. **Einstieg (Video, ~22 s):** In Ego-Perspektive gehst du über den Stützpunkt zum abgeschalteten BB-07, kletterst mit den Händen die Leiter am Bein hinauf, drehst das Handrad und öffnest die Einstiegsluke am Rücken. Das Video ist mit Higgsfield (Kling 3.0) aus Standbildern unseres Mechs erzeugt; Schritte, Leiter, Luke und Funk werden im Spiel synchron dazugemischt. Danach setzt du dich im Spiel-Cockpit hin, schnallst dich an, die Luke fällt zu. (Leertaste überspringt. Ohne abspielbares Video läuft eine Kamerafahrt um das 3D-Modell.)
2. **Kaltstart nach Checkliste:** Das Cockpit ist komplett tot. Ein Ausbilder führt per Funk (deutsche Sprachausgabe mit leichtem Funkfilter und Untertiteln) durch den Start. Der nächste Schalter wird im Cockpit mit einem pulsierenden Ring markiert, ein Pfeil zeigt die Richtung, und die passende Panel-Ansicht (Taste 1–5) wird eingeblendet:

   | Schritt | Wirkung |
   |---|---|
   | BATT ein (linke Konsole, Schutzkappe) | Batteriebus: rotes Notlicht, Warnlampen, Instrumentenzeiger |
   | APU starten | Hilfsturbine läuft in ~9 s hoch → Lampe APU READY |
   | GEN 1 + GEN 2 | Hauptstrom: Displays booten, Kabinenlicht möglich |
   | CABIN LIGHT | Deckenleuchte |
   | HYD PRESS (Overhead) | Hydraulikdruck steigt auf ~23 MPa |
   | COOLANT PUMP (Overhead) | Kühlmittelfluss |
   | REACTOR START (Schutzkappe) | 7 s Zündung mit Grollen und Vibration; ohne Pumpe und Druck: Abbruch |
   | APU aus | Reaktor versorgt jetzt die Generatoren |
   | STAB ASSIST | Gyro richtet sich in ~6 s aus |
   | OPTICS + HUD | Kamerabild und Head-up-Display |
   | LEG LOCK aus | Beinverriegelung löst sich – erst jetzt kann der Mech laufen |

3. **Laufen:** Schub geben, zur ersten Wegmarke (grüner Signalrauch, blinkende Leuchte, Markierung im HUD und auf dem Radar), drehen, zweite Wegmarke, anhalten, Nachtsicht testen. Danach freies Bewegen.

**Laufen fühlt sich nach Laufen an:** Bei jedem Schritt verlagert der Mech sein Gewicht aufs Standbein (Kabine kippt 3–4°), hebt sich über das Bein, sackt beim Aufsetzen ab und nickt nach vorn, der Rumpf verdreht sich leicht. Der Pilotenkopf hängt federnd darin und hält den Blick teilweise waagerecht – dadurch schaukelt das Cockpit sichtbar um dich herum. Kurven, Beschleunigen, Bremsen und Kraterränder neigen die Maschine, beim Anhalten schwingt sie nach. Erkennungsmarken an einer Kette pendeln über dem Sichtschlitz, Röhrendisplays springen kurz, das Licht flackert, die Kabine knarzt, Hydraulik zischt, Schritte kommen von links bzw. rechts. Der Gyro-Stabilisator (G) dämpft das Schwanken.

Fehler werden realistisch behandelt: Reaktor ohne Kühlung/Hydraulik zündet nicht (der Schalter springt zurück), Kühlpumpe im Betrieb aus → Überhitzung, Master Caution, Alarmleuchte und schließlich Reaktor-Notabschaltung. **Schnellstart** im Titelmenü überspringt Einstieg und Checkliste.

## Mission 2 · Gefecht: Feuertaufe

Eine Panzerkolonne rollt auf Sektor Kilo zu. Der Mech steht betriebsbereit an der Basis, die Waffen sind gesichert.

1. **Waffen scharf machen** – Overhead-Panel (Taste 2): Schutzkappe öffnen, WEAPONS ARM, dann MAIN GUN und MISSILE.
2. **Stellung beziehen** an der Panzersperre (Wegmarke 3, grüner Rauch).
3. **Welle 1:** drei Kampfpanzer aus Nordost. **Welle 2:** zwei Panzer und ein Schützenpanzer aus Osten.

**Waffen:** Die 30-mm-Kanone am rechten Arm ist rechts durch die Kanzel zu sehen: Sie schwenkt mit dem Helm (±70° seitlich, mit Servo-Verzögerung), der Lauf fährt bei jedem Schuss zurück, glüht bei Hitze und wirft große Messinghülsen aus, die klirrend auf dem Boden landen. Feuer mit der linken Maustaste (halten = Dauerfeuer, 5 Schuss/s, jede Granate mit Leuchtspur); der Blick wird bei jedem Schuss hochgerissen, die Kabine bebt, das Mündungsfeuer erhellt das Cockpit. Sie überhitzt bei Dauerfeuer. Darüber sitzt ein **Koaxial-MG 7,62 mm** (Schalter MG, Taste **E** halten): 15 Schuss/s, jede dritte Leuchtspur, kleine Hülsen – gegen Schützenpanzer. Lenkraketen aus dem Schulterwerfer: Ziel im gestrichelten Suchkreis halten, bis der Aufschaltton schnell wird (LOCK), dann **F**. Ohne Lock fliegen sie ungelenkt auf den Zielpunkt.

**Gegner** fahren über das Gelände (Hindernissen ausweichend), halten auf Kampfentfernung an, schwenken den Turm zum Mech und feuern echte, fliegende Granaten (siehe *Realistische Gefechte*). Leuchtspurgeschosse zeigen, woher es kommt; wer stehen bleibt, wird leichter getroffen, Fehlschüsse schlagen neben dir ein oder pfeifen vorbei. Treffer gehen dorthin, wo die Granate einschlägt – Kopf, Torso, Arme oder Beine: das Licht setzt aus, Funken sprühen, die Scheibe kann reißen, ein roter Pfeil zeigt die Richtung. Zerstörter rechter Arm = Kanone tot, beschädigte Beine = langsamer. Mit etwas Pech **brennt es an Bord** (Rauch in der Kabine, Hitze steigt) – dann FIRE SUPPR an der Mittelkonsole umlegen (3 Löschflaschen). Kopf oder Torso auf 0 % = Mech zerstört. Am Ende gibt es eine Auswertung mit Abschüssen, Trefferquote und Einsatzzeit.

**Helmdisplay (HMD):** Unabhängig von der Blickrichtung stehen Schub (−30…+100 %, Balken + Zahl), Geschwindigkeit und Fahrtrichtung immer links unten im Bild; rechts unten Munition, Rohrhitze, Raketen und Lock-Status, darüber der Schadenszustand. Feinde werden per Datenlink mit Rahmen und Entfernung markiert, außerhalb des Sichtfelds zeigen Pfeile am Rand in ihre Richtung.

**Außenansicht (Taste 9):** Kamera hinter dem Mech, mit der Maus drehbar, Mausrad = Abstand. Der Mech ist dafür mit Meshy geriggt und läuft mit einer Gehanimation, die mit den simulierten Schritten synchronisiert ist. Steuern und schießen geht auch von außen.

## Starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Logik-Tests (Mech-Bewegung, Kaltstart, Gang, Waffen, Schaden, Gegner-KI)
npm run build    # statischer Build in dist/
```

Bei jedem Push auf `main` baut und veröffentlicht GitHub Actions das Spiel auf GitHub Pages.

## Das Cockpit

Gebaut nach dem Innenraum aus dem Einstiegsvideo: Rundum-Kanzel aus breiter Frontscheibe und zwei schrägen Seitenscheiben, ein geschwungenes schwarzes Armaturenbrett aus fünf Segmenten um den Sitz herum, orange hinterleuchtete Rundinstrumente (Reaktor, Hydraulik, Kühlung, APU, Gyro, Kerntemperatur, Bordnetz, Temperatur, Geschwindigkeit), orange Siebensegment-Anzeigen (Kurs, Munition, Schub, km/h) und eine Anzeigeleiste oben an der Scheibe (Uhrzeit, Kurs, Entfernung). Die Multifunktionsdisplays leuchten ebenfalls orange; nur die Nachtsicht bleibt grün. (Die folgende Liste beschreibt die Ausstattung.)

- **Panzerhülle** aus olivgrünen, rostigen Stahlplatten, genieteten Spanten, Diamant-Riffelblech am Boden, Hydraulikleitungen und Kabelbäumen.
- **Sichtschlitz** aus drei verschmutzten Panzerglasscheiben (Kratzer, Staub, Schlieren), getrennt durch Stahlstreben, dazu zwei kleine seitliche Sichtblöcke. Der Kopf lässt sich nur begrenzt drehen (±105° seitlich, 38° hoch, 62° runter).
- **Drei Glas-Multifunktionsdisplays** (scharf, doppelte Auflösung, große Schrift; Taste 6 zoomt auf die Displays):
  - *Mech Status*: Schadensbild der Baugruppen, Reaktor, Hitze, Kühlmittel, Hydraulik.
  - *Kamera*: Live-Bild der Bugkamera mit 4-fach-Zoom, Kompassband, Entfernungsmesser, Nachtsicht.
  - *Taktik*: Radar mit Sweep, Strukturen, Brände und feindliche Kontakte (500/1000 m).
- **Analoge Instrumente** (Reaktor, Hydraulikdruck, Temperatur, Geschwindigkeit) mit gedämpften Zeigern, die bei jedem Schritt zittern.
- **Holo-Visier statt HUD-Scheibe:** leuchtende Vektorsymbolik direkt auf der Panzerglaskanzel – Kompassband mit Blickrichtungsmarke, Horizontlinien, die mit dem Gang des Mechs wanken und kippen, Fadenkreuz, Bögen für Schub (links) und Geschwindigkeit (rechts), Wegmarke an ihrer echten Richtung im Gelände, Waffenzeile und blinkende Warnungen. Schalter HUD bzw. Taste H.
- **Bedienbare Schalter und Knöpfe** (Fadenkreuz + Klick): Kabinenlicht, HUD, Nachtsicht, Optik, Radarreichweite, Gyro-Stabilisator, Kühlmittelpumpe, Hydraulik, Generatoren, Master Caution u. a. Pumpe aus → Überhitzung mit Alarm; Hydraulik aus → der Mech kommt kaum noch vom Fleck; alle Generatoren aus → Cockpit wird dunkel.
- **Joystick und Schubhebel** bewegen sich mit den Eingaben.
- **Licht**: Tageslicht fällt mit weichen Schatten durch den Sichtschlitz, warme Deckenleuchte, rote Fußraumbeleuchtung, grünes Display-Streulicht, rote Alarmleuchte mit Drahtkäfig; Artillerieblitze erhellen kurz die Kabine. Staub schwebt in der Luft und wird bei jedem Schritt aufgewirbelt.
- **Einstiegsluke** in der Rückwand, die beim Einsteigen offen steht und sich hinter dir schließt.

## Draußen

Ein zerbombtes Stadtrandgebiet: Krater, ausgebrannte Panzerwracks, Gebäuderuinen, Panzersperren-Linien, verkohlte Bäume, Trümmer, brennende Feuer mit Rauchsäulen, Ascheflocken, Leuchtspurgarben und Artillerieeinschläge am Horizont (mit Donner, verzögert um die Schallgeschwindigkeit). Dahinter ein 360°-Panorama einer brennenden Stadt.

## Panel-Ansichten und Zoom

Wie in Flugsimulatoren kann man sich zu einzelnen Bedienfeldern hinbeugen: **1** Vorne (freier Blick), **2** Overhead-Panel (Waffen, Hydraulik, Kühlung), **3** linke Konsole (Elektrik: BATT, APU, Generatoren), **4** rechte Konsole, **5** Mittelkonsole (Reaktor, Gyro, Löschanlage, Licht, Optik, HUD, Beinverriegelung), **6** Displays, **9** Außenansicht. In einer Panel-Ansicht ist der Mauszeiger frei und Schalter werden direkt angeklickt; Esc, Rechtsklick oder dieselbe Taste führen zurück. Im freien Blick zoomt die **gedrückte rechte Maustaste** (z. B. um Displays zu lesen). Die Leiste unten am Bildschirm zeigt die Ansichten auch zum Anklicken.

Die Instrumententafeln haben einen helleren Anstrich, größere hinterleuchtete Beschriftungen mit ON-Markierung und eigene kleine Panel-Leuchten.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Maus | umsehen (Klick fängt die Maus ein; alternativ mit gedrückter Taste ziehen) |
| 1 – 6 | Panel-Ansicht: Vorne, Overhead, links, rechts, Mitte, Displays |
| 9 | Außenansicht an/aus (Maus dreht, Mausrad zoomt) |
| Rechte Maustaste | halten = Zoom · in Panel-Ansicht: zurück |
| W / S | Schubhebel vor / zurück (bis −30 % rückwärts) |
| X / Leertaste | Schub auf null |
| A / D | Mech drehen |
| Linksklick | Schalter unter dem Fadenkreuz betätigen · sonst Kanone feuern (Waffen scharf) |
| F | Rakete starten |
| E (halten) | Koaxial-MG |
| B / V / T | Lanze: folgen / Position halten / Ziel angreifen |
| Leertaste | Einstiegssequenz überspringen |
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
| 3D-Modelle: Pilotensitz, Joystick, Schubhebel, Funkgerät, Feuerlöscher, Panzerwrack, Gebäuderuine, Panzersperre, Sandsäcke, Munitionskisten, Fässer, Stromgenerator | **Meshy 7 Image-to-3D** (über Higgsfield, mit PBR), Vorlagen von GPT Image 2.6 | `public/assets/models/*.glb` |
| BB-07 von außen (5 m) | **Meshy Multi-Image-to-3D** aus Front-, Seiten- und Rückansicht (GPT Image 2.6, Rückansicht mit Luke und Leiter) | `public/assets/models/mech.glb` |
| Cockpit-Brummen, Schlachtlärm, Mech-Schritt, Servo, Hochfahren, Schritte auf Schotter, Leiter, Luke auf/zu, Batterie-Relais, APU, Reaktorzündung, Hydraulikpumpe, Gyro, Beinverriegelung, Gurtschloss, Stützpunkt-Atmo | Higgsfield (Mirelo SFX) | `public/assets/audio/` |
| Kabinenknarzen, Hydraulik pro Schritt, klappernde Ausrüstung | Higgsfield (Mirelo SFX) | `public/assets/audio/` |
| 22 Funksprüche des Ausbilders (Deutsch) | Higgsfield (Text-to-Speech, ElevenLabs-Engine, Stimme „Barrett“ – ausgewählt per deutscher Spracherkennung aus 8 Engine/Stimmen-Kandidaten) | `public/assets/voice/` |
| Einstiegsvideo (Ego-Perspektive) | Higgsfield: Startbilder GPT Image 2.6 mit dem Mech als Referenz, Clips Kling 3.0 Pro, geschnitten mit ffmpeg | `public/assets/video/entry.{webm,mp4}` |
| Feindlicher Kampfpanzer und Radschützenpanzer | **Meshy 7 Image-to-3D**, Vorlagen GPT Image 2.6 | `public/assets/models/enemy_{tank,apc}.glb` |
| Geriggter, laufender BB-07 für die Außenansicht | **Meshy Rigging** mit Gehanimation | `public/assets/models/mech_rigged.glb` |
| Feuerball, Mündungsfeuer, Glasbruch | Higgsfield (GPT Image 2.6) | `public/assets/fx/` |
| Kanone, Raketenstart, Explosion, Panzertreffer, Funken, Panzerkanone, vorbeipfeifende Granate, Feuerlöscher | Higgsfield (Mirelo SFX) | `public/assets/audio/` |
| 12 Funksprüche für Mission 2 | Higgsfield (Text-to-Speech, ElevenLabs „Barrett“) | `public/assets/voice/m2_*.mp3` |
| Gesichter für die Videoverbindung (Ausbilder, Hammer 2, Hammer 3) | Higgsfield: Porträts GPT Image 2.6, sprechende Clips Higgsfield Intone | `public/assets/faces/`, `public/assets/video/face_*` |
| 17 Funksprüche für die Missionen 3–5, je 8 für Hammer 2 und Hammer 3 | Higgsfield (Text-to-Speech, ElevenLabs „Barrett“, „Knox“ und „Vera“; per Spracherkennung geprüft) | `public/assets/voice/m3_* … w3_*.mp3` |

`tools/process-assets.mjs` macht daraus spielfertige Dateien: Normal-Maps und gepackte ORM-Maps (Ambient Occlusion, Rauheit, Metallanteil) werden aus den Farbtexturen abgeleitet (Rost = rau und nicht-metallisch, blanker Stahl = metallisch), Texturen werden nahtlos gemacht, das Panorama wird horizontal nahtlos überblendet, die Decals ausgeschnitten und die GLBs mit WebP-Texturen und Meshopt komprimiert. Die Rohdateien liegen in `assets-src/` (nicht im Repo).

Das Cockpit selbst (Hülle, Armaturen, Displays, Schalter, Leitungen) ist in Three.js aus Primitiven aufgebaut und mit diesen Texturen belegt, die Meshy-Modelle sind darin platziert.

## Technik

- **Three.js** + Vite, keine weiteren Laufzeit-Abhängigkeiten.
- Zwei Szenen: Schlachtfeld (Nahebene 0,4 m, Fernebene 7 km) und Cockpit (Nahebene 2 cm) werden nacheinander mit gelöschtem Tiefenpuffer gerendert – keine Z-Fighting-Probleme trotz riesiger Spannweite.
- Pilotenkopf hängt an einer Feder: bei jedem Schritt des Mechs sackt der Blick ab, das Cockpit rüttelt, Instrumente zittern.
- Das Außenmodell wird per Raycast vermessen (Rumpfmitte, Rückenluke, Leiter am Bein), damit Kamerafahrt und Cockpit genau zum Meshy-Modell passen.
- Nachbearbeitung: MSAA, Bloom, Farbgrading mit Vignette und chromatischer Aberration, ACES-Tonemapping, Filmkorn.
- Bildbasierte Beleuchtung aus dem Panorama für realistische Metallreflexe.

```
src/
  main.js              Spielablauf, Kamera-Rig, Verdrahtung der Systeme
  entry.js             Einstiegssequenz (Video mit Ton-Cues, Hinsetzen, Luke; Fallback-Kamerafahrt)
  cockpit/views.js     Panel-Ansichten (Position, Blickziel, Blickfeld)
  tutorial.js          Mission 1: Schritte, Bedingungen, Funksprüche, Wegmarken (auch Ablaufsteuerung für Mission 2)
  missions.js          Missionskatalog: Definitionen, Wellen, Ziele, Funksprüche, Ablauf
  combat/allies.js     Verbündete Mechs: Modelle, Gehanimation, Waffen, Treffer, Wracks
  cockpit/comms.js     Videoverbindung: wer spricht, Clip abspielen
  logic/allies.js      Flügelmann-Logik: Befehle, Formation, Bewegung, Feuer (getestet)
  combat/arsenal.js    Kanone, Leuchtspur, Lenkraketen, Einschläge
  combat/enemies.js    Panzer/Schützenpanzer: abgetrennter Drehturm, ballistische Granaten mit Kollision, Nebelwände, Deckungssuche, Wracks
  combat/hmd.js        Helmdisplay (Schub, Waffen, Zielmarken, Trefferrichtung)
  combat/gunrig.js     sichtbarer Waffenarm: Kanone + MG, Schwenken, Rücklauf, Hitzeglühen, Hülsen
  logic/combat.js      Waffen, Richtschütze (Vorhalt, Streuung), Panzerung nach Richtung, Trefferzonen, Systemschäden, Gegnertaktik (getestet)
  logic/mech.js        reine Bewegungslogik (getestet)
  logic/systems.js     Strom, APU, Hydraulik, Kühlung, Reaktor, Gyro, Beinverriegelung (getestet)
  logic/gait.js        Gang: Gewichtsverlagerung, Nachschwingen, Kopf-Feder, Pendel (getestet)
  cockpit/cockpit.js   Cockpit-Aufbau und Beleuchtung
  cockpit/instruments.js  Rundinstrumente, Kippschalter, Leuchttaster, Alarmleuchte
  cockpit/displays.js  Glas-Displays (Status, Kamera, Taktik)
  cockpit/hud.js       Head-up-Display
  world/world.js       Gelände, Panorama, Ruinen, Wracks
  world/effects.js     Feuer, Rauch, Asche, Leuchtspur, Artillerie
  audio.js  post.js  input.js  ui.js  assets.js  geom.js
```
