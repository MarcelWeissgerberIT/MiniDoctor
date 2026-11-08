import * as THREE from 'three';

const FOG = /* glsl */ `
uniform vec3 fogColor; uniform float fogDensity;
float fogF(float d){ return 1.0 - exp(-fogDensity * fogDensity * d * d); }`;

// camera-facing quads: per instance offset/size/rotation/alpha/seed
const billboardVert = /* glsl */ `
attribute vec4 inst;   // xyz position, w size
attribute vec4 inst2;  // x rotation, y alpha, z seed, w stretch (height/width)
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vDepth;
uniform float baseY;
void main(){
  vUv = uv;
  vAlpha = inst2.y; vSeed = inst2.z;
  vec4 mv = modelViewMatrix * vec4(inst.xyz, 1.0);
  float c = cos(inst2.x), s = sin(inst2.x);
  vec2 p = position.xy + vec2(0.0, baseY);
  p.y *= inst2.w;
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  mv.xy += p * inst.w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const fireFrag = /* glsl */ `
uniform sampler2D map; uniform float time;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vDepth;
${FOG}
void main(){
  vec2 uv = vUv;
  float w = sin(uv.y * 9.0 - time * 7.0 + vSeed * 6.0) * 0.035 + sin(uv.y * 17.0 - time * 11.0 + vSeed) * 0.02;
  uv.x += w * uv.y;
  uv.y = uv.y * (0.92 + 0.08 * sin(time * 5.0 + vSeed * 3.0));
  vec3 c = texture2D(map, uv).rgb;
  float flick = 0.8 + 0.2 * sin(time * 13.0 + vSeed * 9.0) * sin(time * 7.3 + vSeed);
  c *= flick * vAlpha * 2.2;
  c *= 1.0 - fogF(vDepth) * 0.85;
  gl_FragColor = vec4(c, 1.0);
}`;

const smokeFrag = /* glsl */ `
uniform sampler2D map; uniform vec3 color; uniform vec3 glow;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vDepth;
${FOG}
void main(){
  float a = texture2D(map, vUv).r * vAlpha;
  if (a < 0.004) discard;
  vec3 c = mix(color, glow, clamp(vSeed, 0.0, 1.0));
  c = mix(c, fogColor, fogF(vDepth) * 0.9);
  gl_FragColor = vec4(c, a);
}`;

// fireball / muzzle flash sprite: additive texture, rotated, fading with alpha
const spriteFrag = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vDepth;
${FOG}
void main(){
  vec3 c = texture2D(map, vUv).rgb;
  // burn out from yellow-white to deep orange as it ages (seed carries the age)
  c *= mix(vec3(1.25, 1.1, 0.9), vec3(1.0, 0.45, 0.18), clamp(vSeed, 0.0, 1.0));
  c *= vAlpha * 3.0;
  c *= 1.0 - fogF(vDepth) * 0.8;
  gl_FragColor = vec4(c, 1.0);
}`;

const flashFrag = /* glsl */ `
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vDepth;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float g = exp(-d * d * 5.0) + exp(-d * 18.0) * 2.0;
  gl_FragColor = vec4(vec3(1.0, 0.62, 0.3) * g * vAlpha * 6.0, 1.0);
}`;

class BillboardSet {
  constructor(max, material, baseY = 0) {
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.inst2 = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('inst', this.inst);
    this.geo.setAttribute('inst2', this.inst2);
    this.geo.instanceCount = 0;
    material.uniforms.baseY = { value: baseY };
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.max = max;
  }

  set(i, x, y, z, size, rot, alpha, seed, stretch = 1) {
    this.inst.setXYZW(i, x, y, z, size);
    this.inst2.setXYZW(i, rot, alpha, seed, stretch);
  }

  commit(n) {
    this.geo.instanceCount = n;
    this.inst.needsUpdate = true;
    this.inst2.needsUpdate = true;
  }
}

/**
 * Fires, smoke columns, drifting ash and the distant artillery that keeps
 * lighting up the horizon.
 */
