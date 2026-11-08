import * as THREE from 'three';
import { ENEMY_TYPES, createEnemy, stepEnemy, damageEnemy, hitChance, chooseTarget } from '../logic/combat.js';
import { fitModel } from '../geom.js';

// model fitting: the Meshy vehicles lie along X with the front at -X; turn them to face -Z
const MODEL = {
  tank: { name: 'enemy_tank', length: 8.2, rotY: -Math.PI / 2 },
  apc: { name: 'enemy_apc', length: 7.4, rotY: -Math.PI / 2 },
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Enemy armour on the battlefield: tanks and APCs driven by the pure AI in
 * logic/combat.js, their shells, muzzle flashes, wrecks and radar contacts.
 */
export class Enemies {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.fx = game.world.effects;
    this.list = [];
    this.shells = [];
    this.templates = {};
    for (const [type, def] of Object.entries(MODEL)) {
      const src = game.assets.models[def.name] || game.assets.models.tank;
      if (!src) continue;
      const t = fitModel(src.clone(true), { length: def.length, rotY: def.rotY });
      t.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.envMapIntensity = 0.5;
          o.castShadow = true;
        }
      });
      this.templates[type] = t;
    }
    // shell tracers: white-hot streaks so the pilot sees where the fire comes from
    const geo = new THREE.BoxGeometry(0.22, 0.22, 1);
    geo.translate(0, 0, 0.5);
    this.tracers = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 5, 3.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      64,
    );
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.world.scene.add(this.tracers);
  }

  /** remove everything (mission restart) */
  clear() {
    for (const e of this.list) {
      this.world.scene.remove(e.obj);
      if (e.fire) this.fx.removeFire(e.fire);
      const i = this.world.contacts.indexOf(e.contact);
      if (i >= 0) this.world.contacts.splice(i, 1);
    }
    this.list = [];
    this.shells = [];
    this.tracers.count = 0;
  }

  /**
   * opts: { engage: detection/engagement range override, model: prop model for depot
   * targets ('drums', 'generator', 'crates'), heading }
   */
  spawn(type, x, z, goal, wave = 0, opts = {}) {
    const heading = opts.heading ?? Math.atan2(-(goal[0] - x), -(goal[1] - z));
    const e = createEnemy(type, x, z, heading, goal);
    e.wave = wave;
    if (opts.engage) e.engage = opts.engage;
    const T = ENEMY_TYPES[type];
    e.radius = T.radius;
    e.height = T.height;
    if (type === 'depot') {
      const src = this.g.assets.models[opts.model || 'drums'];
      e.length = 3;
      e.obj = src ? fitModel(src.clone(true), { height: opts.model === 'generator' ? 2.0 : 1.6 }) : new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), new THREE.MeshStandardMaterial({ color: 0x4a4a3a }));
      e.obj.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.castShadow = true;
        }
      });
      e.fuel = opts.model !== 'crates';
      e.label = opts.model === 'generator' ? 'GEN' : opts.model === 'crates' ? 'MUN' : 'TREIB';
    } else {
      e.length = MODEL[type].length;
      e.label = type === 'tank' ? 'PZ' : 'SPZ';
      e.obj = this.templates[type] ? this.templates[type].clone(true) : new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 7), new THREE.MeshStandardMaterial({ color: 0x555a4a }));
      if (this.templates[type]) e.obj.traverse((o) => o.isMesh && (o.material = o.material.clone()));
    }
    e.obj.rotation.order = 'YXZ';
    e.pitch = 0;
    e.roll = 0;
    e.dustAcc = 0;
    e.contact = { x, z, type: 'hostile' };
    this.world.contacts.push(e.contact);
    this.world.scene.add(e.obj);
    this.list.push(e);
    this.place(e, 1);
    return e;
  }

  alive() {
    return this.list.filter((e) => e.state !== 'dead');
  }

  /** centre of the hull in world space */
  center(e, out = new THREE.Vector3()) {
    return out.set(e.x, this.world.heightAt(e.x, e.z) + e.height * 0.5, e.z);
  }

  /** follows the terrain: pitch and roll from the ground under the tracks */
  place(e, k) {
    const h = (dx, dz) => this.world.heightAt(e.x + dx, e.z + dz);
    const fx = -Math.sin(e.heading);
    const fz = -Math.cos(e.heading);
    const L = e.length * 0.45;
    const pitch = Math.atan2(h(fx * L, fz * L) - h(-fx * L, -fz * L), 2 * L);
    const roll = Math.atan2(h(-fz * 1.6, fx * 1.6) - h(fz * 1.6, -fx * 1.6), 3.2);
    e.pitch += (pitch - e.pitch) * k;
    e.roll += (roll - e.roll) * k;
    e.obj.position.set(e.x, h(0, 0) - 0.05, e.z);
    e.obj.rotation.set(e.pitch + (e.wreckTilt || 0), e.heading, e.roll + (e.wreckRoll || 0));
    e.contact.x = e.x;
    e.contact.z = e.z;
  }

  /** returns true when this hit destroyed the vehicle */
  damage(e, dmg) {
    if (!damageEnemy(e, dmg)) return false;
    this.destroy(e);
    return true;
  }

  destroy(e) {
    const c = this.center(e);
    // fuel goes up in a much bigger ball
    this.fx.explosion(c.x, c.y + 0.5, c.z, e.type === 'tank' ? 11 : e.fuel ? 16 : 9);
    e.fire = this.fx.addFire({ x: e.x, z: e.z, y: e.height * 0.55, scale: e.type === 'tank' ? 3.2 : e.fuel ? 4.5 : 2.6, smoke: 1 });
    this.g.explosionSound(c, 1.2);
    // burnt-out wreck: charred, slumped on one side
    e.obj.traverse((o) => {
      if (!o.isMesh) return;
      o.material.color.multiplyScalar(0.16);
      o.material.roughness = 1;
      o.material.metalness = 0.2;
    });
    e.wreckTilt = (Math.random() - 0.5) * 0.08;
    e.wreckRoll = (Math.random() - 0.5) * 0.12;
    e.contact.type = 'fire';
    this.place(e, 1);
    this.g.onEnemyKilled?.(e);
  }

  /**
   * ctx.targets: our mechs [{ x, z, speed, dead, isPlayer, center(out), onHit(shell) }],
   * ctx.playerCenter: for the near-miss sounds
   */
  update(dt, ctx) {
    const rand = Math.random;
    for (const e of this.list) {
      if (e.state === 'dead' || ENEMY_TYPES[e.type].static) continue;
      // only the obstacles close by matter to the driver
      const near = this.world.colliders.filter((c) => Math.abs(c.x - e.x) < 40 && Math.abs(c.z - e.z) < 40);
      const tgt = chooseTarget(e, ctx.targets, dt, rand);
      const was = e.state;
      const ev = stepEnemy(e, dt, { player: tgt, colliders: near, rand });
      if (was !== 'engage' && e.state === 'engage') this.g.onEnemyEngaged?.(e);
      this.place(e, Math.min(1, dt * 4));
      // dust behind the tracks
      if (e.speed > 1.5) {
        e.dustAcc += dt * e.speed * 0.35;
        while (e.dustAcc > 1) {
          e.dustAcc -= 1;
          const bx = e.x + Math.sin(e.heading) * e.length * 0.5;
          const bz = e.z + Math.cos(e.heading) * e.length * 0.5;
          this.fx.spawnDust(bx + (rand() - 0.5) * 3, this.world.heightAt(bx, bz) + 0.4, bz + (rand() - 0.5) * 3, 2.2, 3 + rand() * 2, 0.8, 0.35);
        }
      }
      for (const f of ev) if (f.kind === 'fire') this.fire(e, f.dist, tgt);
    }
    this.updateShells(dt, ctx);
  }

  fire(e, dist, victim) {
    const T = ENEMY_TYPES[e.type];
    const fx = -Math.sin(e.heading);
    const fz = -Math.cos(e.heading);
    const gy = this.world.heightAt(e.x, e.z);
    const muzzle = new THREE.Vector3(e.x + fx * e.length * 0.66, gy + e.height * 0.78, e.z + fz * e.length * 0.66);
    const tank = e.type === 'tank';
    this.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, tank ? 5 : 2.2);
    this.fx.spawnSmoke(muzzle.x + fx * 2, muzzle.y, muzzle.z + fz * 2, tank ? 3 : 1.5, 3 + Math.random() * 2, 0.6, 0.3, 0.6);
    if (tank) for (let i = 0; i < 3; i++) this.fx.spawnDust(muzzle.x + (Math.random() - 0.5) * 6, gy + 0.5, muzzle.z + (Math.random() - 0.5) * 6, 3, 2.5, 1, 0.4);
    this.g.distantGun(muzzle, tank ? 1 : 0.55);
    // decide now whether this one hits (range and our speed), then fly it there
    const hit = Math.random() < hitChance(dist, victim.speed);
    const target = victim.center(new THREE.Vector3());
    if (hit) target.add(_v.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.3) * 1.2, (Math.random() - 0.5) * 1.2));
    else {
      // a miss: short in the dirt, wide to a side or high over the cockpit
      const side = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 22);
      const along = -18 + Math.random() * 40;
      const dx = target.x - muzzle.x;
      const dz = target.z - muzzle.z;
      const l = Math.hypot(dx, dz) || 1;
      target.x += (dx / l) * along + (-dz / l) * side;
      target.z += (dz / l) * along + (dx / l) * side;
      target.y = Math.random() < 0.3 ? target.y + 4 + Math.random() * 6 : this.world.heightAt(target.x, target.z);
    }
    const d = target.clone().sub(muzzle);
    const len = d.length();
    this.shells.push({
      p: muzzle.clone(),
      dir: d.divideScalar(len),
      speed: T.shellSpeed,
      t: 0,
      T: len / T.shellSpeed,
      target,
      hit,
      high: !hit && target.y > this.world.heightAt(target.x, target.z) + 1,
      dmg: T.damage[0] + Math.random() * (T.damage[1] - T.damage[0]),
      type: e.type,
      victim,
      from: new THREE.Vector3(e.x, gy, e.z),
      whizzed: false,
    });
  }

  updateShells(dt, ctx) {
    let n = 0;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      // a near miss cracks past the cockpit
      if (!s.hit && !s.whizzed && s.t > s.T - 0.12 && s.target.distanceTo(ctx.playerCenter) < 45) {
        s.whizzed = true;
        this.g.shellWhizz(s.target);
      }
      if (s.t >= s.T) {
        this.shells.splice(i, 1);
        if (s.hit && !s.victim.dead) s.victim.onHit(s);
        else if (!s.high) {
          const tank = s.type === 'tank';
          this.fx.explosion(s.target.x, s.target.y, s.target.z, tank ? 4.5 : 1.6, { smoke: 0.4, light: tank ? 0.5 : 0.15 });
          for (let k = 0; k < (tank ? 6 : 2); k++)
            this.fx.spawnDust(s.target.x + (Math.random() - 0.5) * 4, s.target.y + 0.5, s.target.z + (Math.random() - 0.5) * 4, tank ? 4 : 2, 4 + Math.random() * 3, 4, 0.7);
          this.g.explosionSound(s.target, tank ? 0.6 : 0.25);
        }
        continue;
      }
      s.p.addScaledVector(s.dir, s.speed * dt);
      if (n < this.tracers.instanceMatrix.count) {
        _q.setFromUnitVectors(Z, s.dir);
        _s.set(s.type === 'tank' ? 1 : 0.6, s.type === 'tank' ? 1 : 0.6, s.type === 'tank' ? 16 : 9);
        _m.compose(_v.copy(s.p).addScaledVector(s.dir, -_s.z), _q, _s);
        this.tracers.setMatrixAt(n++, _m);
      }
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }
}
