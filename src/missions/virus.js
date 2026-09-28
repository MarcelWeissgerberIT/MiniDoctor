import * as THREE from 'three';
import { VESSELS, SIZES } from '../physics.js';
import { t } from '../i18n.js';
import { CLUSTER, splitCluster, hits, virusOutcome } from './virusLogic.js';

const MAX_VIRIONS = 600;
const MAX_SHOTS = 40;
const SHOT_SPEED = 16; // µm/s
const SHOT_LIFE = 3.2;
const DURATION = 90;
const WAVES = [
  { at: 0, big: 3, small: 0 },
  { at: 25, big: 4, small: 2 },
  { at: 52, big: 5, small: 4 },
];

function virionGeometry() {
  // ≈ 100 nm particle with a crown of spike proteins
  const core = new THREE.IcosahedronGeometry(SIZES.virion / 2, 1);
  return core;
}

export class VirusMission {
  constructor(game) {
    this.game = game;
    this.id = 'virus';
    this.vessel = VESSELS.venule;
    this.tools = ['antibody', 'anchor'];
    this.nameKey = 'm2_name';
    this.lateralSpeed = 3;
  }

  start(ctx) {
    const { world, ship } = ctx;
    this.ctx = ctx;
    world.setVessel(this.vessel, { rbcCount: 26, cellLat: 20, cellFront: 90 });
    ship.x = 0;
    ship.y = 0;
    ship.yawLimit = 2.6;
    ship.pitchLimit = 1.2;
    this.clusters = [];
    this.shots = [];
    this.infections = 0;
    this.killed = 0;
    this.time = 0;
    this.wave = 0;
    this.cool = 0;

    const vm = new THREE.MeshStandardMaterial({ color: 0xa8d8a0, emissive: 0x1a3a18, roughness: 0.5 });
    this.virions = new THREE.InstancedMesh(virionGeometry(), vm, MAX_VIRIONS);
    this.virions.frustumCulled = false;
    world.group.add(this.virions);
    const sm = new THREE.MeshBasicMaterial({ color: 0x9ff6ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.shotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), sm, MAX_SHOTS);
    this.shotMesh.frustumCulled = false;
    world.group.add(this.shotMesh);
    // infection flashes on the wall
    this.flashes = [];
    this.dummy = new THREE.Object3D();
    ctx.tools.select('antibody');
    ctx.hud.setObjective(`<b>${t('m2_name')}</b><br>${t('v_obj')}`);
  }

