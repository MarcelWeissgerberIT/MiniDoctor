import * as THREE from 'three';
import './style.css';
import { Assets } from './assets.js';
import { Cockpit } from './cockpit/cockpit.js';
import { drawBoot, drawStatus, drawCamera, drawTactical } from './cockpit/displays.js';
import { World, WORLD } from './world/world.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { createMechState, stepMech, walkBob, MECH, clamp } from './logic/mech.js';
import { UI } from './ui.js';

const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const LOOK = { yaw: 105 * DEG, up: 38 * DEG, down: 62 * DEG, sens: 0.0022 };

/* ------------------------------------------------------------- renderer */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, params.has('lowres') ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const ui = new UI();
const assets = new Assets(renderer);
assets.onProgress = (p) => ui.progress(p);

/* ----------------------------------------------------------------- game */

class Game {
  constructor() {
    this.world = new World(assets);
    this.feedRT = new THREE.WebGLRenderTarget(512, 384, { type: THREE.HalfFloatType });
    this.cockpit = new Cockpit(assets, this.feedRT);
    const env = this.world.makeEnvironment(renderer);
    this.world.scene.environment = env;
    this.cockpit.scene.environment = env;
    this.cockpit.scene.environmentIntensity = 0.35;

    const aspect = innerWidth / innerHeight;
    this.cockpitCam = new THREE.PerspectiveCamera(70, aspect, 0.02, 40);
    this.cockpitCam.rotation.order = 'YXZ';
    this.cockpit.scene.add(this.cockpitCam);
    this.worldCam = new THREE.PerspectiveCamera(70, aspect, 0.4, 7000);
    this.feedCam = new THREE.PerspectiveCamera(13, 4 / 3, 1, 4000);
    this.mechObj = new THREE.Object3D();
    this.mechObj.rotation.order = 'YXZ';

    this.post = new Post(renderer, this.world.scene, this.worldCam, this.cockpit.scene, this.cockpitCam);
    this.input = new Input(canvas);
    this.sound = new Sound(assets.audio);
    this.ray = new THREE.Raycaster();

    this.mech = createMechState(0, 0, 0);
    this.groundY = this.world.heightAt(0, 0);
    this.yaw = 0;
    this.pitch = -9 * DEG;
    this.lookRate = 0;
    this.headOff = new THREE.Vector3();
    this.headVel = new THREE.Vector3();
    this.shake = 0;
    this.shock = 0;
    this.time = 0;
    this.state = 'title';
    this.bootT = 0;
    this.sys = {
      reactor: 0,
      heat: 0.3,
      hyd: 0,
      coolant: 0.82,
      parts: { head: 0.94, torso: 0.81, larm: 0.62, rarm: 0.9, lleg: 0.77, rleg: 0.88 },
      caution: false,
      acked: false,
      warning: '',
      message: 'ALL SYSTEMS NOMINAL',
    };
    this.radarRange = 500;
    this.range = 0;
    this.hovered = null;
    this.frame = 0;
    this.wireActions();
    this.world.effects.onBoom = (d, s) => {
      this.sound.boom(d, s);
      if (d < 600) setTimeout(() => (this.shake += 0.6 * s), (d / 343) * 1000);
    };
    addEventListener('resize', () => this.resize());
    this.input.onLockChange = (locked) => ui.lockHint(!locked && this.state === 'play');
  }

