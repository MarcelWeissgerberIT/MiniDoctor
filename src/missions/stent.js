import * as THREE from 'three';
import { VESSELS, SIZES, beatPhase } from '../physics.js';
import { t } from '../i18n.js';
import { tex } from '../world.js';
import * as L from './stentLogic.js';

const LESION_AT = 7000; // µm downstream of the release point
const ANCHOR_WINDOW = 350;
const ANCHOR_WALL = 45;
const ANCHOR_ANGLE = 0.5;

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** Zig-zag stent ring (real strut thickness ≈ 80 µm). */
function stentRing(R, crowns = 12, amp = 450) {
  const pts = [];
  const n = crowns * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, i % 2 ? amp : -amp));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.05), n * 8, SIZES.stentStrut / 2, 6, true);
}

export class StentMission {
  constructor(game) {
    this.game = game;
    this.id = 'stent';
    this.vessel = VESSELS.coronary;
    this.tools = ['anchor', 'scanner', 'scalpel'];
    this.nameKey = 'm1_name';
    this.lateralSpeed = 45;
  }

  start(ctx) {
    const { world, ship } = ctx;
    this.ctx = ctx;
    const R = this.vessel.radius;
    world.setVessel(this.vessel, { rbcCount: 240, cellLat: 110, cellFront: 280 });
    this.case = L.createStentCase(Math.floor(Math.random() * 1e9));
    this.theta = Math.random() * Math.PI * 2;
    const a0 = this.theta + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.25);
    ship.x = Math.cos(a0) * R * 0.7;
    ship.y = Math.sin(a0) * R * 0.7;
    this.missed = 0;
    this.phase = 'approach';
    this.scored = 0;

