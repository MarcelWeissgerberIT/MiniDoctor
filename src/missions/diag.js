import * as THREE from 'three';
import { VESSELS, SIZES } from '../physics.js';
import { t } from '../i18n.js';
import { SAMPLE_TYPES, findingFor, evidence, diagnosisOutcome, DISEASES } from './diagLogic.js';
import { tex } from '../world.js';

const SCAN_RANGE = 60; // µm
const SCAN_ANGLE = 0.22; // rad (≈ 12°)
const LOCK_ANGLE = 0.75; // autopilot target lock (≈ 43°)
const SCAN_TIME = 1.3;

function bumpy(geo, amp) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1) * Math.cos(v.y * 2.7) * Math.sin(v.z * 3.3);
    v.multiplyScalar(1 + n * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Build the 3D object for a sample. Sizes are real (µm). */
function sampleMesh(type, disease) {
  const g = new THREE.Group();
  if (type === 'wbc') {
    // lymphocyte ≈ 8 µm, neutrophil ≈ 12 µm
    const r = disease === 'virus' ? 4.2 : 5.5;
    const m = new THREE.Mesh(bumpy(new THREE.IcosahedronGeometry(r, 4), 0.06), new THREE.MeshStandardMaterial({ color: 0xe8dff0, roughness: 0.7 }));
    g.add(m);
  } else if (type === 'platelet') {
    const active = disease !== 'virus';
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 10), new THREE.MeshStandardMaterial({ color: 0xeedccc, roughness: 0.6 }));
    m.scale.y = active ? 0.8 : 0.4;
    g.add(m);
    if (active)
      for (let k = 0; k < 9; k++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.4, 5), m.material);
        const a = (k / 9) * Math.PI * 2;
        s.position.set(Math.cos(a) * 1.3, (Math.random() - 0.5) * 0.4, Math.sin(a) * 1.3);
        s.lookAt(s.position.clone().multiplyScalar(2));
        s.rotateX(Math.PI / 2);
        g.add(s);
      }
    if (disease === 'dvt')
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8, 4), new THREE.MeshStandardMaterial({ color: 0xf2ead0 }));
        f.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        g.add(f);
      }
  } else if (type === 'plasma') {
    // plasma sample: molecules are invisible — shown as a sampling shimmer
    const N = 160;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 3);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfff0a0, size: 0.15, transparent: true, opacity: 0.8, depthWrite: false })));
  } else if (type === 'lipid') {
    const high = disease === 'stenosis';
    const n = high ? 40 : 8;
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5d670, roughness: 0.3, emissive: 0x3a2a00 });
    for (let k = 0; k < n; k++) {
      // chylomicrons / VLDL 0.1–1 µm
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.15 + Math.random() * 0.35, 10, 8), mat);
      s.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 3));
      g.add(s);
    }
  } else {
    // particle: depends on the disease
    if (disease === 'virus') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x9fcf9f, emissive: 0x0a200a });
      for (let k = 0; k < 20; k++) {
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), mat);
        s.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 0.5));
        g.add(s);
      }
    } else if (disease === 'stenosis') {
      const mat = new THREE.MeshStandardMaterial({ color: 0xf8f8ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 });
      for (let k = 0; k < 5; k++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 2, 0.15, 1.5 + Math.random()), mat);
        s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        s.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 1.5));
        g.add(s);
      }
    } else if (disease === 'stroke') {
      // micro-emboli from the heart: small platelet–fibrin clumps
      const red = new THREE.MeshStandardMaterial({ color: 0x9a2a2a, roughness: 0.7 });
      const pale = new THREE.MeshStandardMaterial({ color: 0xeedccc, roughness: 0.6 });
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Group();
        c.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(2.5));
        for (let i = 0; i < 9; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.4, 8, 6), i % 3 ? pale : red);
          m.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 0.9));
          c.add(m);
        }
        g.add(c);
      }
    } else {
      const mat = new THREE.MeshStandardMaterial({ color: 0xf2ead0, roughness: 0.8 });
      for (let k = 0; k < 10; k++) {
        const pts = [];
        const start = new THREE.Vector3().randomDirection().multiplyScalar(3);
        for (let i = 0; i < 5; i++) pts.push(start.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(i * 2)));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.06, 4), mat));
      }
    }
  }
  return g;
}

