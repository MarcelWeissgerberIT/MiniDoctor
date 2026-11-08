// The mission catalogue: definitions (briefing, start, lance, waves, checklist steps,
// radio lines) and the runtime that spawns waves and keeps score.
import { Vector3 } from 'three';
import { WAYPOINTS } from './tutorial.js';
import { ENEMY_TYPES } from './logic/combat.js';

const near = (g, wp, r) => Math.hypot(g.mech.x - wp.x, g.mech.z - wp.z) < r;
const wp = (label) => WAYPOINTS.find((w) => w.label === label);

/* ------------------------------------------------------------- radio */

export const MISSION_TEXT = {
  // mission 2
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
  // mission 3
  m3_00: 'BB-07, ab heute führen Sie eine Lanze. Hammer zwei und Hammer drei stehen neben Ihnen bereit, die Waffen sind scharf.',
  m3_01: 'Ihre Flügelmänner hören auf drei Befehle. Taste B: folgen. Taste V: Position halten. Taste T: Ihr Ziel angreifen. Befehlen Sie jetzt folgen und führen Sie die Lanze zur Wegmarke drei.',
  m3_02: 'Gut. Lassen Sie die Lanze hier Position halten, Taste V. Feindkräfte aus Nordwesten im Anmarsch.',
  m3_03: 'Kontakt Nordwest! Vier Fahrzeuge. Lanze, Feuer frei!',
  m3_04: 'Zweite Welle, fünf Fahrzeuge aus Norden. Halten Sie die Linie!',
  m3_05: 'Angriff abgewehrt. Gute Führung, Lanzenführer. Bringen Sie Ihre Leute nach Hause.',
  // mission 4
  m4_00: 'Lanze Hammer, die Aufklärung hat ein feindliches Nachschubdepot im Nordosten gefunden, etwa siebenhundert Meter. Treibstoff, Generatoren, Munition. Das legen wir in Schutt und Asche.',
  m4_01: 'Das Depot wird von Panzern bewacht. Nehmen Sie Ihre Flügelmänner mit, Taste B, und rücken Sie zur Wegmarke vor.',
  m4_02: 'Depot in Sicht. Zerstören Sie alle vier Depotziele. Raketen wirken gut gegen die Treibstofftanks.',
  m4_03: 'Achtung, feindliche Verstärkung aus Norden, zwei Kampfpanzer!',
  m4_04: 'Depot zerstört! Sauber gemacht, Hammer. Rückzug zur Basis.',
  // mission 5
  m5_00: 'BB-07, diesmal allein und leise. In den Ruinen im Westen stehen feindliche Fahrzeuge. Markieren Sie vier davon mit dem Raketensucher: Ziel im Visier halten, bis LOCK kommt.',
  m5_01: 'Kommen Sie nicht näher als dreihundert Meter, sonst werden Sie entdeckt. Feuer nur zur Selbstverteidigung.',
  m5_02: 'Ziel markiert. Weiter so.',
  m5_03: 'Sie wurden entdeckt! Absetzen oder kämpfen, Ihre Entscheidung.',
  m5_04: 'Alle Ziele markiert. Die Artillerie übernimmt. Kehren Sie zur Basis zurück.',
  m5_05: 'Willkommen zurück, Spähtrupp. Saubere Arbeit.',
  // wingmen
  w2_follow: 'Hammer zwei, verstanden, folge Ihnen.',
  w2_hold: 'Hammer zwei, halte Position.',
  w2_attack: 'Hammer zwei, greife Ihr Ziel an.',
  w2_contact: 'Hammer zwei, Kontakt. Eröffne das Feuer.',
  w2_kill: 'Hammer zwei, Ziel zerstört.',
  w2_hit: 'Hammer zwei, ich werde getroffen!',
  w2_down: 'Hammer zwei ist raus! Mech verloren!',
  w2_ff: 'Hammer zwei, Vorsicht, Eigenbeschuss!',
  w3_follow: 'Hammer drei, verstanden, folge Ihnen.',
  w3_hold: 'Hammer drei, halte Position.',
  w3_attack: 'Hammer drei, greife Ihr Ziel an.',
  w3_contact: 'Hammer drei, Feindkontakt. Feuer frei.',
  w3_kill: 'Hammer drei, Abschuss bestätigt.',
  w3_hit: 'Hammer drei, ich habe Treffer abbekommen!',
  w3_down: 'Hammer drei, Mech verloren, ich steige aus!',
  w3_ff: 'Hammer drei, Achtung, Sie schießen auf mich!',
};
export const VOICE_KEYS = Object.keys(MISSION_TEXT);

