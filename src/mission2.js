// Mission 2 "Feuertaufe": arm the weapons, take position behind the hedgehog line
// and hold sector Kilo against two waves of enemy armour.
import { WAYPOINTS } from './tutorial.js';

export const M2_TEXT = {
  m2_00: 'BB-07, Ausbilder hier, ab jetzt ist es ernst. Feindliche Panzerkolonne aus Nordosten, Richtung Sektor Kilo. Machen Sie die Waffen scharf: Overhead-Panel, erst Weapons Arm, dann Main Gun und Missile.',
  m2_01: 'Waffen scharf. Die Kanone folgt Ihrem Blick, Feuer mit der linken Maustaste. Für Raketen halten Sie das Ziel im Visier, bis der Aufschaltton kommt, dann Taste F.',
  m2_02: 'Gehen Sie in Stellung an der Panzersperre, Wegmarke drei, grüner Rauch. Wenn die zurückschießen: in Bewegung bleiben.',
  m2_03: 'Kontakt! Feindliche Panzer, Nordost, Entfernung etwa tausend Meter. Feuer frei!',
  m2_04: 'Ziel vernichtet. Weiter so.',
  m2_05: 'Sie werden getroffen! Bewegung, Pilot, nicht stehen bleiben!',
  m2_06: 'Feuer an Bord! Löschanlage auslösen, Schalter Fire Suppression an der Mittelkonsole.',
  m2_07: 'Achtung, zweite Welle von Osten. Zwei Panzer und ein Schützenpanzer.',
  m2_08: 'Kanone überhitzt! Feuerpause, lassen Sie sie abkühlen.',
  m2_09: 'Kolonne vernichtet. Sektor Kilo ist gehalten. Gute Arbeit, BB-07. Kommen Sie zurück zur Basis.',
  m2_10: 'BB-07, Ihr Mech ist zerstört. Aussteigen! Mission fehlgeschlagen.',
  m2_11: 'Brand gelöscht. Weiterkämpfen.',
};

// spawn points far out in the haze and the rally points they drive to
export const WAVES = {
  1: [
    ['tank', 520, -980, [300, -560]],
    ['tank', 620, -930, [360, -520]],
    ['tank', 430, -1010, [240, -600]],
  ],
  2: [
    ['tank', 1000, -300, [480, -280]],
    ['tank', 1040, -200, [500, -200]],
    ['apc', 980, -380, [460, -360]],
  ],
};

const near = (g, wp, r) => Math.hypot(g.mech.x - wp.x, g.mech.z - wp.z) < r;

export const M2_STEPS = [
  {
    id: 'arm',
    title: 'WEAPONS ARM  →  EIN',
    text: 'Overhead-Panel (Taste 2): Schutzkappe öffnen, WEAPONS ARM umlegen.',
    voice: 'm2_00',
    target: 'wpnArm',
    wait: 2,
    done: (g) => g.sw.wpnArm,
  },
  {
    id: 'guns',
    title: 'MAIN GUN + MISSILE  →  EIN',
    text: 'Gleich daneben auf dem Overhead-Panel.',
    target: (g) => (g.sw.gun ? 'missile' : 'gun'),
    done: (g) => g.sw.gun && g.sw.missile,
  },
  {
    id: 'brief',
    title: 'Waffen-Einweisung',
    text: 'Taste 1 = Blick nach vorn. Linke Maustaste: Kanone (folgt dem Blick). Ziel im Kreis halten bis LOCK, dann F: Rakete.',
    voice: 'm2_01',
    wait: 10,
    done: () => true,
  },
  {
    id: 'wp3',
    title: 'Stellung an WP 3 beziehen',
    text: 'Zur Panzersperre beim grünen Rauch. R schaltet das Radar auf 1000 m.',
    voice: 'm2_02',
    waypoint: 2,
    done: (g) => near(g, WAYPOINTS[2], 35) || g.tutorial.t > 150,
  },
  {
    id: 'wave1',
    title: 'Welle 1: 3 Kampfpanzer (NO)',
    text: 'Feuer frei! In Bewegung bleiben – stehende Ziele treffen sie leichter.',
    voice: 'm2_03',
    start: (g) => g.mission.spawnWave(1),
    done: (g) => g.mission.cleared(1),
  },
  {
    id: 'wave2',
    title: 'Welle 2: 2 Panzer + 1 SPz (O)',
    text: 'Zweite Welle von Osten.',
    voice: 'm2_07',
    wait: 3,
    start: (g) => g.mission.spawnWave(2),
    done: (g) => g.mission.cleared(2),
  },
  { id: 'end', title: 'Sektor Kilo gehalten', text: 'Mission erfüllt.', voice: 'm2_09', wait: 9, done: () => true },
];

/** waves, radio call-outs and the score of one run */
export class Mission2 {
  constructor(game) {
    this.g = game;
    this.waves = {};
    this.lastCall = {};
    this.start = game.time;
    this.kills = 0;
  }

  spawnWave(n) {
    if (this.waves[n]) return;
    this.waves[n] = WAVES[n].map(([type, x, z, goal]) => this.g.enemies.spawn(type, x, z, goal, n));
  }

  cleared(n) {
    return !!this.waves[n] && this.waves[n].every((e) => e.state === 'dead');
  }

  /** radio call-out, at most every `gap` seconds per line and never over another line */
  call(key, gap = 20) {
    const g = this.g;
    if (g.time - (this.lastCall[key] ?? -1e9) < gap) return;
    if (g.time < (g.radioBusyUntil ?? 0)) return;
    this.lastCall[key] = g.time;
    g.say(key, M2_TEXT[key]);
  }
}
