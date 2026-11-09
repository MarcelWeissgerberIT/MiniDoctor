import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { VOICE_KEYS } from './missions.js';
import { TRAINING_TEXT } from './tutorial.js';

const BASE = import.meta.env.BASE_URL + 'assets/';

export const TEXTURE_SETS = ['armor', 'rivets', 'floor', 'console', 'hazard', 'concrete', 'ground'];
export const DECALS = ['nameplate', 'danger', 'eject', 'reactor', 'hydraulic', 'radiation', 'weapons', 'nostep'];
export const MODELS = [
  'seat', 'stick', 'throttle', 'radio', 'extinguisher', 'tank', 'hedgehog', 'ruin',
  'mech', 'sandbags', 'crates', 'drums', 'generator', 'enemy_tank', 'enemy_apc', 'mech_rigged',
];
export const SOUNDS = [
  'cockpit_hum', 'battle_far', 'footstep', 'servo', 'startup',
  'walk_gravel', 'stairs_metal', 'hatch_open', 'hatch_close', 'battery_on', 'apu_start',
  'reactor_start', 'hyd_pump', 'gyro_spin', 'leg_release', 'harness', 'base_ambience',
  'creak_1', 'creak_2', 'hyd_step', 'rattle',
  'gun_shot', 'missile_launch', 'explosion_near', 'armor_hit', 'sparks', 'enemy_cannon', 'shell_whizz', 'extinguisher',
  'drone_loop', 'drone_launch', 'wiper',
  'rail_shot', 'gatling', 'flamer', 'cannon_heavy', 'amb_jungle', 'amb_desert', 'rain_loop', 'sandstorm_loop', 'heli_loop', 'arty_whistle',
];
export const VOICES = [...Array.from({ length: 22 }, (_, i) => 'v' + String(i).padStart(2, '0')), ...VOICE_KEYS, ...Object.keys(TRAINING_TEXT)];

/**
 * Loads every generated asset (Higgsfield images/audio, Meshy models) and
 * offers a small PBR material factory on top of the texture sets.
 */
export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.manager = new THREE.LoadingManager();
    this.tex = {};
    this.fx = {};
    this.decals = {};
    this.models = {};
    this.audio = {};
    this.sky = null;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.onProgress = () => {};
    this._done = 0;
    this._total = 0;
  }

  _tick() {
    this._done++;
    this.onProgress(this._done / this._total);
  }

  _texture(url, srgb, repeat = true) {
    const loader = new THREE.TextureLoader();
    return new Promise((resolve, reject) => {
      loader.load(
        BASE + url,
        (t) => {
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(8, this.maxAniso);
          this._tick();
          resolve(t);
        },
        undefined,
        reject,
      );
    });
  }

  async _json(url) {
    const r = await fetch(BASE + url);
    this._tick();
    return r.json();
  }

  async _model(name) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    try {
      const gltf = await loader.loadAsync(BASE + 'models/' + name + '.glb');
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material.map) o.material.map.anisotropy = Math.min(8, this.maxAniso);
        }
      });
      gltf.scene.animations = gltf.animations;
      this.models[name] = gltf.scene;
    } catch (e) {
      console.warn('model missing', name, e);
    }
    this._tick();
  }

  async _audio(name, dir = 'audio') {
    try {
      const r = await fetch(BASE + dir + '/' + name + '.mp3');
      if (!r.ok) throw new Error(r.status);
      this.audio[name] = await r.arrayBuffer();
    } catch (e) {
      console.warn('audio missing', name);
    }
    this._tick();
  }

  async loadAll() {
    const jobs = [];
    for (const s of TEXTURE_SETS) {
      this.tex[s] = {};
      jobs.push(this._texture(`tex/${s}_c.webp`, true).then((t) => (this.tex[s].c = t)));
      jobs.push(this._texture(`tex/${s}_n.webp`, false).then((t) => (this.tex[s].n = t)));
      jobs.push(this._texture(`tex/${s}_orm.webp`, false).then((t) => (this.tex[s].orm = t)));
    }
    for (const f of ['glass_grime', 'smoke', 'fire', 'fireball', 'muzzle', 'crack']) {
      jobs.push(this._texture(`fx/${f}.webp`, f === 'fire' || f === 'fireball' || f === 'muzzle', f === 'glass_grime').then((t) => (this.fx[f] = t)));
    }
    jobs.push(this._json('decals/decals.json').then((j) => (this.decalAspect = j)));
    for (const d of DECALS) jobs.push(this._texture(`decals/${d}.webp`, true, false).then((t) => (this.decals[d] = t)));
    jobs.push(this._json('sky/pano.json').then((j) => (this.skyMeta = j)));
    this.pano = [];
    for (let k = 0; k < 2; k++) jobs.push(this._texture(`sky/pano_${k}.webp`, true, false).then((t) => (this.pano[k] = t)));
    for (const m of MODELS) jobs.push(this._model(m));
    for (const a of SOUNDS) jobs.push(this._audio(a));
    for (const v of VOICES) jobs.push(this._audio(v, 'voice'));
    this._total = jobs.length;
    await Promise.all(jobs);
    this.materials = new MaterialLib(this);
  }
}

