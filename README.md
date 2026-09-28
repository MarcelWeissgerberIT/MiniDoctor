# MiniDoctor

Ein kleines 3D-First-Person-Spiel im Browser: Du sitzt in einem Mini-Raumschiff, **so groß wie ein Blutplättchen (2,5 µm)**, das in die Blutbahn eines Patienten gespritzt wird. Das Schiff hat **keinen Antrieb** – es treibt mit dem Blutstrom. Alles passiert aus dem Cockpit.

*A small 3D first-person browser game: you pilot a platelet-sized ship with no engine through a patient's bloodstream. German & English.*

## Starten

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Logik-Tests (Physik, Puzzles, Übersetzungen)
npm run build    # statischer Build in dist/
```

**Online spielen:** https://marcelweissgerberit.github.io/MiniDoctor/ (automatisches Deployment per GitHub Actions bei jedem Push)

## Ablauf

Nach jedem Drop folgt eine **animierte Anreise durch den Kreislauf**: Arm-Vene → obere Hohlvene → rechter Vorhof → Trikuspidalklappe → rechte Kammer → Lungenkapillaren (Gasaustausch, die Blutkörperchen werden hellrot) → linkes Herz → Aorta → Zielort (Herzkranzgefäß, Magen, Bein, Lunge oder über die Halsschlagader ins Gehirn). Im Herzen sieht man schlagende Kammerwände, Muskelbälkchen, Papillarmuskeln mit Sehnenfäden, die sich öffnenden Klappen und die Abgänge der Herzkranzgefäße – jeweils beschriftet. Eine Körperkarte zeigt die Route mit blinkender Position („Du bist hier“); auch während der Missionen zeigt eine kleine Karte den Einsatzort. Leertaste überspringt, Shift beschleunigt.

1. **Drop 1 – Diagnose** (Arteriole der Magenschleimhaut, Ø 100 µm): Proben im Blut scannen (Plasma, Leukozyt, Thrombozyt, Lipoproteine, Partikel) und die Krankheit bestimmen.
2. **Drop 2 – Behandlung**, abhängig von der Diagnose:
   - **Koronarstent** (LAD, Ø 3 mm): zur Plaque treiben, verankern, Läsion scannen, Kalkknoten mit dem Skalpell anritzen, Stent wählen, im Herzschlag positionieren, Ballon auf 12–16 atm aufdehnen.
   - **Virämie** (Lungenvenole, Ø 40 µm): Asteroids-artig Virus-Aggregate mit dem Antikörper-Werfer zerschießen, bevor sie die Wand infizieren.
   - **Tiefe Venenthrombose** (V. poplitea, Ø 6 mm): Gerinnsel mit Laser/tPA auflösen, ohne Embolien auszulösen.
   - **Schlaganfall** (A. cerebri media, Gehirn, Ø 3 mm): mechanische Thrombektomie mit Stent-Retriever unter Zeitdruck („Time is brain“: ~1,9 Mio. Nervenzellen pro Minute). Gerinnsel vermessen, Retriever wählen, Katheterspitze setzen, 3 Herzschläge verankern lassen und dann mit dem linken Steuergriff (oder S) gleichmäßig zurückziehen – zu fest reißt Fragmente ab. Ergebnis als TICI-Reperfusionsgrad.
3. Je nach Erfolg **überlebt oder stirbt** der Patient. Einzelmissionen gibt es im Menü unter „Training".

Jeder Drop beginnt mit einem Video (Injektion → Pille öffnet sich → Kamerafahrt ins Cockpit), das nahtlos ins Live-Spiel überblendet. Der **Autopilot** fliegt die ersten 5 Sekunden, dann übernimmst du. Der Autopilot bleibt standardmäßig an und ist mit **P** abschaltbar.

## Steuerung

| Eingabe | Aktion |
|---|---|
| Maus / rechter Steuergriff | umsehen (Klick = Maus einfangen) |
| W A S D / Pfeile / linker Steuergriff | Strömungsklappen: seitlich driften |
| Leertaste | GP-Ib-Anker-Harpune (greift bis 200 µm Wandabstand und zieht das Schiff an die Wand). Vor der Ankerzone gedrückt: Anker scharf – der Anker-Assistent steuert hin und greift automatisch |
| 1–6 / Mausrad | Werkzeug: Laser, Skalpell, Antikörper, Anker, Scanner, tPA |
| Linksklick | Werkzeug benutzen (Scanner/Ballon: halten) |
| P | Autopilot an/aus |
| H | Hilfe (Schritt-für-Schritt-Anleitung der Mission) |
| M | Ton an/aus |

Die beiden **Steuergriffe im Cockpit** lassen sich mit der Maus oder per Touch ziehen: vor, zurück, links, rechts. Sie bewegen sich auch mit, wenn du Tastatur oder Maus benutzt.

## Realismus

- **Maßstab 1:1** (1 Welteinheit = 1 µm): Schiff 2,5 µm, Erythrozyt 7,8 µm (echtes Evans-Fung-Profil), Virion 0,1 µm, Führungsdraht 0,36 mm, Stentstrebe 80 µm.
- **Strömung** nach Hagen-Poiseuille (Mitte schnell, Wand langsam), pulsierend mit dem Puls des Patienten; Koronarfluss ist in der Diastole am stärksten; vor einem Verschluss kommt der Fluss zum Stillstand (Stase).
- Nur die **Zeit ist gedehnt** (1:100 bis 1:1000), damit man dem Fluss folgen kann; die Cockpit-Anzeigen zeigen die echten Werte. Nahe der Gefäßwand, wo das Blut fast stillsteht, schaltet sich automatisch ein Zeitraffer zu (Anzeige z. B. 1:8000).
- Die Dichte der Blutkörperchen ist für die Sicht reduziert.

## Sound & Musik

- **Musik** für die Anreise: zwei von OpenArt generierte Soundtracks (Wan 3.0): ein ruhiges, dunkles *venöses* Thema bis zur Lunge und ein helleres, treibendes *arterielles* Thema, in das beim Gasaustausch übergeblendet wird. Nahtlose Schleifen per Crossfade.
- **Geräuschkulissen** (ebenfalls OpenArt): gedämpftes Herzinneres in den Herzkammern, Atmen in der Lunge.
- **Effekte** (synthetisiert, synchron zum Geschehen): Stationsgong, Klappenschlag beim Durchfahren, Herzschlag (in den Kammern laut), Pulswelle in Arterien, Sauerstoff-Funkeln in der Lunge, Strömungsrauschen, das in engen Gefäßen höher pfeift, vorbeiziehende Blutkörperchen, Ankunfts-Akkord.
- In den Missionen läuft die Musik leise weiter.
- Musik und Ton sind im Menü getrennt abschaltbar, **M** schaltet den Ton stumm.
- `tools/process-audio.mjs` extrahiert die Tonspuren der OpenArt-Videos als Opus (+ AAC-Fallback).

## Kein Motion-Sickness

Fester Horizont (kein Rollen), sichtbarer Cockpitrahmen, ruhige Kamera, begrenzter Blickwinkel, keine FOV-Sprünge. Der **Komfortmodus** im Menü schaltet auch das leichte Herzschlag-Wippen ab.

## Cockpit

Die Displays im Armaturenbrett zeigen Live-Werte: EKG und Puls des Patienten, Zustand, echte Flussgeschwindigkeit, Wandabstand, Zieldistanz, Gefäßquerschnitt mit Schiffsposition, Zeitdehnung, Autopilot-Status. Die Rundlampen zeigen Autopilot, Anker, Werkzeug aktiv, Ton und Warnung.

## Assets

Alle Bilder, Texturen und Videos wurden mit **OpenArt** generiert (Projekt „MiniDoctor"): Cockpit (per Chroma-Key freigestellt; Griffe als eigene Ebenen über eine zweite, griffelose Generation), Körperkarte, Texturen (Endothel, Plaque, Fibrin, Erythrozyt), Missionsbilder, Key-Art, Ausgangsbilder, Werkzeug-Icons, Herzinnenwand-Textur, Schlaganfall-Briefing, Drop-Video (Wan 3.0) und Übergangsvideo Pille → Cockpit (Kling 3 Omni, Start-/Endframe). `tools/process-assets.mjs` erzeugt aus den Rohdaten (`assets-src/`, nicht im Repo) die Web-Versionen in `public/assets/`. Die 3D-Werkzeuge sind prozedural modelliert und animiert; Sounds werden per WebAudio synthetisiert.

## Code

```
src/physics.js        Maßstäbe, Gefäße, Poiseuille, Puls, Erythrozytenform
src/world.js          Gefäß, Blutzellen, Licht, Nebel
src/ship.js           Schiff ohne Antrieb, Klappen, Anker, Autopilot, Eingabe
src/journey.js        animierte Anreise durch Herz und Kreislauf
src/tools.js          animierte Werkzeuge (Laser, Skalpell, Antikörper, Anker, Scanner, tPA)
src/cockpit.js        Cockpit-Overlay + Live-Displays
src/hud.js            HUD, Zielmarker, Werkzeugleiste
src/missions/*.js     Diagnose, Stent, Viren, Thrombose, Schlaganfall (+ testbare *Logic.js)
src/i18n.js           Deutsch / Englisch
```