/* ------------------------------------------------------------- steps */

const M2_STEPS = [
  { id: 'arm', title: 'WEAPONS ARM  →  EIN', text: 'Overhead-Panel (Taste 2): Schutzkappe öffnen, WEAPONS ARM umlegen.', voice: 'm2_00', target: 'wpnArm', wait: 2, done: (g) => g.sw.wpnArm },
  { id: 'guns', title: 'MAIN GUN + MISSILE  →  EIN', text: 'Gleich daneben auf dem Overhead-Panel.', target: (g) => (g.sw.gun ? 'missile' : 'gun'), done: (g) => g.sw.gun && g.sw.missile },
  { id: 'brief', title: 'Waffen-Einweisung', text: 'Taste 1 = Blick nach vorn. Linke Maustaste: Kanone (folgt dem Blick). Ziel im Kreis halten bis LOCK, dann F: Rakete.', voice: 'm2_01', wait: 10, done: () => true },
  { id: 'wp3', title: 'Stellung an WP 3 beziehen', text: 'Zur Panzersperre beim grünen Rauch. R schaltet das Radar auf 1000 m.', voice: 'm2_02', waypoint: 2, done: (g) => near(g, wp('WP 3'), 35) || g.tutorial.t > 150 },
  { id: 'wave1', title: 'Welle 1: 3 Kampfpanzer (NO)', text: 'Feuer frei! In Bewegung bleiben – stehende Ziele treffen sie leichter.', voice: 'm2_03', start: (g) => g.mission.spawnWave(1), done: (g) => g.mission.cleared(1) },
  { id: 'wave2', title: 'Welle 2: 2 Panzer + 1 SPz (O)', text: 'Zweite Welle von Osten.', voice: 'm2_07', wait: 3, start: (g) => g.mission.spawnWave(2), done: (g) => g.mission.cleared(2) },
  { id: 'end', title: 'Sektor Kilo gehalten', text: 'Mission erfüllt.', voice: 'm2_09', wait: 9, start: (g) => g.mission.finish(), done: () => true },
];

const M3_STEPS = [
  { id: 'intro', title: 'Lanze übernehmen', text: 'Hammer 2 und Hammer 3 stehen links und rechts neben dir (grüne Markierung).', voice: 'm3_00', wait: 8, done: () => true },
  { id: 'follow', title: 'FOLGEN (B) · zu WP 3', text: 'Taste B: die Lanze folgt dir. Lauf zur Wegmarke 3 beim grünen Rauch.', voice: 'm3_01', waypoint: 2, done: (g) => near(g, wp('WP 3'), 40) },
  { id: 'hold', title: 'POSITION HALTEN (V)', text: 'Taste V: die Flügelmänner bleiben, wo sie sind.', voice: 'm3_02', wait: 2, done: (g) => g.allies.alive().some((w) => w.order === 'hold') || g.tutorial.t > 25 },
  { id: 'wave1', title: 'Welle 1: 4 Fahrzeuge (NW)', text: 'T: Flügelmänner auf dein aufgeschaltetes Ziel ansetzen.', voice: 'm3_03', start: (g) => g.mission.spawnWave(1), done: (g) => g.mission.cleared(1) },
  { id: 'wave2', title: 'Welle 2: 5 Fahrzeuge (N)', text: 'Halte die Linie. B holt die Lanze wieder zu dir.', voice: 'm3_04', wait: 3, start: (g) => g.mission.spawnWave(2), done: (g) => g.mission.cleared(2) },
  { id: 'end', title: 'Angriff abgewehrt', text: 'Mission erfüllt.', voice: 'm3_05', wait: 8, start: (g) => g.mission.finish(), done: () => true },
];

