// Mission 1, basic training in the base: cold-and-dark start-up, walking, the displays,
// the firing range (cannon, MG, missile via the map), the recon drone with a top attack,
// a fire drill, lance orders and the outside view.
// Each step names the control to highlight, the radio line to play and the
// condition that completes it.

export const WAYPOINTS = [
  { x: 6, z: -115, label: 'WP 1' },
  { x: 92, z: -168, label: 'WP 2' },
  { x: 114, z: -246, label: 'WP 3' }, // behind the hedgehog line (missions 2 and 3)
  { x: 360, z: -470, label: 'WP 4' }, // approach to the enemy depot (mission 4)
  { x: 0, z: -30, label: 'BASIS' }, // in front of the base (mission 5)
];

export const VOICE_TEXT = {
  v00: 'Pilot, hier Ausbilder. BB-07 steht an Rampe drei für Sie bereit. Steigen Sie ein, ich melde mich, sobald Sie sitzen.',
  v01: 'Gut, die Einstiegsluke ist geschlossen. Ihr Mech ist kalt und dunkel. Wir fahren ihn jetzt gemeinsam hoch, Schritt für Schritt nach Checkliste. Mit den Tasten 1 bis 5 schauen Sie direkt auf die einzelnen Bedienfelder.',
  v02: 'Zuerst die Batterie. Linke Konsole, Schalter BATT auf Ein.',
  v03: 'Notstrom liegt an. Jetzt das Hilfstriebwerk: Schalter APU, ebenfalls linke Konsole. Warten Sie, bis die grüne Lampe APU READY leuchtet.',
  v04: 'APU läuft. Generator eins und Generator zwei einschalten.',
  v05: 'Hauptstrom ist da, die Displays fahren hoch. Machen Sie sich Licht: Kabinenlicht, Mittelkonsole unten.',
  v06: 'Hydraulik. Overhead-Panel über Ihnen, Schalter HYD PRESS (Hydraulikdruck). Warten Sie, bis der Druck über 18 Megapascal steht.',
  v07: 'Kühlmittelpumpe einschalten, gleich daneben. Ohne Kühlung zündet der Reaktor nicht.',
  v08: 'Jetzt der Reaktor. Mittelkonsole, Schalter REACTOR START. Erst die rote Schutzkappe öffnen, dann umlegen.',
  v09: 'Reaktor gezündet. Spüren Sie das? Jetzt lebt er. Das Hilfstriebwerk brauchen wir nicht mehr, schalten Sie die APU ab.',
  v10: 'Gyro-Stabilisator einschalten, Schalter STAB ASSIST auf der Mittelkonsole, und ausrichten lassen.',
  v11: 'Optik und Head-up-Display einschalten. Beide Schalter sind unten an der Mittelkonsole.',
  v12: 'Letzter Schritt vor dem Losgehen: Beinverriegelung lösen. Schalter LEG LOCK, unten an der Mittelkonsole, auf Aus.',
  v13: 'Beine frei. Fünf Meter Stahl, und Sie sind der Kopf. Schubhebel nach vorn, Taste W, und laufen Sie zur ersten Wegmarke, dem grünen Rauch voraus.',
  v14: 'Wegmarke eins erreicht. Drehen mit A und D. Die zweite Wegmarke liegt rechts von Ihnen.',
  v15: 'Wegmarke zwei. Schub auf null, Taste X, und anhalten.',
  v16: 'Testen Sie noch die Nachtsicht auf dem Kameradisplay. Taste N.',
  v17: 'Einweisung abgeschlossen. BB-07 ist einsatzbereit. Viel Glück da draußen, Pilot. Ausbilder Ende.',
};