  wireActions() {
    const c = this.cockpit;
    const sw = c.switches;
    const say = (t, color) => {
      this.sys.message = t;
      this.sys.messageColor = color;
      ui.comms(t);
    };
    c.onAction = (a) => {
      if (a === 'caution') {
        this.sys.acked = true;
        this.sound.click('button');
      }
    };
    const bind = (key, fn) => {
      sw[key].action = (on, silent) => {
        if (!silent) this.sound.click('toggle');
        fn(on);
      };
    };
    bind('lights', (on) => (c.lightsOn = on));
    bind('hud', (on) => (c.hud.on = on));
    bind('nv', (on) => (c.mfd.camera.uniforms.nv.value = on ? 1 : 0));
    bind('radar', (on) => (this.radarRange = on ? 1000 : 500));
    bind('optics', (on) => (c.mfd.camera.uniforms.useFeed.value = on ? 1 : 0));
    bind('ir', (on) => say(on ? 'IR SENSOR: THERMAL OVERLAY N/A' : 'IR SENSOR STANDBY', on ? '#ffb347' : null));
    bind('stab', (on) => say(on ? 'GYRO STABILISER ON' : 'GYRO STABILISER OFF'));
    bind('wpnArm', (on) => say(on ? 'WEAPONS: NO HARDPOINTS FITTED' : 'WEAPONS SAFE', on ? '#ffb347' : null));
    for (const k of ['gun', 'missile', 'mg', 'aux']) bind(k, (on) => on && say(`${k.toUpperCase()}: OFFLINE`, '#ffb347'));
    bind('pump', (on) => say(on ? 'COOLANT PUMP ON' : 'COOLANT PUMP OFF', on ? null : '#ffb347'));
    bind('hydp', (on) => say(on ? 'HYDRAULICS PRESSURISED' : 'HYDRAULICS DEPRESSURISING', on ? null : '#ffb347'));
    bind('ecm', (on) => say(on ? 'ECM JAMMING' : 'ECM OFF'));
    bind('beacon', (on) => say(on ? 'IFF BEACON ON' : 'IFF BEACON OFF'));
    bind('firesup', (on) => on && say('FIRE SUPPRESSION ARMED', '#ffb347'));
    bind('coolant', (on) => say(on ? 'COOLANT BYPASS OPEN' : 'COOLANT BYPASS CLOSED'));
    bind('reset', (on) => {
      if (on) {
        this.sys.heat = Math.min(this.sys.heat, 0.5);
        say('REACTOR SCRAM RESET');
        setTimeout(() => sw.reset.set(false), 600);
      }
    });
    for (const k of ['gen0', 'gen1', 'gen2']) bind(k, () => {});
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h);
    for (const cam of [this.cockpitCam, this.worldCam]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    this.post.setSize(w, h);
  }

  async enter() {
    await this.sound.init();
    this.state = 'boot';
    this.bootT = 0;
    this.input.enabled = true;
    this.input.lock();
    this.sound.startup();
    ui.hideTitle();
  }

  skipBoot() {
    this.state = 'play';
    this.bootT = 10;
    this.cockpit.power = 1;
    this.input.enabled = true;
    for (const k in this.cockpit.mfd) this.cockpit.mfd[k].on = true;
    this.cockpit.hud.on = true;
    this.sys.reactor = 0.35;
    this.sys.hyd = 0.85;
    ui.hideTitle();
  }

  /* -------------------------------------------------------------- update */

  updateBoot(dt) {
    this.bootT += dt;
    const t = this.bootT;
    const c = this.cockpit;
    // power comes up with a couple of flickers
    const flick = t > 0.5 && t < 1.2 ? (Math.random() < 0.5 ? 1 : 0.15) : 1;
    c.power = t < 0.5 ? 0 : Math.min(1, (t - 0.5) * 2) * flick;
    if (t > 1.3) for (const k in c.mfd) c.mfd[k].on = true;
    if (t > 1.3 && t < 1.4) this.sound.beep(1400, 0.08, 0.1);
    this.sys.reactor = Math.min(0.35, Math.max(0, (t - 0.6) * 0.2));
    this.sys.hyd = Math.min(0.85, Math.max(0, (t - 1) * 0.5));
    // needle self test
    for (const g of Object.values(c.gauges)) {
      if (t > 1.5 && t < 2.4) g.set(g.opts.max);
    }
    if (t > 4.3) {
      this.state = 'play';
      c.hud.on = true;
      this.sound.startAmbience();
      this.sound.beep(1200, 0.07, 0.1);
      this.sound.beep(1600, 0.07, 0.1, 0.1);
      ui.comms('HQ: BB-07, Sektor Kilo ist feindlich. Machen Sie sich mit dem Cockpit vertraut und rücken Sie dann vor.');
    }
  }

