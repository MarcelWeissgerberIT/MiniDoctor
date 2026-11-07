import * as THREE from 'three';
import './style.css';
import { Assets } from './assets.js';
import { Cockpit } from './cockpit/cockpit.js';
import { drawBoot, drawStatus, drawCamera, drawTactical } from './cockpit/displays.js';
import { World, WORLD } from './world/world.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Sound, Radio } from './audio.js';
import { createMechState, stepMech, MECH, clamp } from './logic/mech.js';
import { BodyDynamics } from './logic/gait.js';
import { createSystems, stepSystems, hotSwitches } from './logic/systems.js';
import { Tutorial, VOICE_TEXT } from './tutorial.js';
import { EntrySequence } from './entry.js';
import { UI } from './ui.js';
import { VIEWS, VIEW_ORDER, CONTROL_VIEW, ZOOM_FOV } from './cockpit/views.js';

const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const LOOK = { yaw: 125 * DEG, up: 62 * DEG, down: 68 * DEG, sens: 0.0022 };
const SWITCH_KEYS = ['batt', 'apu', 'gen1', 'gen2', 'hydp', 'pump', 'coolant', 'reactor', 'stab', 'legLock', 'lights', 'hud', 'optics', 'nv'];
const EXTRA_VOICE = {
  v18: 'Negativ. Ohne Kühlmittelpumpe und Hydraulikdruck zündet der Reaktor nicht. Prüfen Sie Ihre Checkliste.',
  v19: 'Achtung, Master Caution. Prüfen Sie die Warnung und quittieren Sie mit Q.',
  v20: 'Die Beine sind noch verriegelt, Pilot. Erst die Checkliste abarbeiten.',
  v21: 'Ohne Strom passiert da gar nichts. Erst Batterie, APU und Generatoren.',
};

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
    this.ui = ui;
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
    this.worldCam = new THREE.PerspectiveCamera(70, aspect, 0.1, 7000);
    this.feedCam = new THREE.PerspectiveCamera(13, 4 / 3, 1, 4000);
    this.mechObj = new THREE.Object3D();
    this.mechObj.rotation.order = 'YXZ';

    this.post = new Post(renderer, this.world.scene, this.worldCam, this.cockpit.scene, this.cockpitCam);
    this.input = new Input(canvas);
    this.sound = new Sound(assets.audio);
    this.radio = new Radio(this.sound, ui);
    this.voiceText = { ...VOICE_TEXT, ...EXTRA_VOICE };
    this.tutorial = new Tutorial(this, ui);
    this.ray = new THREE.Raycaster();

    this.mech = createMechState(0, 0, 0);
    this.body = new BodyDynamics();
    this.groundY = this.world.heightAt(0, 0);
    this.sys = createSystems(false);
    this.sw = this.switchSnapshot();
    this.yaw = 0;
    this.pitch = -9 * DEG;
    this.view = 'front'; // panel focus view
    this.viewBlend = 0;
    this.focusPose = { pos: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 70 };
    this.zoom = 0;
    this.fov = 70;
    this.lookRate = 0;
    this.headOff = new THREE.Vector3();
    this.headVel = new THREE.Vector3();
    this.shake = 0;
    this.shock = 0;
    this.time = 0;
    this.state = 'title'; // title | entry | cockpit
    this.mode = null; // mission | free
    this.caution = { active: false, acked: false };
    this.message = 'COLD AND DARK';
    this.mainUpAt = -10;
    this.radarRange = 500;
    this.range = 0;
    this.hovered = null;
    this.frame = 0;
    this.waypoint = null;
    this.nag = -100;
    this.wireActions();
    this.world.effects.onBoom = (d, s) => {
      this.sound.boom(d, s);
      if (d < 600) setTimeout(() => (this.shake += 0.6 * s), (d / 343) * 1000);
    };
    addEventListener('resize', () => this.resize());
    this.input.onLockChange = (locked) => ui.lockHint(!locked && this.state !== 'title' && !this.input.cursorMode);
    this.post.cockpitPass.enabled = false;
    this.placeMech();
    // title backdrop: a slow look at the parked mech
    this.worldCam.position.set(-9, 2.2, 15);
    this.worldCam.lookAt(0, 3, 0);
  }

  /* ------------------------------------------------------------ switches */

  switchSnapshot() {
    const sw = this.cockpit.switches;
    const o = {};
    for (const k of SWITCH_KEYS) o[k] = !!sw[k]?.on;
    return o;
  }

  setSwitches(values) {
    for (const [k, v] of Object.entries(values)) this.cockpit.switches[k]?.set(v);
  }

  wireActions() {
    const c = this.cockpit;
    const sw = c.switches;
    const say = (t, color) => {
      this.message = t;
      this.messageColor = color;
    };
    c.onAction = (a) => {
      if (a === 'caution') {
        this.caution.acked = true;
        this.sound.click('button');
      }
    };
    const bind = (key, fn = () => {}) => {
      sw[key].action = (on, silent) => {
        if (!silent) this.sound.click('toggle');
        fn(on);
      };
    };
    bind('batt', (on) => on && this.sound.one('battery_on', 0.8));
    bind('apu', (on) => on && !this.sw.batt && this.complainNoPower());
    bind('gen1');
    bind('gen2');
    bind('lights', (on) => on && !this.sys.mainBus && this.complainNoPower());
    bind('hud');
    bind('nv');
    bind('radar', (on) => (this.radarRange = on ? 1000 : 500));
    bind('optics');
    bind('ir', (on) => say(on ? 'IR SENSOR: THERMAL OVERLAY N/A' : 'IR SENSOR STANDBY', on ? '#ffb347' : null));
    bind('stab', (on) => on && this.sys.mainBus && this.sound.one('gyro_spin', 0.6));
    bind('wpnArm', (on) => say(on ? 'WEAPONS: NO HARDPOINTS FITTED' : 'WEAPONS SAFE', on ? '#ffb347' : null));
    for (const k of ['gun', 'missile', 'mg', 'aux']) bind(k, (on) => on && say(`${k.toUpperCase()}: OFFLINE`, '#ffb347'));
    bind('pump', (on) => say(on ? 'COOLANT PUMP ON' : 'COOLANT PUMP OFF', on ? null : '#ffb347'));
    bind('hydp', (on) => {
      if (on && this.sys.mainBus) this.sound.one('hyd_pump', 0.7);
      say(on ? 'HYDRAULIC PUMP ON' : 'HYDRAULIC PUMP OFF');
    });
    bind('ecm', (on) => say(on ? 'ECM JAMMING' : 'ECM OFF'));
    bind('firesup', (on) => on && say('FIRE SUPPRESSION ARMED', '#ffb347'));
    bind('coolant', (on) => say(on ? 'COOLANT BYPASS OPEN' : 'COOLANT BYPASS CLOSED'));
    bind('reactor');
    bind('legLock');
  }

  /** lean to a panel (focus view) or back to free look */
  setView(name) {
    if (this.state !== 'cockpit') return;
    if (name === this.view && name !== 'front') name = 'front';
    const v = VIEWS[name];
    if (!v) return;
    if (name !== 'front') {
      // remember where we were and fix the target pose
      const eye = new THREE.Vector3().fromArray(v.pos);
      const look = new THREE.Matrix4().lookAt(eye, new THREE.Vector3().fromArray(v.target), new THREE.Vector3(0, 1, 0));
      this.focusPose.pos.copy(eye);
      this.focusPose.q.setFromRotationMatrix(look);
      this.focusPose.fov = v.fov;
      this.input.cursorMode = true;
      this.input.unlock();
    } else {
      this.input.cursorMode = false;
    }
    this.view = name;
    this.sound.click('button');
    ui.setView(name);
    ui.lockHint(false);
  }

  complainNoPower() {
    if (this.time - this.nag < 12) return;
    this.nag = this.time;
    this.radio.say('v21', this.voiceText.v21);
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

  /* ---------------------------------------------------------------- flow */

  async startMission() {
    await this.sound.init();
    this.sound.startAmbience();
    this.input.enabled = true;
    this.input.lock();
    ui.hideTitle();
    ui.fade(1, 0);
    ui.fade(0, 1.5);
    this.mode = 'mission';
    this.state = 'entry';
    this.entry = new EntrySequence(this);
    ui.skipHint(true);
  }

  async startFree() {
    await this.sound.init();
    this.sound.startAmbience();
    this.input.enabled = true;
    this.input.lock();
    ui.hideTitle();
    this.goHot();
    this.mode = 'free';
    this.enterCockpitState();
    ui.comms('HQ: BB-07, Sektor Kilo ist feindlich. Freies Manöver.');
  }

  /** everything running, as after a completed start-up */
  goHot() {
    this.setSwitches(hotSwitches());
    this.sys = createSystems(true);
    this.sys.prev = { ...this.switchSnapshot() };
    this.cockpit.power = 1;
    this.mainUpAt = -10;
  }

  enterCockpitState() {
    this.state = 'cockpit';
    this.post.cockpitPass.enabled = true;
    ui.showViews(true, (name) => this.setView(name));
    this.cockpit.setHatch(0);
    this.world.setMechHatch(0);
    ui.skipHint(false);
    ui.fade(0, 0.4);
    this.updateMix();
    if (this.mode === 'mission') this.tutorial.start();
  }

  setWaypoint(i) {
    this.waypoint = i;
    this.world.setWaypoint(i);
  }

  updateMix() {
    const running = this.sys.reactorState !== 'off';
    this.sound.setMix({ hum: running ? 0.55 * Math.min(1, this.sys.reactor / 0.3 + 0.2) : 0, battle: 0.85, base: 0, walk: 0 });
  }

  /* -------------------------------------------------------------- update */

  updateSystems(dt) {
    this.sw = this.switchSnapshot();
    const ev = stepSystems(this.sys, this.sw, dt, this.mech.throttle);
    const s = this.sys;
    const c = this.cockpit;
    for (const e of ev) {
      if (e === 'apuReady') this.sound.beep(1300, 0.08, 0.08);
      if (e === 'mainPower') {
        this.mainUpAt = this.time;
        this.sound.one('battery_on', 0.5, 0.8);
        this.message = 'MAIN BUS ONLINE';
      }
      if (e === 'reactorIgnite') {
        this.sound.one('reactor_start', 1.0);
        this.message = 'REACTOR IGNITION';
      }
      if (e === 'reactorRunning') this.message = 'REACTOR ONLINE';
      if (e === 'reactorFail') {
        c.switches.reactor.set(false);
        s.prev.reactor = false;
        this.sound.beep(400, 0.25, 0.1);
        this.radio.say('v18', this.voiceText.v18);
      }
      if (e === 'scram') {
        c.switches.reactor.set(false);
        s.prev.reactor = false;
        this.message = 'REACTOR SCRAM - OVERHEAT';
        this.messageColor = '#ff4a3a';
        this.sound.alarm();
      }
      if (e === 'gyroAligned') this.sound.beep(1700, 0.06, 0.07);
      if (e === 'legDenied') {
        c.switches.legLock.set(true);
        s.prev.legLock = true;
        this.sound.beep(400, 0.25, 0.1);
        this.message = 'LEG LOCK: REACTOR/HYD/GYRO NOT READY';
        this.messageColor = '#ffb347';
      }
      if (e === 'legsReleased') {
        this.sound.one('leg_release', 1.0);
        this.headVel.y -= 0.35;
        this.shake += 0.8;
        this.message = 'LEGS FREE';
        this.messageColor = null;
      }
    }
    this.sound.apuRun(s.apuRpm > 0.02 && this.sw.apu && s.battBus);
    if (this.state === 'cockpit') this.updateMix();
    // the reactor shakes the cabin while it lights
    if (s.reactorState === 'igniting') this.shake = Math.max(this.shake, 0.3 + s.ignT * 0.1);

    // electrics drive the cockpit
    c.setElectrics(s.battBus, s.mainBus, this.sw.lights);
    for (const k in c.mfd) c.mfd[k].on = s.mainBus;
    c.hud.on = s.mainBus && this.sw.hud;
    c.mfd.camera.uniforms.useFeed.value = s.mainBus && this.sw.optics ? 1 : 0;
    c.mfd.camera.uniforms.nv.value = this.sw.nv ? 1 : 0;

    // warnings and master caution
    const caution = s.warnings.length > 0;
    if (caution && !this.caution.active) {
      this.caution.acked = false;
      this.sound.alarm();
      if (this.state === 'cockpit' && this.time - this.nag > 10) {
        this.nag = this.time;
        this.radio.say('v19', this.voiceText.v19);
      }
    }
    this.caution.active = caution;
    const L = c.lamps;
    L.batt.on = s.battBus;
    L.apu.on = s.apuReady;
    L.pwrA.on = s.mainBus && this.sw.gen1;
    L.pwrB.on = s.mainBus && this.sw.gen2;
    L.heat.on = s.heat > 0.7;
    L.armor.on = s.mainBus;
    L.lock.on = caution && !this.caution.acked;
    c.alarm.active = caution && !this.caution.acked;

    // needles only move with power on the instruments
    const g = c.gauges;
    const live = s.battBus ? 1 : 0;
    g.reactor.set(s.reactor * 100 * live);
    g.hyd.set(s.hyd * 30 * 0.92 * live);
    g.temp.set((15 + ((s.heat - 0.1) / 0.9) * 360) * live);
    g.speed.set(Math.abs(this.mech.speed) * 3.6 * live);
  }

  updateLook(dt, inp) {
    const free = this.view === 'front';
    const dyaw = free ? -inp.dx * LOOK.sens * (1 - this.zoom * 0.6) : 0;
    const dpitch = free ? -inp.dy * LOOK.sens * (1 - this.zoom * 0.6) : 0;
    // focus views fade in and out; the right mouse button zooms in free look
    const vt = free ? 0 : 1;
    this.viewBlend += (vt - this.viewBlend) * Math.min(1, dt * 5.5);
    if (Math.abs(this.viewBlend - vt) < 0.002) this.viewBlend = vt;
    const zt = free && this.input.rmb ? 1 : 0;
    this.zoom += (zt - this.zoom) * Math.min(1, dt * 8);
    this.yaw = clamp(this.yaw + dyaw, -LOOK.yaw, LOOK.yaw);
    this.pitch = clamp(this.pitch + dpitch, -LOOK.down, LOOK.up);
    if (this.input.hit('KeyC')) {
      this.yaw = 0;
      this.pitch = -9 * DEG;
    }
    for (const name of VIEW_ORDER) if (this.input.hit(VIEWS[name].key)) this.setView(name);
    if (!free && (this.input.hit('Escape') || inp.rmbClicked)) this.setView('front');
    const rate = Math.hypot(dyaw, dpitch) / Math.max(dt, 1e-3);
    this.lookRate += (rate - this.lookRate) * Math.min(1, dt * 8);
  }

  updateMech(dt) {
    const I = this.input;
    const playing = this.state === 'cockpit';
    const thr = playing ? (I.down('KeyW', 'ArrowUp') ? 1 : I.down('KeyS', 'ArrowDown') ? -1 : 0) : 0;
    const turn = playing ? (I.down('KeyA', 'ArrowLeft') ? 1 : I.down('KeyD', 'ArrowRight') ? -1 : 0) : 0;
    const stop = playing && (I.down('KeyX', 'Space') || I.hit('KeyX') || I.hit('Space'));
    this.turnInput = turn;
    if (!this.sys.canWalk) {
      // the lever moves, the legs do not
      const m = this.mech;
      if (stop) m.throttle = 0;
      m.throttle = clamp(m.throttle + thr * MECH.throttleRate * dt, MECH.minThrottle, 1);
      m.speed = Math.max(0, Math.abs(m.speed) - 6 * dt) * Math.sign(m.speed);
      m.turn = 0;
      if (playing && (thr !== 0 || turn !== 0) && this.sys.legsLocked && this.time - this.nag > 15) {
        this.nag = this.time;
        if (this.sys.battBus) this.radio.say('v20', this.voiceText.v20);
        else this.complainNoPower();
      }
    } else {
      const events = stepMech(this.mech, { throttle: thr, turn, stop }, dt, this.world.colliders, WORLD.bounds);
      for (const e of events) this.footstep(e);
    }
    const target = this.world.heightAt(this.mech.x, this.mech.z);
    this.groundY += (target - this.groundY) * Math.min(1, dt * 3);
  }

  /** one foot hits the ground: sound on that side, the frame groans, things rattle */
  footstep(e) {
    const s = e.strength;
    this.sound.footstep(s, e.foot);
    this.sound.one('hyd_step', 0.16 + 0.14 * s, 0.92 + Math.random() * 0.16, undefined, 0.03, e.foot * 0.25);
    if (Math.random() < 0.5) this.sound.one(Math.random() < 0.5 ? 'creak_1' : 'creak_2', 0.18 + 0.25 * s, 0.85 + Math.random() * 0.3, undefined, 0.08 + Math.random() * 0.2);
    if (s > 0.55 && Math.random() < 0.45) this.sound.one('rattle', 0.15 + 0.2 * s, 0.9 + Math.random() * 0.2, undefined, 0.05);
    this.shake += 0.35 * s;
    this.cockpit.jolt(s);
    for (const gg of Object.values(this.cockpit.gauges)) gg.kick(0.2 * s);
  }

  /** slope of the ground under the feet (pitch: front higher = nose up, roll: right higher = +) */
  groundSlope() {
    const m = this.mech;
    const fx = -Math.sin(m.heading);
    const fz = -Math.cos(m.heading);
    const h = (dx, dz) => this.world.heightAt(m.x + dx, m.z + dz);
    const front = h(fx * 1.3, fz * 1.3);
    const back = h(-fx * 1.3, -fz * 1.3);
    const right = h(-fz * 1.0, fx * 1.0);
    const left = h(fz * 1.0, -fx * 1.0);
    return { pitch: Math.atan2(front - back, 2.6), roll: Math.atan2(right - left, 2.0) };
  }

  placeMech(b = null) {
    const m = this.mech;
    this.mechObj.position.set(m.x, this.groundY + MECH.eyeHeight + (b ? b.y : 0), m.z);
    this.mechObj.rotation.set(b ? b.pitch : 0, m.heading + (b ? b.yaw : 0), b ? b.roll : 0);
    this.mechObj.updateMatrix();
    if (b) this.mechObj.translateX(b.x);
    this.mechObj.updateMatrixWorld(true);
    // the exterior model rides along (its origin is at the feet)
    const pm = this.world.playerMech;
    // from inside, the (double-sided) exterior model would block the visor
    pm.visible = !(this.state === 'cockpit' || (this.state === 'entry' && this.entry?.phase === 'inside'));
    pm.position.copy(this.mechObj.position);
    pm.position.y -= MECH.eyeHeight;
    pm.quaternion.copy(this.mechObj.quaternion);
    pm.updateMatrixWorld(true);
  }

  updateCameras(dt, pose) {
    const stab = this.sw.stab && this.sys.gyro > 0.9;
    const m = this.mech;
    // the walker's torso (= cockpit) pose from the gait, and the pilot's head inside it
    const b = this.body.update(dt, m, this.groundSlope(), stab);
    const head = this.body.head;
    // extra impulses (leg release, impacts) on a separate spring
    this.headVel.addScaledVector(this.headOff, -90 * dt).multiplyScalar(Math.max(0, 1 - (stab ? 13 : 8) * dt));
    this.headOff.addScaledVector(this.headVel, dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.shock = Math.max(0, this.shock - dt * 2) + this.shake * 0.02;
    const sh = this.shake * (stab ? 0.5 : 1) * 0.004;
    const t = this.time;
    const n = (a, c) => Math.sin(t * a) * Math.sin(t * c * 1.37);
    const idle = 0.0004 * (this.sys.reactorState === 'running' ? 1 : this.sys.apuRpm * 0.4);
    if (pose) {
      this.cockpitCam.position.copy(pose.pos);
      this.cockpitCam.lookAt(pose.look);
      this.cockpitCam.rotateY(pose.lookOff.yaw);
      this.cockpitCam.rotateX(pose.lookOff.pitch);
    } else {
      this.cockpitCam.position.set(
        head.p[0] + this.headOff.x + n(41, 23) * sh + n(97, 61) * idle,
        head.p[1] + this.headOff.y + n(37, 29) * sh + n(89, 53) * idle,
        head.p[2] + this.headOff.z,
      );
      // the head partly keeps level while the cabin rolls and pitches around it
      this._qs ??= new THREE.Quaternion();
      this._ql ??= new THREE.Quaternion();
      this._e ??= new THREE.Euler();
      this._qs.setFromEuler(this._e.set(head.pitch + n(43, 31) * sh * 1.5, head.yaw, head.roll + n(33, 19) * sh, 'XYZ'));
      this._ql.setFromEuler(this._e.set(this.pitch, this.yaw + n(29, 47) * sh, 0, 'YXZ'));
      const e = this.viewBlend * this.viewBlend * (3 - 2 * this.viewBlend);
      if (e > 0) {
        // lean towards the panel in focus
        this._ql.slerp(this.focusPose.q, e);
        this.cockpitCam.position.addScaledVector(this.focusPose.pos, e);
      }
      this.cockpitCam.quaternion.copy(this._qs).multiply(this._ql);
      const fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(70, this.focusPose.fov, e), ZOOM_FOV, this.zoom);
      if (Math.abs(fov - this.fov) > 0.01) {
        this.fov = fov;
        for (const cam of [this.cockpitCam, this.worldCam]) {
          cam.fov = fov;
          cam.updateProjectionMatrix();
        }
      }
    }
    if (this.debugCam) {
      this.cockpitCam.position.set(...this.debugCam.pos);
      this.cockpitCam.lookAt(...this.debugCam.look);
    }
    this.cockpitCam.updateMatrixWorld(true);
    this.cockpit.setTags(this.body.tags, dt);

    this.placeMech(b);
    if (this.freeCam || this.state === 'title' || (this.state === 'entry' && this.entry.phase === 'outside')) return;
    const wm = new THREE.Matrix4().multiplyMatrices(this.mechObj.matrixWorld, this.cockpitCam.matrixWorld);
    wm.decompose(this.worldCam.position, this.worldCam.quaternion, this.worldCam.scale);
    this.worldCam.updateMatrixWorld(true);

    // the hull camera for the centre display sways with the torso
    this.feedCam.position.copy(this.mechObj.position).add(new THREE.Vector3(-Math.sin(m.heading), -0.3, -Math.cos(m.heading)).multiplyScalar(1.2));
    this.feedCam.rotation.set(-1.5 * DEG + b.pitch, m.heading + b.yaw, b.roll, 'YXZ');
    this.feedCam.updateMatrixWorld(true);
  }

  measureRange() {
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
    if (this.state !== 'cockpit') {
      this.hovered = null;
      ui.hover(null, false);
      return;
    }
    const center = this.input.locked && !this.input.cursorMode;
    this.ray.setFromCamera(center ? new THREE.Vector2(0, 0) : new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.cockpitCam);
    this.ray.far = 2.2;
    const hits = this.ray.intersectObjects(this.cockpit.hitTargets, false);
    const ctl = hits.length ? hits[0].object.userData.control : null;
    this.hovered = ctl;
    const hint = ctl && KEY_HINTS[ctl.label];
    ui.hover(ctl ? (hint ? `${ctl.label.replace('\n', ' ')}  [${hint}]` : ctl.label.replace('\n', ' ')) : null, center, !center && this.input.mouse);
    if (inp.clicked && ctl) ctl.toggle();
  }

  hotkeys() {
    const I = this.input;
    const sw = this.cockpit.switches;
    const map = { KeyL: 'lights', KeyH: 'hud', KeyN: 'nv', KeyR: 'radar', KeyG: 'stab', KeyO: 'optics' };
    for (const [code, key] of Object.entries(map)) if (I.hit(code)) sw[key].toggle();
    if (I.hit('KeyM')) this.sound.setMuted(!this.sound.muted);
    if (I.hit('KeyQ') && this.caution.active) this.cockpit.lamps.lock.toggle();
    if (I.hit('F1') || I.hit('Tab') || I.hit('Slash')) ui.toggleHelp();
  }

  /** tutorial target: pulsing marker on the control + arrow when it is off screen */
  updateMarker() {
    const key = this.tutorial.active ? this.tutorial.targetKey() : null;
    const ctl = key ? this.cockpit.switches[key] || this.cockpit.lamps[key] : null;
    const mesh = ctl ? ctl.hit || ctl.cap : null;
    this.cockpit.setMarker(ctl, this.cockpitCam, this.time);
    if (!mesh) return ui.arrow(null);
    const p = mesh.getWorldPosition(new THREE.Vector3()).project(this.cockpitCam);
    const behind = p.z > 1;
    const on = !behind && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.9;
    const view = CONTROL_VIEW[key];
    const vi = VIEW_ORDER.indexOf(view);
    ui.arrow(on ? null : Math.atan2(behind ? -p.y : p.y, behind ? -p.x : p.x), view && this.view !== view ? `Taste ${vi + 1}: ${VIEWS[view].label}` : null);
    ui.viewHint(view && this.view !== view ? view : null);
  }

  drawDisplays() {
    const c = this.cockpit;
    const f = this.frame;
    if (!this.sys.mainBus) return;
    const since = this.time - this.mainUpAt;
    if (since < 3.2) {
      if (f % 3 === 0) for (const k in c.mfd) drawBoot(c.mfd[k], since);
      return;
    }
    const m = this.mech;
    const s = this.sys;
    const clock = new Date();
    const warning = s.warnings[0];
    if (f % 4 === 0)
      drawStatus(c.mfd.status, {
        ...s,
        parts: { head: 0.94, torso: 0.81, larm: 0.62, rarm: 0.9, lleg: 0.77, rleg: 0.88 },
        time: `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`,
        message: warning || this.statusLine(),
        messageColor: warning ? '#ff4a3a' : this.messageColor,
      });
    if (f % 4 === 1)
      drawCamera(c.mfd.camera, {
        heading: m.heading,
        range: this.range,
        nv: this.sw.nv,
        zoom: 4,
        contact: this.sw.optics ? null : 'OPTICS OFF',
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

  statusLine() {
    const s = this.sys;
    if (s.reactorState === 'igniting') return `REACTOR IGNITION ${Math.round((s.ignT / 7) * 100)}%`;
    if (this.sw.stab && s.gyro < 1 && s.mainBus) return `GYRO ALIGN ${Math.round(s.gyro * 100)}%`;
    if (s.legsLocked && s.reactorState === 'running') return 'LEGS LOCKED';
    return this.message;
  }

  hudWaypoint() {
    if (this.waypoint == null) return null;
    const b = this.world.beacons[this.waypoint];
    const dx = b.x - this.mech.x;
    const dz = b.z - this.mech.z;
    return { bearing: Math.atan2(-dx, -dz), dist: Math.hypot(dx, dz), label: b.label };
  }

  update(dt) {
    this.time += dt;
    this.frame++;
    const inp = this.input.consume();
    let pose = null;
    if (this.state === 'title') {
      // slow orbit around the parked mech behind the title screen
      const a = this.time * 0.05 + 2.4;
      this.worldCam.position.set(Math.sin(a) * 15, 2.4, Math.cos(a) * 15);
      this.worldCam.lookAt(0, 3.0, 0);
      this.worldCam.updateMatrixWorld(true);
    } else if (this.state === 'entry') {
      if (this.input.hit('Space') || this.input.hit('Enter') || this.input.hit('KeyE')) this.entry.skip();
      pose = this.entry.update(dt, inp);
      if (this.entry.done) this.enterCockpitState();
    } else if (this.state === 'cockpit') {
      this.hotkeys();
      this.updateLook(dt, inp);
      this.tutorial.update(dt);
    }
    if (this.state !== 'title') this.updateSystems(dt);
    this.updateMech(dt);
    this.updateCameras(dt, pose);
    if (this.frame % 6 === 0) this.measureRange();
    this.updateInteraction(inp);
    this.updateMarker();

    this.world.update(dt, this.time, this.worldCam.position);
    const fx = this.world.effects;
    const fwd = new THREE.Vector3(-Math.sin(this.mech.heading), 0, -Math.cos(this.mech.heading));
    const inFront = Math.max(0, fx.flashDir.dot(fwd));
    this.cockpit.setDaylight(0.85 + 0.15 * Math.sin(this.mech.heading * 1.3), fx.flashLevel * (0.25 + inFront), new THREE.Color(1, 0.6, 0.3));

    this.cockpit.update(dt, this.time, { throttle: this.mech.throttle, turnInput: this.turnInput || 0, lookPitchRate: 0 }, this.hovered);
    this.cockpit.hud.update(dt, {
      heading: this.mech.heading,
      speed: this.mech.speed,
      throttle: this.mech.throttle,
      look: this.yaw,
      stab: this.sw.stab && this.sys.gyro >= 1,
      nv: this.sw.nv,
      lights: this.sw.lights,
      warning: this.sys.warnings[0] || (this.sys.legsLocked ? 'LEG LOCK' : ''),
      waypoint: this.hudWaypoint(),
      time: this.time,
    });
    this.drawDisplays();
    this.sound.update({ turn: this.mech.turn, lookRate: this.state === 'cockpit' ? this.lookRate : 0, speed: this.mech.speed, reactor: this.sys.reactor });
    ui.update(this);
  }

  render() {
    // the boarding video covers the screen: no need to draw the world behind it
    if (this.state === 'entry' && this.entry.phase === 'video') return;
    if (this.frame % 2 === 0 && this.sw.optics && this.sys.mainBus && this.state === 'cockpit') {
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
let last = performance.now();

function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
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
    if (params.has('skip')) {
      // test hook: straight into a running cockpit
      game.goHot();
      game.mode = 'free';
      game.input.enabled = true;
      ui.hideTitle();
      game.enterCockpitState();
    } else if (params.has('cold')) {
      // test hook: straight into the cold cockpit with the tutorial
      game.mode = 'mission';
      game.input.enabled = true;
      ui.hideTitle();
      game.enterCockpitState();
    } else ui.ready(() => game.startMission(), () => game.startFree());
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
