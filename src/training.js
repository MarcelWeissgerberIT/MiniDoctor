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