  updateSystems(dt) {
    const s = this.sys;
    const sw = this.cockpit.switches;
    const powered = sw.gen1.on || sw.gen2.on || sw.gen0.on;
    this.cockpit.lamps.pwrA.on = sw.gen1.on;
    this.cockpit.lamps.pwrB.on = sw.gen2.on;
    if (this.state === 'play') this.cockpit.power += ((powered ? 1 : 0.0) - this.cockpit.power) * Math.min(1, dt * 6);
    for (const k in this.cockpit.mfd) this.cockpit.mfd[k].on = this.state !== 'title' && powered && this.bootT > 1.3;
    const thr = Math.abs(this.mech.throttle);
    s.reactor += (0.35 + thr * 0.6 - s.reactor) * dt * 0.4;
    const cooling = (sw.pump.on ? 0.3 : -0.25) + (sw.coolant.on ? 0.12 : 0);
    s.heat += (s.reactor * 0.8 - cooling + 0.05 - s.heat) * dt * 0.08;
    s.heat = clamp(s.heat, 0.05, 1);
    s.hyd += ((sw.hydp.on ? 0.85 : 0.08) - s.hyd) * dt * (sw.hydp.on ? 0.6 : 0.25);
    const warnings = [];
    if (s.heat > 0.78) warnings.push('HEAT CRITICAL');
    if (s.hyd < 0.4 && this.state === 'play') warnings.push('HYD PRESS LOW');
    if (!sw.pump.on) warnings.push('COOLANT PUMP OFF');
    s.warning = warnings[0] || '';
    const caution = warnings.length > 0;
    if (caution && !s.caution) {
      s.acked = false;
      this.sound.alarm();
    }
    s.caution = caution;
    const lamps = this.cockpit.lamps;
    lamps.heat.on = s.heat > 0.7;
    lamps.armor.on = true;
    lamps.lock.on = caution && !s.acked;
    this.cockpit.alarm.active = caution && !s.acked;
    const g = this.cockpit.gauges;
    if (this.state === 'play' || this.bootT > 2.4) {
      g.reactor.set(s.reactor * 100);
      g.hyd.set(s.hyd * 30 * 0.92);
      g.temp.set(40 + s.heat * 330);
      g.speed.set(Math.abs(this.mech.speed) * 3.6);
    }
  }

  updateLook(dt, inp) {
    const stab = this.cockpit.switches.stab.on;
    const dyaw = -inp.dx * LOOK.sens;
    const dpitch = -inp.dy * LOOK.sens;
    this.yaw = clamp(this.yaw + dyaw, -LOOK.yaw, LOOK.yaw);
    this.pitch = clamp(this.pitch + dpitch, -LOOK.down, LOOK.up);
    if (this.input.hit('KeyC')) {
      this.yaw = 0;
      this.pitch = -9 * DEG;
    }
    const rate = Math.hypot(dyaw, dpitch) / Math.max(dt, 1e-3);
    this.lookRate += (rate - this.lookRate) * Math.min(1, dt * 8);
    this.lookPitchRate = dpitch / Math.max(dt, 1e-3);
    return stab;
  }

  updateMech(dt) {
    const I = this.input;
    const playing = this.state === 'play';
    const hydOk = this.sys.hyd > 0.4;
    const mechIn = playing
      ? {
          throttle: I.down('KeyW', 'ArrowUp') ? 1 : I.down('KeyS', 'ArrowDown') ? -1 : 0,
          turn: I.down('KeyA', 'ArrowLeft') ? 1 : I.down('KeyD', 'ArrowRight') ? -1 : 0,
          stop: I.down('KeyX', 'Space'),
        }
      : { throttle: 0, turn: 0, stop: true };
    if (!hydOk) {
      mechIn.turn *= 0.3;
      this.mech.throttle = clamp(this.mech.throttle, -0.1, 0.2);
    }
    this.turnInput = mechIn.turn;
    const events = stepMech(this.mech, mechIn, dt, this.world.colliders, WORLD.bounds);
    for (const e of events) {
      this.sound.footstep(e.strength);
      this.headVel.y -= 0.22 * e.strength;
      this.headVel.x += e.foot * 0.05 * e.strength;
      this.shake += 0.5 * e.strength;
      this.cockpit.jolt(e.strength);
      for (const g of Object.values(this.cockpit.gauges)) g.kick(0.25 * e.strength);
    }
    const target = this.world.heightAt(this.mech.x, this.mech.z);
    this.groundY += (target - this.groundY) * Math.min(1, dt * 3);
  }