/** Shared PBR materials built from the derived texture sets. */
class MaterialLib {
  constructor(assets) {
    const t = assets.tex;
    const pbr = (set, o = {}) =>
      new THREE.MeshStandardMaterial({
        map: t[set].c,
        normalMap: t[set].n,
        normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
        roughnessMap: t[set].orm,
        metalnessMap: t[set].orm,
        aoMap: t[set].orm,
        aoMapIntensity: o.ao ?? 1,
        roughness: o.roughness ?? 1,
        metalness: o.metalness ?? 1,
        color: o.color ?? 0xffffff,
        envMapIntensity: o.env ?? 1,
      });
    this.armor = pbr('armor', { env: 0.6 });
    this.armorDark = pbr('armor', { color: 0x6f7368, env: 0.5 });
    this.rivets = pbr('rivets', { env: 0.7 });
    this.floor = pbr('floor', { normal: 1.4, env: 0.8 });
    this.console = pbr('console', { env: 0.5, normal: 0.8 });
    this.consoleMetal = pbr('console', { metalness: 1, roughness: 0.75, color: 0x8a8d90, env: 0.9 });
    this.hazard = pbr('hazard', { env: 0.5 });
    this.concrete = pbr('concrete', { env: 0.3 });
    this.ground = pbr('ground', { env: 0.2 });
    // untextured helpers
    this.steel = new THREE.MeshStandardMaterial({ color: 0x6b6e70, metalness: 1, roughness: 0.42, envMapIntensity: 1 });
    this.brass = new THREE.MeshStandardMaterial({ color: 0xa08048, metalness: 1, roughness: 0.38 });
    this.rubber = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0, roughness: 0.85 });
    this.hose = new THREE.MeshStandardMaterial({
      map: t.console.c,
      normalMap: t.console.n,
      color: 0x2a2a2a,
      metalness: 0,
      roughness: 0.7,
    });
    this.pipe = new THREE.MeshStandardMaterial({
      map: t.rivets.c,
      normalMap: t.rivets.n,
      roughnessMap: t.rivets.orm,
      metalnessMap: t.rivets.orm,
      color: 0x9a9a9a,
      metalness: 1,
      roughness: 1,
    });
    this.blackPaint = new THREE.MeshStandardMaterial({ color: 0x0c0c0c, metalness: 0.2, roughness: 0.6 });
    this.redPaint = new THREE.MeshStandardMaterial({ color: 0x7a0f0a, metalness: 0.3, roughness: 0.5 });
    this.screenOff = new THREE.MeshStandardMaterial({ color: 0x050805, metalness: 0, roughness: 0.15 });
    this.decal = {};
    for (const d of DECALS) {
      this.decal[d] = new THREE.MeshStandardMaterial({
        map: assets.decals[d],
        transparent: false,
        alphaTest: 0.5,
        roughness: 0.6,
        metalness: d === 'nameplate' ? 0.8 : 0.1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
    }
  }
}