    // Eccentric plaque: ellipsoid centred on the wall; its proximal tip is at LESION_AT.
    this.plaqueAxial = 6000;
    this.plaqueRadial = R * this.case.stenosis;
    this.plaqueTangential = 1400;
    const pm = new THREE.MeshStandardMaterial({ map: tex('tex_plaque', 6, 30), roughness: 0.7, color: 0xfff2d0, emissive: 0x000000 });
    this.plaque = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), pm);
    this.plaque.scale.set(this.plaqueRadial, this.plaqueTangential, this.plaqueAxial);
    this.plaque.rotation.z = this.theta;
    world.group.add(this.plaque);

    // Calcium nodes near the anchor point (visible from the cockpit)
    this.nodes = [];
    const nm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x333333 });
    for (let k = 0; k < this.case.calcNodes; k++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + Math.random() * 4, 1), nm.clone());
      this.nodes.push({ mesh: m, off: (k - 1) * 22, z: 40 + k * 18, scored: false });
      world.group.add(m);
    }

    // Stent + balloon (hidden until the catheter arrives)
    this.stent = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 0.7, roughness: 0.3, emissive: 0x1a1d22 });
    for (let k = -3; k <= 3; k++) {
      const ring = new THREE.Mesh(stentRing(1), sm);
      ring.scale.set(R, R, 1);
      ring.position.z = k * 1000;
      this.stent.add(ring);
    }
    this.balloon = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 8000, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25, roughness: 0.1, side: THREE.DoubleSide }),
    );
    this.balloon.rotation.x = Math.PI / 2;
    this.stent.add(this.balloon);
    this.stent.visible = false;
    world.group.add(this.stent);
    this.stentRadius = 0.3;

    // Guidewire (0.014″ = 356 µm), hugging the wall near us
    this.wire = new THREE.Mesh(
      new THREE.CylinderGeometry(SIZES.guidewire / 2, SIZES.guidewire / 2, 20000, 24, 1),
      new THREE.MeshStandardMaterial({ color: 0x8a95a5, metalness: 0.6, roughness: 0.35, emissive: 0x111418 }),
    );
    this.wire.rotation.x = Math.PI / 2;
    this.wire.visible = false;
    world.group.add(this.wire);

    ctx.tools.select('anchor');
    ctx.hud.setObjective(`<b>${t('m1_name')}</b><br>${t('st_obj')}`);
  }

  get lesionDist() {
    return LESION_AT;
  }

  anchorPoint() {
    const R = this.vessel.radius;
    const r = R - SIZES.ship / 2 - 20;
    return { x: Math.cos(this.theta) * r, y: Math.sin(this.theta) * r };
  }

  autopilotTarget(ship) {
    if (this.phase !== 'approach') return null;
    const R = this.vessel.radius;
    const toGo = LESION_AT - ship.dist;
    // stay in the fast centre flow first, marginate to the wall when close
    const p = this.anchorPoint();
    const approachR = toGo > 2500 ? 0.72 : 1;
    const r = Math.hypot(p.x, p.y) * (approachR === 1 ? 1 : 0.72);
    const onArc = angDiff(Math.atan2(ship.y, ship.x), this.theta) < 0.05;
    if (!onArc && toGo > 1000) return { x: Math.cos(this.theta) * R * 0.72, y: Math.sin(this.theta) * R * 0.72 };
    return { x: Math.cos(this.theta) * r, y: Math.sin(this.theta) * r };
  }

  canRelease() {
    return this.phase === 'approach';
  }

  inAnchorZone(ship) {
    const R = this.vessel.radius;
    const toGo = LESION_AT - ship.dist;
    return (
      toGo > 0 &&
      toGo < ANCHOR_WINDOW &&
      ship.wallDistance(R) < ANCHOR_WALL &&
      angDiff(Math.atan2(ship.y, ship.x), this.theta) < ANCHOR_ANGLE
    );
  }

  /** Called when the pilot presses the anchor. */
  tryAnchor(ctx) {
    const { ship, hud } = ctx;
    if (this.phase !== 'approach') return false;
    if (this.inAnchorZone(ship)) {
      this.phase = 'scan';
      this.anchorDist = ship.dist;
      hud.toast(t('hud_anchored'), 'ok');
      hud.setObjective(`<b>${t('m1_name')}</b><br>${t('st_scan')}`);
      ctx.tools.select('scanner');
      return true;
    }
    hud.toast(ship.wallDistance(this.vessel.radius) > ANCHOR_WALL ? t('anchorNoWall') : t('anchorWrongSpot'), 'warn');
    return false;
  }

  constrain(ship) {
    // keep the ship out of the plaque ellipsoid (flow carries it around)
    const R = this.vessel.radius;
    const cx = Math.cos(this.theta) * R;
    const cy = Math.sin(this.theta) * R;
    const zc = LESION_AT + this.plaqueAxial;
    const dx = ship.x - cx;
    const dy = ship.y - cy;
    const c = Math.cos(-this.theta);
    const s = Math.sin(-this.theta);
    const lx = (dx * c - dy * s) / this.plaqueRadial;
    const ly = (dx * s + dy * c) / this.plaqueTangential;
    const lz = (ship.dist - zc) / this.plaqueAxial;
    const q = lx * lx + ly * ly + lz * lz;
    if (q < 1) {
      const push = (1 - q) * 60;
      const r = ship.r || 1;
      ship.x -= (ship.x / r) * push;
      ship.y -= (ship.y / r) * push;
    }
  }

  update(dt, ctx) {
    const { world, ship, hud, input, tools, audio } = ctx;
    const R = this.vessel.radius;
    const zPlaque = world.zOf(LESION_AT + this.plaqueAxial, ship);
    this.plaque.position.set(Math.cos(this.theta) * R, Math.sin(this.theta) * R, zPlaque);

    // nodes sit on the wall just downstream of the anchor point
    const tang = new THREE.Vector2(-Math.sin(this.theta), Math.cos(this.theta));
    const base = ship.anchored && this.anchorDist ? this.anchorDist : LESION_AT - 150;
    const zc = LESION_AT + this.plaqueAxial;
    for (const n of this.nodes) {
      const nd = base + n.z;
      const q = (nd - zc) / this.plaqueAxial;
      const h = q > -1 ? this.plaqueRadial * Math.sqrt(Math.max(0, 1 - q * q)) : 0;
      const rr = R - h - 5;
      n.mesh.position.set(Math.cos(this.theta) * rr + tang.x * n.off, Math.sin(this.theta) * rr + tang.y * n.off, world.zOf(nd, ship));
      n.mesh.material.emissive.setHex(n.scored ? 0x00303a : 0x333333);
    }

    const toGo = LESION_AT - ship.dist;
    const target = this.anchorPoint();
    ctx.mapTarget = target;
    ctx.distToTarget = toGo;

    if (this.phase === 'approach') {
      const zone = this.inAnchorZone(ship);
      hud.setCenter(zone ? `<div class="zone">${t('anchorZone')}</div>` : '');
      if (zone && ship.autopilot) ctx.requestAnchor();
      hud.setStats(
        `${t('hud_dist')}: <b>${(toGo / 1000).toFixed(2)} mm</b><br>${t('hud_wall')}: <b>${Math.round(ship.wallDistance(R))} µm</b><br>` +
          `${t('st_side')}: <b>${Math.round((angDiff(Math.atan2(ship.y, ship.x), this.theta) * 180) / Math.PI)}°</b>`,
      );
      if (toGo < -30) {
        this.missed++;
        ship.dist = LESION_AT - 2600;
        audio.sfx('bad');
        hud.toast(t('sweptPast'), 'bad', 4);
        ctx.fade();
      }
      tools.aimForward(40);
      return null;
    }
    hud.setCenter('');
    hud.setStats(
      `${t('hud_anchor')}: <b>${t('hud_anchored')}</b><br>` +
        (this.phase !== 'scan' ? `${t('st_lesion')}: <b>${this.case.lesionLength.toFixed(1)} mm</b><br>${t('st_ref')}: <b>${this.case.refDiameter.toFixed(2)} mm</b><br>` : '') +
        (this.choice ? `Stent: <b>${this.choice.length} × ${this.choice.diam.toFixed(2)} mm</b>` : ''),
    );

    if (input.clicked && ctx.controls) {
      const need = { scan: 'scanner', score: 'scalpel' }[this.phase];
      if (need && tools.target !== need) hud.toast(t('needTool', { tool: t('tool_' + need) }), 'warn');
    }

    if (this.phase === 'scan') {
      tools.aimAtWorld(new THREE.Vector3(this.plaque.position.x * 0.97, this.plaque.position.y * 0.97, -120));
      if (tools.target === 'scanner' && input.clicked && ctx.controls && !this.scanT) {
        tools.fire({ duration: 2 });
        this.scanT = 2;
        audio.sfx('scan');
        hud.toast(t('st_scanning'), 'info', 2);
      }
      if (this.scanT) {
        this.scanT -= dt;
        this.plaque.material.emissive.setHex(Math.sin(ctx.time * 20) > 0 ? 0x113344 : 0x000000);
        if (this.scanT <= 0) {
          this.scanT = 0;
          this.plaque.material.emissive.setHex(0);
          this.phase = 'score';
          this.blade = 0;
          this.attempts = 6;
          tools.select('scalpel');
          audio.sfx('ok');
          hud.setObjective(
            `<b>${t('m1_name')}</b><br>${t('st_measured', { len: this.case.lesionLength.toFixed(1), ref: this.case.refDiameter.toFixed(2) })}<br>${t('st_score')}`,
          );
        }
      }
      return null;
    }

    if (this.phase === 'score') {
      // blade sweeps across the three nodes; click to cut
      this.blade = (this.blade + dt * 0.55) % 2;
      const pos = this.blade < 1 ? this.blade : 2 - this.blade; // 0..1
      const zones = this.nodes.map((n, k) => ({ c: 0.2 + k * 0.3, n }));
      const bar = zones
        .map((z) => `<div class="zoneMark ${z.n.scored ? 'done' : ''}" style="left:${(z.c - 0.05) * 100}%;width:10%"></div>`)
        .join('');
      hud.setBar(`<div class="timing">${bar}<div class="needle" style="left:${pos * 100}%"></div></div>
        <div class="bar-caption">${t('st_scored', { n: this.scored, t: this.nodes.length })} · ${t('st_attempts')}: ${this.attempts}</div>`);
      const cur = zones.find((z) => Math.abs(z.c - pos) < 0.05);
      tools.aimAtWorld((cur ?? zones[1]).n.mesh.position.clone().applyMatrix4(world.group.matrixWorld));
      if (tools.target === 'scalpel' && input.clicked && ctx.controls) {
        tools.fire();
        audio.sfx('cut');
        this.attempts--;
        if (cur && !cur.n.scored) {
          cur.n.scored = true;
          this.scored++;
          cur.n.mesh.scale.set(1, 0.5, 1);
          hud.toast(t('st_scored', { n: this.scored, t: this.nodes.length }), 'ok');
        }
        if (this.scored === this.nodes.length || this.attempts <= 0) {
          hud.setBar('');
          this.openChooser(ctx);
        }
      }
      return null;
    }

    if (this.phase === 'catheter') {
      this.catT += dt;
      const k = Math.min(1, this.catT / 3.5);
      const tw = new THREE.Vector2(Math.cos(this.theta + 0.12), Math.sin(this.theta + 0.12)).multiplyScalar(R - 260);
      this.wire.visible = true;
      this.wire.position.set(tw.x, tw.y, 12000 - k * 12000 - 10000);
      this.stent.visible = this.catT > 1.2;
      this.stentZ = 9000 * (1 - Math.min(1, (this.catT - 1.2) / 2.3));
      this.applyStent(0.3);
      if (this.catT > 3.8) {
        this.phase = 'position';
        this.drift = (Math.random() - 0.5) * 3;
        hud.setObjective(`<b>${t('m1_name')}</b><br>${t('st_position')}`);
      }
      tools.aimForward(60);
      return null;
    }

    if (this.phase === 'position') {
      const beat = beatPhase(ctx.time, this.vessel.heartRate);
      const off = this.drift + Math.sin(beat * Math.PI * 2) * 2.4; // mm, sways with the heart
      this.stentZ = -off * 1000 * 0.12;
      this.applyStent(0.3);
      const Ls = this.choice.length;
      const Ll = this.case.lesionLength;
      const scale = 40;
      const lesionL = 50 - (Ll / scale) * 50;
      const stentL = 50 - (Ls / scale) * 50 + (off / scale) * 100;
      hud.setBar(`<div class="timing pos">
          <div class="lesion" style="left:${lesionL}%;width:${(Ll / scale) * 100}%"></div>
          <div class="stentbar" style="left:${stentL}%;width:${(Ls / scale) * 100}%"></div>
          <div class="centre"></div></div>
          <div class="bar-caption">${t('st_offset')}: ${off >= 0 ? '+' : ''}${off.toFixed(1)} mm</div>`);
      if (input.clicked && ctx.controls) {
        this.pScore = L.positionScore(off, Ls, Ll);
        this.offset = off;
        this.phase = 'inflate';
        this.pressure = 0;
        audio.sfx('anchor');
        hud.setObjective(`<b>${t('m1_name')}</b><br>${t('st_inflate')}`);
      }
      tools.aimForward(60);
      return null;
    }

    if (this.phase === 'inflate') {
      if (input.down && ctx.controls) {
        this.inflating = true;
        this.pressure += dt * 3.2;
        if (Math.random() < dt * 4) audio.sfx('tool');
      }
      const unscored = this.nodes.length - this.scored;
      const rad = 0.3 + 0.67 * Math.min(1, this.pressure / 14);
      this.applyStent(rad);
      const pct = Math.min(100, (this.pressure / 24) * 100);
      hud.setBar(`<div class="gauge"><div class="fill ${this.pressure > 16 ? 'hot' : ''}" style="width:${pct}%"></div>
        <div class="band" style="left:${(12 / 24) * 100}%;width:${(4 / 24) * 100}%"></div></div>
        <div class="bar-caption">${t('st_pressure')}: <b>${this.pressure.toFixed(1)} atm</b>${unscored ? ` · ⚠ ${t('st_calc_warn', { n: unscored })}` : ''}</div>`);
      const infl = L.inflationResult(this.pressure, this.scored, this.nodes.length);
      if ((this.inflating && !input.down) || infl.dissection) {
        hud.setBar('');
        this.finish(ctx, infl);
      }
      return null;
    }

    if (this.phase === 'done') {
      this.doneT -= dt;
      // deflate balloon, stent stays
      this.balloon.visible = false;
      if (this.doneT <= 0) return this.result;
    }
    return null;
  }

  applyStent(radiusFrac) {
    const R = this.vessel.radius;
    this.stent.position.z = this.stentZ ?? 0;
    for (const c of this.stent.children) {
      if (c === this.balloon) {
        c.scale.set(radiusFrac * R * 0.96, 1, radiusFrac * R * 0.96);
      } else c.scale.set(radiusFrac * R, radiusFrac * R, 1);
    }
    this.stentRadius = radiusFrac;
  }

  openChooser(ctx) {
    ctx.input.unlock();
    const c = { length: null, diam: null };
    const html = `<h2>${t('st_choose')}</h2>
      <p>${t('st_measured', { len: this.case.lesionLength.toFixed(1), ref: this.case.refDiameter.toFixed(2) })}</p>
      <p class="muted">${t('st_rule')}</p>
      <h3>${t('st_length')}</h3><div class="choices" data-g="length">${L.STENT_LENGTHS.map((v) => `<button class="btn sm" data-v="${v}">${v}</button>`).join('')}</div>
      <h3>${t('st_diam')}</h3><div class="choices" data-g="diam">${L.STENT_DIAMETERS.map((v) => `<button class="btn sm" data-v="${v}">${v.toFixed(2)}</button>`).join('')}</div>
      <button class="btn primary" id="st-ok" disabled>${t('st_confirm')}</button>`;
    const p = ctx.hud.openPanel(html);
    p.querySelectorAll('.choices').forEach((grp) =>
      grp.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          grp.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          c[grp.dataset.g] = parseFloat(b.dataset.v);
          p.querySelector('#st-ok').disabled = !(c.length && c.diam);
        }),
      ),
    );
    p.querySelector('#st-ok').addEventListener('click', () => {
      this.choice = c;
      ctx.hud.closePanel();
      this.phase = 'catheter';
      this.catT = 0;
      ctx.hud.setObjective(`<b>${t('m1_name')}</b><br>${t('st_catheter')}`);
      ctx.audio.sfx('ok');
    });
  }

  finish(ctx, infl) {
    const lScore = L.lengthScore(this.choice.length, this.case.lesionLength);
    const dScore = L.diameterScore(this.choice.diam, this.case.refDiameter);
    const o = L.stentOutcome({ lScore, dScore, pScore: this.pScore, inflation: infl, missedAnchors: this.missed });
    if (infl.dissection) {
      ctx.hud.toast(t('st_dissection'), 'bad', 5);
      ctx.audio.sfx('bad');
    } else ctx.audio.sfx('ok');
    // plaque gets compressed by a good stent
    this.plaque.scale.x = this.plaqueRadial * (1 - 0.8 * o.quality);
    this.phase = 'done';
    this.doneT = 2.5;
    const pc = (x) => `${Math.round(x * 100)} %`;
    this.result = {
      quality: o.quality,
      damage: o.damage,
      lines: [
        `${t('st_length')}: ${this.choice.length} mm (${t('st_lesion')} ${this.case.lesionLength.toFixed(1)} mm) — ${pc(lScore)}`,
        `${t('st_diam')}: ${this.choice.diam.toFixed(2)} mm (${t('st_ref')} ${this.case.refDiameter.toFixed(2)} mm) — ${pc(dScore)}`,
        `${t('st_offset')}: ${this.offset.toFixed(1)} mm — ${pc(this.pScore)}`,
        `${t('st_pressure')}: ${this.pressure.toFixed(1)} atm — ${infl.dissection ? `<span class="bad">${t('st_dissection')}</span>` : pc(infl.score)}`,
        this.missed ? `${t('st_missed')}: ${this.missed}` : '',
      ].filter(Boolean),
    };
  }

  dispose() {}
}
