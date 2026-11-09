import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createWingman, stepWingman, setOrder, damageWingman, wingmanHitChance, WINGMAN } from '../logic/allies.js';
import { fitModel } from '../geom.js';
import { MECH, stepLength } from '../logic/mech.js';
import { MechWalker } from '../world/mechwalk.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

// the lance: call signs, radio voice keys, paint and formation slots (right, back)
export const LANCE = {
  h2: { name: 'HAMMER 2', voice: 'w2', tint: [0.82, 0.9, 1.0], slot: [-20, 8] },
  h3: { name: 'HAMMER 3', voice: 'w3', tint: [1.0, 0.92, 0.8], slot: [20, 8] },
};

/**
 * Allied mechs walking and fighting next to the player: the rigged BB model with its
 * own walk cycle, an IFF lamp, autocannon tracers and missiles, damage and wrecks.
 */
export class Allies {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.fx = game.world.effects;
    this.list = [];
    this.rounds = [];
    this.missiles = [];
    const geo = new THREE.BoxGeometry(0.14, 0.14, 1);
    geo.translate(0, 0, 0.5);
    this.tracers = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.4, 1.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      80,
    );
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.world.scene.add(this.tracers);
    this.missileGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8).rotateX(Math.PI / 2);
    this.missileMat = new THREE.MeshStandardMaterial({ color: 0x8a8f86, metalness: 0.6, roughness: 0.5 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 5, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glowGeo = new THREE.SphereGeometry(0.3, 8, 6);
    this.iffGeo = new THREE.SphereGeometry(0.09, 10, 8);
  }

  clear() {
    for (const w of this.list) {
      this.world.scene.remove(w.obj);
      if (w.fire) this.fx.removeFire(w.fire);
      const i = this.world.contacts.indexOf(w.contact);
      if (i >= 0) this.world.contacts.splice(i, 1);
    }
    for (const m of this.missiles) this.world.scene.remove(m.mesh);
    this.list = [];
    this.rounds = [];
    this.missiles = [];
    this.tracers.count = 0;
  }

  alive() {
    return this.list.filter((w) => !w.dead);
  }

  spawn(key, x, z, heading) {
    const def = LANCE[key];
    const w = createWingman(def.name, x, z, heading, def.slot);
    w.key = key;
    w.voice = def.voice;
    w.phase = Math.random();
    w.weight = 0;
    w.hitCalls = 0;
    const src = this.g.assets.models.mech_rigged;
    const obj = new THREE.Group();
    w.stepPhase = Math.random();
    w.foot = 1;
    if (src) {
      const copy = cloneSkinned(src);
      const body = fitModel(copy, { height: MECH.height, rotY: Math.PI });
      body.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.color.setRGB(...def.tint);
        o.material.envMapIntensity = 0.45;
        o.material.metalness = 0.55;
        o.frustumCulled = false;
        o.castShadow = true;
      });
      obj.add(body);
      w.body = body;
      obj.updateMatrixWorld(true);
      w.walker = new MechWalker(body, obj);
    } else {
      obj.add(new THREE.Mesh(new THREE.BoxGeometry(3, 5, 2), new THREE.MeshStandardMaterial({ color: 0x556055 })));
    }
    // blinking green IFF lamp on the cockpit roof
    w.iffMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 6, 1.2) });
    const iff = new THREE.Mesh(this.iffGeo, w.iffMat);
    iff.position.set(0, MECH.height + 0.05, 0);
    obj.add(iff);
    w.obj = obj;
    w.contact = { x, z, type: 'ally', lance: true };
    this.world.contacts.push(w.contact);
    this.world.scene.add(obj);
    this.list.push(w);
    this.place(w, 0);
    return w;
  }

  /** world position of the torso */
  center(w, out = new THREE.Vector3()) {
    return out.set(w.x, this.world.heightAt(w.x, w.z) + 3.2, w.z);
  }

  order(order, targetId = null) {
    const alive = this.alive();
    if (!alive.length) return null;
    for (const w of alive) setOrder(w, order, null, targetId);
    return alive;
  }

  place(w, dt) {
    const y = this.world.heightAt(w.x, w.z);
    w.obj.position.set(w.x, y - (w.dead ? 0.8 : 0), w.z);
    w.obj.rotation.set(w.dead ? 0.12 : 0, w.heading, w.dead ? 0.45 : 0);
    w.contact.x = w.x;
    w.contact.z = w.z;
    // steps like the player's mech: the walker plants the feet in step with them
    if (w.walker && !w.dead) {
      const sp = Math.abs(w.speed);
      const stride = sp * dt + Math.abs(w.turn) * dt * 2.2;
      if (stride > 0.0005) {
        w.stepPhase += stride / stepLength(sp);
        while (w.stepPhase >= 1) {
          w.stepPhase -= 1;
          w.foot = -w.foot;
          if (sp > 0.5) this.g.allyFootstep?.(w); // a footfall, heard when close
        }
      }
      w.obj.updateMatrixWorld(true);
      w.walker.update(dt, w, (x, z) => this.world.heightAt(x, z));
    }
  }

  /** ctx: { leader: {x, z, heading, speed}, time } */
  update(dt, ctx) {
    const enemies = this.g.enemies.list.map((e) => ({ id: e.id, x: e.x, z: e.z, dead: e.state === 'dead', ref: e }));
    for (const w of this.list) {
      if (w.dead) continue;
      // a 5 m walker steps over sandbags and hedgehogs: only buildings are in the way
      const near = this.world.colliders.filter((c) => c.r > 2.5 && Math.abs(c.x - w.x) < 30 && Math.abs(c.z - w.z) < 30);
      const hadTarget = w.target;
      const ev = stepWingman(w, dt, { leader: ctx.leader, enemies, colliders: near });
      if (w.target && !hadTarget && ctx.time - (w.lastContact ?? -99) > 30) {
        w.lastContact = ctx.time;
        this.g.wingCall?.(w, 'contact', 25);
      }
      this.place(w, dt);
      w.iffMat.color.setRGB(0.4, Math.sin(ctx.time * 5 + w.slot[0]) > 0.6 ? 6 : 0.4, 1.2);
      for (const e of ev) {
        const tgt = enemies.find((x) => x.id === e.target)?.ref;
        if (!tgt || tgt.state === 'dead') continue;
        if (e.kind === 'shot') this.shoot(w, tgt, e.dist);
        else this.launch(w, tgt);
      }
    }
    this.updateRounds(dt);
    this.updateMissiles(dt);
  }

  muzzle(w, out) {
    const fx = -Math.sin(w.heading);
    const fz = -Math.cos(w.heading);
    const rx = Math.cos(w.heading);
    const rz = -Math.sin(w.heading);
    return out.set(w.x + rx * 1.4 + fx * 2.1, this.world.heightAt(w.x, w.z) + 3.0, w.z + rz * 1.4 + fz * 2.1);
  }

  shoot(w, tgt, dist) {
    const from = this.muzzle(w, new THREE.Vector3());
    const to = this.g.enemies.center(tgt, new THREE.Vector3());
    if (!this.world.lineOfSight(from, to.clone().setY(to.y + tgt.height * 0.35))) {
      w.noLos = true;
      w.reload = 1;
      w.burstLeft = 0;
      return;
    }
    w.noLos = false;
    const hit = Math.random() < wingmanHitChance(dist);
    if (!hit) {
      to.x += (Math.random() - 0.5) * 14;
      to.z += (Math.random() - 0.5) * 14;
      to.y = this.world.heightAt(to.x, to.z);
    }
    const d = to.clone().sub(from);
    const len = d.length();
    this.rounds.push({ p: from.clone(), dir: d.divideScalar(len), t: 0, T: len / 1000, to, hit, tgt, w });
    this.fx.muzzle(from.x, from.y, from.z, 2);
    this.g.allyGun?.(from);
  }

  launch(w, tgt) {
    const top = this.g.enemies.center(tgt, new THREE.Vector3());
    top.y += tgt.height * 0.35;
    if (!this.world.lineOfSight(this.muzzle(w, new THREE.Vector3()), top)) return;
    const fx = -Math.sin(w.heading);
    const fz = -Math.cos(w.heading);
    const rx = Math.cos(w.heading);
    const rz = -Math.sin(w.heading);
    const p = new THREE.Vector3(w.x - rx * 1.2, this.world.heightAt(w.x, w.z) + 4.6, w.z - rz * 1.2);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.missileGeo, this.missileMat));
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    glow.position.z = 0.7;
    mesh.add(glow);
    mesh.position.copy(p);
    this.world.scene.add(mesh);
    this.missiles.push({ mesh, p, v: new THREE.Vector3(fx, 0.25, fz).normalize().multiplyScalar(60), tgt, w, age: 0, smoke: 0, hit: Math.random() < 0.75 });
    this.g.allyMissile?.(p);
  }

  /** a wingman's round or missile strikes: the kill is credited to him, not to us */
  hit(w, tgt, dmg) {
    const E = this.g.enemies;
    E.killer = w;
    const killed = E.damage(tgt, dmg);
    E.killer = null;
    return killed;
  }

  updateRounds(dt) {
    let n = 0;
    for (let i = this.rounds.length - 1; i >= 0; i--) {
      const r = this.rounds[i];
      r.t += dt;
      if (r.t >= r.T) {
        this.rounds.splice(i, 1);
        if (r.hit && r.tgt.state !== 'dead') {
          this.fx.impact(r.to.x, r.to.y, r.to.z, 'metal', 1.1);
          if (this.hit(r.w, r.tgt, WINGMAN.damage)) this.g.onAllyKill?.(r.w, r.tgt);
        } else this.fx.impact(r.to.x, r.to.y, r.to.z, 'ground', 1);
        continue;
      }
      r.p.addScaledVector(r.dir, 1000 * dt);
      if (n < this.tracers.instanceMatrix.count) {
        _q.setFromUnitVectors(Z, r.dir);
        _m.compose(_v.copy(r.p).addScaledVector(r.dir, -10), _q, _s.set(1, 1, 10));
        this.tracers.setMatrixAt(n++, _m);
      }
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  updateMissiles(dt) {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.age += dt;
      const aim = this.g.enemies.center(m.tgt, _v.set(0, 0, 0));
      if (!m.hit) aim.x += 12;
      const speed = Math.min(260, m.v.length() + 240 * dt);
      const want = aim.sub(m.p).normalize();
      const dir = m.v.clone().normalize().lerp(want, Math.min(1, dt * (m.age > 0.25 ? 3 : 0.5))).normalize();
      m.v.copy(dir).multiplyScalar(speed);
      const prev = m.p.clone();
      m.p.addScaledVector(m.v, dt);
      m.mesh.position.copy(m.p);
      m.mesh.quaternion.setFromUnitVectors(Z, dir.clone().negate());
      m.smoke += dt;
      while (m.smoke > 0.035) {
        m.smoke -= 0.035;
        this.fx.spawnSmoke(prev.x, prev.y, prev.z, 0.8, 2.8, 0.25, 0.7, 0.45);
      }
      const c = this.g.enemies.center(m.tgt, new THREE.Vector3());
      const ground = m.p.y < this.world.heightAt(m.p.x, m.p.z);
      if (m.p.distanceTo(c) < m.tgt.radius + 1 || ground || m.age > 8) {
        this.fx.explosion(m.p.x, Math.max(m.p.y, this.world.heightAt(m.p.x, m.p.z) + 0.5), m.p.z, 6);
        this.g.explosionSound(m.p, 0.8);
        if (m.hit && m.tgt.state !== 'dead' && m.p.distanceTo(c) < m.tgt.radius + 3) {
          if (this.hit(m.w, m.tgt, WINGMAN.missileDamage)) this.g.onAllyKill?.(m.w, m.tgt);
        }
        this.world.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  /** an enemy shell (or our own fire) hits a wingman */
  damage(w, dmg, { friendly = false } = {}) {
    if (w.dead) return;
    const c = this.center(w, new THREE.Vector3());
    this.fx.impact(c.x + (Math.random() - 0.5) * 2, c.y + (Math.random() - 0.5) * 2, c.z + (Math.random() - 0.5) * 2, 'metal', 1.6);
    if (damageWingman(w, dmg)) {
      this.fx.explosion(c.x, c.y, c.z, 10);
      w.fire = this.fx.addFire({ x: w.x, z: w.z, y: 1.5, scale: 3, smoke: 1 });
      w.body?.traverse((o) => {
        if (!o.isMesh) return;
        o.material.color.multiplyScalar(0.2);
        o.material.roughness = 1;
      });
      w.iffMat.color.setRGB(0, 0, 0);
      w.contact.type = 'fire';
      this.place(w, 0);
      this.g.explosionSound(c, 1.3);
      this.g.wingCall?.(w, 'down', 0);
      return;
    }
    if (friendly) this.g.wingCall?.(w, 'ff', 8);
    else if ((w.hp < 70 && w.hitCalls === 0) || (w.hp < 35 && w.hitCalls === 1)) {
      w.hitCalls++;
      this.g.wingCall?.(w, 'hit', 0);
    }
  }
}
