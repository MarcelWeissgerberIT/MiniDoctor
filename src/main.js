import * as THREE from 'three';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import './style.css';
import { Assets } from './assets.js';
import { Cockpit } from './cockpit/cockpit.js';
import { drawBoot, drawStatus, drawCamera, drawTactical, drawComms, drawTargetList, drawDrone } from './cockpit/displays.js';
import { Drone } from './combat/drone.js';
import { Comms, speakerOf } from './cockpit/comms.js';
import { World, WORLD } from './world/world.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Sound, Radio } from './audio.js';
import { createMechState, stepMech, MECH, clamp, stepLength } from './logic/mech.js';
import { BodyDynamics } from './logic/gait.js';
import { createSystems, stepSystems, hotSwitches } from './logic/systems.js';
import { Tutorial, VOICE_TEXT, TRAINING_TEXT } from './tutorial.js';
import { Range } from './training.js';
import { EntrySequence } from './entry.js';
import { UI } from './ui.js';
import { VIEWS, VIEW_ORDER, CONTROL_VIEW, ZOOM_FOV } from './cockpit/views.js';
import { Arsenal } from './combat/arsenal.js';
import { GunRig } from './combat/gunrig.js';
import { Enemies } from './combat/enemies.js';
import { HMD } from './combat/hmd.js';
import { Mission, MISSIONS, MISSION_TEXT } from './missions.js';
import { Allies, LANCE } from './combat/allies.js';
import { ORDERS } from './logic/allies.js';
import { MISSILE, PART_NAMES, createParts, mechDestroyed, weaponState, gunInLimits } from './logic/combat.js';
import { armorFace, MECH_ARMOR, hitPart, applyHitAt, systemHit, SYSTEMS, ENEMY_TYPES, observe, isKnown } from './logic/combat.js';
import { fitModel } from './geom.js';