export class DiagnosisMission {
  constructor(game) {
    this.game = game;
    this.id = 'diag';
    this.vessel = VESSELS.arteriole;
    this.tools = ['scanner', 'anchor'];
    this.nameKey = 'm0_name';
    this.lateralSpeed = 6;
  }

  start(ctx) {
    const { world, ship } = ctx;
    this.ctx = ctx;
    world.setVessel(this.vessel, { rbcCount: 70, cellLat: 50, cellFront: 160 });
    ship.x = 0;
    ship.y = 0;
    const R = this.vessel.radius;
    this.disease = this.game.disease;
    const types = [...SAMPLE_TYPES].sort(() => Math.random() - 0.5);
    this.samples = types.map((type, k) => {
      const a = Math.random() * Math.PI * 2;
      const r = R * (0.45 + Math.random() * 0.3);
      const mesh = sampleMesh(type, this.disease);
      world.group.add(mesh);
      return { type, x: Math.cos(a) * r, y: Math.sin(a) * r, dist: 380 + k * 170, state: 'open', progress: 0, mesh };
    });
    this.findings = [];
    this.phase = 'scan';
    ctx.tools.select('scanner');
  }

  sonarRange = 400;
  sonarTargets() {
    return this.samples.filter((s) => s.state === 'open').map((s) => ({ x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z }));
  }

  autopilotTarget(ship) {
    const next = this.samples.find((s) => s.state === 'open' && s.dist - ship.dist > -5);
    if (!next) return { x: 0, y: 0 };
    // aim to pass beside the sample (not through it)
    const r = Math.hypot(next.x, next.y) || 1;
    return { x: next.x - (next.x / r) * 10, y: next.y - (next.y / r) * 10 };
  }

  update(dt, ctx) {
    const { world, ship, hud, input, tools, audio } = ctx;
    const cam = world.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let scanning = false;
    let best = null;
    let next = null;
    const lockAngle = ship.autopilot ? LOCK_ANGLE : SCAN_ANGLE;
    for (const s of this.samples) {
      if (s.state === 'gone') continue;
      s.dist += world.flowAt(s.x, s.y, ctx.time) * dt;
      const z = world.zOf(s.dist, ship);
      s.mesh.position.set(s.x, s.y, z);
      s.mesh.rotation.y += dt * 0.2;
      if (z > 20 && s.state === 'open') {
        s.state = 'missed';
        hud.toast(t('d_missed'), 'warn');
        ctx.radio('r_d_missed', null, { cooldown: 30 });
      }
      if (z > 200) {
        s.state = s.state === 'open' ? 'missed' : s.state;
        s.mesh.visible = false;
      }
      if (s.state !== 'open') continue;
      const to = s.mesh.position.clone().sub(cam.position);
      const d = to.length();
      const ang = to.normalize().angleTo(fwd);
      if (!next || z > next.z) next = { s, d, z }; // closest one ahead
      if (d < SCAN_RANGE && ang < lockAngle && (!best || d < best.d)) best = { s, d };
    }
    // Scanner: hold the mouse button while a sample is in the crosshair
    // (with the autopilot on, the scanner locks on automatically).
    const holding = this.phase === 'scan' && input.down && ctx.controls;
    if (holding && tools.target !== 'scanner') tools.select('scanner');
    tools.setHolding(holding);
    if (best) tools.aimAtWorld(best.s.mesh.position);
    else tools.aimForward(30);
    if (holding && best) {
      scanning = true;
      best.s.progress += dt / SCAN_TIME;
      if (best.s.progress >= 1) {
        best.s.state = 'done';
        const f = findingFor(best.s.type, this.disease);
        this.findings.push({ type: best.s.type, f });
        hud.toast(`${t('s_' + best.s.type)}: ${t(f)}`, 'ok', 4.5);
        ctx.radio('r_d_found', null, { priority: 0, cooldown: 25 });
        audio.sfx('ok');
      } else if (Math.random() < dt * 6) audio.sfx('scan');
    }
    // markers + arrow to the next sample
    for (const s of this.samples) {
      if (s.state === 'gone' || !s.mesh.visible) continue;
      const d = s.mesh.position.distanceTo(cam.position);
      if (d > 260) continue;
      const done = s.state === 'done';
      const col = done ? '#56f59a' : s.state === 'missed' ? '#777' : best?.s === s ? '#ffd27f' : '#7ff3ff';
      hud.marker(s.mesh.position, {
        size: Math.max(12, 300 / Math.max(5, d)),
        color: col,
        label: `${t('s_' + s.type)} · ${Math.round(d)} µm`,
        progress: s.state === 'open' && s.progress > 0 ? s.progress : -1,
      });
    }
    if (next && !best) hud.pointer(next.s.mesh.position, '#ffd27f');
    this.guide(ctx, next, best, scanning);
    ctx.scanning = scanning;
    const open = this.samples.filter((s) => s.state === 'open').length;
    hud.setStats(
      `${t('d_samples')}: <b>${this.samples.filter((s) => s.state === 'done').length}/${this.samples.length}</b><br>` +
        this.findings.map((x) => `• ${t(x.f)}`).join('<br>'),
    );
    if (this.phase === 'scan' && (open === 0 || input.pressed.has('Enter'))) this.openDiagnosis(ctx);
    if (this.result) return this.result;
    return null;
  }

