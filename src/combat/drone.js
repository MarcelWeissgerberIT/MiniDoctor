import * as THREE from 'three';
import { DRONE, DRONE_MODES, createDrone, launchDrone, recallDrone, retaskDrone, stepDrone, inSensor, airborne, setDroneMode } from '../logic/drone.js';
import { observe } from '../logic/combat.js';

// dock on the mech's back, relative to the pilot's eye (mech body frame, -Z forward)
const DOCK = new THREE.Vector3(0, 0.75, 1.55);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/**
 * The recon quadcopter: rides on the mech's back, takes off on command, flies to a point,
 * circles it while marking every vehicle its camera sees, and comes home to recharge.
 * Its camera feeds the DROHNE page of the centre display.
 */
export class Drone {
  constructor(game) {
    this.g = game;
    this.world = game.world;
    this.d = createDrone();
    this.spares = 1;
    this.scanT = 0;
    this.lostT = 0;
    this.jammed = false;
    this.mesh = this.build();
    this.world.scene.add(this.mesh);
    // looks down at the search area from the drone
    this.cam = new THREE.PerspectiveCamera(42, 4 / 3, 1, 3000);
    this.buzz = null;
  }

  build() {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x3b4036, metalness: 0.5, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x16181a, metalness: 0.4, roughness: 0.6 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.5), body);
    hull.castShadow = true;
    g.add(hull);
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), dark);
    pod.position.set(0, -0.1, -0.16);
    g.add(pod);
    this.rotors = [];
    const discMat = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.35, depthWrite: false });
    for (const [x, z] of [
      [-0.42, -0.42],
      [0.42, -0.42],
      [-0.42, 0.42],
      [0.42, 0.42],
    ]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.62), body);
      arm.position.set(x / 2, 0, z / 2);
      arm.rotation.y = Math.atan2(x, z);
      g.add(arm);
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), dark);
      motor.position.set(x, 0.04, z);
      g.add(motor);
      const r = new THREE.Group();
      r.position.set(x, 0.09, z);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.01, 0.04), dark);
      r.add(blade);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.005, 20), discMat);
      disc.visible = false;
      r.add(disc);
      r.userData.disc = disc;
      r.userData.blade = blade;
      g.add(r);
      this.rotors.push(r);
    }
    // navigation lights and an anti-collision strobe
    const lamp = (c, x, z) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), new THREE.MeshBasicMaterial({ color: c }));
      m.position.set(x, 0, z);
      g.add(m);
      return m;
    };
    lamp(new THREE.Color(4, 0.2, 0.1), -0.17, -0.24);
    lamp(new THREE.Color(0.2, 4, 0.4), 0.17, -0.24);
    this.strobe = lamp(new THREE.Color(6, 6, 6), 0, 0.25);
    g.scale.setScalar(1.25);
    return g;
  }

  /** what the drone does once it is up (KREISEN, BEGLEITEN, VORAUS, MANUELL) */
  setMode(mode) {
    const was = this.d.mode;
    if (!setDroneMode(this.d, mode)) return;
    this.mode = mode;
    if (was !== mode) this.g.droneSay(`DROHNE: ${DRONE_MODES[mode]}`, '#9fe8ff');
  }

  reset() {
    const mode = this.d?.mode ?? 'orbit';
    this.d = createDrone();
    this.d.mode = mode;
    this.spares = 1;
    this.lostT = 0;
    this.falling = null;
    this.jammed = !!this.g.mission?.def?.noDrone;
    this.setBuzz(0);
  }

  get state() {
    return this.d.state;
  }

  get airborne() {
    return airborne(this.d);
  }

  home(out) {
    return this.g.mechObj.localToWorld(out.copy(DOCK));
  }

  /** Q: launch towards where the pilot looks, or call it home */
  toggle(goal) {
    const d = this.d;
    if (this.jammed) return this.g.droneSay('STÖRSENDER · DROHNE NICHT EINSETZBAR', '#ff5a48');
    if (d.state === 'lost') return this.g.droneSay(this.spares ? 'ERSATZDROHNE WIRD MONTIERT' : 'KEINE DROHNE MEHR', '#ff5a48');
    if (airborne(d)) {
      if (recallDrone(d)) this.g.droneSay('DROHNE KEHRT ZURÜCK', '#a6ffb8');
      return;
    }
    this.launch(goal);
  }

  launch(goal) {
    const d = this.d;
    if (this.jammed) return this.g.droneSay('STÖRSENDER · DROHNE NICHT EINSETZBAR', '#ff5a48');
    if (airborne(d)) {
      if (retaskDrone(d, goal, this.home(_v))) this.g.droneSay('DROHNE NEUES ZIEL', '#a6ffb8');
      return true;
    }
    if (d.state !== 'docked') return false;
    if (d.battery < DRONE.minLaunch) {
      this.g.droneSay(`DROHNE LÄDT · ${Math.round(d.battery * 100)}%`, '#ffc15e');
      return false;
    }
    const h = this.home(_v);
    if (!launchDrone(d, goal, h)) return false;
    d.x = h.x;
    d.y = h.y;
    d.z = h.z;
    this.g.sound.one('drone_launch', 0.7);
    this.g.droneSay('DROHNE STARTET', '#a6ffb8');
    this.g.onDroneLaunched?.();
    return true;
  }

  recall() {
    if (recallDrone(this.d)) this.g.droneSay('DROHNE KEHRT ZURÜCK', '#a6ffb8');
  }

  setBuzz(v) {
    const s = this.g.sound;
    if (!s.ctx) return;
    if (!this.buzz) this.buzz = s.loop('drone_loop', 0, s.master);
    if (this.buzz) this.buzz.gain.gain.setTargetAtTime(v, s.ctx.currentTime, 0.15);
  }

  update(dt) {
    const d = this.d;
    const g = this.g;
    const h = this.home(_v);
    const ev = stepDrone(d, dt, { home: h, ground: (x, z) => this.world.heightAt(x, z), heading: g.mech.heading, control: g.droneControl?.() });
    for (const e of ev) {
      if (e === 'airborne') g.droneSay('DROHNE IN DER LUFT', '#a6ffb8');
      if (e === 'arrived') g.droneSay('DROHNE ÜBER ZIELGEBIET · SUCHE', '#a6ffb8');
      if (e === 'lowBattery') g.droneSay('DROHNE AKKU SCHWACH · RÜCKKEHR', '#ffc15e');
      if (e === 'docked') {
        g.droneSay('DROHNE GELANDET · LÄDT', '#a6ffb8');
        g.onDroneDocked?.();
      }
      if (e === 'crashed') this.lose('DROHNE ABGESTÜRZT · AKKU LEER');
    }
    // under fire: an APC close by may hit it; an anti-aircraft tank with its radar will,
    // from far away, once it has tracked it for a moment; a gunship's gunner sometimes
    if (airborne(d) && d.state !== 'launch' && d.state !== 'land') {
      for (const e of g.enemies.alive()) {
        const dd = Math.hypot(e.x - d.x, e.z - d.z);
        let rate = 0;
        if (e.type === 'apc' && dd < 260) rate = 0.05;
        else if (e.type === 'heli' && dd < 400) rate = 0.12;
        else if (e.type === 'aa' && dd < 950) {
          e.aaTrack = (e.aaTrack ?? 0) + dt;
          if (e.aaTrack > 2.5) rate = 0.9;
          if (e.aaTrack > 2 && Math.random() < dt * 3) g.enemies.aaBurst?.(e, d);
        }
        if (rate && Math.random() < dt * rate) {
          this.lose(e.type === 'aa' ? 'DROHNE VON FLAK ABGESCHOSSEN' : 'DROHNE ABGESCHOSSEN');
          break;
        }
      }
    }
    // a lost drone falls, smokes and burns out; a spare can be fitted after a while
    if (this.falling) {
      const f = this.falling;
      f.vy -= 9.81 * dt;
      f.p.addScaledVector(_w.set(f.vx, f.vy, f.vz), dt);
      this.mesh.rotation.x += dt * 4;
      this.mesh.rotation.z += dt * 3;
      if (Math.random() < 0.6) this.world.effects.spawnSmoke(f.p.x, f.p.y, f.p.z, 0.6, 2, 0.4, 0.8, 0.5);
      const gy = this.world.heightAt(f.p.x, f.p.z);
      if (f.p.y <= gy + 0.2) {
        this.world.effects.explosion(f.p.x, gy + 0.3, f.p.z, 2.2, { smoke: 0.5, light: 0.3 });
        g.explosionSound(f.p.clone(), 0.2);
        this.falling = null;
        this.mesh.visible = false;
      } else this.mesh.position.copy(f.p);
    }
    if (d.state === 'lost') {
      this.setBuzz(0);
      this.lostT += dt;
      if (this.spares > 0 && this.lostT > 45) {
        this.spares--;
        const mode = this.d.mode;
        this.d = createDrone();
        this.d.mode = mode;
        this.d.battery = 0.5;
        this.mesh.visible = true;
        this.mesh.rotation.set(0, 0, 0);
        g.droneSay('ERSATZDROHNE MONTIERT', '#a6ffb8');
      }
      return;
    }
    // follow the logic
    this.mesh.visible = true;
    this.mesh.position.set(d.x, d.y, d.z);
    if (d.state === 'docked') this.mesh.quaternion.copy(g.mechObj.quaternion);
    else {
      this.mesh.rotation.set(airborne(d) && d.state !== 'launch' ? -0.12 : 0, d.heading, 0, 'YXZ');
    }
    const spin = airborne(d) ? 60 : 0;
    for (const r of this.rotors) {
      r.rotation.y += spin * dt;
      r.userData.disc.visible = spin > 0;
      r.userData.blade.visible = spin === 0;
    }
    this.strobe.visible = airborne(d) && Math.floor(g.time * 1.5) % 2 === 0 && g.time % 0.67 < 0.08;
    // buzz: loud on the back while taking off, faint far away
    if (airborne(d)) {
      const dist = _w.set(d.x, d.y, d.z).distanceTo(g.mechObj.position);
      this.setBuzz(Math.min(0.5, 14 / (dist + 10)));
    } else this.setBuzz(0);
    // the camera looks down at the circle's centre (or ahead while flying out)
    if (airborne(d)) {
      this.cam.position.set(d.x, d.y - 0.3, d.z);
      // in the pilot's hand it looks ahead and down, otherwise at what it circles
      const ahead = d.state === 'manual' || d.state === 'return' || !d.goal;
      const c = ahead ? [d.x - Math.sin(d.heading) * 90, d.z - Math.cos(d.heading) * 90] : d.goal;
      this.cam.lookAt(c[0], this.world.heightAt(c[0], c[1]), c[1]);
      this.cam.updateMatrixWorld(true);
    }
    this.scan(dt);
  }

  /** the sensor: every vehicle in reach with a clear line gets marked and tracked */
  scan(dt) {
    const d = this.d;
    this.scanT -= dt;
    if (this.scanT > 0 || !airborne(d)) return;
    this.scanT = 0.4;
    const g = this.g;
    const eye = _w.set(d.x, d.y - 0.5, d.z);
    for (const e of g.enemies.alive()) {
      if (!inSensor(d, e.x, e.z)) continue;
      const top = g.enemies.center(e, new THREE.Vector3());
      top.y += e.height * 0.3;
      if (!this.world.lineOfSight(eye, top)) continue;
      observe(e, g.time);
      const fresh = !e.droneMark || e.droneMark < g.time;
      e.droneMark = g.time + DRONE.markTime;
      if (fresh) {
        d.marks++;
        g.stats.droneMarks = (g.stats.droneMarks || 0) + 1;
        g.onDroneMark?.(e);
      }
    }
  }

  lose(text) {
    const d = this.d;
    if (d.state === 'lost' || d.state === 'docked') return;
    d.state = 'lost';
    this.lostT = 0;
    this.falling = { p: new THREE.Vector3(d.x, d.y, d.z), vx: -Math.sin(d.heading) * 8, vy: 0, vz: -Math.cos(d.heading) * 8 };
    this.g.droneSay(text, '#ff5a48');
    this.g.sound.beep(380, 0.3, 0.1);
  }

  /** status for the displays */
  info() {
    const d = this.d;
    const h = this.home(_v);
    return {
      state: d.state,
      battery: d.battery,
      alt: airborne(d) ? d.y - this.world.heightAt(d.x, d.z) : 0,
      dist: airborne(d) ? Math.hypot(d.x - h.x, d.z - h.z) : 0,
      goal: d.goal,
      x: d.x,
      z: d.z,
      heading: d.heading,
      marks: d.marks,
      spares: this.spares,
      jammed: this.jammed,
      mode: d.mode,
      speed: d.speed,
    };
  }
}