const M4_STEPS = [
  { id: 'intro', title: 'Einsatzbefehl Depot', text: 'Feindliches Nachschubdepot ca. 700 m Nordost.', voice: 'm4_00', wait: 10, start: (g) => g.mission.setupDepot(), done: () => true },
  { id: 'advance', title: 'Mit der Lanze zu WP 4', text: 'B: Flügelmänner folgen. Radar mit R auf 1000 m.', voice: 'm4_01', waypoint: 3, done: (g) => near(g, wp('WP 4'), 70) },
  { id: 'depot', title: 'Depot zerstören (4 Ziele)', text: 'TREIB = Treibstoff, GEN = Generator, MUN = Munition. Raketen (F) wirken gut.', voice: 'm4_02', done: (g) => g.mission.cleared('depot') },
  { id: 'end', title: 'Depot zerstört', text: 'Mission erfüllt.', voice: 'm4_04', wait: 8, start: (g) => g.mission.finish(), done: () => true },
];

const M5_STEPS = [
  { id: 'intro', title: 'Spähtrupp West', text: 'Allein und leise. Ruinen im Westen.', voice: 'm5_00', wait: 11, start: (g) => g.mission.setupRecon(), done: () => true },
  { id: 'mark', title: 'Vier Fahrzeuge markieren', text: 'Ziel im gestrichelten Kreis halten bis LOCK = markiert. Nicht näher als 300 m.', voice: 'm5_01', done: (g) => g.mission.marked >= 4 },
  { id: 'back', title: 'Zurück zur Basis', text: 'Artillerie schlägt auf die markierten Ziele ein. Zur Wegmarke BASIS.', voice: 'm5_04', waypoint: 4, start: (g) => g.mission.artillery(), done: (g) => near(g, wp('BASIS'), 45) },
  { id: 'end', title: 'Aufklärung abgeschlossen', text: 'Mission erfüllt.', voice: 'm5_05', wait: 6, start: (g) => g.mission.finish(), done: () => true },
];

/* ------------------------------------------------------------- catalogue */