  updateCameras(dt, stab) {
    const bob = walkBob(this.mech);
    // pilot head on a spring inside the cockpit
    const k = 90;
    const d = stab ? 13 : 7;
    this.headVel.addScaledVector(this.headOff, -k * dt).multiplyScalar(Math.max(0, 1 - d * dt));
    this.headOff.addScaledVector(this.headVel, dt);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shock = Math.max(0, this.shock - dt * 2) + this.shake * 0.02;
    const sh = this.shake * (stab ? 0.4 : 1) * 0.004;
    const t = this.time;
    const n = (a, b) => Math.sin(t * a) * Math.sin(t * b * 1.37);
    // idle engine vibration
    const idle = 0.00035 * this.cockpit.power;
    this.cockpitCam.position.set(
      this.headOff.x + n(41, 23) * sh + n(97, 61) * idle,
      this.headOff.y + n(37, 29) * sh + n(89, 53) * idle,
      this.headOff.z,
    );
    this.cockpitCam.rotation.set(this.pitch + n(43, 31) * sh * 1.5, this.yaw + n(29, 47) * sh, n(33, 19) * sh);
    if (this.debugCam) {
      // inspection camera for screenshots (?manual + window.__game.debugCam = { pos, look })
      this.cockpitCam.position.set(...this.debugCam.pos);
      this.cockpitCam.lookAt(...this.debugCam.look);
    }
    this.cockpitCam.updateMatrixWorld(true);

    const m = this.mech;
    this.mechObj.position.set(m.x, this.groundY + MECH.eyeHeight + bob.y * (stab ? 0.6 : 1), m.z);
    this.mechObj.rotation.set(bob.pitch, m.heading, bob.roll * (stab ? 0.5 : 1));
    this.mechObj.updateMatrix();
    this.mechObj.translateX(bob.x * (stab ? 0.5 : 1));
    this.mechObj.updateMatrixWorld(true);
    const wm = new THREE.Matrix4().multiplyMatrices(this.mechObj.matrixWorld, this.cockpitCam.matrixWorld);
    wm.decompose(this.worldCam.position, this.worldCam.quaternion, this.worldCam.scale);
    this.worldCam.updateMatrixWorld(true);

    // turret camera for the centre display: fixed to the mech, looking ahead
    this.feedCam.position.copy(this.mechObj.position).add(new THREE.Vector3(-Math.sin(m.heading), -0.6, -Math.cos(m.heading)).multiplyScalar(2));
    this.feedCam.rotation.set(-2.5 * DEG, m.heading, 0, 'YXZ');
    this.feedCam.updateMatrixWorld(true);
  }

