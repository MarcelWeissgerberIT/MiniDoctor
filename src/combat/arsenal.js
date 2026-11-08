import * as THREE from 'three';
import { GUN, MISSILE, createWeapons, stepWeapons, fireGun, stepLock, fireMissile, steer, segmentHitsSphere } from '../logic/combat.js';

// hard points relative to the pilot's eye (mech body frame, -Z forward)
export const MUZZLE = new THREE.Vector3(1.35, -0.95, -2.2); // 30 mm autocannon on the right arm
const POD = new THREE.Vector3(-1.15, 0.65, 0.2); // missile pod on the left shoulder

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/**
 * The player's weapons out in the world: autocannon rounds with tracers, guided
 * missiles with smoke trails, impacts and the damage they do.
 */
export class Arsenal {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.fx = game.world.effects;
    this.w = createWeapons();
    this.rounds = [];
    this.missiles = [];
    const geo = new THREE.BoxGeometry(0.14, 0.14, 1);
    geo.translate(0, 0, 0.5);
    this.tracers = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.4, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      96,
    );
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.world.scene.add(this.tracers);
    // missile: grey body, fins, bright motor glow
    this.missileBody = new THREE.CylinderGeometry(0.09, 0.09, 1.2, 10);
    this.missileBody.rotateX(Math.PI / 2);
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0x8a8f86, metalness: 0.6, roughness: 0.5 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 5, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glowGeo = new THREE.SphereGeometry(0.32, 10, 8);
  }

  reset() {
    this.w = createWeapons();
    this.rounds = [];
    for (const m of this.missiles) this.world.scene.remove(m.mesh);
    this.missiles = [];
    this.tracers.count = 0;
  }

  /** where the line of sight meets an enemy, a building or the ground */
  aimPoint(origin, dir, out = new THREE.Vector3()) {
    const far = 2400;
    let best = far;
    _a.copy(origin).addScaledVector(dir, far);
    for (const e of this.g.enemies.list) {
      const c = this.g.enemies.center(e, _c);
      const t = segmentHitsSphere(origin.toArray(), _a.toArray(), c.toArray(), e.radius);
      if (t >= 0 && t * far < best) best = t * far;
    }
    // march the terrain coarse, then refine
    let prev = 0;
    for (let d = 10; d < best; d += 10) {
      const y = origin.y + dir.y * d;
      if (y < this.world.heightAt(origin.x + dir.x * d, origin.z + dir.z * d)) {
        let lo = prev;
        let hi = d;
        for (let k = 0; k < 8; k++) {
          const mid = (lo + hi) / 2;
          if (origin.y + dir.y * mid < this.world.heightAt(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        best = hi;
        break;
      }
      prev = d;
    }
    return out.copy(origin).addScaledVector(dir, best);
  }

  /**
   * ctx: { live: {gun, missile}, trigger, launch, inLimits, origin, dir, mechObj }
   */
  update(dt, ctx) {
    const w = this.w;
    stepWeapons(w, dt);
    // lock-on: the enemy closest to the line of sight inside the seeker cone
    const cands = [];
    for (const e of this.g.enemies.alive()) {
      const c = this.g.enemies.center(e, _c).sub(ctx.origin);
      const dist = c.length();
      cands.push({ id: e.id, angle: c.divideScalar(dist).angleTo(ctx.dir), dist });
    }
    stepLock(w, cands, dt, ctx.live.missile);

    if (ctx.trigger && ctx.inLimits) {
      const wasHot = w.gun.overheated;
      if (fireGun(w, ctx.live.gun)) this.shoot(ctx);
      if (w.gun.overheated && !wasHot) this.g.onGunOverheat?.();
    }
    if (ctx.launch) {
      const m = fireMissile(w, ctx.live.missile);
      if (m) this.launch(m.target, ctx);
      else if (ctx.live.missile) this.g.sound.beep(300, 0.12, 0.06);
    }
    this.updateRounds(dt);
    this.updateMissiles(dt);
  }

  shoot(ctx) {
    const muzzle = ctx.mechObj.localToWorld(MUZZLE.clone());
    const aim = this.aimPoint(ctx.origin, ctx.dir);
    const dir = aim.sub(muzzle).normalize();
    // dispersion
    dir.x += (Math.random() - 0.5) * 2 * GUN.spread;
    dir.y += (Math.random() - 0.5) * 2 * GUN.spread;
    dir.z += (Math.random() - 0.5) * 2 * GUN.spread;
    dir.normalize();
    this.rounds.push({ p: muzzle.clone(), v: dir.clone().multiplyScalar(GUN.speed), life: 2.4, prev: muzzle.clone() });
    const f = muzzle.clone().addScaledVector(dir, 1.4);
    this.fx.muzzle(f.x, f.y, f.z, 2.4);
    this.fx.blastLight(f.x, f.y, f.z, 120, 0.07);
    this.g.onGunFired?.();
  }

  updateRounds(dt) {
    const enemies = this.g.enemies;
    let n = 0;
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i];
      r.prev.copy(r.p);
      r.p.addScaledVector(r.v, dt);
      r.life -= dt;
      const p0 = r.prev.toArray();
      const p1 = r.p.toArray();
      let done = false;
      // vehicles (wrecks stop rounds too, but take no damage)
      for (const e of enemies.list) {
        const c = enemies.center(e, _c);
        const t = segmentHitsSphere(p0, p1, c.toArray(), e.radius * 0.9);
        if (t < 0) continue;
        _a.copy(r.prev).lerp(r.p, t);
        this.fx.impact(_a.x, _a.y, _a.z, 'metal', 1.2);
        if (e.state !== 'dead') {
          this.w.gun.hits++;
          enemies.damage(e, GUN.damage);
        }
        done = true;
        break;
      }
      // our own lance: rounds stop on them (and they complain)
      if (!done) {
        for (const w of this.g.allies.list) {
          if (w.dead) continue;
          const t = segmentHitsSphere(p0, p1, this.g.allies.center(w, _c).toArray(), 2.2);
          if (t < 0) continue;
          _a.copy(r.prev).lerp(r.p, t);
          this.fx.impact(_a.x, _a.y, _a.z, 'metal', 1);
          this.g.allies.damage(w, 2, { friendly: true });
          done = true;
          break;
        }
      }
      // the ground
      if (!done) {
        const h = this.world.heightAt(r.p.x, r.p.z);
        if (r.p.y < h) {
          this.fx.impact(r.p.x, h, r.p.z, 'ground', 1);
          done = true;
        }
      }
      // buildings and obstacles (cylinders)
      if (!done) {
        for (const c of this.world.colliders) {
          const dx = r.p.x - c.x;
          const dz = r.p.z - c.z;
          if (dx * dx + dz * dz < c.r * c.r && r.p.y < this.world.heightAt(c.x, c.z) + Math.min(14, c.r * 2.5)) {
            this.fx.impact(r.p.x, r.p.y, r.p.z, 'ground', 0.8);
            done = true;
            break;
          }
        }
      }
      if (done || r.life <= 0) {
        this.rounds.splice(i, 1);
        continue;
      }
      if (n < this.tracers.instanceMatrix.count) {
        const len = Math.min(14, r.prev.distanceTo(r.p) * 0.9 + 2);
        _b.copy(r.v).normalize();
        _q.setFromUnitVectors(Z, _b);
        _m.compose(_a.copy(r.p).addScaledVector(_b, -len), _q, _s.set(1, 1, len));
        this.tracers.setMatrixAt(n++, _m);
      }
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  launch(targetId, ctx) {
    const p = ctx.mechObj.localToWorld(POD.clone());
    const dir = ctx.dir.clone();
    dir.y += 0.1;
    dir.normalize();
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.missileBody, this.missileMat));
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    glow.position.z = 0.75;
    mesh.add(glow);
    mesh.position.copy(p);
    this.world.scene.add(mesh);
    this.missiles.push({
      mesh,
      p,
      dir: dir.toArray(),
      speed: MISSILE.speed0,
      target: targetId,
      aim: this.aimPoint(ctx.origin, ctx.dir),
      age: 0,
      smoke: 0,
    });
    this.fx.muzzle(p.x, p.y, p.z, 2.5);
    for (let k = 0; k < 4; k++) this.fx.spawnSmoke(p.x, p.y, p.z, 1.6, 2.5, 0.5, 0.6, 0.6);
    this.g.onMissileLaunched?.();
  }

  updateMissiles(dt) {
    const enemies = this.g.enemies;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.age += dt;
      m.speed = Math.min(MISSILE.speedMax, m.speed + MISSILE.accel * dt);
      const tgt = m.target != null ? enemies.list.find((e) => e.id === m.target) : null;
      if (tgt && tgt.state !== 'dead') enemies.center(tgt, m.aim).y += 0.3;
      if (m.age > 0.2) {
        const to = _a.copy(m.aim).sub(m.p).normalize().toArray();
        m.dir = steer(m.dir, to, MISSILE.turn * dt * (m.age < 0.6 ? 2 : 1));
      }
      const prev = m.p.clone();
      m.p.x += m.dir[0] * m.speed * dt;
      m.p.y += m.dir[1] * m.speed * dt;
      m.p.z += m.dir[2] * m.speed * dt;
      m.mesh.position.copy(m.p);
      m.mesh.quaternion.setFromUnitVectors(Z, _b.fromArray(m.dir).negate());
      // smoke trail
      m.smoke += dt;
      while (m.smoke > 0.03) {
        m.smoke -= 0.03;
        const k = Math.random();
        this.fx.spawnSmoke(prev.x + (m.p.x - prev.x) * k, prev.y + (m.p.y - prev.y) * k, prev.z + (m.p.z - prev.z) * k, 0.8, 3 + Math.random() * 1.5, 0.25, 0.7, 0.45);
      }
      // impact?
      let hitEnemy = null;
      for (const e of enemies.list) {
        const t = segmentHitsSphere(prev.toArray(), m.p.toArray(), enemies.center(e, _c).toArray(), e.radius + 0.6);
        if (t >= 0) {
          hitEnemy = e;
          break;
        }
      }
      const ground = m.p.y < this.world.heightAt(m.p.x, m.p.z);
      if (hitEnemy || ground || m.age > MISSILE.life) {
        this.explode(m, hitEnemy);
        this.world.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  explode(m, direct) {
    const p = m.p;
    this.fx.explosion(p.x, Math.max(p.y, this.world.heightAt(p.x, p.z) + 0.5), p.z, 6);
    this.g.explosionSound(p, 0.8);
    const enemies = this.g.enemies;
    if (direct && direct.state !== 'dead') {
      this.w.missiles.hits++;
      enemies.damage(direct, MISSILE.damage);
    }
    for (const e of enemies.alive()) {
      if (e === direct) continue;
      const d = enemies.center(e, _c).distanceTo(p);
      if (d < MISSILE.splashRadius) enemies.damage(e, MISSILE.splash * (1 - d / MISSILE.splashRadius));
    }
  }
}
