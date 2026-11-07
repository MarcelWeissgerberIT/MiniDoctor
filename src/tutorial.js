// Mission 1: cold-and-dark start-up and walking drill.
// Each step names the control to highlight, the radio line to play and the
// condition that completes it.

export const WAYPOINTS = [
  { x: 6, z: -115, label: 'WP 1' },
  { x: 92, z: -168, label: 'WP 2' },
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
  { id: 'end', title: 'Einweisung abgeschlossen', text: 'BB-07 ist einsatzbereit. Frei bewegen.', voice: 'v17', wait: 8, done: () => true },
];

export class Tutorial {
  constructor(game, ui) {
    this.g = game;
    this.ui = ui;
    this.index = -1;
    this.t = 0;
    this.active = false;
    this.finished = false;
  }

  start() {
    this.active = true;
    this.ui.checklist(STEPS, 0);
    this.go(0);
  }

  get step() {
    return STEPS[this.index];
  }

  go(i) {
    this.index = i;
    this.t = 0;
    const s = STEPS[i];
    if (!s) {
      this.active = false;
      this.finished = true;
      this.ui.checklist(null);
      this.g.onTutorialDone?.();
      return;
    }
    this.ui.checklist(STEPS, i);
    if (s.voice) this.g.radio.say(s.voice, VOICE_TEXT[s.voice]);
    this.g.setWaypoint(s.waypoint ?? null);
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
