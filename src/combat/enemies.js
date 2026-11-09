import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ENEMY_TYPES, createEnemy, stepEnemy, damageEnemy, chooseTarget, gunnerAim, armorFace, ARMOR, observe, artilleryImpact } from '../logic/combat.js';
import { fitModel } from '../geom.js';
import { MECH, stepLength } from '../logic/mech.js';
import { MechWalker } from '../world/mechwalk.js';

// model fitting: the Meshy vehicles lie along X with the front at -X; turn them to face -Z.
// turretCut: height (m) above which the tank mesh is the turret with its gun
const MODEL = {
  tank: { name: 'enemy_tank', length: 8.2, rotY: -Math.PI / 2, turretCut: 1.6 },
  apc: { name: 'enemy_apc', length: 7.4, rotY: -Math.PI / 2 },
  bunker: { name: 'bunker', height: 3.2, rotY: 0 },
  artillery: { name: 'artillery', length: 8.5, rotY: -Math.PI / 2 },
  aa: { name: 'aa', length: 7.6, rotY: -Math.PI / 2, turretCut: 1.9 },
  truck: { name: 'truck', length: 9, rotY: -Math.PI / 2 },
  heli: { name: 'heli', length: 16, rotY: -Math.PI / 2 },
};
const LABEL = { tank: 'PZ', apc: 'SPZ', bunker: 'BNK', artillery: 'ART', aa: 'FLAK', heli: 'HELI', truck: 'LKW', mech: 'MECH' };

/**
 * Cut a single-mesh vehicle into hull and turret (by triangle height) so the turret can
 * turn on its own. Returns a group: hull mesh + 'turret' pivot holding the turret mesh.
 */