const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const TYPE_NAME = { tank: 'KAMPFPANZER', apc: 'SCHÜTZENPANZER', depot: 'DEPOT' };
const TYPE_SHORT = { tank: 'PZ', apc: 'SPZ', depot: 'DEP' };
const FACE_NAME = { front: 'FRONT', side: 'SEITE', rear: 'HECK' };
const STATE_NAME = { advance: 'VORRÜCKEN', engage: 'GEFECHT', cover: 'DECKUNG', flank: 'FLANKE', dead: 'ZERSTÖRT' };
/** compass degrees (clockwise from north) of a heading-convention angle */
const compass = (a) => Math.round(((-a / DEG) % 360) + 360) % 360;
/** clock position of a bearing relative to the hull (+ = left), 12 = ahead */
const clockOf = (rel) => ((Math.round(-rel / (Math.PI / 6)) % 12) + 12) % 12 || 12;
const LOOK = { yaw: 125 * DEG, up: 62 * DEG, down: 68 * DEG, sens: 0.0022 };
const SWITCH_KEYS = ['batt', 'apu', 'gen1', 'gen2', 'hydp', 'pump', 'coolant', 'reactor', 'stab', 'legLock', 'lights', 'hud', 'optics', 'nv', 'wpnArm', 'gun', 'missile', 'firesup', 'mg'];
const newStats = () => ({ kills: 0, hitsTaken: 0, start: 0 });
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
    this.voiceText = { ...VOICE_TEXT, ...TRAINING_TEXT, ...EXTRA_VOICE, ...MISSION_TEXT };
    this.firingRange = new Range(this);
    this.tutorial = new Tutorial(this, ui);
    this.comms = new Comms();
    this.ray = new THREE.Raycaster();
    this.assets = assets;

    // combat
    this.enemies = new Enemies(this);
    this.allies = new Allies(this);
    this.arsenal = new Arsenal(this);
    this.gunRig = new GunRig(this);
    this.gunRig.visible = false;
    this.kick = 0; // recoil kick of the view (rad)
    // the player as a target for enemy gunners (kept as one object: they remember it)
    const game = this;
    this.playerTarget = {
      isPlayer: true,
      x: 0,
      z: 0,
      speed: 0,
      dead: false,
      // the gunners lead a walking mech
      get vx() {
        return -Math.sin(game.mech.heading) * game.mech.speed;
      },
      get vz() {
        return -Math.cos(game.mech.heading) * game.mech.speed;
      },
      center: (out) => out.copy(this.mechObj.position).add(new THREE.Vector3(0, -0.7, 0)),
      onHit: (s, at) => this.onPlayerHit(s, at),
    };
    this.failed = {}; // knocked-out systems (optics, sensors, gyro, cooling, missiles, hydraulics)
    this.drone = new Drone(this);
    // interactive displays: page per display, the cursor in the target list, what is open
    this.pages = { status: 'status', camera: 'camera' };
    this.selected = null;
    this.listFilter = 'all';
    this.listScroll = 0;
    this.droneMode = false;
    this.openMfd = null;
    this.hmd = new HMD(document.getElementById('hmd'));
    this.parts = createParts();
    this.fire = null;
    this.fireCharges = 3;
    this.dead = false;
    this.stats = newStats();
    this.lockBeep = 0;
    this.radioBusyUntil = 0;
    this.mission = null;
    // third-person view (key 9)
    this.external = false;
    this.ext = { yaw: 0.6, pitch: 0.2, dist: 19 };
    this.buildRig();

    this.mech = createMechState(0, 0, 0);
    this.body = new BodyDynamics();
    this.groundY = this.world.heightAt(0, 0);
    this.sys = createSystems(false);
    this.sw = this.switchSnapshot();
    this.yaw = 0;
    this.pitch = -5 * DEG;
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
    bind('wpnArm', (on) => {
      say(on ? 'MASTER ARM - WEAPONS HOT' : 'WEAPONS SAFE', on ? '#ff4a3a' : null);
      if (on && this.sys.mainBus) this.sound.beep(980, 0.09, 0.08);
    });
    bind('gun', (on) => say(on ? 'MAIN GUN 30MM READY' : 'MAIN GUN SAFE'));
    bind('missile', (on) => say(on ? `MISSILES ${this.arsenal.w.missiles.count} READY` : 'MISSILES SAFE'));
    bind('mg', (on) => say(on ? 'COAX MG 7.62 READY' : 'COAX MG SAFE'));
    bind('aux', (on) => on && say('AUX: OFFLINE', '#ffb347'));
    bind('pump', (on) => say(on ? 'COOLANT PUMP ON' : 'COOLANT PUMP OFF', on ? null : '#ffb347'));
    bind('hydp', (on) => {
      if (on && this.sys.mainBus) this.sound.one('hyd_pump', 0.7);
      say(on ? 'HYDRAULIC PUMP ON' : 'HYDRAULIC PUMP OFF');
    });
    bind('ecm', (on) => say(on ? 'ECM JAMMING' : 'ECM OFF'));
    bind('firesup', (on) => on && this.dischargeExtinguisher());
    bind('coolant', (on) => say(on ? 'COOLANT BYPASS OPEN' : 'COOLANT BYPASS CLOSED'));
    bind('reactor');
    bind('legLock');
  }

  /** lean to a panel (focus view) or back to free look */
  setView(name) {
    if (this.state !== 'cockpit') return;
    if (name === 'external') return this.setExternal(!this.external);
    if (this.external) this.setExternal(false);
    if (name === this.view && name !== 'front') name = 'front';
    this.openMfd = null;
    this.droneMode = false;
    ui.mfdOpen(false);
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

  /** radio line that also tells the mission how long the channel is busy */
  say(key, text) {
    const dur = this.radio.say(key, text ?? this.voiceText[key]);
    this.radioBusyUntil = this.time + (dur || 3) + 0.5;
    // the speaker's face on the left display (needs main power)
    this.comms.start(speakerOf(key), dur || 3, this.time);
  }

  /* ------------------------------------------------------- external view */

  /** the rigged, animated copy of the mech for the third-person view */
  buildRig() {
    const src = assets.models.mech_rigged;
    const clip = src?.animations?.[0];
    if (!src || !clip) return;
    const body = fitModel(src, { height: MECH.height, rotY: Math.PI });
    body.traverse((o) => {
      if (o.isMesh) {
        o.material.envMapIntensity = 0.45;
        o.material.metalness = 0.55;
        o.frustumCulled = false;
      }
    });
    this.world.playerMech.add(body);
    this.world.playerMech.updateMatrixWorld(true);
    this.world.centreOnTorso(body);
    body.visible = false;
    const mixer = new THREE.AnimationMixer(src);
    const action = mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(0);
    let hips = null;
    src.traverse((o) => {
      if (o.isBone && !hips && /hips/i.test(o.name)) hips = o;
    });
    this.rig = { body, mixer, action, dur: clip.duration, phase: 0, weight: 0, hips, hipsBind: hips?.position.clone() };
  }

  setExternal(on) {
    if (on === this.external || this.state !== 'cockpit') return;
    this.external = on;
    if (on) this.extSeen = true;
    if (on && this.view !== 'front') {
      this.view = 'front';
      this.viewBlend = 0;
      this.input.cursorMode = false;
    }
    this.post.cockpitPass.enabled = !on;
    ui.setView(on ? 'external' : 'front');
    this.sound.click('button');
    this.fov = -1; // refresh the cockpit field of view on the way back in
    if (on) {
      this.ext.yaw = 0.5;
      this.ext.pitch = 0.22;
      this.ext.h = this.mech.heading;
    }
  }

  /** walk cycle synced to the simulated steps (one clip cycle = two steps) */
  updateRig(dt) {
    const r = this.rig;
    if (!r || !this.external) return;
    const m = this.mech;
    const sp = Math.abs(m.speed);
    const rate = sp > 0.05 ? sp / stepLength(sp) : Math.abs(m.turn) * 1.4;
    r.phase = (r.phase + ((dt * rate) / 2) * (m.speed < -0.05 ? -1 : 1) + 1) % 1;
    const w = clamp(sp / 1.2 + Math.abs(m.turn) * 0.8, 0, 1);
    r.weight += (w - r.weight) * Math.min(1, dt * 4);
    r.action.setEffectiveWeight(r.weight);
    r.action.time = r.phase * r.dur;
    r.mixer.update(0);
    // the clip walks forward on its own: keep it on the spot, our simulation moves the mech
    if (r.hips) {
      r.hips.position.x = r.hipsBind.x;
      r.hips.position.z = r.hipsBind.z;
    }
  }

  updateExternalCam(dt) {
    const m = this.mech;
    const e = this.ext;
    e.h += Math.atan2(Math.sin(m.heading - e.h), Math.cos(m.heading - e.h)) * Math.min(1, dt * 2.5);
    const yaw = e.h + e.yaw;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const pivot = new THREE.Vector3(m.x, this.groundY + 4.4, m.z);
    const cam = this.worldCam;
    cam.position.copy(pivot).addScaledVector(fwd, -e.dist * Math.cos(e.pitch));
    cam.position.y += e.dist * Math.sin(e.pitch);
    const gy = this.world.heightAt(cam.position.x, cam.position.z) + 1.2;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(pivot.addScaledVector(fwd, 40));
    const fov = this.fitFov(60);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
  }

  /* -------------------------------------------------------------- combat */

  updateCombat(dt) {
    const live = weaponState(this.sw, this.sys.mainBus);
    live.gun = live.gun && this.parts.rarm > 0 && !this.dead;
    live.missile = live.missile && !this.dead;
    const cam = this.worldCam;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    // the gun is slaved to the helmet within its traverse (measured in the torso frame)
    const local = dir.clone().applyQuaternion(this.mechObj.quaternion.clone().invert());
    const inLimits = gunInLimits(Math.atan2(-local.x, -local.z), Math.asin(clamp(local.y, -1, 1)));
    const aiming = this.view === 'front' && !this.hovered && !this.dead && (this.input.locked || this.external);
    // the visible arm swings towards where the pilot looks
    if (!this.aimPt || this.frame % 2 === 0) this.aimPt = this.arsenal.aimPoint(cam.position, dir, this.aimPt || new THREE.Vector3());
    this.gunRig.update(dt, { mechObj: this.mechObj, aim: this.aimPt, heat: this.arsenal.w.gun.heat, show: !this.external });
    this.arsenal.update(dt, {
      live,
      rig: this.gunRig,
      triggerMG: aiming && this.input.down('KeyE'),
      trigger: aiming && this.input.lmb,
      launch: !this.dead && this.input.hit('KeyF'),
      inLimits,
      origin: cam.position.clone(),
      dir,
      mechObj: this.mechObj,
    });
    this.weaponLive = { ...live, inLimits };
    if (live.master && this.frame % 6 === 0) this.aimRange = this.arsenal.aimPoint(cam.position, dir).distanceTo(cam.position);
    // seeker tone: slow growl while locking, fast high tone once locked
    const ms = this.arsenal.w.missiles;
    this.lockBeep -= dt;
    if (live.missile && ms.lockT > 0 && this.lockBeep <= 0) {
      if (ms.locked) {
        this.sound.beep(1650, 0.08, 0.045);
        this.lockBeep = 0.12;
      } else {
        this.sound.beep(860, 0.06, 0.03);
        this.lockBeep = 0.34 - (ms.lockT / MISSILE.lockTime) * 0.2;
      }
    }
    const m = this.mech;
    // who can the pilot actually see (seeker lock needs it); a few vehicles per frame
    const vis = this.enemies.alive();
    for (let k = 0; k < Math.min(3, vis.length); k++) {
      const e = vis[(this.frame * 3 + k) % vis.length];
      const top = this.enemies.center(e, new THREE.Vector3());
      top.y += e.height * 0.35;
      e.losPlayer = this.world.lineOfSight(cam.position, top);
      // what we see goes on the displays (and stays there for a while as a track)
      if (e.losPlayer && Math.hypot(e.x - this.mech.x, e.z - this.mech.z) < 2200) observe(e, this.time);
      else if (e.droneMark > this.time) observe(e, this.time);
    }
    // the lance shares what its mechs see over the datalink (one pair per frame)
    const wl = this.allies.list.filter((w) => !w.dead);
    if (wl.length && vis.length && !this.failed.sensors) {
      const w = wl[this.frame % wl.length];
      const e = vis[(this.frame >> 1) % vis.length];
      if (Math.hypot(e.x - w.x, e.z - w.z) < 900) {
        const top = this.enemies.center(e, new THREE.Vector3());
        top.y += e.height * 0.35;
        if (this.world.lineOfSight(this.allies.center(w, new THREE.Vector3()).add(new THREE.Vector3(0, 1.5, 0)), top)) observe(e, this.time);
      }
    }
    this.drone.update(dt);
    // a designated vehicle that died or vanished is released
    const des = ms.designated;
    if (des != null) {
      const e = this.enemies.list.find((x) => x.id === des);
      if (!e || e.state === 'dead' || !isKnown(e, this.time)) {
        ms.designated = null;
        if (this.selected === des) this.selected = null;
      }
    }
    // recon: whatever the seeker locks gets marked
    if (ms.locked && this.mission) {
      const e = this.enemies.list.find((x) => x.id === ms.target);
      if (e) this.mission.mark(e);
    }
    this.lanceOrders();
    if (this.allies.list.length) this.allies.update(dt, { leader: { x: m.x, z: m.z, heading: m.heading, speed: m.speed }, time: this.time });
    const pt = this.playerTarget;
    pt.x = m.x;
    pt.z = m.z;
    pt.speed = m.speed;
    pt.dead = this.dead;
    const targets = [pt];
    for (const w of this.allies.list) {
      w.proxy ??= {
        isPlayer: false,
        get x() {
          return w.x;
        },
        get z() {
          return w.z;
        },
        get speed() {
          return w.speed;
        },
        get dead() {
          return w.dead;
        },
        get vx() {
          return -Math.sin(w.heading) * w.speed;
        },
        get vz() {
          return -Math.cos(w.heading) * w.speed;
        },
        center: (out) => this.allies.center(w, out),
        onHit: (s) => this.allies.damage(w, s.dmg * MECH_ARMOR[armorFace(w.heading, w.x, w.z, s.from.x, s.from.z)]),
      };
      targets.push(w.proxy);
    }
    this.enemies.update(dt, { targets, playerCenter: pt.center(new THREE.Vector3()) });
    this.mission?.update();
    this.updateFire(dt);
  }

  /** lance commands: B follow, V hold, T attack the locked / sighted target */
  lanceOrders() {
    const I = this.input;
    if (!this.allies.list.length || this.dead) return;
    let order = null;
    let target = null;
    if (I.hit('KeyB')) order = 'follow';
    else if (I.hit('KeyV')) order = 'hold';
    else if (I.hit('KeyT')) {
      const ms = this.arsenal.w.missiles;
      target = ms.target != null ? this.enemies.list.find((e) => e.id === ms.target && e.state !== 'dead') : null;
      if (!target) {
        // the enemy closest to the line of sight
        const cam = this.worldCam;
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
        let best = 0.2;
        for (const e of this.enemies.alive()) {
          const a = this.enemies.center(e, new THREE.Vector3()).sub(cam.position).normalize().angleTo(dir);
          if (a < best) {
            best = a;
            target = e;
          }
        }
      }
      if (!target) {
        this.hmd.notify('KEIN ZIEL FÜR DIE LANZE', '#ffc15e', 1.5);
        this.sound.beep(400, 0.12, 0.06);
        return;
      }
      order = 'attack';
    }
    if (!order) return;
    const who = this.allies.order(order, target?.id ?? null);
    if (!who) return;
    this.lastLanceOrder = order;
    this.sound.beep(1200, 0.05, 0.05);
    this.hmd.notify(`LANZE: ${ORDERS[order]}${target ? ' ' + (target.label || '') : ''}`, '#a6ffb8', 1.6);
    // one of them acknowledges, taking turns
    this.ackTurn = ((this.ackTurn ?? -1) + 1) % who.length;
    this.wingCall(who[this.ackTurn], order, 0, true);
  }

  /** a wingman on the radio (key: follow, hold, attack, contact, kill, hit, down, ff) */
  wingCall(w, kind, gap = 10, force = false) {
    const key = `${w.voice}_${kind}`;
    w.calls ??= {};
    if (this.time - (w.calls[kind] ?? -1e9) < gap) return;
    if (!force && kind !== 'down' && this.time < this.radioBusyUntil) return;
    w.calls[kind] = this.time;
    this.say(key);
    if (kind === 'down') this.hmd.notify(`${w.name} AUSGEFALLEN`, '#ff5a48', 3);
  }

  onAllyKill(w, e) {
    this.stats.lanceKills = (this.stats.lanceKills ?? 0) + 1;
    this.onEnemyKilled(e, w);
    this.wingCall(w, 'kill', 12);
  }

  allyFootstep(w) {
    const d = Math.hypot(w.x - this.mech.x, w.z - this.mech.z);
    if (d > 90) return;
    const p = new THREE.Vector3(w.x, 0, w.z);
    this.sound.one('footstep', Math.min(0.35, 9 / (d + 8)), 0.95 + Math.random() * 0.1, this.sound.outside, d / 343, this.panOf(p));
    if (d < 40) this.shake += 0.08 * (1 - d / 40);
  }

  allyGun(p) {
    const d = p.distanceTo(this.mechObj.position);
    this.sound.one('gun_shot', clamp(30 / (d + 20), 0.03, 0.4), 0.85 + Math.random() * 0.1, this.sound.outside, Math.min(3, d / 343), this.panOf(p));
  }

  allyMissile(p) {
    const d = p.distanceTo(this.mechObj.position);
    this.sound.one('missile_launch', clamp(40 / (d + 20), 0.05, 0.6), 1, this.sound.outside, Math.min(3, d / 343), this.panOf(p));
  }

  onGunFired(mg = false) {
    const pan = this.external ? 0 : 0.45;
    if (mg) {
      // light and fast: a rattle, a small twitch
      this.sound.one('gun_shot', 0.2, 1.7 + Math.random() * 0.15, undefined, 0, pan);
      this.shake += 0.05;
      this.kick += 0.0012;
      if (Math.random() < 0.3) this.cockpit.gunFlash();
      return;
    }
    // 30 mm: the whole cabin takes the blow, the view kicks up and settles
    this.sound.one('gun_shot', 0.6, 0.92 + Math.random() * 0.1, undefined, 0, pan);
    this.sound.thump(62, 0.35, 0.18);
    this.shake += 0.32;
    this.kick += 0.011;
    this.headVel.z += 0.07;
    this.headVel.x -= 0.02;
    this.cockpit.gunFlash();
    this.cockpit.jolt(0.18);
  }

  onGunOverheat() {
    this.hmd.notify('KANONE ÜBERHITZT', '#ff5a48', 2);
    this.sound.beep(480, 0.2, 0.08);
    this.mission?.call('m2_08', 40);
  }

  onMissileLaunched() {
    this.sound.one('missile_launch', 0.8, 0.95 + Math.random() * 0.1, undefined, 0, this.external ? 0 : -0.4);
    this.shake += 0.4;
    this.cockpit.jolt(0.3);
  }

  onEnemyKilled(e, by = null) {
    this.stats.kills++;
    const what = e.type === 'tank' ? 'PANZER' : e.type === 'apc' ? 'SCHÜTZENPANZER' : 'DEPOTZIEL';
    this.hmd.notify(`${what} ZERSTÖRT${by ? ' · ' + by.name : ''}`, '#a6ffb8', 2.5);
    if (!by && this.mission?.def.id === 'm2') this.mission.call('m2_04', 12);
  }

  /** -1 (left) .. 1 (right) relative to where the pilot looks */
  panOf(p) {
    const b = Math.atan2(-(p.x - this.mech.x), -(p.z - this.mech.z));
    const view = this.mech.heading + (this.external ? this.ext.yaw : this.yaw);
    return clamp(Math.sin(view - b), -0.9, 0.9);
  }

  explosionSound(p, size = 1) {
    const d = p.distanceTo(this.mechObj.position);
    if (d < 450) this.sound.one('explosion_near', clamp((size * 110) / (d + 40), 0.04, 1), 0.85 + Math.random() * 0.25, this.sound.outside, d / 343, this.panOf(p));
    else this.sound.boom(d, size * 0.6);
    if (d < 140) {
      const k = size * (1 - d / 140);
      setTimeout(() => (this.shake += k * 1.4), (d / 343) * 1000);
    }
  }

  distantGun(p, size) {
    const d = p.distanceTo(this.mechObj.position);
    this.sound.one('enemy_cannon', clamp((size * 160) / (d + 60), 0.04, 0.9), 0.9 + Math.random() * 0.15, this.sound.outside, Math.min(4, d / 343), this.panOf(p));
  }

  shellWhizz(p) {
    this.sound.one('shell_whizz', 0.75, 0.9 + Math.random() * 0.2, undefined, 0, this.panOf(p));
  }

  /** a shell struck us at `at` (world): which part, how thick the armour is there, what broke */
  onPlayerHit(shell, at) {
    if (this.dead || this.mission?.ended) return;
    const m = this.mech;
    let part = 'torso';
    if (at) {
      const dx = at.x - m.x;
      const dz = at.z - m.z;
      const lx = dx * Math.cos(m.heading) - dz * Math.sin(m.heading); // metres to our right
      part = hitPart(lx, at.y - this.world.heightAt(m.x, m.z));
    }
    const face = armorFace(m.heading, m.x, m.z, shell.from.x, shell.from.z);
    const dmg = shell.dmg * MECH_ARMOR[face];
    applyHitAt(this.parts, dmg, part);
    const sys = systemHit(this.failed, part, dmg);
    if (sys) this.systemFailed(sys);
    this.stats.hitsTaken++;
    const strength = clamp(dmg / 15, 0.3, 1.3);
    const b = Math.atan2(-(shell.from.x - this.mech.x), -(shell.from.z - this.mech.z));
    const view = this.mech.heading + (this.external ? this.ext.yaw : this.yaw);
    const rel = Math.atan2(Math.sin(view - b), Math.cos(view - b)); // + = from the right
    this.hmd.hitFrom(rel);
    this.shake += 1.2 + strength;
    this.shock = Math.max(this.shock, 0.8);
    this.headVel.x -= Math.sin(rel) * 0.35 * strength;
    this.headVel.z += 0.3 * strength;
    this.sound.one('armor_hit', 0.9 + 0.3 * strength, 0.9 + Math.random() * 0.2, undefined, 0, clamp(Math.sin(rel), -0.8, 0.8));
    this.sound.thump(50, 0.7 * strength, 0.5);
    this.sound.one('sparks', 0.4, 1, undefined, 0.05);
    this.cockpit.hit(strength, part);
    ui.damageFlash(false);
    const pct = Math.round(this.parts[part] * 100);
    this.hmd.notify(`TREFFER ${PART_NAMES[part]}${face === 'rear' ? ' (HECK)' : ''} ${pct}%`, pct < 40 ? '#ff5a48' : '#ffc15e', 2.5);
    if (part === 'rarm' && this.parts.rarm <= 0) this.hmd.notify('KANONE AUSGEFALLEN', '#ff5a48', 3);
    if (this.mech.speed < 2) this.mission?.call('m2_05', 30);
    // a big shell can set the mech alight, the light cannon of an APC rarely
    if (!this.fire && Math.random() < 0.22 * Math.min(1, dmg / 12)) this.startFire(part);
    if (mechDestroyed(this.parts)) this.destroyed();
  }

  /** a system knocked out by a hit: warn, and the rest of the game feels it */
  systemFailed(k) {
    this.hmd.notify(`${SYSTEMS[k]} AUSGEFALLEN`, '#ff5a48', 3.5);
    this.message = `SYS FAIL: ${SYSTEMS[k]}`;
    this.messageColor = '#ff4a3a';
    this.sound.alarm();
    this.sound.one('sparks', 0.5, 0.7);
    if (k === 'optics') this.hmd.notify('KAMERA / ZOOM AUSGEFALLEN', '#ffc15e', 3);
    if (k === 'sensors') this.hmd.notify('DATALINK GESTÖRT · RADAR 250 m', '#ffc15e', 3);
    if (k === 'gyro') this.hmd.notify('STABILISIERUNG AUS', '#ffc15e', 3);
  }

  /** our round struck an enemy's armour: show where (front plates shrug it off) */
  onArmorHit(e, face, f, kind) {
    if (kind === 'mg' && face !== 'rear') return;
    const name = { front: 'FRONT', side: 'SEITE', rear: 'HECK', turret: 'TURM', top: 'DACH' }[face];
    this.hmd.armorHit(`${name} ×${f.toFixed(1)}`, f >= 1.3 ? '#a6ffb8' : f >= 0.9 ? '#effff2' : '#ffc15e');
  }

  /** drill: the training fire (the instructor is already talking, it does no real harm) */
  startFire(part, drill = false) {
    this.fire = { part, t: 0, drill };
    this.sound.alarm();
    if (drill) return;
    if (this.mission) this.mission.call('m2_06', 5);
    else this.say('m2_06');
  }

  /** basic training: the two wingmen walk up next to the trainee */
  spawnTrainingLance() {
    if (this.allies.list.length) return;
    const m = this.mech;
    const back = [Math.sin(m.heading) * 30, Math.cos(m.heading) * 30];
    this.allies.spawn('h2', m.x + back[0] - Math.cos(m.heading) * 18, m.z + back[1] + Math.sin(m.heading) * 18, m.heading);
    this.allies.spawn('h3', m.x + back[0] + Math.cos(m.heading) * 18, m.z + back[1] - Math.sin(m.heading) * 18, m.heading);
    this.lastLanceOrder = null;
  }

  updateFire(dt) {
    // a holed coolant loop: the reactor runs hot
    if (this.failed.cooling && this.sys.heat < 0.8) this.sys.heat = Math.min(0.8, this.sys.heat + 0.012 * dt);
    const f = this.fire;
    this.cockpit.fireLevel = f ? 1 : 0;
    ui.smoke(f ? Math.min(0.5, 0.12 + f.t * 0.02) : 0);
    if (!f) return;
    f.t += dt;
    if (f.drill) return; // smoke and alarm, no real damage
    this.parts[f.part] = Math.max(0, this.parts[f.part] - 0.006 * dt);
    this.parts.torso = Math.max(0, this.parts.torso - 0.003 * dt);
    this.sys.heat = Math.min(0.95, this.sys.heat + 0.025 * dt);
    if (Math.random() < dt * 0.8) this.sound.one('sparks', 0.22, 0.8 + Math.random() * 0.4);
    if (mechDestroyed(this.parts)) this.destroyed();
  }

  /** FIRE SUPPR is a guarded momentary switch: one bottle per throw, then it springs back */
  dischargeExtinguisher() {
    setTimeout(() => this.cockpit.switches.firesup.set(false), 900);
    if (!this.sys.battBus) return this.complainNoPower();
    if (this.fireCharges <= 0) {
      this.message = 'FIRE SUPPR: BOTTLES EMPTY';
      this.messageColor = '#ff4a3a';
      this.sound.beep(400, 0.25, 0.1);
      return;
    }
    this.fireCharges--;
    this.sound.one('extinguisher', 0.9);
    ui.extinguish();
    this.message = `FIRE SUPPR DISCHARGED - ${this.fireCharges} LEFT`;
    this.messageColor = null;
    if (this.fire) {
      const drill = this.fire.drill;
      this.fire = null;
      this.hmd.notify('BRAND GELÖSCHT', '#a6ffb8', 2.5);
      if (!drill) setTimeout(() => this.say('m2_11'), 1400);
    }
  }

  destroyed() {
    if (this.dead) return;
    this.dead = true;
    const p = this.mechObj.position;
    this.world.effects.explosion(p.x, p.y - 1.5, p.z, 9);
    this.sound.one('explosion_near', 1, 0.8);
    this.sound.thump(38, 1, 1.6);
    this.shake += 4;
    this.cockpit.hit(1.5, 'head');
    this.cockpit.crack();
    this.sound.alarm();
    this.mech.throttle = 0;
    this.tutorial.active = false;
    ui.checklist(null);
    this.say('m2_10');
    ui.damageFlash(true);
    setTimeout(() => ui.fade(1, 2.5), 2600);
    setTimeout(() => this.showResult(false), 5400);
  }

  showResult(win) {
    const w = this.arsenal.w;
    const def = this.mission?.def ?? (this.mode === 'mission' ? MISSIONS[0] : null);
    const t = Math.max(0, this.time - this.stats.start);
    const lance = this.allies.list;
    if (win && def) saveProgress(def.id, t);
    ui.result(
      {
        win,
        tag: def ? `MISSION ${def.num} · ${def.name.toUpperCase()}` : '',
        sub: win ? def?.winText : 'BB-07 ist ausgefallen. Mission fehlgeschlagen.',
        rows: [
          ['Abschüsse', `${this.stats.kills - (this.stats.lanceKills ?? 0)}${lance.length ? ` (+${this.stats.lanceKills ?? 0} Lanze)` : ''} / ${def?.total ?? '-'}`],
          ...(lance.length ? [['Lanze', lance.map((x) => `${x.name.replace('HAMMER', 'H')} ${x.dead ? '✕' : Math.round((x.hp / 200) * 100) + '%'}`).join(' · ')]] : []),
          ['Kanone', `${w.gun.hits} Treffer · ${w.gun.shots} Schuss`],
          ['Raketen', `${w.missiles.hits} Treffer · ${w.missiles.fired} gestartet`],
          ['Erlittene Treffer', String(this.stats.hitsTaken)],
          ['Torso', `${Math.round(this.parts.torso * 100)} %`],
          ['Einsatzzeit', `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`],
        ],
      },
      () => (this.mission ? this.restartMission() : location.reload()),
      () => location.reload(),
    );
    this.input.unlock();
  }

  /** clean slate for a new fight */
  resetCombat() {
    this.enemies.clear();
    this.allies.clear();
    this.arsenal.reset();
    this.gunRig.reset();
    this.parts = createParts();
    this.failed = {};
    this.drone.reset();
    this.selected = null;
    this.droneMode = false;
    this.arsenal.w.missiles.designated = null;
    this.world.smokeScreens.length = 0;
    this.world.effects.clearScreens();
    this.fire = null;
    this.fireCharges = 3;
    this.dead = false;
    this.cockpit.clearDamage();
    this.stats = newStats();
    this.stats.start = this.time;
    ui.smoke(0);
  }

  async startCombatMission(def) {
    await this.sound.init();
    this.sound.startAmbience();
    this.input.enabled = true;
    this.input.lock();
    ui.hideTitle();
    this.beginMission(def);
  }

  /** a combat mission from the catalogue: mech hot at the base, lance next to it */
  beginMission(def) {
    this.mode = 'combat';
    this.goHot();
    const armed = !!def.armed;
    this.setSwitches({ wpnArm: armed, gun: armed, missile: armed, mg: armed, firesup: false });
    this.sys.prev = { ...this.switchSnapshot() };
    this.resetCombat();
    this.mech = createMechState(0, 0, 0);
    this.groundY = this.world.heightAt(0, 0);
    this.body = new BodyDynamics();
    for (const h of this.world.hostiles) h.hidden = true;
    this.world.setWaypoint(null);
    this.mission = new Mission(this, def);
    // the lance waits in front of the base gate
    (def.allies || []).forEach((key, i) => this.allies.spawn(key, (i ? 1 : -1) * 16, -42, 0));
    this.tutorial = new Tutorial(this, ui, def.steps, this.voiceText, def.title);
    this.onTutorialDone = () => this.showResult(true);
    if (this.external) this.setExternal(false);
    if (this.state !== 'cockpit') this.enterCockpitState();
    else this.tutorial.start();
    ui.fade(1, 0);
    ui.fade(0, 1.2);
    if (def.comms) ui.comms(def.comms);
  }

  restartMission() {
    ui.hideResult();
    this.input.lock();
    this.beginMission(this.mission.def);
  }

  complainNoPower() {
    if (this.time - this.nag < 12) return;
    this.nag = this.time;
    this.say('v21');
  }

  /**
   * Field of view designed for 16:9. Wider screens keep the same horizontal view,
   * narrow and portrait screens (phones) get more vertical view so the cockpit is not
   * cut down to a keyhole and the panels are not seen at extreme angles.
   */
  fitFov(v) {
    const aspect = innerWidth / innerHeight;
    const f = (2 * Math.atan((Math.tan((v * DEG) / 2) * (16 / 9)) / aspect)) / DEG;
    return clamp(f, v * 0.8, Math.max(v, Math.min(95, v * 1.6)));
  }

  resize() {
    this.fov = -1; // recompute the field of view for the new aspect
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
    this.stats.start = this.time;
    this.onTutorialDone = () => setTimeout(() => this.showResult(true), 2500);
    ui.skipHint(true);
  }

  async startFree() {
    await this.sound.init();
    this.sound.startAmbience();
    this.input.enabled = true;
    this.input.lock();
    ui.hideTitle();
    this.goHot();
    this.setSwitches({ wpnArm: true, gun: true, missile: true, mg: true });
    this.sys.prev = { ...this.switchSnapshot() };
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
    if (this.mode === 'mission' || this.mode === 'combat') this.tutorial.start();
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
        this.say('v18');
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

    // electrics drive the cockpit (a destroyed mech only keeps its battery)
    c.setElectrics(s.battBus, s.mainBus && !this.dead, this.sw.lights);
    for (const k in c.mfd) c.mfd[k].on = s.mainBus && !this.dead;
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
        this.say('v19');
      }
    }
    this.caution.active = caution;
    const L = c.lamps;
    L.batt.on = s.battBus;
    L.apu.on = s.apuReady;
    L.pwrA.on = s.mainBus && this.sw.gen1;
    L.pwrB.on = s.mainBus && this.sw.gen2;
    L.heat.on = s.heat > 0.7;
    L.armor.on = s.mainBus && Object.values(this.parts).some((v) => v < 0.6);
    L.lock.on = caution && !this.caution.acked;
    c.alarm.active = caution && !this.caution.acked;

    // needles only move with power on the instruments
    const g = c.gauges;
    const live = s.battBus ? 1 : 0;
    g.reactor.set(s.reactor * 100 * live);
    g.hyd.set(s.hyd * 30 * 0.92 * live);
    g.temp.set((15 + ((s.heat - 0.1) / 0.9) * 360) * live);
    g.speed.set(Math.abs(this.mech.speed) * 3.6 * live);
    g.coolant.set((this.sw.pump && s.mainBus ? s.coolant * 100 : 0) * live);
    g.apu.set(s.apuRpm * 100 * live);
    g.gyro.set(s.gyro * 100 * live);
    g.core.set(s.heat * 100 * live);
    g.amp.set((s.mainBus ? 140 + s.reactor * 120 + Math.abs(this.mech.speed) * 9 : s.battBus ? 35 : 0) * live);
    // segment readouts
    if (this.frame % 5 === 0) {
      const sg = c.segs;
      const m = this.mech;
      const now = new Date();
      sg.clock.set(`${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`);
      const hdg = String(Math.round(((-m.heading * 180) / Math.PI + 3600) % 360) % 360).padStart(3, '0');
      sg.podHdg.set(hdg);
      sg.hdg.set(hdg);
      sg.range.set(this.range ? String(Math.min(9999, Math.round(this.range))) : '----');
      sg.ammo.set(String(this.arsenal.w.gun.ammo).padStart(3, '0'));
      sg.thr.set(String(Math.round(m.throttle * 100)));
      sg.spd.set(String(Math.round(Math.abs(m.speed) * 3.6)));
    }
  }

  updateLook(dt, inp) {
    if (this.external) {
      // orbit the camera around the mech; view keys bring you back inside
      this.ext.yaw = Math.atan2(Math.sin(this.ext.yaw - inp.dx * 0.004), Math.cos(this.ext.yaw - inp.dx * 0.004));
      this.ext.pitch = clamp(this.ext.pitch + inp.dy * 0.003, -0.2, 1.0);
      this.ext.dist = clamp(this.ext.dist + inp.wheel * 1.6, 9, 45);
      for (const name of VIEW_ORDER) if (this.input.hit(VIEWS[name].key)) this.setView(name);
      if (this.input.hit('Escape')) this.setExternal(false);
      return;
    }
    const free = this.view === 'front';
    const dyaw = free ? -inp.dx * LOOK.sens * (1 - this.zoom * 0.6) : 0;
    const dpitch = free ? -inp.dy * LOOK.sens * (1 - this.zoom * 0.6) : 0;
    // focus views fade in and out; the right mouse button zooms in free look
    const vt = free ? 0 : 1;
    this.viewBlend += (vt - this.viewBlend) * Math.min(1, dt * 5.5);
    if (Math.abs(this.viewBlend - vt) < 0.002) this.viewBlend = vt;
    const zt = free && this.input.rmb && !this.failed.optics ? 1 : 0;
    this.zoom += (zt - this.zoom) * Math.min(1, dt * 8);
    this.yaw = clamp(this.yaw + dyaw, -LOOK.yaw, LOOK.yaw);
    this.pitch = clamp(this.pitch + dpitch, -LOOK.down, LOOK.up);
    if (this.input.hit('KeyC')) {
      this.yaw = 0;
      this.pitch = -5 * DEG;
    }
    for (const name of VIEW_ORDER) if (this.input.hit(VIEWS[name].key)) this.setView(name);
    if (!free && (this.input.hit('Escape') || inp.rmbClicked)) {
      if (this.openMfd) this.closeDisplay();
      else this.setView('front');
    }
    const rate = Math.hypot(dyaw, dpitch) / Math.max(dt, 1e-3);
    this.lookRate += (rate - this.lookRate) * Math.min(1, dt * 8);
  }

  updateMech(dt) {
    const I = this.input;
    const playing = this.state === 'cockpit' && !this.dead;
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
        if (this.sys.battBus) this.say('v20');
        else this.complainNoPower();
      }
    } else {
      const events = stepMech(this.mech, { throttle: thr, turn, stop: stop || this.dead }, dt, this.world.colliders, WORLD.bounds);
      for (const e of events) this.footstep(e);
      // damaged legs cannot carry the full stride
      const vmax = MECH.maxForward * (0.45 + 0.55 * Math.min(this.parts.lleg, this.parts.rleg)) * (this.failed.hydraulics ? 0.7 : 1);
      if (this.mech.speed > vmax) this.mech.speed = vmax;
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
    pm.visible = this.external || !(this.state === 'cockpit' || (this.state === 'entry' && this.entry?.phase === 'inside'));
    if (this.rig) {
      // outside view: the rigged model walks by itself, the static one stays for the base scenes
      this.rig.body.visible = this.external;
      this.world.mechBody.visible = !this.external;
      this.world.mechHatch.visible = this.world.mechOpening.visible = !this.external;
    }
    if (this.external) {
      pm.position.set(m.x, this.groundY, m.z);
      pm.rotation.set(0, m.heading, 0);
    } else {
      pm.position.copy(this.mechObj.position);
      pm.position.y -= MECH.eyeHeight;
      pm.quaternion.copy(this.mechObj.quaternion);
    }
    pm.updateMatrixWorld(true);
  }

  updateCameras(dt, pose) {
    const stab = this.sw.stab && this.sys.gyro > 0.9 && !this.failed.gyro;
    const m = this.mech;
    // the walker's torso (= cockpit) pose from the gait, and the pilot's head inside it
    const b = this.body.update(dt, m, this.groundSlope(), stab);
    this.pose = b;
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
      this.kick = Math.max(0, this.kick - this.kick * Math.min(1, dt * 9) - dt * 0.004);
      this._ql.setFromEuler(this._e.set(this.pitch + this.kick, this.yaw + n(29, 47) * sh, 0, 'YXZ'));
      const e = this.viewBlend * this.viewBlend * (3 - 2 * this.viewBlend);
      if (e > 0) {
        // lean towards the panel in focus
        this._ql.slerp(this.focusPose.q, e);
        this.cockpitCam.position.addScaledVector(this.focusPose.pos, e);
      }
      this.cockpitCam.quaternion.copy(this._qs).multiply(this._ql);
      const fov = this.fitFov(THREE.MathUtils.lerp(THREE.MathUtils.lerp(70, this.focusPose.fov, e), ZOOM_FOV, this.zoom));
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
    if (this.external) {
      this.updateRig(dt);
      this.updateExternalCam(dt);
      return;
    }
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
    if (this.state !== 'cockpit' || this.external) {
      this.hovered = null;
      ui.hover(null, false);
      return;
    }
    const center = this.input.locked && !this.input.cursorMode;
    this.ray.setFromCamera(center ? new THREE.Vector2(0, 0) : new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.cockpitCam);
    this.ray.far = 2.2;
    const screens = Object.entries(this.cockpit.mfd).map(([slot, m]) => ((m.mesh.userData.mfdSlot = slot), m.mesh));
    const hits = this.ray.intersectObjects([...this.cockpit.hitTargets, ...screens], false);
    const scr = hits.length ? hits[0].object.userData.mfdSlot : null;
    if (scr && !center) {
      // the displays: click to open, and once open, the soft keys and contents
      this.hovered = null;
      if (this.openMfd === scr) {
        const h = this.cockpit.mfd[scr].hitAt(hits[0].uv.x * 512, (1 - hits[0].uv.y) * 384);
        ui.hover(h ? null : null, false, this.input.mouse);
        if (inp.clicked) this.mfdClick(scr, hits[0].uv);
      } else {
        ui.hover('Display öffnen', false, this.input.mouse);
        if (inp.clicked && this.sys.mainBus) this.openDisplay(scr);
      }
      return;
    }
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
    if (I.hit('Digit9') || I.hit('Numpad9')) this.setExternal(!this.external);
    if (I.hit('Backspace') && this.caution.active) this.cockpit.lamps.lock.toggle();
    if (I.hit('F1') || I.hit('Slash')) ui.toggleHelp();
    // displays, targets and the drone
    if (I.hit('KeyM')) this.toggleDisplay('tactical');
    if (I.hit('Tab')) this.nextTarget();
    if (I.hit('KeyQ')) this.drone.toggle(this.droneGoal());
  }

  /* ------------------------------------------------ displays you can open */

  toggleDisplay(slot) {
    if (this.openMfd === slot) this.closeDisplay();
    else this.openDisplay(slot);
  }

  /** lean in until one display fills the view; its soft keys and contents are clickable */
  openDisplay(slot) {
    if (this.state !== 'cockpit' || this.dead) return;
    if (!this.sys.mainBus) return this.complainNoPower();
    if (this.external) this.setExternal(false);
    const mesh = this.cockpit.mfd[slot]?.mesh;
    if (!mesh) return;
    mesh.updateMatrixWorld(true);
    const c = mesh.getWorldPosition(new THREE.Vector3());
    const q = mesh.getWorldQuaternion(new THREE.Quaternion());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // far enough that the whole bezel shows, a little above centre so the subtitles stay clear
    const eye = c.clone().addScaledVector(n, 0.39);
    const look = c.clone().addScaledVector(up, -0.012);
    this.focusPose.pos.copy(eye);
    this.focusPose.q.setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, look, up));
    this.focusPose.fov = 46;
    if (this.view !== 'mfd') this.mfdReturn = this.view;
    this.view = 'mfd';
    this.openMfd = slot;
    this.input.cursorMode = true;
    this.input.unlock();
    ui.setView('displays');
    ui.mfdOpen(true);
    ui.lockHint(false);
    this.sound.click('button');
    this.onDisplayOpened?.(slot);
  }

  closeDisplay() {
    const back = this.mfdReturn && this.mfdReturn !== 'mfd' ? this.mfdReturn : 'front';
    this.openMfd = null;
    this.droneMode = false;
    this.view = 'mfd-closing';
    this.setView(back);
  }

  /** a click on a display: its soft keys, tabs, list rows, map */
  mfdClick(slot, uv) {
    const mfd = this.cockpit.mfd[slot];
    const x = uv.x * 512;
    const y = (1 - uv.y) * 384;
    const h = mfd.hitAt(x, y);
    if (!h) return;
    this.sound.click('button');
    this.mfdAction(slot, h.action, x, y);
  }

  mfdAction(slot, a, x, y) {
    const ms = this.arsenal.w.missiles;
    const list = this.intel?.list ?? [];
    const sel = list.find((t) => t.id === this.selected);
    switch (a.type) {
      case 'page':
        if (slot === 'status' || slot === 'camera') this.pages[slot] = a.page;
        break;
      case 'select':
        this.selected = a.id;
        if (slot === 'camera') this.designate(a.id); // on the picture a click is enough
        break;
      case 'designate':
        if (sel) this.designate(sel.id);
        break;
      case 'release':
        ms.designated = null;
        this.hmd.notify('SUCHER FREI', '#a6ffb8', 1.5);
        break;
      case 'next':
        this.nextTarget();
        break;
      case 'filter':
        this.listFilter = a.filter;
        this.listScroll = 0;
        break;
      case 'scroll':
        this.listScroll = Math.max(0, this.listScroll + a.d * 4);
        break;
      case 'zoom': {
        const ranges = [250, 500, 1000, 2000];
        const i = clamp(ranges.indexOf(this.radarRange) + a.d, 0, ranges.length - 1);
        this.radarRange = ranges[i];
        break;
      }
      case 'droneMode':
        this.droneMode = !this.droneMode;
        break;
      case 'map': {
        // a click on the map: the drone goes there when asked to, else the nearest vehicle is picked
        const mp = this.cockpit.mfd[slot].map;
        const rx = ((x - mp.cx) / mp.R) * mp.range;
        const rz = ((y - mp.cy) / mp.R) * mp.range;
        const c = Math.cos(mp.heading);
        const s = Math.sin(mp.heading);
        const wx = mp.x + rx * c + rz * s;
        const wz = mp.z - rx * s + rz * c;
        if (this.droneMode) {
          if (this.drone.launch([wx, wz])) this.droneMode = false;
        } else this.selected = null;
        break;
      }
      case 'droneTo':
        if (sel) this.drone.launch([sel.x, sel.z]);
        break;
      case 'launch':
        this.drone.launch(this.droneGoal());
        break;
      case 'recall':
        this.drone.recall();
        break;
    }
  }

  /** hand a vehicle to the missile seeker */
  designate(id) {
    const ms = this.arsenal.w.missiles;
    const t = this.intel?.list.find((x) => x.id === id);
    if (!t) return;
    ms.designated = id;
    this.selected = id;
    this.sound.beep(1300, 0.05, 0.05);
    this.hmd.notify(`ZIEL ${t.label} ${Math.round(t.dist)} m ZUGEWIESEN${t.visible || t.marked ? '' : ' · KEINE SICHT'}`, '#ffc15e', 2);
    this.onDesignated?.(t);
  }

  /** Tab: the next known vehicle (by range) goes to the seeker */
  nextTarget() {
    const list = (this.intel?.list ?? []).filter((t) => !t.stale);
    if (!list.length) return this.hmd.notify('KEIN BEKANNTES ZIEL', '#ffc15e', 1.5);
    const i = list.findIndex((t) => t.id === this.arsenal.w.missiles.designated);
    this.designate(list[(i + 1) % list.length].id);
  }

  /** where Q sends the drone: the point the pilot looks at, within reason */
  droneGoal() {
    const cam = this.worldCam;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const p = this.arsenal.aimPoint(cam.position, dir, new THREE.Vector3());
    const d = p.distanceTo(cam.position);
    const dist = clamp(Number.isFinite(d) ? d : 450, 250, 1200);
    const l = Math.hypot(dir.x, dir.z) || 1;
    return [this.mech.x + (dir.x / l) * dist, this.mech.z + (dir.z / l) * dist];
  }

  droneSay(text, color = '#a6ffb8') {
    this.hmd.notify(text, color, 2.5);
    this.message = text;
    this.messageColor = color === '#ff5a48' ? '#ff4a3a' : null;
  }

  onDroneMark(e) {
    this.sound.beep(1900, 0.04, 0.05);
    this.hmd.notify(`DROHNE: ${e.label || (e.type === 'tank' ? 'PZ' : 'SPZ')} MARKIERT`, '#9fe8ff', 1.8);
  }

  /** tutorial target: pulsing marker on the control + arrow when it is off screen */
  updateMarker() {
    const key = this.tutorial.active ? this.tutorial.targetKey() : null;
    const ctl = key ? this.cockpit.switches[key] || this.cockpit.lamps[key] : null;
    const mesh = ctl ? ctl.hit || ctl.cap : null;
    this.cockpit.setMarker(ctl, this.cockpitCam, this.time);
    if (!mesh) {
      ui.viewHint(null);
      return ui.arrow(null);
    }
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
    const warning = this.fire ? 'FIRE ON BOARD' : s.warnings[0];
    const link = this.comms.state(this.time);
    // an open display is redrawn every frame so clicks answer at once
    const due = (slot, k) => this.openMfd === slot || f % 4 === k;
    const ms = this.arsenal.w.missiles;
    if (link && this.pages.status === 'status' && this.openMfd !== 'status') {
      if (f % 2 === 0) drawComms(c.mfd.status, link, this.time);
    } else if (this.pages.status === 'targets') {
      if (due('status', 0))
        drawTargetList(c.mfd.status, {
          list: this.intel?.list ?? [],
          selected: this.selected,
          designated: ms.designated,
          locked: ms.locked && ms.target === ms.designated,
          lockT: ms.lockT / MISSILE.lockTime,
          filter: this.listFilter,
          scroll: this.listScroll,
          droneDisabled: this.drone.jammed || this.drone.state === 'lost',
        });
    } else if (due('status', 0))
      drawStatus(c.mfd.status, {
        ...s,
        parts: this.parts,
        failed: Object.keys(this.failed).map((k) => SYSTEMS[k]),
        bottles: this.fireCharges,
        time: `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`,
        message: warning || this.statusLine(),
        messageColor: warning ? '#ff4a3a' : this.messageColor,
      });
    if (this.pages.camera === 'drone') {
      if (due('camera', 1)) drawDrone(c.mfd.camera, { drone: this.drone.info(), feed: this.drone.airborne, boxes: this.drone.airborne ? this.feedBoxes(this.drone.cam) : [], selected: this.selected });
    } else if (due('camera', 1))
      drawCamera(c.mfd.camera, {
        heading: m.heading,
        range: this.range,
        nv: this.sw.nv,
        zoom: 4,
        failed: !!this.failed.optics,
        contact: this.sw.optics ? this.cameraContact() : 'OPTICS OFF',
        contactColor: '#ff4a3a',
        boxes: this.sw.optics ? this.feedBoxes() : [],
        el: ((this.pose?.pitch ?? 0) / DEG) - 1.5,
        count: this.intel?.list.length ?? null,
        threats: this.intel?.threats.length ?? 0,
        target: this.intel?.primary ?? null,
      });
    if (due('tactical', 2))
      drawTactical(c.mfd.tactical, {
        ...m,
        time: this.time,
        range: this.failed.sensors ? 250 : this.radarRange,
        contacts: this.world.contacts,
        look: this.yaw,
        grid: `${String(Math.round(1000 + m.x / 10)).padStart(4, '0')}-${String(Math.round(1000 - m.z / 10)).padStart(4, '0')}`,
        hostiles: [...this.world.hostiles.filter((h) => !h.hidden), ...(this.intel?.list ?? [])].filter((h) => Math.hypot(h.x - m.x, h.z - m.z) < (this.failed.sensors ? 250 : this.radarRange)).length,
        enemies: this.intel ? this.intel.list.map((t) => ({ ...t, primary: t === this.intel.primary })) : null,
        nearest: this.intel?.list[0] ?? null,
        threats: this.intel?.threats.length ?? 0,
        allies: this.allies.list.map((w) => ({ call: w.name.replace('HAMMER ', 'H'), x: w.x, z: w.z, heading: w.heading, hp: w.hp / 200, dead: w.dead })),
        wp: this.hudWaypoint(),
        smoke: this.world.smokeScreens,
        kills: this.mission ? this.stats.kills : null,
        total: this.mission?.def.total ?? null,
        sensorsDown: !!this.failed.sensors,
        selected: this.selected,
        designated: ms.designated,
        locked: ms.locked && ms.target === ms.designated,
        drone: this.drone.info(),
        droneMode: this.droneMode,
      });
  }

  /** tracked vehicles inside the hull camera's picture (512 x 384 display units) */
  feedBoxes(cam = this.feedCam) {
    const it = this.intel;
    if (!it?.list.length) return [];
    const f = 192 / Math.tan((cam.fov * DEG) / 2);
    const v = new THREE.Vector3();
    const out = [];
    for (const t of it.list) {
      if (t.stale) continue;
      this.enemies.center(t.e, v);
      const dist = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      out.push({ id: t.id, x: ((v.x + 1) / 2) * 512, y: ((1 - v.y) / 2) * 384, r: (t.e.radius * f) / dist, dist, label: t.label, aiming: t.aiming, primary: t === it.primary, marked: t.marked, selected: t.id === this.selected });
    }
    return out;
  }

  /** what the hull camera reports: the locked target */
  cameraContact() {
    const ms = this.arsenal.w.missiles;
    const e = ms.target != null && this.enemies.list.find((x) => x.id === ms.target);
    if (!e) return null;
    const d = Math.hypot(e.x - this.mech.x, e.z - this.mech.z);
    return `${ms.locked ? 'LOCK' : 'TRK'} ${e.type === 'tank' ? 'MBT' : 'APC'} ${Math.round(d)} m`;
  }

  /** screen positions of the enemies for the helmet display (datalink) */
  hmdTargets() {
    if (!this.sys.mainBus || this.dead) return null;
    const out = [];
    const cam = this.worldCam;
    const W = innerWidth;
    const H = innerHeight;
    const ms = this.arsenal.w.missiles;
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const f = H / 2 / Math.tan((cam.fov * DEG) / 2);
    const v = new THREE.Vector3();
    // only known vehicles (seen by us, the lance or the drone); lost ones at their last position
    for (const it of this.intel?.list ?? []) {
      const e = it.e;
      this.enemies.center(e, v);
      if (it.stale) v.set(it.x, this.world.heightAt(it.x, it.z) + e.height * 0.5, it.z);
      const dist = v.distanceTo(cam.position);
      if (dist > 2400) continue;
      const front = v.clone().sub(cam.position).dot(camDir) > 0;
      const p = v.clone().project(cam);
      const onScreen = front && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.92;
      const mine = ms.target === e.id;
      const t = {
        dist,
        label: `${e.label || (e.type === 'tank' ? 'PZ' : 'SPZ')}${it.stale ? '?' : ''}`,
        marked: e.marked,
        droneMarked: it.marked,
        stale: it.stale,
        designated: ms.designated === e.id,
        face: it.stale ? '' : it.face,
        hp: it.hp,
        aiming: it.aiming,
        lock: mine ? ms.lockT / MISSILE.lockTime : 0,
        locked: mine && ms.locked,
        onScreen,
      };
      if (onScreen) {
        t.x = ((p.x + 1) / 2) * W;
        t.y = ((1 - p.y) / 2) * H;
        t.r = (e.radius * f) / dist;
      } else t.edge = Math.atan2(front ? p.y : -p.y, front ? p.x : -p.x);
      out.push(t);
    }
    return out;
  }

  /** wingmen for the helmet display: screen markers and the lance panel */
  hmdAllies() {
    if (!this.allies.list.length) return null;
    const cam = this.worldCam;
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const v = new THREE.Vector3();
    return this.allies.list.map((w) => {
      this.allies.center(w, v);
      v.y += 1.6;
      const dist = v.distanceTo(cam.position);
      const front = v.clone().sub(cam.position).dot(camDir) > 0;
      const p = v.clone().project(cam);
      const on = front && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.92 && dist > 8;
      return {
        name: w.name,
        hp: w.hp / 200,
        dead: w.dead,
        order: w.order,
        dist,
        onScreen: on,
        x: ((p.x + 1) / 2) * innerWidth,
        y: ((1 - p.y) / 2) * innerHeight,
      };
    });
  }

  drawHMD(dt) {
    const m = this.mech;
    const w = this.arsenal.w;
    const live = this.weaponLive || {};
    const cam = this.worldCam;
    const damaged = Object.values(this.parts).some((v) => v < 1);
    this.hmd.draw(dt, {
      visible: this.state === 'cockpit',
      panels: this.view === 'front' || this.external,
      power: this.sys.battBus ? Math.max(0.6, this.cockpit.power) : 0.4,
      external: this.external,
      throttle: m.throttle,
      speed: m.speed,
      maxSpeed: MECH.maxForward,
      legsLocked: this.sys.legsLocked,
      canWalk: this.sys.canWalk,
      aimRange: live.master ? this.aimRange : 0,
      weapons:
        this.mode === 'combat' || this.sw.wpnArm
          ? {
              master: live.master,
              gun: live.gun,
              gunDamaged: this.parts.rarm <= 0,
              ammo: w.gun.ammo,
              mgAmmo: w.mg.ammo,
              mg: live.mg,
              heat: w.gun.heat,
              overheated: w.gun.overheated,
              inLimits: live.inLimits,
              missile: live.missile,
              missiles: w.missiles.count,
              lockT: w.missiles.lockT / MISSILE.lockTime,
              locked: w.missiles.locked,
              coneR: (innerHeight / 2 / Math.tan((cam.fov * DEG) / 2)) * Math.tan(MISSILE.lockCone),
            }
          : null,
      parts: this.mode === 'combat' || damaged ? this.parts : null,
      failed: Object.keys(this.failed).map((k) => SYSTEMS[k]),
      allies: this.hmdAllies(),
      targets: this.hmdTargets(),
      fire: !!this.fire,
    });
  }

  statusLine() {
    const s = this.sys;
    if (s.reactorState === 'igniting') return `REACTOR IGNITION ${Math.round((s.ignT / 7) * 100)}%`;
    if (this.sw.stab && s.gyro < 1 && s.mainBus) return `GYRO ALIGN ${Math.round(s.gyro * 100)}%`;
    if (s.legsLocked && s.reactorState === 'running') return 'LEGS LOCKED';
    // a running mech with nothing else to say: the combat picture
    if (s.reactorState === 'running' && this.message === 'COLD AND DARK') {
      const it = this.intel;
      if (it?.threats.length) return `ANGEPEILT VON ${it.threats.length} · ${it.threats.map((t) => t.clock + 'h').join(' ')}`;
      if (it?.list.length) return `GEFECHT · ${it.list.length} FEIND · ${Math.round(it.list[0].dist)} m`;
      return 'ALLE SYSTEME BEREIT';
    }
    return this.message;
  }

  hudWaypoint() {
    if (this.waypoint == null) return null;
    const b = this.world.beacons[this.waypoint];
    const dx = b.x - this.mech.x;
    const dz = b.z - this.mech.z;
    const dist = Math.hypot(dx, dz);
    const v = Math.max(0, this.mech.speed);
    return { bearing: Math.atan2(-dx, -dz), dist, label: b.label, x: b.x, z: b.z, eta: v > 0.5 ? dist / v : null };
  }

  /**
   * What the sensors know about the enemy, shared by the canopy HUD, the displays and
   * the helmet display: every vehicle with range, bearing, which side it shows us,
   * its state, and whether its gun is laid on us (laser warning).
   */
  updateIntel() {
    const m = this.mech;
    const list = [];
    const look = m.heading + (this.external ? 0 : this.yaw);
    const threats = [];
    for (const e of this.enemies.alive()) {
      const armed = e.type !== 'depot';
      // laser warning: a gun laid on us is felt even when we cannot see who it is
      const toUsTrue = Math.atan2(e.x - m.x, e.z - m.z);
      const aiming = armed && e.target === this.playerTarget && e.state !== 'advance' && Math.abs(wrapA(e.heading + (e.turret || 0) - toUsTrue)) < 0.12;
      if (aiming) threats.push({ clock: clockOf(wrapA(Math.atan2(-(e.x - m.x), -(e.z - m.z)) - m.heading)) });
      // only what our side has seen; a lost contact stays at its last known position
      if (!isKnown(e, this.time)) continue;
      const stale = this.time - e.seenT > 1.5;
      const ex = stale ? e.kx : e.x;
      const ez = stale ? e.kz : e.z;
      const dx = ex - m.x;
      const dz = ez - m.z;
      const dist = Math.hypot(dx, dz);
      // without the sensors only what we see ourselves, and not far
      if (this.failed.sensors && (dist > 600 || e.losPlayer === false)) continue;
      const brg = Math.atan2(-dx, -dz);
      const gun = e.heading + (e.turret || 0);
      list.push({
        stale,
        visible: e.losPlayer !== false && !stale,
        marked: (e.droneMark ?? 0) > this.time,
        e,
        id: e.id,
        type: e.type,
        name: TYPE_NAME[e.type],
        label: e.label || TYPE_SHORT[e.type],
        x: ex,
        z: ez,
        heading: e.heading,
        gun,
        dist,
        brg,
        rel: wrapA(brg - m.heading),
        off: Math.abs(wrapA(brg - look)),
        clock: clockOf(wrapA(brg - m.heading)),
        face: armed ? FACE_NAME[armorFace(e.heading, e.x, e.z, m.x, m.z)] : '',
        aiming,
        hp: e.hp / ENEMY_TYPES[e.type].hp,
        state: armed ? STATE_NAME[e.state] || e.state.toUpperCase() : 'STATISCH',
        kmh: Math.abs(e.speed) * 3.6,
        missionMarked: !!e.marked,
      });
    }
    list.sort((a, b) => a.dist - b.dist);
    // primary target: the designated one, what the seeker tracks, what the pilot looks at, the closest
    const ms = this.arsenal.w.missiles;
    let primary = list.find((t) => t.id === ms.designated) || list.find((t) => t.id === ms.target) || null;
    if (!primary) {
      const looked = list.filter((t) => t.off < 0.2).sort((a, b) => a.off - b.off)[0];
      primary = looked || list[0] || null;
    }
    // shells that will pass close to us in the next moment
    const pc = this.playerTarget.center(new THREE.Vector3());
    let incoming = 0;
    for (const s of this.enemies.shells) {
      const rx = pc.x - s.p.x;
      const ry = pc.y - s.p.y;
      const rz = pc.z - s.p.z;
      const v2 = s.v.lengthSq();
      const t = (rx * s.v.x + ry * s.v.y + rz * s.v.z) / v2;
      if (t < 0 || t > 1.5) continue;
      if (Math.hypot(rx - s.v.x * t, ry - s.v.y * t, rz - s.v.z * t) < 25) incoming++;
    }
    this.intel = { list, primary, threats, incoming };
    return this.intel;
  }

  /** the mission line: objective, progress, kills and time */
  missionInfo() {
    const st = this.tutorial.active ? this.tutorial.step : null;
    const def = this.mission?.def;
    const t = Math.max(0, this.time - (this.stats.start ?? 0));
    return {
      objective: st?.title || (def ? def.name : ''),
      step: this.tutorial.active ? `${this.tutorial.index + 1}/${this.tutorial.steps.length}` : '',
      kills: def ? this.stats.kills : null,
      total: def?.total ?? null,
      time: `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`,
    };
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
    if (this.state === 'cockpit') this.updateCombat(dt);
    else this.gunRig.visible = false;

    this.world.update(dt, this.time, this.worldCam.position);
    const fx = this.world.effects;
    const fwd = new THREE.Vector3(-Math.sin(this.mech.heading), 0, -Math.cos(this.mech.heading));
    const inFront = Math.max(0, fx.flashDir.dot(fwd));
    this.cockpit.setDaylight(0.85 + 0.15 * Math.sin(this.mech.heading * 1.3), fx.flashLevel * (0.25 + inFront), new THREE.Color(1, 0.6, 0.3));

    this.cockpit.update(dt, this.time, { throttle: this.mech.throttle, turnInput: this.turnInput || 0, lookPitchRate: 0 }, this.hovered);
    const w = this.arsenal.w;
    const live = this.weaponLive || {};
    const intel = this.updateIntel();
    const parts = this.parts;
    this.cockpit.hud.update(dt, {
      q: this.mechObj.quaternion.clone().invert(),
      maxSpeed: MECH.maxForward,
      weapons: {
        master: live.master,
        gun: live.gun,
        mg: live.mg,
        missile: live.missile,
        ammo: w.gun.ammo,
        mgAmmo: w.mg.ammo,
        heat: w.gun.heat,
        overheated: w.gun.overheated,
        missiles: w.missiles.count,
        locked: w.missiles.locked,
        lockT: w.missiles.lockT / MISSILE.lockTime,
        inLimits: live.inLimits,
        gunYaw: this.gunRig.yaw,
        gunPitch: this.gunRig.pitch,
        range: live.master ? this.aimRange : 0,
        blocked: !!this.failed.missiles,
        gunDead: parts.rarm <= 0,
      },
      intel: this.mode === 'combat' || intel.list.length ? intel : null,
      mission: this.mission ? this.missionInfo() : null,
      systems: {
        integrity: Math.min(parts.torso, parts.head),
        parts,
        reactor: this.sys.reactor,
        heat: this.sys.heat,
        hyd: this.sys.hyd,
        failed: Object.keys(this.failed).map((k) => SYSTEMS[k]),
        fire: !!this.fire,
        bottles: this.fireCharges,
      },
      pitch: this.pose?.pitch ?? 0,
      roll: this.pose?.roll ?? 0,
      lookPitch: this.pitch,
      alt: this.groundY,
      slope: this.groundSlope().pitch,
      range: this.range,
      heading: this.mech.heading,
      speed: this.mech.speed,
      throttle: this.mech.throttle,
      look: this.yaw,
      stab: this.sw.stab && this.sys.gyro >= 1,
      nv: this.sw.nv,
      lights: this.sw.lights,
      warning: this.fire ? 'FIRE' : this.sys.warnings[0] || (this.sys.legsLocked ? 'LEG LOCK' : ''),
      waypoint: this.hudWaypoint(),
      time: this.time,
    });
    this.drawDisplays();
    this.drawHMD(dt);
    this.sound.update({ turn: this.mech.turn, lookRate: this.state === 'cockpit' ? this.lookRate : 0, speed: this.mech.speed, reactor: this.sys.reactor });
    ui.update(this);
  }

  render() {
    // the boarding video covers the screen: no need to draw the world behind it
    if (this.state === 'entry' && this.entry.phase === 'video') return;
    const droneFeed = this.pages.camera === 'drone' && this.drone.airborne;
    if (this.frame % 2 === 0 && this.sys.mainBus && this.state === 'cockpit' && !this.external && (droneFeed || (this.sw.optics && !this.failed.optics))) {
      renderer.setRenderTarget(this.feedRT);
      renderer.render(this.world.scene, droneFeed ? this.drone.cam : this.feedCam);
      renderer.setRenderTarget(null);
    }
    this.post.render(this.time, this.shock);
  }
}

/* ------------------------------------------------------------ progress */

const PROGRESS_KEY = 'battlebot-progress';
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveProgress(id, time) {
  try {
    const p = loadProgress();
    const best = p[id]?.best;
    p[id] = { done: true, best: best ? Math.min(best, time) : time };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* private mode: progress is not kept */
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

/** canvas text (displays, HUD, panel labels) needs the bundled fonts before the first draw */
function loadFonts() {
  const faces = ['400 20px "JetBrains Mono"', '700 20px "JetBrains Mono"', '500 20px "Barlow Condensed"', '600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"'];
  return Promise.all(faces.map((f) => document.fonts?.load(f).catch(() => null)));
}

Promise.all([assets.loadAll(), loadFonts()])
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
    } else if (params.has('m2') || params.has('m')) {
      // test hook: straight into a combat mission (?m=3 ...)
      const def = MISSIONS.find((d) => d.num === +(params.get('m') || 2));
      game.input.enabled = true;
      ui.hideTitle();
      game.beginMission(def);
    } else
      ui.ready(MISSIONS, loadProgress(), (def) => (def.kind === 'tutorial' ? game.startMission() : game.startCombatMission(def)), () => game.startFree());
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