// the training lines after the walking drill
export const TRAINING_TEXT = {
  t01: 'Gut. Jetzt Ihre Anzeigen. Auf der Scheibe liegt das Holo-HUD: links Navigation und Systeme, rechts Ziel und Waffen. Mit Taste sechs sehen Sie die drei Displays. Klicken Sie ein Display an, um es zu öffnen.',
  t02: 'Das Display ist offen. Oben wechseln Sie die Seiten, unten liegen die Funktionstasten. Mit Escape oder einem Rechtsklick schließen Sie es wieder.',
  t03: 'Weiter zur Waffenausbildung. Overhead-Panel, Taste zwei: Schutzkappe öffnen, Weapons Arm einschalten, dann Main Gun, Missile und das MG.',
  t04: 'Waffen scharf. Laufen Sie zur Schießbahn an Wegmarke drei. Dort stehen ausgemusterte Panzer als Übungsziele.',
  t05: 'Übungsziel eins. Richten Sie den Kopf auf das Ziel, die Kanone folgt Ihrem Blick. Linke Maustaste feuert. Achten Sie auf die Rohrhitze, und denken Sie dran: vorne ist ein Panzer am dicksten.',
  t06: 'Sauber. Das Maschinengewehr, Taste E, ist für weiche Ziele. Nehmen Sie die Munitionskisten bei Ziel zwei unter Feuer.',
  t07: 'Jetzt die Zielerfassung über das Display. Taste M öffnet die Taktikkarte. Klicken Sie Ziel drei an und dann auf Aufschalten.',
  t08: 'Aufgeschaltet. Schließen Sie das Display und drücken Sie F. Rakete los.',
  t09: 'Ziel vier steht hinter der Ruine, kein Sichtkontakt. Dafür haben Sie die Aufklärungsdrohne. Taste Q startet sie in Blickrichtung. Oder schicken Sie sie über die Taktikkarte.',
  t10: 'Drohne in der Luft. Sie kreist über dem Gebiet und markiert alles, was sie sieht. Das Bild sehen Sie im Bordcomputer, Taste sieben, Seite Drohne.',
  t11: 'Ziel vier ist markiert. Wählen Sie es mit Tab oder auf der Karte, schalten Sie auf und feuern Sie. Die Rakete steigt über die Deckung und stößt von oben herab.',
  t12: 'Treffer. Holen Sie die Drohne zurück, Taste Q. Sie landet selbstständig auf Ihrem Rücken und lädt den Akku nach.',
  t13: 'Achtung, Übung! Brand im Torso. Feuerlöschanlage auf der Mittelkonsole, Taste fünf, Schalter Fire Suppression. Schnell!',
  t14: 'Feuer aus. Jetzt Ihre Lanze: Hammer zwei und Hammer drei stoßen zu Ihnen. Taste B heißt folgen, V heißt Position halten, T heißt Ihr Ziel angreifen. Befehlen Sie: folgen.',
  t15: 'Gut. Und jetzt: Position halten, Taste V.',
  t16: 'Zum Schluss: Mit Taste neun sehen Sie Ihren Mech von außen. Mit neun geht es zurück ins Cockpit.',
  t17: 'Jetzt der Bordcomputer. Taste sieben, oder auf dem linken Display auf Computer klicken. Auf der Seite Feuerleitung stellen Sie Zielerfassung, Kanone, Raketen und Drohne ein.',
  t18: 'Schalten Sie die automatische Zielerfassung ein. Der Rechner weist dann selbst das gefährlichste Ziel zu. Sie müssen nur noch feuern.',
  t19: 'Für die Kanone: Feuerart Feuerstoß, Zielhilfe auf Auto. Der Rechner richtet das Rohr selbst auf das zugewiesene Ziel und hält bei fahrenden Zielen vor.',
  t20: 'Übungsziel fünf fährt. Schließen Sie das Display und feuern Sie mit der linken Maustaste. Den Vorhalt übernimmt der Rechner.',
  t21: 'Ziel sechs ist schwer gepanzert. Stellen Sie die Raketen auf Salve zwei. Mit F gehen dann zwei Raketen hintereinander raus.',
  t22: 'Die Drohne kann mehr als kreisen. Stellen Sie im Rechner den Modus auf Begleiten. Dann bleibt sie über Ihnen und meldet alles im Umkreis.',
  t23: 'Jetzt fliegen Sie selbst. Modus Manuell, dann im Bordcomputer die Seite Drohne. W und S für das Tempo, A und D zum Drehen, R und F für die Höhe. Suchen Sie Ziel sieben, weit im Norden.',
  t24: 'Ziel sieben ist markiert, die Auto-Zielerfassung hat es schon zugewiesen. Schließen Sie das Display und feuern Sie. Die Rakete fliegt im Steilflug über die Deckung.',
  t25: 'Durch die Einschläge ist Ihre Frontscheibe verdreckt. Schalten Sie den Scheibenwischer ein: Taste K, oder der Schalter WIPER unten an der Mittelkonsole.',
};

const near = (g, wp, r = 16) => Math.hypot(g.mech.x - wp.x, g.mech.z - wp.z) < r;

