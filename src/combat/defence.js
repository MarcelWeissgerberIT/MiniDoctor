import * as THREE from 'three';
import { closingOn } from '../logic/combat.js';

// the interceptor charge: fast, flies straight at where the threat will be
const SPEED = 260; // m/s
const ENGAGE = 120; // a guided missile at us inside this range gets a charge
const MIN = 15; // closer than this there is no time left
const RELOAD = 0.45; // s between two charges
const KILL = 0.9; // chance that a charge that meets its missile destroys it
const MARK_LIFE = 1.8; // s the helmet marker stays

const _rel0 = new THREE.Vector3();
const _rel1 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _aim = new THREE.Vector3();

/**
 * The active missile defence, made visible: each charge leaves the shoulder box as a white-hot
 * point with a smoke trail, flies to meet the missile, and bursts there with a flash and a spray
 * of fragments. The helmet display rings the spot ("ABGEFANGEN") for a moment, so the pilot sees
 * what happened even when it was over in a quarter of a second.
 */
export class Defence {
  constructor(game) {
    this.g = game;
    this.flying = [];
    this.marks = []; // { p, t, ok } for the helmet display and the threat ring
    this.coreGeo = new THREE.SphereGeometry(0.22, 8, 6);
    this.haloGeo = new THREE.SphereGeometry(0.75, 10, 8);
    const add = {
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    };
    this.coreMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(12, 10, 7),
      ...add,
    });
    this.haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.2, 1.6, 0.5),
      opacity: 0.55,
      ...add,
    });
  }

  reset() {
    for (const c of this.flying) this.g.world.scene.remove(c.mesh);
    this.flying = [];
    this.marks = [];
  }

  /** look for something to shoot down, then fly the charges already on their way */
  update(dt) {
    const g = this.g;
    for (let i = this.marks.length - 1; i >= 0; i--) if ((this.marks[i].t += dt) > MARK_LIFE) this.marks.splice(i, 1);
    this.fly(dt);
    const a = g.aps;
    if (!a) return;
    a.cool = Math.max(0, a.cool - dt);
    if (a.cool > 0 || !g.apsOn() || g.mission?.ended) return;
    const pc = g.playerTarget.center(new THREE.Vector3());
    // guided missiles at us (one charge each until it misses)
    let best = null;
    let bestD = 1e9;
    for (const m of g.enemies.atgms) {
      if (m.tgt !== g.playerTarget || m.engaged) continue;
      const d = m.p.distanceTo(pc);
      if (d < MIN || d > ENGAGE) continue;
      // one that lost its guidance in the smoke only matters if it still flies at us
      if (m.lost && closingOn(m.p, m.v, pc, 4, 1) < 0) continue;
      if (d < bestD) ((best = m), (bestD = d));
    }
    if (best) {
      const m = best;
      return this.launch(m, {
        alive: () => g.enemies.atgms.includes(m),
        kill: () => g.enemies.killATGM(m, false, false),
        release: () => (m.engaged = null),
      });
    }
    // helicopter rockets that will strike us in the next moment
    const sh = g.enemies.shells;
    for (let i = sh.length - 1; i >= 0; i--) {
      const s = sh[i];
      if (s.type !== 'heli' || s.engaged || s.p.distanceTo(pc) < 25) continue;
      if (closingOn(s.p, s.v, pc, 4.5, 0.65) < 0) continue;
      return this.launch(s, {
        alive: () => sh.includes(s),
        kill: () => {
          const k = sh.indexOf(s);
          if (k >= 0) sh.splice(k, 1);
        },
        release: () => (s.engaged = null),
      });
    }
  }

  /** a charge leaves the box on the side facing the threat */
  launch(threat, api) {
    const g = this.g;
    const a = g.aps;
    a.cool = RELOAD;
    a.left--;
    const side = g.mechObj.worldToLocal(threat.p.clone()).x >= 0 ? 1 : -1;
    const p = g.mechObj.localToWorld(new THREE.Vector3(0.9 * side, 1.4, -0.4));
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.coreGeo, this.coreMat));
    mesh.add(new THREE.Mesh(this.haloGeo, this.haloMat));
    mesh.position.copy(p);
    g.world.scene.add(mesh);
    // thrown out sideways and up first, then it swings onto the threat: a curved white streak
    // the pilot sees come in from the side (a straight one would hide behind its own burst)
    const out = new THREE.Vector3(side, 0, 0).transformDirection(g.mechObj.matrixWorld);
    const v = threat.p.clone().sub(p).normalize().multiplyScalar(0.55).addScaledVector(out, 0.65).add(new THREE.Vector3(0, 0.4, 0)).setLength(SPEED * 0.8);
    const c = {
      p,
      v,
      threat,
      api,
      mesh,
      age: 0,
      trail: 0,
      last: p.clone(),
      hit: Math.random() < KILL,
    };
    threat.engaged = c;
    this.flying.push(c);
    const fx = g.world.effects;
    fx.muzzle(p.x, p.y, p.z, 1.8);
    fx.puff(p.x, p.y, p.z, 1.2, 2.5, 0.35);
    g.sound.one('gun_shot', 0.55, 1.6);
    if (a.left === 0) setTimeout(() => g.hmd.notify('ABWEHR LEER', '#ff5a48', 2.4), 900);
  }

  fly(dt) {
    const g = this.g;
    const fx = g.world.effects;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const c = this.flying[i];
      const t = c.threat;
      c.age += dt;
      if (!c.api.alive() || c.age > 1.5) {
        // its missile struck or blew up on something else first: the charge goes off in the air
        this.done(i, c, false, true);
        continue;
      }
      // fly to where the threat will be when we get there
      _d.subVectors(t.p, c.p);
      const tgo = _d.length() / (SPEED + t.v.length());
      _aim.copy(t.p).addScaledVector(t.v, tgo).sub(c.p).setLength(SPEED);
      c.v.lerp(_aim, Math.min(1, dt * 11)).setLength(SPEED);
      // where the two meet: closest approach of the relative motion over this frame
      _rel0.subVectors(c.p, t.p);
      c.p.addScaledVector(c.v, dt);
      _rel1.subVectors(c.p, t.p).addScaledVector(t.v, -dt); // the threat moves on after us
      const seg = _d.subVectors(_rel1, _rel0);
      const k = Math.max(0, Math.min(1, -_rel0.dot(seg) / (seg.lengthSq() || 1)));
      const miss = _rel0.addScaledVector(seg, k).length();
      c.mesh.position.copy(c.p);
      // white smoke behind it, so the path stays in the air for a moment
      const L = c.p.distanceTo(c.last);
      c.trail += L;
      while (c.trail > 1.6) {
        c.trail -= 1.6;
        const f = Math.max(0, 1 - c.trail / (L || 1));
        fx.puff(c.last.x + (c.p.x - c.last.x) * f, c.last.y + (c.p.y - c.last.y) * f, c.last.z + (c.p.z - c.last.z) * f, 0.9, 2.2 + Math.random() * 0.8, 0.22, 0.15);
      }
      c.last.copy(c.p);
      if (miss < 3 || _rel1.length() < 2) {
        c.p.copy(t.p);
        this.done(i, c, c.hit, false);
      }
    }
  }

  /** the charge bursts: the missile with it, or (one in ten) it flies on through the smoke */
  done(i, c, kill, stray) {
    const g = this.g;
    this.flying.splice(i, 1);
    g.world.scene.remove(c.mesh);
    const fx = g.world.effects;
    const p = c.p;
    if (stray) {
      fx.interceptBurst(p.x, p.y, p.z, 0.5);
      return;
    }
    const a = g.aps;
    if (kill) {
      c.api.kill();
      fx.interceptBurst(p.x, p.y, p.z, 1);
      g.explosionSound(p, 0.7);
      g.stats.intercepts = (g.stats.intercepts ?? 0) + 1;
      g.hmd.notify(`ABWEHR: ABGEFANGEN · ${a.left}/${a.max}`, '#a6ffb8', 1.8);
      g.sound.beep(1700, 0.05, 0.06, 0.12);
      g.sound.beep(2300, 0.07, 0.06, 0.2);
    } else {
      c.api.release();
      fx.interceptBurst(p.x, p.y, p.z, 0.45);
      g.explosionSound(p, 0.35);
      g.hmd.notify(`ABWEHR: VERFEHLT · ${a.left}/${a.max}`, '#ffc15e', 1.6);
    }
    this.marks.push({ p: p.clone(), t: 0, ok: kill });
  }
}