  /** Step-by-step instructions that follow what the pilot has to do next. */
  guide(ctx, next, best, scanning) {
    const done = this.samples.filter((s) => s.state === 'done').length;
    let step;
    let text;
    if (!next) {
      step = 4;
      text = t('d_step4');
    } else if (best) {
      step = 3;
      text = scanning ? t('d_scanning', { p: Math.round(best.s.progress * 100) }) : t('d_step3');
    } else if (next.d < SCAN_RANGE * 1.6) {
      step = 2;
      text = ctx.input.locked || !ctx.controls ? t('d_step2') : t('d_step2_lock');
    } else {
      step = 1;
      text = t('d_step1', { type: t('s_' + next.s.type), d: Math.round(next.d) });
    }
    const steps = [1, 2, 3, 4]
      .map((k) => `<li class="${k === step ? 'now' : k < step ? 'past' : ''}">${k === step ? text : t('d_short' + k)}</li>`)
      .join('');
    const key = `${step}|${text}|${done}`;
    if (key === this._guideKey) return;
    this._guideKey = key;
    ctx.hud.setObjective(`<b>${t('m0_name')}</b> · ${t('d_samples')} ${done}/${this.samples.length}<ol class="guide">${steps}</ol>`);
  }

  openDiagnosis(ctx) {
    this.phase = 'choose';
    ctx.input.unlock();
    ctx.tools.setHolding(false);
    const ev = evidence(this.findings.map((f) => f.f));
    const html = `
      <h2>${t('d_choose')}</h2>
      <p class="muted">${t('d_hint')}</p>
      <ul class="findings">${this.findings.map((x) => `<li><b>${t('s_' + x.type)}:</b> ${t(x.f)}</li>`).join('') || `<li>${t('d_none')}</li>`}</ul>
      <div class="choices">${DISEASES.map(
        (d) => `<button class="btn" data-d="${d}">${t('dx_' + d)}<small>${'●'.repeat(ev[d])}${'○'.repeat(Math.max(0, 4 - ev[d]))}</small></button>`,
      ).join('')}</div>`;
    const p = ctx.hud.openPanel(html);
    p.querySelectorAll('[data-d]').forEach((b) =>
      b.addEventListener('click', () => {
        const chosen = b.dataset.d;
        const o = diagnosisOutcome(chosen, this.disease, this.findings.length);
        ctx.hud.closePanel();
        ctx.audio.sfx(o.correct ? 'ok' : 'bad');
        this.game.diagnosed = chosen;
        this.result = {
          quality: o.quality,
          damage: o.damage,
          lines: [
            `${t('d_your')}: <b>${t('dx_' + chosen)}</b>`,
            o.correct ? `<span class="ok">${t('d_correct')}</span>` : `<span class="bad">${t('d_wrong', { dx: t('dx_' + this.disease) })}</span>`,
          ],
        };
      }),
    );
  }

  dispose() {}
}