export const MISSIONS = [
  {
    id: 'm1',
    num: 1,
    name: 'Kalt & dunkel',
    tag: 'EINWEISUNG',
    diff: 1,
    lance: 0,
    desc: 'BB-07 steht abgeschaltet an Rampe drei. Steig über die Leiter ein, fahr den Mech nach Checkliste hoch und bring ihn zum Laufen.',
    kind: 'tutorial',
  },
  {
    id: 'm2',
    num: 2,
    name: 'Feuertaufe',
    tag: 'VERTEIDIGUNG',
    diff: 2,
    lance: 0,
    desc: 'Eine Panzerkolonne rollt auf Sektor Kilo zu. Waffen scharf machen, an der Panzersperre Stellung beziehen und zwei Angriffswellen abwehren.',
    title: 'GEFECHT · FEUERTAUFE',
    armed: false,
    steps: M2_STEPS,
    total: 6,
    waves: {
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
    },
    comms: 'HQ: BB-07, Feindkolonne im Anmarsch auf Sektor Kilo.',
    winText: 'Sektor Kilo ist gehalten.',
  },
  {
    id: 'm3',
    num: 3,
    name: 'Schulter an Schulter',
    tag: 'LANZE · VERTEIDIGUNG',
    diff: 2,
    lance: 2,
    desc: 'Deine erste Lanze: Hammer 2 und Hammer 3 kämpfen an deiner Seite. Befiehl Folgen, Halten und Angreifen und halte die Panzersperre gegen zwei Wellen.',
    title: 'LANZE · SCHULTER AN SCHULTER',
    armed: true,
    allies: ['h2', 'h3'],
    steps: M3_STEPS,
    total: 9,
    waves: {
      1: [
        ['tank', -420, -980, [-60, -560]],
        ['tank', -340, -1020, [0, -600]],
        ['tank', -500, -940, [-120, -540]],
        ['apc', -380, -960, [-40, -580]],
      ],
      2: [
        ['tank', 100, -1150, [120, -560]],
        ['tank', 200, -1120, [200, -540]],
        ['tank', 0, -1100, [60, -580]],
        ['apc', 150, -1180, [160, -600]],
        ['apc', 60, -1160, [100, -620]],
      ],
    },
    comms: 'HQ: Lanze Hammer, Sektor Kilo halten.',
    winText: 'Die Linie hat gehalten.',
  },
  {
    id: 'm4',
    num: 4,
    name: 'Depotschlag',
    tag: 'LANZE · ANGRIFF',
    diff: 3,
    lance: 2,
    desc: 'Ein feindliches Nachschubdepot liegt 700 m nordöstlich. Rück mit deiner Lanze vor, schalte die Wachen aus und zerstöre Treibstoff, Generatoren und Munition.',
    title: 'ANGRIFF · DEPOTSCHLAG',
    armed: true,
    allies: ['h2', 'h3'],
    steps: M4_STEPS,
    total: 9,
    depot: { x: 430, z: -560 },
    waves: {
      reinforce: [
        ['tank', 450, -1120, [430, -640]],
        ['tank', 380, -1140, [400, -660]],
      ],
    },
    comms: 'HQ: Lanze Hammer, Ziel ist das Depot Nordost.',
    winText: 'Das Depot brennt.',
  },
  {
    id: 'm5',
    num: 5,
    name: 'Spähtrupp',
    tag: 'AUFKLÄRUNG',
    diff: 2,
    lance: 0,
    desc: 'Allein in die Ruinen im Westen: vier feindliche Fahrzeuge mit dem Raketensucher markieren, ohne entdeckt zu werden. Den Rest erledigt die Artillerie.',
    title: 'AUFKLÄRUNG · SPÄHTRUPP',
    armed: true,
    steps: M5_STEPS,
    total: 5,
    recon: { x: -540, z: -300, count: 5, minBase: 430 },
    comms: 'HQ: BB-07, Funkstille ab jetzt.',
    winText: 'Alle Ziele markiert und vernichtet.',
  },
];

/* ------------------------------------------------------------- runtime */

/** waves, objectives, radio call-outs and the score of one run */
export class Mission {
  constructor(game, def) {
    this.g = game;
    this.def = def;
    this.waves = {};
    this.lastCall = {};
    this.marked = 0;
    this.detected = false;
    this.reinforced = false;
  }

  /** objective done: what is left of the enemy breaks off */
  finish() {
    this.ended = true;
  }

  spawnWave(n) {
    if (this.waves[n] || !this.def.waves?.[n]) return;
    this.waves[n] = this.def.waves[n].map(([type, x, z, goal]) => this.g.enemies.spawn(type, x, z, goal, n));
  }

  cleared(n) {
    return !!this.waves[n] && this.waves[n].every((e) => e.state === 'dead');
  }

  /** radio call-out, at most every `gap` seconds per line and never over another line */
  call(key, gap = 20) {
    const g = this.g;
    if (g.time - (this.lastCall[key] ?? -1e9) < gap) return false;
    if (g.time < (g.radioBusyUntil ?? 0)) return false;
    this.lastCall[key] = g.time;
    g.say(key, MISSION_TEXT[key]);
    return true;
  }

  /** a free patch of ground near (x, z): no obstacles within `clear` metres */
  freeSpot(x, z, clear) {
    const cols = this.g.world.colliders;
    for (let r = 0; r < 300; r += 8) {
      for (let a = 0; a < Math.PI * 2; a += 0.5) {
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (cols.every((c) => Math.hypot(c.x - px, c.z - pz) > c.r + clear)) return [px, pz];
        if (r === 0) break;
      }
    }
    return [x, z];
  }