  measureRange() {
    // ray-march the terrain and check the obstacle circles in front of the turret camera
    const m = this.mech;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.feedCam.quaternion);
    const o = this.feedCam.position;
    let hit = 0;
    for (let s = 5; s < 2500; s += 5) {
      const x = o.x + dir.x * s;
      const y = o.y + dir.y * s;
      const z = o.z + dir.z * s;
      if (y < this.world.heightAt(x, z)) {
        hit = s;
        break;
      }
    }
    for (const c of this.world.colliders) {
      const dx = c.x - m.x;
      const dz = c.z - m.z;
      const along = dx * -Math.sin(m.heading) + dz * -Math.cos(m.heading);
      if (along < 0) continue;
      const perp = Math.abs(dx * Math.cos(m.heading) - dz * Math.sin(m.heading));
      if (perp < c.r && (!hit || along < hit)) hit = along - Math.sqrt(Math.max(0, c.r * c.r - perp * perp));
    }
    this.range = hit;
  }

  updateInteraction(inp) {
    this.ray.setFromCamera(this.input.locked ? new THREE.Vector2(0, 0) : new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.cockpitCam);
    this.ray.far = 2.2;
    const hits = this.ray.intersectObjects(this.cockpit.hitTargets, false);
    const ctl = hits.length ? hits[0].object.userData.control : null;
    this.hovered = ctl;
    ui.hover(ctl ? KEY_HINTS[ctl.label] ? `${ctl.label.replace('\n', ' ')}  [${KEY_HINTS[ctl.label]}]` : ctl.label.replace('\n', ' ') : null, this.input.locked);
    if (inp.clicked && ctl && this.state === 'play') ctl.toggle();
  }

  hotkeys() {
    const I = this.input;
    const sw = this.cockpit.switches;
    const map = { KeyL: 'lights', KeyH: 'hud', KeyN: 'nv', KeyR: 'radar', KeyG: 'stab', KeyO: 'optics' };
    for (const [code, key] of Object.entries(map)) if (I.hit(code)) sw[key].toggle();
    if (I.hit('KeyM')) this.sound.setMuted(!this.sound.muted);
    if (I.hit('KeyQ') && this.sys.caution) this.cockpit.lamps.lock.toggle();
    if (I.hit('F1') || I.hit('Tab') || I.hit('Slash')) ui.toggleHelp();
  }

  drawDisplays() {
    const c = this.cockpit;
    const f = this.frame;
    if (this.state === 'boot' && this.bootT < 3.6) {
      if (f % 3 === 0) for (const k in c.mfd) drawBoot(c.mfd[k], this.bootT - 1.3);
      return;
    }
    const m = this.mech;
    const s = this.sys;
    const clock = new Date();
    if (f % 4 === 0)
      drawStatus(c.mfd.status, {
        ...s,
        time: `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`,
        message: s.warning || s.message,
        messageColor: s.warning ? '#ff4a3a' : s.messageColor,
      });
    if (f % 4 === 1)
      drawCamera(c.mfd.camera, {
        heading: m.heading,
        range: this.range,
        nv: c.switches.nv.on,
        zoom: 4,
        contact: c.switches.optics.on ? null : 'NO SIGNAL',
      });
    if (f % 4 === 2)
      drawTactical(c.mfd.tactical, {
        ...m,
        time: this.time,
        range: this.radarRange,
        contacts: this.world.contacts,
        look: this.yaw,
        grid: `${String(Math.round(1000 + m.x / 10)).padStart(4, '0')}-${String(Math.round(1000 - m.z / 10)).padStart(4, '0')}`,
        hostiles: this.world.hostiles.filter((h) => Math.hypot(h.x - m.x, h.z - m.z) < this.radarRange).length,
      });
  }

  update(dt) {
    this.time += dt;
    this.frame++;
    const inp = this.input.consume();
    if (this.state === 'boot') this.updateBoot(dt);
    if (this.state === 'play') this.hotkeys();
    const stab = this.state !== 'title' ? this.updateLook(dt, inp) : true;
    this.updateMech(dt);
    this.updateSystems(dt);
    this.updateCameras(dt, stab);
    if (this.frame % 6 === 0) this.measureRange();
    this.updateInteraction(inp);

    // world and the light that falls through the visor
    this.world.update(dt, this.time, this.worldCam.position);
    const fx = this.world.effects;
    const fwd = new THREE.Vector3(-Math.sin(this.mech.heading), 0, -Math.cos(this.mech.heading));
    const inFront = Math.max(0, fx.flashDir.dot(fwd));
    this.cockpit.setDaylight(0.85 + 0.15 * Math.sin(this.mech.heading * 1.3), fx.flashLevel * (0.25 + inFront), new THREE.Color(1, 0.6, 0.3));

    this.cockpit.update(dt, this.time, {
      throttle: this.mech.throttle,
      turnInput: this.turnInput || 0,
      lookPitchRate: 0,
    }, this.hovered);
    this.cockpit.hud.update(dt, {
      heading: this.mech.heading,
      speed: this.mech.speed,
      throttle: this.mech.throttle,
      look: this.yaw,
      stab: this.cockpit.switches.stab.on,
      nv: this.cockpit.switches.nv.on,
      lights: this.cockpit.lightsOn,
      warning: this.sys.warning,
      time: this.time,
    });
    this.drawDisplays();
    this.sound.update({ turn: this.mech.turn, lookRate: this.lookRate, speed: this.mech.speed });
    ui.update(this);
  }

  render() {
    if (this.frame % 2 === 0 && this.cockpit.switches.optics.on && this.cockpit.power > 0.5) {
      renderer.setRenderTarget(this.feedRT);
      renderer.render(this.world.scene, this.feedCam);
      renderer.setRenderTarget(null);
    }
    this.post.render(this.time, this.shock);
  }
}

const KEY_HINTS = {
  'CABIN\nLIGHT': 'L',
  HUD: 'H',
  NV: 'N',
  'RADAR\nRANGE': 'R',
  'STAB\nASSIST': 'G',
  OPTICS: 'O',
  'MASTER CAUTION quittieren': 'Q',
};

/* ----------------------------------------------------------------- boot */

let game;
const clock = new THREE.Clock();

function loop() {
  const dt = Math.min(0.05, clock.getDelta());
  game.update(dt);
  game.render();
  requestAnimationFrame(loop);
}

assets
  .loadAll()
  .then(() => {
    game = new Game();
    window.__game = game;
    if (params.has('yaw')) game.yaw = +params.get('yaw') * DEG;
    if (params.has('pitch')) game.pitch = +params.get('pitch') * DEG;
    if (params.has('heading')) game.mech.heading = +params.get('heading') * DEG;
    if (params.has('skip')) game.skipBoot();
    else ui.ready(() => game.enter());
    renderer.compile(game.world.scene, game.worldCam);
    renderer.compile(game.cockpit.scene, game.cockpitCam);
    if (params.has('manual')) {
      // test hook: advance the simulation by hand (headless screenshots)
      window.__step = (n = 1, dt = 1 / 30, renderLast = true) => {
        for (let i = 0; i < n; i++) {
          game.update(dt);
          if (renderLast && i === n - 1) game.render();
        }
      };
    } else loop();
  })
  .catch((e) => {
    console.error(e);
    ui.error(e);
  });