/** g is the game: g.sw (switch snapshot), g.sys (systems), g.mech, g.cockpit */
export const STEPS = [
  { id: 'intro', title: 'Einweisung', text: 'Sieh dich mit der Maus im Cockpit um.', voice: 'v01', wait: 7, done: () => true },
  { id: 'batt', title: 'BATT  →  EIN', text: 'Batterie-Hauptschalter, linke Konsole (Schutzkappe). Taste 3 zeigt die Konsole.', voice: 'v02', target: 'batt', done: (g) => g.sw.batt },
  { id: 'apu', title: 'APU  →  START', text: 'Hilfstriebwerk starten und warten, bis APU READY leuchtet.', voice: 'v03', target: 'apu', done: (g) => g.sys.apuReady },
  { id: 'gen', title: 'GEN 1 + GEN 2  →  EIN', text: 'Beide Generatoren auf der linken Konsole einschalten.', voice: 'v04', target: (g) => (g.sw.gen1 ? 'gen2' : 'gen1'), done: (g) => g.sw.gen1 && g.sw.gen2 && g.sys.mainBus },
  { id: 'light', title: 'CABIN LIGHT  →  EIN', text: 'Kabinenlicht, Mittelkonsole unten (Taste 5) oder L.', voice: 'v05', target: 'lights', done: (g) => g.sw.lights },
  { id: 'hyd', title: 'HYD PRESS  →  EIN', text: 'Hydraulikpumpe, Overhead-Panel (Taste 2). Warten bis > 18 MPa.', voice: 'v06', target: 'hydp', done: (g) => g.sys.hyd > 0.7 },
  { id: 'pump', title: 'COOLANT PUMP  →  EIN', text: 'Kühlmittelpumpe, Overhead-Panel.', voice: 'v07', target: 'pump', done: (g) => g.sw.pump },
  { id: 'reactor', title: 'REACTOR START', text: 'Mittelkonsole (Taste 5): Schutzkappe öffnen, Schalter umlegen. Zündung abwarten.', voice: 'v08', target: 'reactor', done: (g) => g.sys.reactorState === 'running' },
  { id: 'apuoff', title: 'APU  →  AUS', text: 'Der Reaktor versorgt jetzt die Generatoren.', voice: 'v09', target: 'apu', done: (g) => !g.sw.apu },
  { id: 'gyro', title: 'STAB ASSIST  →  EIN', text: 'Gyro einschalten und ausrichten lassen (Taste G).', voice: 'v10', target: 'stab', done: (g) => g.sys.gyro >= 1 },
  { id: 'sensors', title: 'OPTICS + HUD  →  EIN', text: 'Kamera-Optik und Head-up-Display, Mittelkonsole unten (O / H).', voice: 'v11', target: (g) => (g.sw.optics ? 'hud' : 'optics'), done: (g) => g.sw.optics && g.sw.hud },
  { id: 'leglock', title: 'LEG LOCK  →  AUS', text: 'Beinverriegelung lösen, Mittelkonsole unten (Taste 5).', voice: 'v12', target: 'legLock', done: (g) => !g.sys.legsLocked },
  { id: 'wp1', title: 'Wegmarke 1 anlaufen', text: 'Taste 1 für den Blick nach vorn. W: Schub vor · S: zurück · grüner Rauch voraus.', voice: 'v13', waypoint: 0, done: (g) => near(g, WAYPOINTS[0]) },
  { id: 'wp2', title: 'Wegmarke 2 anlaufen', text: 'A / D: drehen. Die Marke liegt rechts.', voice: 'v14', waypoint: 1, done: (g) => near(g, WAYPOINTS[1]) },
  { id: 'stop', title: 'Anhalten', text: 'X: Schub auf null.', voice: 'v15', done: (g) => Math.abs(g.mech.speed) < 0.3 && g.mech.throttle === 0 },
  { id: 'nv', title: 'Nachtsicht testen', text: 'Taste N oder Schalter NV, Mittelkonsole unten.', voice: 'v16', target: 'nv', done: (g) => g.sw.nv },
  // --- displays
  { id: 'mfd', title: 'Ein Display öffnen', text: 'Taste 6 zeigt die Displays. Ein Display anklicken öffnet es.', voice: 't01', wait: 4, done: (g) => g.openMfd != null },
  { id: 'mfdclose', title: 'Display schließen', text: 'Oben Seiten, unten Funktionstasten. Esc oder Rechtsklick schließt.', voice: 't02', wait: 4, done: (g) => g.openMfd == null },
  // --- firing range
  {
    id: 'arm',
    title: 'WEAPONS ARM, MAIN GUN, MISSILE, MG → EIN',
    text: 'Overhead-Panel (Taste 2): Schutzkappe öffnen, dann die Waffenschalter.',
    voice: 't03',
    target: (g) => (!g.sw.wpnArm ? 'wpnArm' : !g.sw.gun ? 'gun' : !g.sw.missile ? 'missile' : 'mg'),
    done: (g) => g.sw.wpnArm && g.sw.gun && g.sw.missile && g.sw.mg,
  },
  { id: 'range', title: 'Zur Schießbahn: Wegmarke 3', text: 'Übungsziele (ÜZ) stehen nördlich von WP 3.', voice: 't04', waypoint: 2, start: (g) => g.firingRange.setup(), done: (g) => near(g, WAYPOINTS[2], 25) },
  { id: 'gun', title: 'ÜZ 1 mit der Kanone zerstören', text: 'Kopf aufs Ziel, linke Maustaste. Rohrhitze beachten; das HUD zeigt die Seite, die er dir zeigt.', voice: 't05', done: (g) => g.firingRange.dead(1) },
  { id: 'mgfire', title: 'ÜZ 2 (Munitionskisten) mit dem MG', text: 'E gedrückt halten: das MG ist für weiche Ziele.', voice: 't06', done: (g) => g.firingRange.dead(2) },
  { id: 'map', title: 'Taktikkarte: ÜZ 3 aufschalten', text: 'M öffnet die Karte. ÜZ 3 anklicken, dann AUFSCHALTEN.', voice: 't07', done: (g) => g.firingRange.locked(3) || g.firingRange.dead(3) },
  { id: 'missile', title: 'Rakete auf ÜZ 3', text: 'Display schließen (Esc), dann F.', voice: 't08', done: (g) => g.firingRange.dead(3) },
  // --- drone and top attack
  { id: 'drone', title: 'Aufklärungsdrohne starten', text: 'Q startet sie in Blickrichtung (ÜZ 4 hinter der Ruine). Oder Karte: DROHNE ►, dann Ziel anklicken.', voice: 't09', done: (g) => g.drone.airborne },
  { id: 'dmark', title: 'Die Drohne markiert ÜZ 4', text: 'Bordcomputer (Taste 7), Seite DROHNE: ihr Kamerabild. Sie kreist und markiert, was sie sieht.', voice: 't10', done: (g) => g.firingRange.marked(4) || g.firingRange.dead(4) },
  { id: 'indirect', title: 'ÜZ 4 im Steilangriff', text: 'Tab (oder Karte) weist es zu, F feuert: die Rakete steigt über die Deckung.', voice: 't11', done: (g) => g.firingRange.dead(4) },
  // --- fire-control computer: auto target, the laid gun with lead, salvo, drone modes and flying by hand
  { id: 'comp', title: 'Bordcomputer: FEUERLEITUNG', text: 'Taste 7 (oder linkes Display: COMPUTER ►), Reiter FEUERLEITUNG.', voice: 't17', start: (g) => g.firingRange.setupFireControl(), done: (g) => g.openMfd === 'computer' && g.compPage === 'fc' },
  { id: 'autot', title: 'AUTO-ZIEL einschalten', text: 'FEUERLEITUNG: AUTO-ZIEL. Der Rechner weist das gefährlichste Ziel selbst zu.', voice: 't18', done: (g) => g.fc.autoTarget },
  { id: 'gunfc', title: 'Kanone: FEUERSTOSS, Zielhilfe AUTO', text: 'FEUERLEITUNG: FEUERSTOSS und bei ZIELHILFE AUTO. Das Rohr richtet sich mit Vorhalt.', voice: 't19', done: (g) => g.fc.gunMode === 'burst' && g.fc.gunAim === 'auto' },
  { id: 'mover', title: 'Fahrendes Ziel ÜZ 5', text: 'Computer schließen (Esc), ÜZ 5 ist zugewiesen: linke Maustaste.', voice: 't20', done: (g) => g.firingRange.dead(5) },
  { id: 'salvo', title: 'Salve 2 auf ÜZ 6', text: 'FEUERLEITUNG: SALVE 2 (Taste 7). ÜZ 6 wird automatisch zugewiesen: Esc, dann F.', voice: 't21', done: (g) => g.firingRange.dead(6) },
  { id: 'escort', title: 'Drohne: Modus BEGLEITEN', text: 'Bordcomputer, FEUERLEITUNG oder DROHNE: BEGLEITEN.', voice: 't22', done: (g) => g.drone.d.mode === 'escort' },
  {
    id: 'manual',
    title: 'Drohne von Hand: ÜZ 7 finden',
    text: 'Bordcomputer, Seite DROHNE: MANUELL (START oder Q). W/S Tempo · A/D drehen · R/F Höhe. ÜZ 7 liegt weit im Norden.',
    voice: 't23',
    done: (g) => g.firingRange.marked(7) || g.firingRange.dead(7),
  },
  { id: 'final', title: 'ÜZ 7 bekämpfen', text: 'Auto-Ziel hat es zugewiesen: Computer schließen (Esc), F.', voice: 't24', done: (g) => g.firingRange.dead(7) },
  { id: 'recall', title: 'Drohne zurückrufen', text: 'Q. Sie landet selbstständig und lädt nach.', voice: 't12', done: (g) => !g.drone.airborne || g.drone.state === 'return' || g.drone.state === 'land' },
  // --- the front screen: mud from the range, the wipers clear it
  {
    id: 'wiper',
    title: 'Scheibenwischer: WIPER (K)',
    text: 'Schalter WIPER unten an der Mittelkonsole (Taste 5) oder Taste K.',
    voice: 't25',
    target: 'wiper',
    start: (g) => {
      g.cockpit.splatter(1, -0.3);
      g.cockpit.splatter(1, 0.4);
      g.cockpit.dustGlass(0.06);
    },
    done: (g) => g.sw.wiper && g.cockpit.grimeLevel() < 0.15,
  },
  // --- damage control, lance, outside view
  { id: 'fire', title: 'Brandübung: FIRE SUPPR', text: 'Mittelkonsole (Taste 5), Schalter FIRE SUPPR.', voice: 't13', target: 'firesup', start: (g) => g.startFire('torso', true), done: (g) => !g.fire },
  { id: 'lance', title: 'Lanze: folgen (B)', text: 'B folgen · V Position halten · T dein Ziel angreifen.', voice: 't14', start: (g) => g.spawnTrainingLance(), done: (g) => g.lastLanceOrder === 'follow' },
  { id: 'hold', title: 'Lanze: Position halten (V)', text: 'V.', voice: 't15', done: (g) => g.lastLanceOrder === 'hold' },
  { id: 'ext', title: 'Außenansicht: 9 und zurück', text: 'Taste 9 zeigt den Mech von außen, 9 wieder zurück.', voice: 't16', done: (g) => g.extSeen && !g.external },
  { id: 'end', title: 'Grundausbildung abgeschlossen', text: 'BB-07 ist einsatzbereit.', voice: 'v17', wait: 8, done: () => true },
];