export class Effects {
  constructor(world, assets) {
    this.world = world;
    const scene = world.scene;
    const fog = { fogColor: { value: world.haze }, fogDensity: { value: world.scene.fog.density } };
    this.time = { value: 0 };

    this.fireMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: assets.fx.fire }, time: this.time, ...fog },
      vertexShader: billboardVert,
      fragmentShader: fireFrag,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.fire = new BillboardSet(160, this.fireMat, 0.5);
    this.fire.mesh.renderOrder = 3;
    scene.add(this.fire.mesh);

    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: assets.fx.smoke },
        color: { value: new THREE.Color(0.075, 0.07, 0.068) },
        glow: { value: new THREE.Color(0.55, 0.26, 0.09) },
        ...fog,
      },
      vertexShader: billboardVert,
      fragmentShader: smokeFrag,
      transparent: true,
      depthWrite: false,
    });
    this.smoke = new BillboardSet(1400, this.smokeMat);
    this.smoke.mesh.renderOrder = 2;
    scene.add(this.smoke.mesh);

    // coloured signal smoke for waypoints
    this.flareMat = this.smokeMat.clone();
    this.flareMat.uniforms.color = { value: new THREE.Color(0.16, 0.42, 0.14) };
    this.flareMat.uniforms.glow = { value: new THREE.Color(0.3, 0.8, 0.25) };
    this.flareMat.uniforms.map = { value: assets.fx.smoke };
    this.flareMat.uniforms.fogColor = fog.fogColor;
    this.flareMat.uniforms.fogDensity = fog.fogDensity;
    this.flare = new BillboardSet(220, this.flareMat);
    this.flare.mesh.renderOrder = 2;
    scene.add(this.flare.mesh);
    this.flareParticles = [];
    this.flareAcc = 0;

    this.flashMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: billboardVert,
      fragmentShader: flashFrag,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    this.flashes = new BillboardSet(8, this.flashMat);
    this.flashes.mesh.renderOrder = 4;
    scene.add(this.flashes.mesh);

    // light-brown dust kicked up by impacts and tracks
    this.dustMat = this.smokeMat.clone();
    this.dustMat.uniforms.map = { value: assets.fx.smoke };
    this.dustMat.uniforms.color = { value: new THREE.Color(0.24, 0.2, 0.16) };
    this.dustMat.uniforms.glow = { value: new THREE.Color(0.6, 0.32, 0.12) };
    this.dustMat.uniforms.fogColor = fog.fogColor;
    this.dustMat.uniforms.fogDensity = fog.fogDensity;
    this.dust = new BillboardSet(500, this.dustMat);
    this.dust.mesh.renderOrder = 2;
    scene.add(this.dust.mesh);

    // white smoke screens laid by the vehicles' grenade dischargers
    this.screenMat = this.smokeMat.clone();
    this.screenMat.uniforms.map = { value: assets.fx.smoke };
    this.screenMat.uniforms.color = { value: new THREE.Color(0.6, 0.61, 0.6) };
    this.screenMat.uniforms.glow = { value: new THREE.Color(0.75, 0.75, 0.73) };
    this.screenMat.uniforms.fogColor = fog.fogColor;
    this.screenMat.uniforms.fogDensity = fog.fogDensity;
    this.screen = new BillboardSet(360, this.screenMat);
    this.screen.mesh.renderOrder = 2;
    scene.add(this.screen.mesh);
    this.screenParticles = [];

    // fireballs and muzzle flashes
    const sprite = (map) =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: map }, ...fog },
        vertexShader: billboardVert,
        fragmentShader: spriteFrag,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
    this.fireballs = new BillboardSet(48, sprite(assets.fx.fireball));
    this.fireballs.mesh.renderOrder = 4;
    scene.add(this.fireballs.mesh);
    this.muzzles = new BillboardSet(24, sprite(assets.fx.muzzle));
    this.muzzles.mesh.renderOrder = 4;
    scene.add(this.muzzles.mesh);
    this.balls = [];
    this.muzzleList = [];
    this.dustParticles = [];
    // short-lived lights for explosions and muzzle flashes near the camera
    this.blastLights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 90, 2);
      scene.add(l);
      this.blastLights.push({ light: l, t: 0, life: 1, power: 0 });
    }

    this.fires = [];
    this.particles = [];
    this.flashList = [];
    this.nextFlash = 2;
    this.flashLevel = 0;
    this.flashDir = new THREE.Vector3(1, 0, 0);
    this.onBoom = null; // (distance, strength) => void

    this.buildAsh(scene);
    this.buildTracers(scene);
    this.fireLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 70, 2);
      scene.add(l);
      this.fireLights.push(l);
    }
  }

  addFire(f) {
    const y = this.world.heightAt(f.x, f.z) + (f.y || 0);
    const flames = [];
    const n = 3 + Math.floor(f.scale / 2);
    for (let i = 0; i < n; i++) {
      flames.push({
        x: f.x + (Math.random() - 0.5) * f.scale * 0.6,
        z: f.z + (Math.random() - 0.5) * f.scale * 0.6,
        size: f.scale * (0.5 + Math.random() * 0.6),
        seed: Math.random(),
      });
    }
    const fire = { ...f, y, flames, emit: 0 };
    this.fires.push(fire);
    return fire;
  }

  removeFire(fire) {
    const i = this.fires.indexOf(fire);
    if (i >= 0) this.fires.splice(i, 1);
  }

  spawnSmoke(x, y, z, size, life, rise, glow = 0.6, alpha = 0.55) {
    if (this.particles.length >= this.smoke.max) this.particles.shift();
    this.particles.push({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 0.8,
      vy: rise * (0.8 + Math.random() * 0.4),
      vz: (Math.random() - 0.5) * 0.8,
      size,
      grow: size * (0.5 + Math.random() * 0.4),
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.3,
      age: 0,
      life,
      glow,
      alpha,
    });
  }

  /** a wall of white smoke around (x, z): billows up quickly and hangs for ~20 s */
  smokeScreen(x, y, z, radius = 16) {
    for (let i = 0; i < 52; i++) {
      if (this.screenParticles.length >= this.screen.max) this.screenParticles.shift();
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      this.screenParticles.push({
        x: x + Math.cos(a) * r,
        y: y + 1 + Math.random() * 3,
        z: z + Math.sin(a) * r,
        vx: Math.cos(a) * (2 + Math.random() * 3),
        vy: 2 + Math.random() * 1.6,
        vz: Math.sin(a) * (2 + Math.random() * 3),
        size: 6 + Math.random() * 4,
        grow: 0.4 + Math.random() * 0.3,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.2,
        age: -Math.random() * 1.2, // the canisters pop one after another
        life: 18 + Math.random() * 8,
        seed: Math.random() * 0.4,
      });
    }
  }

  clearScreens() {
    this.screenParticles.length = 0;
    this.screen.commit(0);
  }

  spawnDust(x, y, z, size, life, rise, alpha = 0.6) {
    if (this.dustParticles.length >= this.dust.max) this.dustParticles.shift();
    this.dustParticles.push({
      x,
      y,
      z,
      vx: (Math.random() - 0.5) * 2,
      vy: rise * (0.6 + Math.random() * 0.8),
      vz: (Math.random() - 0.5) * 2,
      size,
      grow: size * (0.6 + Math.random() * 0.5),
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      age: 0,
      life,
      glow: 0,
      alpha,
    });
  }

  blastLight(x, y, z, power, life) {
    const b = this.blastLights.reduce((a, c) => (c.t / c.life > a.t / a.life || c.power === 0 ? c : a));
    b.light.position.set(x, y, z);
    b.t = 0;
    b.life = life;
    b.power = power;
  }

  /** a vehicle or a missile goes up: fireball, flash, black smoke, debris dust */
  explosion(x, y, z, size = 8, { smoke = 1, light = 1 } = {}) {
    const n = 3 + Math.round(size / 4);
    for (let i = 0; i < n; i++) {
      if (this.balls.length >= this.fireballs.max) this.balls.shift();
      this.balls.push({
        x: x + (Math.random() - 0.5) * size * 0.35,
        y: y + Math.random() * size * 0.3,
        z: z + (Math.random() - 0.5) * size * 0.35,
        size: size * (0.55 + Math.random() * 0.5),
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 1.2,
        vy: 1 + Math.random() * size * 0.25,
        age: -i * 0.05,
        life: 0.55 + Math.random() * 0.45 + size * 0.02,
      });
    }
    this.flashList.push({ x, y: y + 1, z, size: size * 4, age: 0, life: 0.25 });
    for (let i = 0; i < Math.round(6 * smoke + size * 0.6); i++) {
      this.spawnSmoke(x + (Math.random() - 0.5) * size * 0.5, y + Math.random() * size * 0.4, z + (Math.random() - 0.5) * size * 0.5, size * 0.6, 7 + Math.random() * 8, 2 + Math.random() * 3, 0.9, 0.8);
    }
    for (let i = 0; i < 5; i++) this.spawnDust(x + (Math.random() - 0.5) * size, y, z + (Math.random() - 0.5) * size, size * 0.5, 3 + Math.random() * 3, 3, 0.5);
    if (light) this.blastLight(x, y + 2, z, 900 * light * (size / 8), 0.6);
  }

  /** a round hits the ground (dust) or armour (sparks + small flash) */
  impact(x, y, z, kind = 'ground', scale = 1) {
    if (kind === 'ground') {
      for (let i = 0; i < 3; i++) this.spawnDust(x + (Math.random() - 0.5), y + 0.3, z + (Math.random() - 0.5), 1.4 * scale, 1.8 + Math.random() * 1.5, 2.5 + Math.random() * 2, 0.7);
      if (this.balls.length < this.fireballs.max) this.balls.push({ x, y: y + 0.4, z, size: 1.2 * scale, rot: Math.random() * 6, vr: 0, vy: 0, age: 0, life: 0.12 });
    } else {
      if (this.balls.length >= this.fireballs.max) this.balls.shift();
      this.balls.push({ x, y, z, size: 2.2 * scale, rot: Math.random() * 6, vr: 0, vy: 0, age: 0, life: 0.14 });
      this.spawnSmoke(x, y, z, 1.2 * scale, 1.5, 1.5, 0.5, 0.5);
    }
  }

  muzzle(x, y, z, size = 2) {
    if (this.muzzleList.length >= this.muzzles.max) this.muzzleList.shift();
    this.muzzleList.push({ x, y, z, size, rot: Math.random() * 6.28, age: 0, life: 0.07 });
  }

  flareEmit(dt, x, y, z) {
    this.flareAcc += dt * 9;
    while (this.flareAcc > 1) {
      this.flareAcc -= 1;
      if (this.flareParticles.length >= this.flare.max) this.flareParticles.shift();
      this.flareParticles.push({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, age: 0, life: 9 + Math.random() * 4, rot: Math.random() * 6, size: 1.2 });
    }
  }

  buildAsh(scene) {
    const n = 1600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 120;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 120;
      const ember = Math.random() < 0.06;
      col[i * 3] = ember ? 3.0 : 0.55;
      col[i * 3 + 1] = ember ? 1.1 : 0.53;
      col[i * 3 + 2] = ember ? 0.3 : 0.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.ash = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.ash.frustumCulled = false;
    scene.add(this.ash);
  }

  buildTracers(scene) {
    this.tracers = [];
    const geo = new THREE.BoxGeometry(0.6, 0.6, 22);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 2.2, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, t: 0, life: 0, from: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    this.nextBurst = 4;
  }

  tracerBurst(camPos) {
    const a = Math.random() * Math.PI * 2;
    const d = 350 + Math.random() * 500;
    const from = new THREE.Vector3(camPos.x + Math.cos(a) * d, 2 + Math.random() * 8, camPos.z + Math.sin(a) * d);
    const b = a + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.6);
    const to = new THREE.Vector3(camPos.x + Math.cos(b) * d * 1.1, 5 + Math.random() * 60, camPos.z + Math.sin(b) * d * 1.1);
    const dir = to.sub(from).normalize();
    let k = 0;
    for (const tr of this.tracers) {
      if (tr.life > 0) continue;
      tr.from.copy(from).addScaledVector(new THREE.Vector3(Math.random(), Math.random(), Math.random()), 3);
      tr.vel.copy(dir).multiplyScalar(700 + Math.random() * 100);
      tr.t = -k * 0.09;
      tr.life = 1.6;
      tr.mesh.lookAt(tr.from.clone().add(tr.vel));
      if (++k >= 5) break;
    }
  }

  artillery(camPos) {
    const a = Math.random() * Math.PI * 2;
    const d = 900 + Math.random() * 900;
    const near = Math.random() < 0.18;
    const dist = near ? 250 + Math.random() * 250 : d;
    const x = camPos.x + Math.cos(a) * dist;
    const z = camPos.z + Math.sin(a) * dist;
    const y = Math.max(this.world.heightAt(x, z), -5) + 4;
    const size = near ? 60 : 140 + Math.random() * 120;
    this.flashList.push({ x, y, z, size, age: 0, life: 0.5 + Math.random() * 0.4 });
    this.flashDir.set(Math.cos(a), 0, Math.sin(a));
    this.flashLevel = Math.max(this.flashLevel, near ? 1 : 0.55 + Math.random() * 0.35);
    // dirt and smoke cloud of the impact
    const n = near ? 14 : 8;
    for (let i = 0; i < n; i++) {
      this.spawnSmoke(
        x + (Math.random() - 0.5) * 12,
        y + Math.random() * 6,
        z + (Math.random() - 0.5) * 12,
        near ? 9 : 22,
        9 + Math.random() * 6,
        3 + Math.random() * 3,
        0.9,
        0.75,
      );
    }
    this.onBoom?.(dist, near ? 1 : 0.5);
  }

  update(dt, time, camPos) {
    this.time.value = time;

    // fires and their smoke
    let fi = 0;
    for (const f of this.fires) {
      for (const fl of f.flames) {
        if (fi >= this.fire.max) break;
        this.fire.set(fi++, fl.x, f.y, fl.z, fl.size, 0, 1, fl.seed, 1.6);
      }
      f.emit += dt * (2.5 + f.scale * 0.4) * f.smoke;
      while (f.emit > 1) {
        f.emit -= 1;
        this.spawnSmoke(
          f.x + (Math.random() - 0.5) * f.scale * 0.4,
          f.y + f.scale * 0.9,
          f.z + (Math.random() - 0.5) * f.scale * 0.4,
          f.scale * 0.9,
          12 + Math.random() * 10,
          3.2 + f.scale * 0.3,
        );
      }
    }
    this.fire.commit(fi);

    // nearest fires get the real lights
    const sorted = this.fires
      .map((f) => ({ f, d: (f.x - camPos.x) ** 2 + (f.z - camPos.z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.fireLights.forEach((l, i) => {
      const s = sorted[i];
      if (!s) {
        l.intensity = 0;
        return;
      }
      l.position.set(s.f.x, s.f.y + s.f.scale * 0.6, s.f.z);
      l.intensity = (160 + 70 * Math.sin(time * 11 + i) * Math.sin(time * 4.7 + i * 2)) * (s.f.scale / 5);
    });

    // smoke simulation (wind drifts it east)
    let si = 0;
    const wind = 2.2;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age > p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      p.x += (p.vx + wind * t) * dt;
      p.y += p.vy * dt * (1 - t * 0.6);
      p.z += p.vz * dt;
      p.rot += p.vr * dt;
      const size = p.size + p.grow * p.age;
      const a = p.alpha * Math.min(1, p.age * 2) * (1 - t) * (1 - t * 0.3);
      this.smoke.set(si++, p.x, p.y, p.z, size, p.rot, a, p.glow * Math.max(0, 1 - t * 4));
    }
    this.smoke.commit(si);

    let di = 0;
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.age += dt;
      if (p.age > p.life) {
        this.dustParticles.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      p.x += (p.vx + wind * t) * dt;
      p.y += p.vy * dt * (1 - t);
      p.z += p.vz * dt;
      p.rot += p.vr * dt;
      const a = p.alpha * Math.min(1, p.age * 6) * (1 - t) ** 1.5;
      this.dust.set(di++, p.x, p.y, p.z, p.size + p.grow * p.age, p.rot, a, 0);
    }
    this.dust.commit(di);

    let ci = 0;
    for (let i = this.screenParticles.length - 1; i >= 0; i--) {
      const p = this.screenParticles[i];
      p.age += dt;
      if (p.age > p.life) {
        this.screenParticles.splice(i, 1);
        continue;
      }
      if (p.age < 0) continue;
      const t = p.age / p.life;
      const drag = Math.exp(-dt * 1.4);
      p.vx *= drag;
      p.vz *= drag;
      p.vy *= Math.exp(-dt * 0.5);
      p.x += (p.vx + 0.35) * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.vr * dt;
      const a = 0.95 * Math.min(1, p.age * 3) * Math.min(1, (1 - t) * 3);
      this.screen.set(ci++, p.x, p.y, p.z, p.size + p.grow * p.age * 4, p.rot, a, p.seed);
    }
    this.screen.commit(ci);

    let bi = 0;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.age += dt;
      if (b.age > b.life) {
        this.balls.splice(i, 1);
        continue;
      }
      if (b.age < 0) continue;
      const t = b.age / b.life;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      const a = Math.min(1, (1 - t) * 1.6) * (t < 0.1 ? t * 10 : 1);
      this.fireballs.set(bi++, b.x, b.y, b.z, b.size * (0.45 + 0.75 * Math.sqrt(t)), b.rot, a, t);
    }
    this.fireballs.commit(bi);
    let mi = 0;
    for (let i = this.muzzleList.length - 1; i >= 0; i--) {
      const m = this.muzzleList[i];
      m.age += dt;
      if (m.age > m.life) {
        this.muzzleList.splice(i, 1);
        continue;
      }
      this.muzzles.set(mi++, m.x, m.y, m.z, m.size, m.rot, 1 - m.age / m.life, 0);
    }
    this.muzzles.commit(mi);
    for (const b of this.blastLights) {
      b.t += dt;
      const k = Math.max(0, 1 - b.t / b.life);
      b.light.intensity = b.power * k * k;
      if (k === 0) b.power = 0;
    }

    let fi2 = 0;
    for (let i = this.flareParticles.length - 1; i >= 0; i--) {
      const p = this.flareParticles[i];
      p.age += dt;
      if (p.age > p.life) {
        this.flareParticles.splice(i, 1);
        continue;
      }
      const t = p.age / p.life;
      p.x += wind * t * dt * 1.4;
      p.y += (2.4 - t * 1.6) * dt;
      p.rot += dt * 0.2;
      const a = 0.7 * Math.min(1, p.age * 3) * (1 - t);
      this.flare.set(fi2++, p.x, p.y, p.z, p.size + p.age * 1.1, p.rot, a, 1 - t * 3);
    }
    this.flare.commit(fi2);

    // artillery flashes
    this.nextFlash -= dt;
    if (this.nextFlash < 0) {
      this.artillery(camPos);
      this.nextFlash = 2 + Math.random() * 7;
    }
    let fl = 0;
    for (let i = this.flashList.length - 1; i >= 0; i--) {
      const f = this.flashList[i];
      f.age += dt;
      if (f.age > f.life) {
        this.flashList.splice(i, 1);
        continue;
      }
      const k = 1 - f.age / f.life;
      this.flashes.set(fl++, f.x, f.y, f.z, f.size * (0.6 + 0.4 * (1 - k)), 0, k * k, 0);
    }
    this.flashes.commit(fl);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 3.5);
    const w = this.world;
    w.skyUniforms.flash.value = this.flashLevel;
    w.skyUniforms.flashDir.value.copy(this.flashDir);
    w.flashLight.intensity = this.flashLevel * 3;
    w.flashLight.position.copy(camPos).addScaledVector(this.flashDir, 500).setY(150);
    w.flashLight.target.position.copy(camPos);

    // tracers
    this.nextBurst -= dt;
    if (this.nextBurst < 0) {
      this.tracerBurst(camPos);
      this.nextBurst = 3 + Math.random() * 8;
    }
    for (const tr of this.tracers) {
      if (tr.life <= 0) {
        tr.mesh.visible = false;
        continue;
      }
      tr.t += dt;
      tr.life -= dt;
      tr.mesh.visible = tr.t > 0;
      tr.mesh.position.copy(tr.from).addScaledVector(tr.vel, Math.max(0, tr.t));
    }

    // ash: world-fixed specks in a box that wraps around the camera
    const pos = this.ash.geometry.attributes.position;
    this.lastCam ??= camPos.clone();
    const dx = camPos.x - this.lastCam.x;
    const dy = camPos.y - this.lastCam.y;
    const dz = camPos.z - this.lastCam.z;
    this.lastCam.copy(camPos);
    const wrap = (v, h) => (v > h ? v - 2 * h : v < -h ? v + 2 * h : v);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) - dy - dt * (0.5 + (i % 7) * 0.12);
      const x = pos.getX(i) - dx + dt * (wind * 0.6 + Math.sin(time * 0.7 + i) * 0.4);
      const z = pos.getZ(i) - dz;
      pos.setXYZ(i, wrap(x, 60), wrap(y, 30), wrap(z, 60));
    }
    pos.needsUpdate = true;
    this.ash.position.copy(camPos);
  }
}
