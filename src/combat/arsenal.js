import * as THREE from 'three';
import { GUN, MG, MISSILE, createWeapons, stepWeapons, fireGun, fireMG, stepLock, fireMissile, steer, segmentHitsSphere } from '../logic/combat.js';
import { triggerWants, triggerShot } from '../logic/firecontrol.js';

// missile pod on the left shoulder, relative to the pilot's eye (mech body frame, -Z forward);
// far enough forward that the pilot sees the missiles leave
const POD = new THREE.Vector3(-1.2, 0.6, -0.6);

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
    this.trig = { held: false, burstLeft: 0 }; // single / burst / continuous fire
    this.salvoLeft = 0;
    this.salvoT = 0;
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
    this.trig = { held: false, burstLeft: 0 };
    this.salvoLeft = 0;
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
   * ctx: { live: {gun, missile, mg}, trigger, triggerMG, launch, inLimits, origin, dir, mechObj, rig }
   */
  update(dt, ctx) {
    const w = this.w;
    stepWeapons(w, dt);
    // lock-on: the enemy closest to the line of sight inside the seeker cone
    const cands = [];
    const h = ctx.mechObj ? this.g.mech.heading : 0;
    const time = this.g.time;
    for (const e of this.g.enemies.alive()) {
      const c = this.g.enemies.center(e, _c).sub(ctx.origin);
      const dist = c.length();
      // gimbal: how far off the hull axis a designated target lies
      const gimbal = Math.abs(Math.atan2(Math.sin(Math.atan2(-c.x, -c.z) - h), Math.cos(Math.atan2(-c.x, -c.z) - h)));
      cands.push({
        id: e.id,
        angle: c.divideScalar(dist).angleTo(ctx.dir),
        dist,
        gimbal,
        visible: e.losPlayer !== false, // the seeker needs a clear view ...
        marked: (e.droneMark ?? 0) > time, // ... or the drone's laser on it
      });
    }
    stepLock(w, cands, dt, ctx.live.missile);

    const failed = this.g.failed ?? {};
    // the trigger as the fire-control computer sets it: one round, a burst, or as long as held
    const fc = ctx.fc || {};
    if (triggerWants(this.trig, !!(ctx.trigger && ctx.inLimits), fc.gunMode || 'auto', fc.burst || 3) && ctx.inLimits) {
      const wasHot = w.gun.overheated;
      if (fireGun(w, ctx.live.gun)) {
        this.shoot(ctx);
        triggerShot(this.trig);
      } else if (w.gun.overheated || !ctx.live.gun) this.trig.burstLeft = 0;
      if (w.gun.overheated && !wasHot) this.g.onGunOverheat?.();
    }
    if (ctx.triggerMG && ctx.inLimits && fireMG(w, ctx.live.mg)) this.shoot(ctx, true);
    if (ctx.launch && failed.missiles) {
      this.g.sound.beep(260, 0.18, 0.08);
      this.g.hmd?.notify('RAKETENWERFER BLOCKIERT', '#ff5a48', 1.5);
    } else if (ctx.launch) {
      const m = fireMissile(w, ctx.live.missile);
      if (m) {
        this.launch(m.target, ctx);
        // a salvo: the second rail fires a moment later on the same target
        if ((fc.salvo || 1) > 1) {
          this.salvoLeft = fc.salvo - 1;
          this.salvoT = 0.3;
        }
      } else if (ctx.live.missile) this.g.sound.beep(300, 0.12, 0.06);
    }
    if (this.salvoLeft > 0) {
      this.salvoT -= dt;
      if (this.salvoT <= 0) {
        w.missiles.cooldown = 0;
        const m = fireMissile(w, ctx.live.missile && !failed.missiles);
        if (m) this.launch(m.target, ctx);
        this.salvoLeft = m ? this.salvoLeft - 1 : 0;
        this.salvoT = 0.3;
      }
    }
    this.updateRounds(dt);
    this.updateMissiles(dt);
  }

  /** one round from the cannon or the coaxial MG: it leaves along the barrel */
  shoot(ctx, mg = false) {
    const muzzle = ctx.rig.muzzle(new THREE.Vector3(), mg);
    const dir = ctx.rig.forward(new THREE.Vector3());
    // without the gyro the arm shakes with every step
    const spread = (mg ? MG.spread : GUN.spread) * (this.g.failed?.gyro ? 2.6 : 1);
    // a holed coolant loop: the barrel heats up much faster
    if (!mg && this.g.failed?.cooling) this.w.gun.heat = Math.min(1, this.w.gun.heat + GUN.heatPerShot * 0.7);
    dir.x += (Math.random() - 0.5) * 2 * spread;
    dir.y += (Math.random() - 0.5) * 2 * spread;
    dir.z += (Math.random() - 0.5) * 2 * spread;
    dir.normalize();
    const shot = mg ? this.w.mg.shots : this.w.gun.shots;
    this.rounds.push({
      p: muzzle.clone(),
      v: dir.clone().multiplyScalar(mg ? MG.speed : GUN.speed),
      life: mg ? 1.6 : 2.4,
      prev: muzzle.clone(),
      mg,
      dmg: mg ? MG.damage : GUN.damage,
      from: muzzle.clone(),
      tracer: !mg || shot % MG.tracerEvery === 0,
    });
    const f = muzzle.clone().addScaledVector(dir, mg ? 0.3 : 0.5);
    this.fx.muzzle(f.x, f.y, f.z, mg ? 0.9 : 2.4);
    if (!mg || shot % 3 === 0) this.fx.blastLight(f.x, f.y, f.z, mg ? 40 : 120, 0.06);
    ctx.rig.fired(mg);
    this.g.onGunFired?.(mg);
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
        this.fx.impact(_a.x, _a.y, _a.z, 'metal', r.mg ? 0.5 : 1.2);
        if (e.state !== 'dead') {
          this.w[r.mg ? 'mg' : 'gun'].hits++;
          enemies.damage(e, r.dmg, r.from, _a, r.mg ? 'mg' : 'gun');
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
          this.fx.impact(r.p.x, h, r.p.z, 'ground', r.mg ? 0.45 : 1);
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
      if (r.tracer && n < this.tracers.instanceMatrix.count) {
        const len = Math.min(r.mg ? 8 : 14, r.prev.distanceTo(r.p) * 0.9 + 2);
        _b.copy(r.v).normalize();
        _q.setFromUnitVectors(Z, _b);
        _m.compose(_a.copy(r.p).addScaledVector(_b, -len), _q, _s.set(r.mg ? 0.45 : 1, r.mg ? 0.45 : 1, len));
        this.tracers.setMatrixAt(n++, _m);
      }
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  launch(targetId, ctx) {
    const p = ctx.mechObj.localToWorld(POD.clone());
    const tg = targetId != null ? this.g.enemies.list.find((e) => e.id === targetId) : null;
    // the pod fires along the hull, slightly up, slewed toward a target within its gimbal,
    // so the missile does not swing wide past cover on its way round; the seeker steers on
    const dir = new THREE.Vector3(0, 0.12, -1).applyQuaternion(ctx.mechObj.quaternion);
    if (tg) {
      const fh = Math.atan2(-dir.x, -dir.z);
      const th = Math.atan2(-(tg.x - p.x), -(tg.z - p.z));
      const off = Math.atan2(Math.sin(th - fh), Math.cos(th - fh));
      const h = fh + Math.max(-MISSILE.gimbal, Math.min(MISSILE.gimbal, off));
      const l = Math.hypot(dir.x, dir.z);
      dir.x = -Math.sin(h) * l;
      dir.z = -Math.cos(h) * l;
    }
    dir.y = Math.max(dir.y, 0.08);
    dir.normalize();
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.missileBody, this.missileMat));
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    glow.position.z = 0.75;
    mesh.add(glow);
    mesh.position.copy(p);
    this.world.scene.add(mesh);
    // no line of sight but a drone mark: a top attack over the cover onto the thin roof
    // flight profile from the computer: direct, steep (top attack), or steep only without sight
    const prof = this.g.fc?.missileProfile || 'auto';
    const top = !!tg && (prof === 'top' || (prof === 'auto' && tg.losPlayer === false && (tg.droneMark ?? 0) > this.g.time));
    if (top) {
      dir.y = Math.max(dir.y, 0.55);
      dir.normalize();
    }
    this.missiles.push({
      mesh,
      p,
      top,
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
      if (tgt && tgt.state !== 'dead') {
        enemies.center(tgt, _b).y += 0.3;
        const lased = (tgt.droneMark ?? 0) > this.g.time;
        // a smoke screen between seeker and target breaks the track (unless the drone lases it)
        if (!lased && this.world.smokeScreens.length && this.world.smokeBlocks(m.p, _b)) m.target = null;
        else {
          m.aim.copy(_b);
          // top attack: climb over the cover first, then dive steeply
          if (m.top) {
            // head for a point high above the target, dive once it lies steeply below
            const hd = Math.hypot(_b.x - m.p.x, _b.z - m.p.z);
            const above = m.p.y - _b.y;
            if (!m.terminal && above > 8 && hd < above * 1.4) m.terminal = true;
            if (!m.terminal) m.aim.y = _b.y + MISSILE.loft;
          } else {
            // direct: a few metres over the line of sight until close, clear of the ground
            const hd = Math.hypot(_b.x - m.p.x, _b.z - m.p.z);
            m.aim.y += Math.max(0, Math.min(6, (hd - 60) * 0.03));
          }
        }
      }
      if (m.age > 0.2) {
        const to = _a.copy(m.aim).sub(m.p).normalize().toArray();
        // fins bite harder in the steep terminal dive of a top attack
        m.dir = steer(m.dir, to, MISSILE.turn * dt * (m.age < 0.6 ? 2 : m.terminal ? 2.4 : 1));
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
      // ruins stop missiles too
      let wall = false;
      if (!hitEnemy && !ground) {
        const gy = this.world.heightAt(m.p.x, m.p.z);
        for (const c of this.world.colliders) {
          if (c.r < 2.5) continue;
          const dx = m.p.x - c.x;
          const dz = m.p.z - c.z;
          if (dx * dx + dz * dz < c.r * c.r * 0.8 && m.p.y < gy + (c.h ?? 8)) {
            wall = true;
            break;
          }
        }
      }
      if (hitEnemy || ground || wall || m.age > MISSILE.life) {
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
      // the side it strikes follows from where it came in
      const from = new THREE.Vector3(p.x - m.dir[0] * 20, p.y, p.z - m.dir[2] * 20);
      // diving onto the roof: the thinnest armour there is
      enemies.damage(direct, MISSILE.damage, from, p, m.top && m.dir[1] < -0.3 ? 'top' : 'missile');
    }
    for (const e of enemies.alive()) {
      if (e === direct) continue;
      const d = enemies.center(e, _c).distanceTo(p);
      if (d < MISSILE.splashRadius) enemies.damage(e, MISSILE.splash * (1 - d / MISSILE.splashRadius));
    }
  }
}
