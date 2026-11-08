import * as THREE from 'three';
import { WAYPOINTS } from './tutorial.js';

/**
 * The base firing range for the basic training: four old hulls north of WP 3.
 * 1 and 3 stand in the open (gun, missile), 2 is a stack of ammunition crates (MG),
 * 4 hides behind a tall ruin (drone mark, top attack). They never move or shoot.
 */
export class Range {
  constructor(game) {
    this.g = game;
    this.targets = {};
  }

  setup() {
    if (this.targets[1]) return;
    const g = this.g;
    const W = g.world;
    const base = WAYPOINTS[2];
    const eye = new THREE.Vector3(base.x, W.heightAt(base.x, base.z) + 3.95, base.z);
    const free = (x, z, r) => !W.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r);
    const seen = (x, z) => W.lineOfSight(eye, new THREE.Vector3(x, W.heightAt(x, z) + 1.8, z));
    const used = [];
    // a free, visible spot at about this range and bearing (0 = north, + = left)
    const pick = (dist, bearing, spread) => {
      for (let k = 0; k < 120; k++) {
        const a = bearing + (Math.random() - 0.5) * spread * (1 + k / 40);
        const d = dist + (Math.random() - 0.5) * 70;
        const x = base.x - Math.sin(a) * d;
        const z = base.z - Math.cos(a) * d;
        if (free(x, z, 7) && seen(x, z) && used.every(([ux, uz]) => Math.hypot(ux - x, uz - z) > 40)) {
          used.push([x, z]);
          return [x, z];
        }
      }
      const x = base.x - Math.sin(bearing) * dist;
      const z = base.z - Math.cos(bearing) * dist;
      used.push([x, z]);
      return [x, z];
    };
    // behind the tallest ruin out there, as seen from WP 3
    const hidden = () => {
      const ruins = W.colliders
        .filter((c) => c.r >= 5 && (c.h ?? 0) >= 7)
        .map((c) => ({ c, d: Math.hypot(c.x - base.x, c.z - base.z), b: Math.atan2(-(c.x - base.x), -(c.z - base.z)) }))
        .filter((r) => r.d > 220 && r.d < 560 && Math.abs(r.b) < 1.4)
        .sort((a, b) => Math.abs(a.b) - Math.abs(b.b));
      for (const { c } of ruins) {
        const ax = c.x - base.x;
        const az = c.z - base.z;
        const l = Math.hypot(ax, az);
        const x = c.x + (ax / l) * (c.r + 10);
        const z = c.z + (az / l) * (c.r + 10);
        if (free(x, z, 5) && !seen(x, z)) return [x, z];
      }
      return pick(450, 0.9, 0.4);
    };
    const side = (x, z) => Math.atan2(-(base.x - x), -(base.z - z)) + Math.PI / 2; // broadside on
    const make = (n, type, [x, z], opts = {}) => {
      const e = g.enemies.spawn(type, x, z, [base.x, base.z], 0, opts);
      e.frozen = true;
      e.hp = type === 'depot' ? 40 : 50; // one missile is enough, even on the front
      e.label = `ÜZ ${n}`;
      e.training = n;
      this.targets[n] = e;
      return e;
    };
    make(1, 'tank', pick(210, 0.12, 0.5), {});
    this.targets[1].heading = side(this.targets[1].x, this.targets[1].z);
    make(2, 'depot', pick(150, -0.4, 0.4), { model: 'crates' });
    make(3, 'tank', pick(380, -0.15, 0.6));
    make(4, 'tank', hidden());
    for (const e of Object.values(this.targets)) g.enemies.place(e, 1);
  }

  /**
   * The fire-control chapter: ÜZ 5 drives to and fro across the range (lead), ÜZ 6 is a
   * heavy hull that takes a salvo, ÜZ 7 hides far out, only a drone flown by hand finds it.
   */
  setupFireControl() {
    if (this.targets[5]) return;
    const g = this.g;
    const W = g.world;
    const base = WAYPOINTS[2];
    const eye = new THREE.Vector3(base.x, W.heightAt(base.x, base.z) + 3.95, base.z);
    const free = (x, z, r) => !W.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r);
    const seen = (x, z) => W.lineOfSight(eye, new THREE.Vector3(x, W.heightAt(x, z) + 1.8, z));
    const at = (d, a) => [base.x - Math.sin(a) * d, base.z - Math.cos(a) * d];
    const spawn = (n, [x, z], hp) => {
      const e = g.enemies.spawn('tank', x, z, [base.x, base.z], 0, {});
      e.frozen = true;
      e.hp = hp;
      e.label = `ÜZ ${n}`;
      e.training = n;
      this.targets[n] = e;
      g.enemies.place(e, 1);
      return e;
    };
    // a track across the line of fire, about 240 m out, both ends in sight
    let track = null;
    for (let k = 0; k < 60 && !track; k++) {
      const a = (Math.random() - 0.5) * 0.9;
      const d = 210 + Math.random() * 80;
      const [cx, cz] = at(d, a);
      const sx = Math.cos(a);
      const sz = -Math.sin(a);
      const A = [cx - sx * 70, cz - sz * 70];
      const B = [cx + sx * 70, cz + sz * 70];
      let ok = true;
      for (let i = 0; i <= 6 && ok; i++) {
        const x = A[0] + ((B[0] - A[0]) * i) / 6;
        const z = A[1] + ((B[1] - A[1]) * i) / 6;
        ok = free(x, z, 6) && seen(x, z);
      }
      if (ok) track = { A, B };
    }
    track ??= { A: at(240, -0.5), B: at(240, 0.5) };
    this.track = { ...track, dir: 1, t: 0 };
    spawn(5, track.A, 50);
    // heavy: a frontal missile does about 56, two get through
    let p6 = null;
    for (let k = 0; k < 80 && !p6; k++) {
      const p = at(300 + Math.random() * 80, 0.6 + (Math.random() - 0.5) * 0.5);
      if (free(p[0], p[1], 7) && seen(p[0], p[1])) p6 = p;
    }
    spawn(6, p6 ?? at(330, 0.6), 100);
    // far out and out of sight
    let p7 = null;
    for (let k = 0; k < 120 && !p7; k++) {
      const p = at(650 + Math.random() * 250, (Math.random() - 0.5) * 1.2);
      if (free(p[0], p[1], 7) && !seen(p[0], p[1])) p7 = p;
    }
    spawn(7, p7 ?? at(780, 0.2), 50);
  }

  /** the moving target drives back and forth on its track */
  update(dt) {
    const e = this.targets[5];
    const tr = this.track;
    if (!e || !tr || e.state === 'dead') return;
    const len = Math.hypot(tr.B[0] - tr.A[0], tr.B[1] - tr.A[1]);
    tr.t += (dt * 7 * tr.dir) / len;
    if (tr.t > 1 || tr.t < 0) {
      tr.dir = -tr.dir;
      tr.t = Math.max(0, Math.min(1, tr.t));
    }
    e.x = tr.A[0] + (tr.B[0] - tr.A[0]) * tr.t;
    e.z = tr.A[1] + (tr.B[1] - tr.A[1]) * tr.t;
    e.heading = Math.atan2(-(tr.B[0] - tr.A[0]) * tr.dir, -(tr.B[1] - tr.A[1]) * tr.dir);
    e.speed = 7;
    this.g.enemies.place(e, Math.min(1, dt * 4));
  }

  dead(n) {
    const e = this.targets[n];
    return !!e && e.state === 'dead';
  }

  marked(n) {
    const e = this.targets[n];
    return !!e && (e.droneMark ?? 0) > this.g.time;
  }

  locked(n) {
    const e = this.targets[n];
    const ms = this.g.arsenal.w.missiles;
    return !!e && ms.designated === e.id && ms.locked && ms.target === e.id;
  }
}