  /** depot: four targets around a free spot, four guards, reinforcements later */
  setupDepot() {
    const d = this.def.depot;
    const [cx, cz] = this.freeSpot(d.x, d.z, 22);
    this.depotAt = [cx, cz];
    const E = this.g.enemies;
    const parts = [
      ['drums', -7, -5],
      ['generator', 6, -6],
      ['crates', -6, 7],
      ['drums', 8, 6],
    ];
    this.waves.depot = parts.map(([model, dx, dz]) => E.spawn('depot', cx + dx, cz + dz, [cx + dx, cz + dz], 'depot', { model, heading: Math.random() * 6 }));
    const guards = [
      ['tank', cx - 30, cz + 25],
      ['tank', cx + 35, cz - 20],
      ['apc', cx + 10, cz + 40],
    ];
    this.waves.guard = guards.map(([type, x, z]) => E.spawn(type, x, z, [x, z], 'guard', { heading: Math.atan2(-(0 - x), -(0 - z)) }));
  }

  /** recon: vehicles parked next to ruins in the west, with a short detection range */
  setupRecon() {
    const r = this.def.recon;
    // far enough from the base that the start is not already inside their detection range
    const ok = (x, z) => Math.hypot(x, z) > r.minBase;
    const ruins = this.g.world.colliders.filter((c) => c.r > 3 && ok(c.x, c.z) && Math.hypot(c.x - r.x, c.z - r.z) < 220);
    const spots = [];
    for (const c of ruins) {
      if (spots.length >= r.count) break;
      const [x, z] = this.freeSpot(c.x + c.r + 8, c.z, 5);
      if (ok(x, z) && spots.every((s) => Math.hypot(s[0] - x, s[1] - z) > 60)) spots.push([x, z]);
    }
    for (let k = 0; spots.length < r.count && k < 200; k++) {
      const [x, z] = this.freeSpot(r.x + (Math.random() - 0.5) * 280, r.z + (Math.random() - 0.5) * 280, 6);
      if (ok(x, z) && spots.every((s) => Math.hypot(s[0] - x, s[1] - z) > 60)) spots.push([x, z]);
    }
    const types = ['tank', 'apc', 'tank', 'apc', 'tank'];
    this.waves.recon = spots.map(([x, z], i) => this.g.enemies.spawn(types[i % types.length], x, z, [x, z], 'recon', { engage: 280, heading: Math.random() * 6 }));
  }

  /** recon: the seeker locked a vehicle */
  mark(e) {
    if (e.marked || this.def.id !== 'm5') return;
    e.marked = true;
    this.marked++;
    this.g.hmd.notify(`ZIEL MARKIERT ${this.marked}/4`, '#a6ffb8', 2);
    if (this.marked < 4) this.call('m5_02', 3);
  }

  /** recon payoff: the guns fall on everything that was marked */
  artillery() {
    const g = this.g;
    const targets = (this.waves.recon || []).filter((e) => e.marked && e.state !== 'dead');
    targets.forEach((e, i) => {
      for (let k = 0; k < 3; k++) {
        setTimeout(() => {
          if (!g.mission || g.mission !== this) return;
          const x = e.x + (Math.random() - 0.5) * (k === 1 ? 2 : 16);
          const z = e.z + (Math.random() - 0.5) * (k === 1 ? 2 : 16);
          g.world.effects.explosion(x, g.world.heightAt(x, z) + 1, z, 9);
          g.explosionSound(new Vector3(x, g.world.heightAt(x, z), z), 1.1);
          if (k === 1 && e.state !== 'dead') g.enemies.damage(e, 999);
        }, 4000 + i * 1300 + k * 450);
      }
    });
  }

  /** per frame: reinforcements, detection */
  update() {
    if (this.def.id === 'm4' && !this.reinforced && this.waves.depot && this.waves.depot.some((e) => e.state === 'dead')) {
      this.reinforced = true;
      this.spawnWave('reinforce');
      setTimeout(() => this.call('m4_03', 0), 1500);
    }
    if (this.def.id === 'm5' && !this.detected && (this.waves.recon || []).some((e) => e.state === 'engage' || e.hp < ENEMY_TYPES[e.type].hp)) {
      this.detected = true;
      for (const e of this.waves.recon) e.engage = undefined; // the whole group is alerted
      this.call('m5_03', 0);
    }
  }
}