export class Tutorial {
  constructor(game, ui, steps = STEPS, text = { ...VOICE_TEXT, ...TRAINING_TEXT }, title = 'GRUNDAUSBILDUNG') {
    this.g = game;
    this.ui = ui;
    this.steps = steps;
    this.text = text;
    this.title = title;
    this.index = -1;
    this.t = 0;
    this.active = false;
    this.finished = false;
  }

  start() {
    this.active = true;
    this.finished = false;
    this.ui.checklist(this.steps, 0, this.title);
    this.go(0);
  }

  get step() {
    return this.steps[this.index];
  }

  go(i) {
    this.index = i;
    this.t = 0;
    const s = this.steps[i];
    if (!s) {
      this.active = false;
      this.finished = true;
      this.ui.checklist(null);
      this.g.onTutorialDone?.();
      return;
    }
    this.ui.checklist(this.steps, i, this.title);
    if (s.voice) this.g.say(s.voice, this.text[s.voice]);
    this.g.setWaypoint(s.waypoint ?? null);
    s.start?.(this.g);
  }

  targetKey() {
    const s = this.step;
    if (!s || !s.target) return null;
    return typeof s.target === 'function' ? s.target(this.g) : s.target;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const s = this.step;
    const minTime = s.wait ?? 1.2;
    if (this.t > minTime && s.done(this.g)) {
      this.g.sound.beep(1500, 0.05, 0.06);
      this.go(this.index + 1);
    }
  }
}
