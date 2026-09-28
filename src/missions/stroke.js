import * as THREE from 'three';
import { VESSELS, beatPhase } from '../physics.js';
import { t } from '../i18n.js';
import { tex } from '../world.js';
import * as K from './strokeLogic.js';

const CLOT_AT = 3200;
const DOCK_GAP = 220;

export class StrokeMission {
  constructor(game) {
    this.game = game;
    this.id = 'stroke';
    this.vessel = VESSELS.mca;
    this.tools = ['scanner', 'anchor'];
    this.nameKey = 'm4_name';
    this.lateralSpeed = 45;
  }

  start(ctx) {
    const { world, ship } = ctx;
    this.ctx = ctx;
    const R = this.vessel.radius;
    world.setVessel(this.vessel, { rbcCount: 230, cellLat: 110, cellFront: 260 });
    this.case = K.createStrokeCase(Math.floor(Math.random() * 1e9));
    this.side = Math.random() * Math.PI * 2;
    ship.x = Math.cos(this.side + 0.6) * R * 0.3;
    ship.y = Math.sin(this.side + 0.6) * R * 0.3;
    this.phase = 'approach';
    this.elapsed = 0; // game seconds since the mission (and the ischaemia clock) started
    this.pull = K.createPull();
    this.beats = 0;
    this.opened = false;

    // red, RBC-rich cardio-embolic clot filling the lumen
    const faceMat = new THREE.MeshStandardMaterial({ map: tex('tex_fibrin', 40, 40), color: 0xc05050, roughness: 0.85, transparent: true, fog: false });
    const geo = new THREE.PlaneGeometry(2 * R, 2 * R, 64, 64);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, Math.sin(x * 0.018) * Math.cos(y * 0.021) * 30 - Math.hypot(x, y) * 0.03);
    }
    geo.computeVertexNormals();
    this.face = new THREE.Mesh(geo, faceMat);
    world.group.add(this.face);

    // microcatheter (Ø ≈ 0.7 mm) running past the ship into the clot
    this.cath = new THREE.Mesh(
      new THREE.CylinderGeometry(350, 350, 6000, 32),
      new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.35, metalness: 0.2 }),
    );
    this.cath.rotation.x = Math.PI / 2;
    this.cath.visible = false;
    world.group.add(this.cath);

    // stent retriever: proximal part visible in front of the clot + platinum markers
    this.retr = new THREE.Group();
    const strut = new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.7, roughness: 0.3, emissive: 0x1a1d22 });
    for (let k = 0; k < 4; k++) {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), (i % 2 ? 0.12 : -0.12) + k * 0.5));
      }
      const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.025, 5, true), strut);
      this.retr.add(ring);
    }
    const mk = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7ff3ff, emissiveIntensity: 1.5 });
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mk);
      const a = (k / 3) * Math.PI * 2;
      m.position.set(Math.cos(a), Math.sin(a), -0.2);
      this.retr.add(m);
    }
    this.retr.visible = false;
    world.group.add(this.retr);

    this.frags = [];
    ctx.tools.select('scanner');
    ctx.hud.setObjective(`<b>${t('m4_name')}</b><br>${t('k_approach')}`);
  }

  get dockPoint() {
    const R = this.vessel.radius;
    return { x: Math.cos(this.side) * R * 0.78, y: Math.sin(this.side) * R * 0.78 };
  }

  flowMod(ship) {
    if (this.opened) return 1;
    const d = CLOT_AT - ship.dist;
    return Math.max(0.1, Math.min(1, d / 1200));
  }

  autopilotTarget() {
    return this.phase === 'approach' ? this.dockPoint : null;
  }

  /** Cursor stays free while pulling (to grab the control grip). */
  wantsCursor() {
    return this.phase === 'integrate' || this.phase === 'pull' || this.phase === 'done';
  }

  canRelease() {
    return this.phase === 'approach' || this.phase === 'done';
  }

  pullInput(ctx) {
    const ky = ctx.input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const back = Math.max(0, -ky, -ctx.ship.stick.ly);
    return Math.max(back, ctx.input.down && ctx.controls ? 0.5 : 0);
  }

  update(dt, ctx) {
    const { world, ship, hud, input, tools, audio } = ctx;
    const R = this.vessel.radius;
    if (!this.opened) this.elapsed += dt;
    const zFace = world.zOf(CLOT_AT, ship);
    const pr = this.pull.progress;
    // while being pulled, the clot is compressed into the retriever and slides towards us
    const slide = this.phase === 'pull' || this.phase === 'done' ? pr : 0;
    this.face.position.set(0, 0, zFace + slide * (-zFace + 600));
    this.face.scale.setScalar(1 - 0.72 * slide);
    this.face.visible = !(this.phase === 'done' && pr >= 1 && this.face.material.opacity <= 0.02);
    if (this.phase === 'done') this.face.material.opacity = Math.max(0, this.face.material.opacity - dt * 0.8);

    // proximal struts sit just in front of the clot, the rest is inside it
    this.retr.position.set(0, 0, this.face.position.z + 30);
    // self-expanding: the struts open up to the vessel wall, and collapse with the clot
    this.retr.scale.set(R * 0.95 * this.face.scale.x + 1, R * 0.95 * this.face.scale.x + 1, -70);

    const lost = K.neuronsLost(this.elapsed);
    const realSec = this.elapsed * K.REAL_SECONDS_PER_GAME_SECOND;
    const clock = `${Math.floor(realSec / 60)}:${String(Math.floor(realSec % 60)).padStart(2, '0')}`;
    const statsHead = `${t('k_time')}: <b>${clock} min</b><br>${t('k_neurons')}: <b class="bad">${(lost / 1e6).toFixed(1)} ${t('k_mio')}</b><br>`;
    ctx.mapTarget = this.dockPoint;
    ctx.distToTarget = CLOT_AT - ship.dist;
    ctx.warning = !this.opened;

    // fragments (distal emboli) drift away into the brain
    for (const f of this.frags) {
      f.position.z -= dt * 400;
      f.rotation.x += dt;
      if (f.position.z < -2000) f.visible = false;
    }

    if (this.phase === 'approach') {
      hud.setStats(statsHead + `${t('hud_dist')}: <b>${Math.max(0, CLOT_AT - DOCK_GAP - ship.dist).toFixed(0)} µm</b>`);
      tools.aimForward(60);
      if (ship.dist >= CLOT_AT - DOCK_GAP) {
        ship.dist = CLOT_AT - DOCK_GAP;
        ctx.requestAnchor(true);
        this.phase = 'scan';
        hud.setObjective(`<b>${t('m4_name')}</b><br>${t('k_scan')}`);
        tools.select('scanner');
      }
      return null;
    }
    hud.setStats(statsHead + (this.phase === 'pull' ? `${t('k_progress')}: <b>${Math.round(pr * 100)} %</b><br>${t('k_frags')}: <b>${this.pull.fragments}</b>` : ''));

    if (this.phase === 'scan') {
      tools.aimAtWorld(new THREE.Vector3(ship.x * 0.6, ship.y * 0.6, zFace));
      if (input.clicked && ctx.controls && !this.scanT) {
        tools.select('scanner');
        tools.fire({ duration: 1.6 });
        this.scanT = 1.6;
        audio.sfx('scan');
      }
      if (this.scanT) {
        this.scanT -= dt;
        this.face.material.emissive.setHex(Math.sin(ctx.time * 20) > 0 ? 0x113344 : 0);
        if (this.scanT <= 0) {
          this.scanT = 0;
          this.face.material.emissive.setHex(0);
          audio.sfx('ok');
          this.openChooser(ctx);
        }
      }
      return null;
    }

    if (this.phase === 'deploy') {
      // the microcatheter tip sways with the pulse; click when it is 2–6 mm beyond the clot
      this.cath.visible = true;
      const beat = beatPhase(ctx.time, this.vessel.heartRate);
      const off = this.drift + Math.sin(beat * Math.PI * 2) * 5; // mm beyond distal clot end
      const tw = this.dockPoint;
      const rr = Math.hypot(tw.x, tw.y);
      const a = this.side + 0.12; // just beside the ship, entering the clot ahead
      this.cath.position.set(Math.cos(a) * (rr - 380), Math.sin(a) * (rr - 380), zFace - 2900 - Math.max(0, off) * 10);
      const L = this.case.clotLength;
      const scale = 40;
      const clotL = 30;
      const tip = clotL + ((L + off) / scale) * 100;
      hud.setBar(`<div class="timing pos">
          <div class="lesion red" style="left:${clotL}%;width:${(L / scale) * 100}%"></div>
          <div class="zoneMark goal" style="left:${clotL + ((L + 2) / scale) * 100}%;width:${(4 / scale) * 100}%"></div>
          <div class="needle" style="left:${Math.max(0, Math.min(100, tip))}%"></div></div>
          <div class="bar-caption">${t('k_tip')}: ${off >= 0 ? '+' : ''}${off.toFixed(1)} mm</div>`);
      tools.aimForward(60);
      if (input.clicked && ctx.controls) {
        this.dScore = K.deployScore(off);
        this.offset = off;
        this.phase = 'integrate';
        ctx.input.unlock(); // free the cursor so the control grip can be grabbed
        this.retr.visible = true;
        this.beats = 0;
        this.lastBeat = beat;
        audio.sfx('anchor');
        hud.setBar('');
        hud.setObjective(`<b>${t('m4_name')}</b><br>${t('k_integrate')}`);
      }
      return null;
    }

    if (this.phase === 'integrate') {
      const beat = beatPhase(ctx.time, this.vessel.heartRate);
      if (beat < this.lastBeat) this.beats++;
      this.lastBeat = beat;
      hud.setCenter(`<div class="handover">${t('k_beats', { n: Math.min(3, this.beats) })}</div>`);
      if (this.pullInput(ctx) > 0.05 && ctx.controls) {
        this.iScore = K.integrationScore(this.beats);
        this.phase = 'pull';
        hud.setCenter('');
        hud.setObjective(`<b>${t('m4_name')}</b><br>${t('k_pull')}`);
      }
      return null;
    }

    if (this.phase === 'pull') {
      this.cath.visible = true;
      const p = this.pullInput(ctx);
      const ev = K.stepPull(this.pull, p, dt, this.case.sticky, this.iScore);
      const f = this.pull.force;
      const pct = Math.min(100, (f / 1.2) * 100);
      hud.setBar(`<div class="gauge"><div class="fill ${f > K.PULL.high ? 'hot' : ''}" style="width:${pct}%"></div>
        <div class="band" style="left:${(K.PULL.low / 1.2) * 100}%;width:${((K.PULL.high - K.PULL.low) / 1.2) * 100}%"></div></div>
        <div class="gauge thin"><div class="fill" style="width:${pr * 100}%"></div></div>
        <div class="bar-caption">${t('k_force')} · ${ev.inBand ? `<span class="ok">${t('k_good')}</span>` : f > K.PULL.high ? `<span class="bad">${t('k_toohard')}</span>` : t('k_tooslow')}</div>`);
      if (p > 0.02 && Math.random() < dt * 5) audio.sfx('tool');
      if (ev.tore) {
        hud.toast(t('k_tore'), 'bad', 3);
        audio.sfx('bad');
        const fr = new THREE.Mesh(new THREE.DodecahedronGeometry(90, 1), this.face.material.clone());
        fr.material.opacity = 1;
        fr.position.set((Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, this.face.position.z - 50);
        world.group.add(fr);
        this.frags.push(fr);
      }
      if (ev.done) this.finish(ctx, true);
      else if (this.pull.time > 45) this.finish(ctx, false);
      return null;
    }

    if (this.phase === 'done') {
      this.doneT -= dt;
      if (this.doneT <= 0) return this.result;
    }
    return null;
  }

  openChooser(ctx) {
    ctx.input.unlock();
    let pick = null;
    const html = `<h2>${t('k_choose')}</h2>
      <p>${t('k_measured', { len: this.case.clotLength.toFixed(1), d: this.case.vesselDiameter.toFixed(1) })}</p>
      <p class="muted">${t('k_rule')}</p>
      <div class="choices">${K.RETRIEVERS.map((r, i) => `<button class="btn sm" data-i="${i}">${r.d} × ${r.l} mm</button>`).join('')}</div>
      <button class="btn primary" id="k-ok" disabled>${t('k_confirm')}</button>`;
    const p = ctx.hud.openPanel(html);
    p.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        p.querySelectorAll('[data-i]').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        pick = K.RETRIEVERS[+b.dataset.i];
        p.querySelector('#k-ok').disabled = false;
      }),
    );
    p.querySelector('#k-ok').addEventListener('click', () => {
      this.retriever = pick;
      this.rScore = K.retrieverScore(pick, this.case);
      ctx.hud.closePanel();
      this.phase = 'deploy';
      this.drift = (Math.random() - 0.5) * 4;
      ctx.hud.setObjective(`<b>${t('m4_name')}</b><br>${t('k_deploy')}`);
      ctx.audio.sfx('ok');
    });
  }

  finish(ctx, removed) {
    const o = K.strokeOutcome({ rScore: this.rScore, dScore: this.dScore, iScore: this.iScore, pull: this.pull, removed, seconds: this.elapsed });
    ctx.hud.setBar('');
    if (removed) {
      this.opened = true;
      ctx.audio.sfx('ok');
      ctx.hud.toast(t('k_reperfused', { g: o.grade }), 'ok', 4);
    } else {
      ctx.audio.sfx('bad');
      ctx.hud.toast(t('k_failed'), 'bad', 4);
    }
    this.phase = 'done';
    this.doneT = 3.5;
    const pc = (x) => `${Math.round(x * 100)} %`;
    this.result = {
      quality: o.quality,
      damage: o.damage,
      lines: [
        `${t('k_retriever')}: ${this.retriever.d} × ${this.retriever.l} mm (${t('k_clot')} ${this.case.clotLength.toFixed(1)} mm, Ø ${this.case.vesselDiameter.toFixed(1)} mm) — ${pc(this.rScore)}`,
        `${t('k_tip')}: ${this.offset >= 0 ? '+' : ''}${this.offset.toFixed(1)} mm — ${pc(this.dScore)}`,
        `${t('k_integr')}: ${Math.min(3, this.beats)}/3 — ${pc(this.iScore)}`,
        `${t('k_frags')}: ${this.pull.fragments}`,
        `TICI ${o.grade} · ${t('k_neurons')}: ${(o.lost / 1e6).toFixed(1)} ${t('k_mio')}`,
      ],
    };
  }

  dispose() {}
}