  spawn(level) {
    const R = this.vessel.radius;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * R * 0.5;
    const z = -(8 + Math.random() * 25);
    const offsets = [];
    for (let k = 0; k < CLUSTER[level].virions; k++)
      offsets.push(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * CLUSTER[level].radius));
    this.clusters.push({
      level,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      vz: (Math.random() - 0.5) * 0.4,
      offsets,
      spin: Math.random() * 3,
    });
  }

  autopilotTarget() {
    return { x: 0, y: 0 };
  }

  update(dt, ctx) {
    const { world, ship, hud, input, tools, audio } = ctx;
    const R = this.vessel.radius;
    this.time += dt;
    while (this.wave < WAVES.length && this.time >= WAVES[this.wave].at) {
      const w = WAVES[this.wave];
      for (let k = 0; k < w.big; k++) this.spawn(3);
      for (let k = 0; k < w.small; k++) this.spawn(2);
      this.wave++;
      hud.toast(`${t('v_wave')} ${this.wave}/${WAVES.length}`, 'warn');
      audio.sfx('alarm');
    }

    // clusters: carried by plasma, drifting towards the endothelium
    const vs = ship.speed;
    for (const c of this.clusters) {
      const r = Math.hypot(c.x, c.y) || 1;
      const out = 0.55 + c.level * 0.08;
      c.x += (c.vx + (c.x / r) * out) * dt;
      c.y += (c.vy + (c.y / r) * out) * dt;
      c.z += c.vz * dt - (world.flowAt(c.x, c.y, ctx.time) - vs) * dt;
      c.vx *= 1 - dt * 0.3;
      c.vy *= 1 - dt * 0.3;
      c.vz *= 1 - dt * 0.3;
      c.spin += dt;
      // keep them in the local window (they travel with us)
      if (c.z < -45) c.z = -45;
      if (c.z > 25) c.z = 25;
      if (Math.hypot(c.x, c.y) >= R - 0.3) {
        c.dead = true;
        this.infections += c.level;
        this.flashes.push({ x: c.x, y: c.y, z: c.z, t: 1.5 });
        hud.toast(t('v_infected'), 'bad');
        audio.sfx('bad');
      }
    }

    // fire antibodies from the ship's nose
    this.cool -= dt;
    const cam = world.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    tools.aimAtWorld(cam.position.clone().addScaledVector(fwd, 20));
    if (ctx.controls && tools.target === 'antibody' && input.down && this.cool <= 0 && this.shots.length < MAX_SHOTS) {
      this.cool = 0.22;
      tools.fire();
      audio.sfx('shoot');
      const p = cam.position.clone().addScaledVector(fwd, 0.9);
      this.shots.push({ x: p.x, y: p.y, z: p.z, vx: fwd.x * SHOT_SPEED, vy: fwd.y * SHOT_SPEED, vz: fwd.z * SHOT_SPEED, life: SHOT_LIFE });
    }
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.life -= dt;
      if (Math.hypot(s.x, s.y) > R) s.life = 0;
      for (const c of this.clusters) {
        if (c.dead || s.life <= 0) continue;
        if (hits(s, c)) {
          s.life = 0;
          c.dead = true;
          for (const k of splitCluster(c)) {
            k.offsets = [];
            for (let i = 0; i < CLUSTER[k.level].virions; i++)
              k.offsets.push(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * CLUSTER[k.level].radius));
            k.spin = 0;
            this.clusters.push(k);
          }
          if (c.level === 1) this.killed++;
          audio.sfx('pop');
        }
      }
    }
    this.shots = this.shots.filter((s) => s.life > 0);
    this.clusters = this.clusters.filter((c) => !c.dead);

    // render virions
    let n = 0;
    for (const c of this.clusters) {
      for (const o of c.offsets) {
        if (n >= MAX_VIRIONS) break;
        this.dummy.position.set(c.x + o.x, c.y + o.y, c.z + o.z);
        this.dummy.rotation.set(c.spin, c.spin * 0.7, 0);
        this.dummy.updateMatrix();
        this.virions.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    this.virions.count = n;
    this.virions.instanceMatrix.needsUpdate = true;
    this.shots.forEach((s, i) => {
      this.dummy.position.set(s.x, s.y, s.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(0.6 + Math.random() * 0.5);
      this.dummy.updateMatrix();
      this.shotMesh.setMatrixAt(i, this.dummy.matrix);
    });
    this.dummy.scale.setScalar(1);
    this.shotMesh.count = this.shots.length;
    this.shotMesh.instanceMatrix.needsUpdate = true;

    // target markers: virions are real size (100 nm) → the HUD brackets them
    for (const c of this.clusters) {
      const p = new THREE.Vector3(c.x, c.y, c.z);
      const d = p.distanceTo(cam.position);
      const wallD = R - Math.hypot(c.x, c.y);
      hud.marker(p, {
        size: 8 + c.level * 5,
        color: wallD < 4 ? '#ff6b6b' : '#b6ff9f',
        label: `${CLUSTER[c.level].virions}× · ${d.toFixed(0)} µm`,
      });
    }
    for (const f of this.flashes) {
      f.t -= dt;
      if (f.t > 0) hud.marker(new THREE.Vector3(f.x, f.y, f.z), { size: 30 * f.t, color: '#ff4d4d' });
    }
    this.flashes = this.flashes.filter((f) => f.t > 0);

    const left = DURATION - this.time;
    hud.setStats(
      `${t('v_wave')}: <b>${this.wave}/${WAVES.length}</b> · ⏱ <b>${Math.max(0, left).toFixed(0)} s</b><br>` +
        `${t('v_left')}: <b>${this.clusters.length}</b><br>${t('v_killed')}: <b>${this.killed}</b><br>` +
        `${t('v_infect')}: <b class="${this.infections ? 'bad' : ''}">${this.infections}</b>`,
    );
    ctx.warning = this.clusters.some((c) => R - Math.hypot(c.x, c.y) < 4);
    const allWaves = this.wave >= WAVES.length;
    if ((allWaves && this.clusters.length === 0) || left <= 0) {
      for (const c of this.clusters) this.infections += c.level;
      const o = virusOutcome(this.infections, this.killed);
      return {
        quality: o.quality,
        damage: o.damage,
        lines: [`${t('v_killed')}: ${this.killed}`, `${t('v_infect')}: ${this.infections}`],
      };
    }
    return null;
  }

  dispose(ctx) {
    ctx.ship.yawLimit = 1.2;
    ctx.ship.pitchLimit = 0.8;
  }
}