function splitTurret(template, cutY) {
  template.updateMatrixWorld(true);
  const parts = { hull: { p: [], n: [], uv: [] }, turret: { p: [], n: [], uv: [] } };
  let cx = 0;
  let cz = 0;
  let cn = 0;
  const tip = new THREE.Vector3(0, 0, Infinity); // the most forward turret vertex: the muzzle
  let material = null;
  const a = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  template.traverse((o) => {
    if (!o.isMesh) return;
    material ??= o.material;
    const g = o.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    nm.getNormalMatrix(o.matrixWorld);
    const tri = [];
    for (let i = 0; i < count; i += 3) {
      tri.length = 0;
      let y = 0;
      for (let k = 0; k < 3; k++) {
        const j = idx ? idx.getX(i + k) : i + k;
        a.fromBufferAttribute(pos, j).applyMatrix4(o.matrixWorld);
        y += a.y / 3;
        tri.push([a.x, a.y, a.z, j]);
      }
      const dst = y > cutY ? parts.turret : parts.hull;
      for (const [x, yy, z, j] of tri) {
        dst.p.push(x, yy, z);
        if (nor) {
          nrm.fromBufferAttribute(nor, j).applyMatrix3(nm).normalize();
          dst.n.push(nrm.x, nrm.y, nrm.z);
        }
        if (uv) dst.uv.push(uv.getX(j), uv.getY(j));
        if (dst === parts.turret && z < tip.z) tip.set(x, yy, z);
        // the turret ring: centre of the turret body (above the gun)
        if (y > cutY + 0.55 && y < cutY + 1.2) {
          cx += x;
          cz += z;
          cn++;
        }
      }
    }
  });
  const pivot = new THREE.Vector3(cn ? cx / cn : 0, cutY, cn ? cz / cn : 0);
  const build = (d, offset) => {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(d.p);
    for (let i = 0; i < p.length; i += 3) {
      p[i] -= offset.x;
      p[i + 1] -= offset.y;
      p[i + 2] -= offset.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (d.n.length) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(d.n), 3));
    if (d.uv.length) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(d.uv), 2));
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    return m;
  };
  const group = new THREE.Group();
  group.add(build(parts.hull, new THREE.Vector3()));
  const turret = new THREE.Group();
  turret.name = 'turret';
  turret.position.copy(pivot);
  turret.add(build(parts.turret, pivot));
  turret.userData.muzzle = tip.sub(pivot).toArray();
  group.add(turret);
  return group;
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _w = new THREE.Vector3();
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
    this.strikes = []; // artillery salvos in the air
    this.templates = {};
    for (const [type, def] of Object.entries(MODEL)) {
      const src = game.assets.models[def.name] || game.assets.models.tank;
      if (!src) continue;
      let t = fitModel(src.clone(true), { length: def.length, height: def.height, rotY: def.rotY });
      t.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.envMapIntensity = 0.5;
          o.castShadow = true;
        }
      });
      if (def.turretCut && game.assets.models[def.name]) t = splitTurret(t, def.turretCut);
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
    this.strikes = [];
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
    } else if (type === 'mech') {
      // an enemy battle mech: the rigged model in dark paint, walking like ours
      e.length = 4;
      e.label = opts.label || 'MECH';
      e.obj = new THREE.Group();
      const src = this.g.assets.models.mech_rigged;
      if (src) {
        const body = fitModel(cloneSkinned(src), { height: MECH.height, rotY: Math.PI });
        const tint = opts.tint || [0.42, 0.16, 0.14];
        body.traverse((o) => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          o.material.color.setRGB(...tint);
          o.material.envMapIntensity = 0.45;
          o.frustumCulled = false;
          o.castShadow = true;
        });
        e.obj.add(body);
        e.obj.updateMatrixWorld(true);
        e.walker = new MechWalker(body, e.obj);
        e.stepPhase = 0;
        e.foot = 1;
        e.turn = 0;
      }
    } else {
      e.length = MODEL[type]?.length ?? 6;
      e.label = LABEL[type] || type.toUpperCase();
      e.obj = this.templates[type] ? this.templates[type].clone(true) : new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 7), new THREE.MeshStandardMaterial({ color: 0x555a4a }));
      if (this.templates[type]) e.obj.traverse((o) => o.isMesh && (o.material = o.material.clone()));
    }
    if (type === 'truck') {
      e.path = opts.path;
      e.pathSpeed = opts.speed;
    }
    if (type === 'heli') {
      // flying: its own height and a rotor disc
      e.alt = opts.alt ?? 38 + Math.random() * 16;
      e.y = this.world.heightAt(x, z) + e.alt;
      e.vx = 0;
      e.vz = 0;
      e.bank = 0;
      e.runT = 6 + Math.random() * 6;
      e.orbitDir = Math.random() < 0.5 ? -1 : 1;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(7.2, 28), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 4.1;
      e.obj.add(disc);
      e.rotor = disc;
    }
    e.obj.rotation.order = 'YXZ';
    e.turretObj = e.obj.getObjectByName('turret');
    e.pitch = 0;
    e.roll = 0;
    e.dustAcc = 0;
    e.contact = { x, z, type: 'hostile', enemy: true };
    // HQ reports new contacts: they show up at their spawn point until we see them ourselves
    observe(e, this.g.time);
    this.world.contacts.push(e.contact);
    this.world.scene.add(e.obj);
    this.list.push(e);
    this.place(e, 1);
    return e;
  }

  alive() {
    return this.list.filter((e) => e.state !== 'dead' && !e.escaped);
  }

  /** centre of the hull in world space */
  center(e, out = new THREE.Vector3()) {
    if (e.y != null) return out.set(e.x, e.y + e.height * 0.5, e.z); // in the air
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
    if (e.y != null) {
      // a helicopter: nose down when fast, banked into the turn
      e.obj.position.set(e.x, e.y, e.z);
      e.obj.rotation.set(-Math.min(0.3, Math.hypot(e.vx, e.vz) * 0.01) + (e.wreckTilt || 0), e.heading, e.bank + (e.wreckRoll || 0));
      e.contact.x = e.x;
      e.contact.z = e.z;
      return;
    }
    e.obj.position.set(e.x, h(0, 0) - 0.05, e.z);
    // a mech stands upright on its feet
    if (e.walker) e.obj.rotation.set(0, e.heading, 0);
    else e.obj.rotation.set(e.pitch + (e.wreckTilt || 0), e.heading, e.roll + (e.wreckRoll || 0));
    if (e.turretObj) e.turretObj.rotation.y = e.turret || 0;
    e.contact.x = e.x;
    e.contact.z = e.z;
  }

  /**
   * A hit; `from` (where the shot came from) and `at` (impact point) apply the armour:
   * thick in front, thin at the back, the turret front strongest. Returns true when destroyed.
   */
  damage(e, dmg, from = null, at = null, kind = 'gun') {
    if (e.state === 'dead') return false;
    // a helicopter or a truck has no armour worth the name
    if (e.type === 'heli' || e.type === 'truck') from = null;
    if (kind === 'top' && e.type !== 'depot' && e.type !== 'heli') {
      dmg *= 1.5;
      this.g.onArmorHit?.(e, 'top', 1.5, kind);
    } else if (from && e.type !== 'depot') {
      let face = armorFace(e.heading, e.x, e.z, from.x, from.z);
      const turretHit = at && e.turretObj && at.y > this.world.heightAt(e.x, e.z) + MODEL[e.type].turretCut + 0.1;
      if (turretHit && armorFace(e.heading + (e.turret || 0), e.x, e.z, from.x, from.z) === 'front') face = 'turret';
      // shaped-charge missiles care less about where they strike
      const f = kind === 'missile' ? 0.6 + 0.4 * ARMOR[face] : ARMOR[face];
      dmg *= f;
      this.g.onArmorHit?.(e, face, f, kind);
    }
    e.lastHit = this.g.time;
    if (!damageEnemy(e, dmg)) return false;
    this.destroy(e);
    return true;
  }

  destroy(e) {
    // a shot-down helicopter spins and falls; it blows up on the ground
    if (e.type === 'heli' && !e.crashed) {
      e.falling = { vy: 0, spin: (Math.random() < 0.5 ? -1 : 1) * 2.5 };
      this.fx.explosion(e.x, e.y + 2, e.z, 5, { smoke: 0.6, light: 0.4 });
      this.g.explosionSound(this.center(e), 0.7);
      e.contact.type = 'fire';
      this.g.onEnemyKilled?.(e);
      return;
    }
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
    this.world.updateSmokeScreens(dt);
    this.updateStrikes(dt, ctx);
    for (const e of this.list) {
      if (e.falling) this.fall(e, dt);
      if (e.state === 'dead' || ENEMY_TYPES[e.type].static || e.escaped) continue;
      // training targets (old hulls on the range) stand still and never shoot
      if (e.frozen) {
        e.speed = 0;
        continue;
      }
      // only the obstacles close by matter to the driver
      const near = this.world.colliders.filter((c) => Math.abs(c.x - e.x) < 40 && Math.abs(c.z - e.z) < 40);
      const tgt = chooseTarget(e, ctx.targets, dt, rand);
      const T = ENEMY_TYPES[e.type];
      if (T.air) {
        this.updateHeli(e, dt, tgt);
        continue;
      }
      // the gunner tracks the target's motion with a lag: a mech that zigzags spoils the lead
      if (tgt) {
        const k = Math.min(1, dt / 1.4);
        e.tvx = (e.tvx ?? 0) + ((tgt.vx ?? 0) - (e.tvx ?? 0)) * k;
        e.tvz = (e.tvz ?? 0) + ((tgt.vz ?? 0) - (e.tvz ?? 0)) * k;
      }
      const was = e.state;
      // at night they see us late, unless our lamps give us away
      const night = this.g.night && !(this.g.lightsOn && this.g.kit?.lights.visible !== false);
      const engage0 = e.engage;
      if (night && !T.indirect) e.engage = (engage0 ?? T.engage) * 0.6;
      const ev = stepEnemy(e, dt, { player: tgt, colliders: near, rand, findCover: (x) => this.findCover(x, tgt) });
      e.engage = engage0;
      if (e.walker) this.walk(e, dt);
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
      for (const f of ev) {
        if (f.kind === 'smoke') {
          this.smoke(e);
          continue;
        }
        if (f.kind === 'escaped') {
          e.obj.visible = false;
          e.contact.type = 'gone';
          this.g.mission?.onEscaped?.(e);
          continue;
        }
        if (f.kind !== 'fire' || this.g.mission?.ended) continue;
        // a howitzer fires on the reported position: no sight needed
        if (T.indirect) {
          this.fireIndirect(e, tgt);
          continue;
        }
        // the gunner needs to see the target: ruins and ridges give cover
        const muzzle = this.muzzle(e, new THREE.Vector3());
        if (!this.world.lineOfSight(muzzle, tgt.center(new THREE.Vector3()).add(_s.set(0, 1.2, 0)))) {
          e.noLos = true;
          e.reload = 1.2 + Math.random();
          e.burstLeft = 0;
          continue;
        }
        e.noLos = false;
        this.fire(e, f.dist, tgt);
      }
    }
    this.updateShells(dt, ctx);
  }

  /** an enemy mech's legs: planted feet in step with its speed (like our lance) */
  walk(e, dt) {
    const sp = Math.abs(e.speed);
    e.turn = e.lastHeading == null ? 0 : (e.heading - e.lastHeading) / Math.max(dt, 1e-3);
    e.lastHeading = e.heading;
    const stride = sp * dt + Math.abs(e.turn) * dt * 2.2;
    if (stride > 0.0005) {
      e.stepPhase += stride / stepLength(Math.max(sp, 0.5));
      while (e.stepPhase >= 1) {
        e.stepPhase -= 1;
        e.foot = -e.foot;
        if (sp > 0.5) this.g.allyFootstep?.(e);
      }
    }
    e.obj.updateMatrixWorld(true);
    e.walker.update(dt, e, (x, z) => this.world.heightAt(x, z));
  }

  /**
   * A gunship: circles the target at a few hundred metres, then turns in for an attack
   * run, rippling rockets when its nose points at the target; banks through the turns.
   */
  updateHeli(e, dt, tgt) {
    const T = ENEMY_TYPES.heli;
    if (e.rotor) e.rotor.rotation.z += dt * 30;
    let gx = e.goal[0];
    let gz = e.goal[1];
    const d = tgt ? Math.hypot(tgt.x - e.x, tgt.z - e.z) : 1e9;
    if (tgt) {
      e.runT -= dt;
      if (e.runT < 0 && !e.run) {
        e.run = true;
        e.runT = 9;
      }
      if (e.run) {
        // straight at it, firing from the engage range, break off close in
        gx = tgt.x;
        gz = tgt.z;
        if (d < 170 || e.runT < 0) {
          e.run = false;
          e.runT = 8 + Math.random() * 6;
          e.orbitDir = -e.orbitDir;
        }
      } else {
        // the circuit: a ring of 380 m around the target, flown in one direction
        const a = Math.atan2(e.z - tgt.z, e.x - tgt.x) + e.orbitDir * 0.5;
        gx = tgt.x + Math.cos(a) * 380;
        gz = tgt.z + Math.sin(a) * 380;
      }
    }
    const want = Math.atan2(-(gx - e.x), -(gz - e.z));
    const err = Math.atan2(Math.sin(want - e.heading), Math.cos(want - e.heading));
    const turn = Math.max(-0.9 * dt, Math.min(0.9 * dt, err));
    e.heading += turn;
    e.bank += ((-turn / Math.max(dt, 1e-3)) * 0.5 - e.bank) * Math.min(1, dt * 3);
    e.speed += Math.max(-8 * dt, Math.min(6 * dt, T.speed * (e.run ? 1 : 0.8) - e.speed));
    e.vx = -Math.sin(e.heading) * e.speed;
    e.vz = -Math.cos(e.heading) * e.speed;
    e.x += e.vx * dt;
    e.z += e.vz * dt;
    const ground = this.world.heightAt(e.x, e.z);
    const hy = ground + (e.run ? Math.max(22, e.alt * 0.6) : e.alt);
    e.y += Math.max(-6 * dt, Math.min(6 * dt, hy - e.y));
    e.y = Math.max(e.y, ground + 8);
    this.place(e, 1);
    // rockets on the attack run, when the nose points at the target and it can be seen
    e.reload -= dt;
    if (!tgt || this.g.mission?.ended || !e.run || d > T.engage || Math.abs(err) > 0.18) return;
    if (e.reload <= 0) {
      const muzzle = this.muzzle(e, new THREE.Vector3());
      if (!this.world.lineOfSight(muzzle, tgt.center(new THREE.Vector3()).add(_s.set(0, 1.2, 0)))) return;
      this.fire(e, d, tgt);
      e.burstLeft = (e.burstLeft ?? T.burst) - 1;
      e.reload = e.burstLeft > 0 ? 0.22 : T.reload[0] + Math.random() * (T.reload[1] - T.reload[0]);
      if (e.burstLeft <= 0) e.burstLeft = T.burst;
    }
  }

  /** the flak's tracers climbing towards the drone (looks only) */
  aaBurst(e, d) {
    const m = this.muzzle(e, new THREE.Vector3());
    const dir = new THREE.Vector3(d.x - m.x, d.y - m.y, d.z - m.z).normalize();
    this.fx.muzzle(m.x, m.y, m.z, 1.4);
    this.shells.push({ p: m.clone(), prev: m.clone(), v: dir.multiplyScalar(900), life: 1.4, dmg: 0, type: 'aa', from: new THREE.Vector3(e.x, 0, e.z), whizzed: true, aa: true });
  }

  /** a shot-down helicopter: spins down, burns where it hits the ground */
  fall(e, dt) {
    const f = e.falling;
    f.vy -= 9.81 * dt;
    e.y += f.vy * dt;
    e.x += e.vx * dt * 0.6;
    e.z += e.vz * dt * 0.6;
    e.heading += f.spin * dt;
    if (Math.random() < 0.7) this.fx.spawnSmoke(e.x, e.y + 1, e.z, 2.2, 3, 0.4, 1.0, 0.7);
    const g = this.world.heightAt(e.x, e.z);
    if (e.y <= g + 0.5) {
      e.y = g + 0.3;
      e.falling = null;
      e.crashed = true;
      e.wreckTilt = 0.25;
      e.wreckRoll = 0.6;
      if (e.rotor) e.rotor.visible = false;
      this.fx.explosion(e.x, g + 1, e.z, 10);
      e.fire = this.fx.addFire({ x: e.x, z: e.z, y: 1.5, scale: 3.5, smoke: 1.2 });
      this.g.explosionSound(new THREE.Vector3(e.x, g, e.z), 1.2);
      e.obj.traverse((o) => {
        if (!o.isMesh || o === e.rotor) return;
        o.material.color.multiplyScalar(0.16);
        o.material.roughness = 1;
      });
    }
    this.place(e, 1);
  }

  /**
   * A howitzer fires on where the target is reported: the salvo lands a few seconds later,
   * announced by its whistle, scattered less with every salvo it has fired at it.
   */
  fireIndirect(e, tgt) {
    if (!tgt) return;
    const muzzle = this.muzzle(e, new THREE.Vector3());
    this.fx.muzzle(muzzle.x, muzzle.y + 1, muzzle.z, 6);
    this.fx.spawnSmoke(muzzle.x, muzzle.y + 1, muzzle.z, 4, 5, 0.8, 0.5, 0.6);
    this.g.distantGun(muzzle, 1.4);
    e.salvo = (e.salvo ?? 0) + 1;
    const T = ENEMY_TYPES.artillery;
    const hit = artilleryImpact(tgt, e.salvo - 1);
    const dist = Math.hypot(tgt.x - e.x, tgt.z - e.z);
    this.strikes.push({ x: hit.x, z: hit.z, t: 4 + dist / 500, whistled: false, dmg: T.damage[0] + Math.random() * (T.damage[1] - T.damage[0]), from: new THREE.Vector3(e.x, 0, e.z) });
  }

  /** artillery shells coming down: the whistle, then the blast hurts whatever is close */
  updateStrikes(dt, ctx) {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      const gy = this.world.heightAt(s.x, s.z);
      if (!s.whistled && s.t < 3.3) {
        s.whistled = true;
        this.g.artilleryWhistle?.(new THREE.Vector3(s.x, gy, s.z));
      }
      if (s.t > 0) continue;
      this.strikes.splice(i, 1);
      this.fx.explosion(s.x, gy + 0.5, s.z, 11);
      for (let k = 0; k < 8; k++) this.fx.spawnDust(s.x + (Math.random() - 0.5) * 10, gy + 0.5, s.z + (Math.random() - 0.5) * 10, 5, 5 + Math.random() * 3, 5, 0.8);
      this.g.explosionSound(new THREE.Vector3(s.x, gy, s.z), 1.6);
      for (const tg of ctx.targets) {
        if (tg.dead) continue;
        const d = Math.hypot(tg.x - s.x, tg.z - s.z);
        if (d > 16) continue;
        const at = new THREE.Vector3(tg.x, gy + 2, tg.z);
        tg.onHit({ dmg: s.dmg * (1 - d / 16) * 1.2, from: s.from, type: 'artillery' }, at);
      }
      // it also wrecks our own vehicles caught in the open... and theirs
      for (const e of this.list) if (e.state !== 'dead' && Math.hypot(e.x - s.x, e.z - s.z) < 10) this.damage(e, 30);
    }
  }

  /** world position of the gun muzzle (turret direction for tanks) */
  muzzle(e, out) {
    const mz = e.turretObj?.userData.muzzle;
    if (mz) {
      e.obj.updateMatrixWorld(true);
      return e.turretObj.localToWorld(out.set(mz[0], mz[1], mz[2] - 0.3));
    }
    const h = e.heading + (e.turret || 0);
    if (e.type === 'heli') return out.set(e.x - Math.sin(e.heading) * 5, e.y - 0.6, e.z - Math.cos(e.heading) * 5);
    const gy = this.world.heightAt(e.x, e.z);
    if (e.type === 'mech') {
      // the gun arm on its right side
      const r = 1.5;
      return out.set(e.x - Math.sin(h) * 2.2 + Math.cos(h) * r, gy + 3.3, e.z - Math.cos(h) * 2.2 - Math.sin(h) * r);
    }
    if (e.type === 'bunker') return out.set(e.x - Math.sin(h) * 3.6, gy + 1.6, e.z - Math.cos(h) * 3.6);
    const reach = e.type === 'tank' ? 5.6 : e.length * 0.35;
    return out.set(e.x - Math.sin(h) * reach, gy + e.height * (e.type === 'tank' ? 0.78 : 0.95), e.z - Math.cos(h) * reach);
  }

  /** behind the nearest solid ruin, seen from the attacker */
  findCover(e, from) {
    let best = null;
    let bd = 220;
    for (const c of this.world.colliders) {
      if (c.r < 4 || (c.h ?? 0) < 4) continue;
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d >= bd) continue;
      const ax = c.x - from.x;
      const az = c.z - from.z;
      const l = Math.hypot(ax, az) || 1;
      bd = d;
      best = [c.x + (ax / l) * (c.r + 7), c.z + (az / l) * (c.r + 7)];
    }
    return best;
  }

  /** smoke grenades: a white wall that blocks sight (and seekers) for a while */
  smoke(e) {
    const fx = -Math.sin(e.heading + (e.turret || 0));
    const fz = -Math.cos(e.heading + (e.turret || 0));
    const cx = e.x + fx * 22;
    const cz = e.z + fz * 22;
    this.fx.smokeScreen(cx, this.world.heightAt(cx, cz), cz);
    this.world.addSmokeScreen(cx, cz, 16, 22);
    this.g.distantGun?.(new THREE.Vector3(e.x, 0, e.z), 0.25);
  }

  fire(e, dist, victim) {
    const T = ENEMY_TYPES[e.type];
    const muzzle = this.muzzle(e, new THREE.Vector3());
    const h = e.heading + (e.turret || 0);
    const fx = -Math.sin(h);
    const fz = -Math.cos(h);
    const gy = this.world.heightAt(e.x, e.z);
    const tank = e.type === 'tank';
    this.fx.muzzle(muzzle.x, muzzle.y, muzzle.z, tank ? 5 : 2.2);
    this.fx.spawnSmoke(muzzle.x + fx * 2, muzzle.y, muzzle.z + fz * 2, tank ? 3 : 1.5, 3 + Math.random() * 2, 0.6, 0.3, 0.6);
    if (tank) for (let i = 0; i < 3; i++) this.fx.spawnDust(muzzle.x + (Math.random() - 0.5) * 6, gy + 0.5, muzzle.z + (Math.random() - 0.5) * 6, 3, 2.5, 1, 0.4);
    this.g.distantGun(muzzle, tank ? 1 : 0.55);
    // the gunner leads the target and scatters; whether it hits is up to the flying shell
    const c = victim.center(new THREE.Vector3());
    const moving = Math.abs(e.speed) > 1 ? 0.7 : 1; // firing on the move is less accurate
    // our ECM spoils their fire-control solution
    const ecm = victim === this.g.playerTarget ? this.g.kit?.ecm ?? 1 : 1;
    const aim = gunnerAim(muzzle, { x: c.x, y: c.y - 0.25, z: c.z, vx: e.tvx ?? 0, vz: e.tvz ?? 0 }, T.shellSpeed, T.skill * moving * ecm);
    const dir = new THREE.Vector3(aim.x - muzzle.x, aim.y - muzzle.y, aim.z - muzzle.z).normalize();
    this.shells.push({
      p: muzzle.clone(),
      prev: muzzle.clone(),
      v: dir.multiplyScalar(T.shellSpeed),
      life: 3,
      dmg: T.damage[0] + Math.random() * (T.damage[1] - T.damage[0]),
      type: e.type,
      from: new THREE.Vector3(e.x, gy, e.z),
      whizzed: false,
    });
  }

  /** the mechs a shell can strike: legs, torso and head spheres around each */
  updateShells(dt, ctx) {
    let n = 0;
    const seg = (a, b, cx, cy, cz, r) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const fx = a.x - cx;
      const fy = a.y - cy;
      const fz = a.z - cz;
      const A = dx * dx + dy * dy + dz * dz;
      const B = 2 * (fx * dx + fy * dy + fz * dz);
      const C = fx * fx + fy * fy + fz * fz - r * r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return -1;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      return t >= 0 && t <= 1 ? t : -1;
    };
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.prev.copy(s.p);
      s.p.addScaledVector(s.v, dt);
      s.life -= dt;
      let hit = null;
      let ht = 2;
      // mechs: legs, torso, head (the flak's tracers at the drone hit nothing down here)
      for (const tg of s.aa ? [] : ctx.targets) {
        if (tg.dead) continue;
        const gy = this.world.heightAt(tg.x, tg.z);
        for (const [y, r] of [
          [1.25, 1.25],
          [3.05, 1.5],
          [4.85, 0.55],
        ]) {
          const t = seg(s.prev, s.p, tg.x, gy + y, tg.z, r);
          if (t >= 0 && t < ht) {
            ht = t;
            hit = tg;
          }
        }
      }
      const tank = s.type === 'tank';
      if (s.type === 'heli' && Math.random() < 0.8) this.fx.spawnSmoke(s.p.x, s.p.y, s.p.z, 0.7, 1.5, 0.2, 0.9, 0.5);
      if (hit) {
        const at = s.prev.clone().lerp(s.p, ht);
        this.shells.splice(i, 1);
        hit.onHit(s, at);
        continue;
      }
      // near miss: the crack of a shell going past (closest approach of this step)
      if (!s.whizzed) {
        const pc = ctx.playerCenter;
        _w.copy(s.p).sub(s.prev);
        const L = _w.lengthSq() || 1;
        const t = Math.max(0, Math.min(1, _v.copy(pc).sub(s.prev).dot(_w) / L));
        const near = _v.copy(s.prev).addScaledVector(_w, t);
        if (near.distanceTo(pc) < 16) {
          s.whizzed = true;
          this.g.shellWhizz(near.clone());
        }
      }
      // ruins and the ground stop it
      const g = this.world.heightAt(s.p.x, s.p.z);
      let stop = s.p.y < g;
      if (!stop) {
        for (const c of this.world.colliders) {
          if (c.r < 2.5) continue;
          const dx = s.p.x - c.x;
          const dz = s.p.z - c.z;
          if (dx * dx + dz * dz < c.r * c.r * 0.8 && s.p.y < g + (c.h ?? 8)) {
            stop = true;
            break;
          }
        }
      }
      if (stop || s.life <= 0) {
        this.shells.splice(i, 1);
        if (stop) {
          const y = Math.max(s.p.y, g);
          this.fx.explosion(s.p.x, y, s.p.z, tank ? 4.5 : 1.6, { smoke: 0.4, light: tank ? 0.5 : 0.15 });
          for (let k = 0; k < (tank ? 6 : 2); k++)
            this.fx.spawnDust(s.p.x + (Math.random() - 0.5) * 4, y + 0.5, s.p.z + (Math.random() - 0.5) * 4, tank ? 4 : 2, 4 + Math.random() * 3, 4, 0.7);
          this.g.explosionSound(s.p.clone(), tank ? 0.6 : 0.25);
        }
        continue;
      }
      if (n < this.tracers.instanceMatrix.count) {
        _v.copy(s.v).normalize();
        _q.setFromUnitVectors(Z, _v);
        _s.set(tank ? 1 : 0.6, tank ? 1 : 0.6, tank ? 16 : 9);
        _m.compose(_w.copy(s.p).addScaledVector(_v, -_s.z), _q, _s);
        this.tracers.setMatrixAt(n++, _m);
      }
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
  }
}
