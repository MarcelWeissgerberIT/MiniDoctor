import * as THREE from 'three';
import { VESSELS } from '../physics.js';
import { t } from '../i18n.js';
import { tex } from '../world.js';
import * as C from './clotLogic.js';

const CLOT_AT = 2600;
const DOCK_GAP = 45; // µm in front of the clot face

export class ClotMission {
  constructor(game) {
    this.game = game;
    this.id = 'clot';
    this.vessel = VESSELS.vein;
    this.tools = ['laser', 'tpa', 'anchor'];
    this.nameKey = 'm3_name';
    this.lateralSpeed = 40;
  }

  start(ctx) {
    const { world, ship } = ctx;
    this.ctx = ctx;
    const R = this.vessel.radius;
    world.setVessel(this.vessel, { rbcCount: 220, cellLat: 110, cellFront: 260, fogColor: 0x6e2a22 });
    const a = Math.random() * Math.PI * 2;
    ship.x = Math.cos(a) * R * 0.25;
    ship.y = Math.sin(a) * R * 0.25;
    this.clot = C.createClot(Math.floor(Math.random() * 1e6));
    this.phase = 'approach';

    // clot face: fibrin disc filling the lumen
    const faceMat = new THREE.MeshStandardMaterial({ map: tex('tex_fibrin', 40, 40), emissiveMap: tex('tex_fibrin', 40, 40), emissive: 0x7a4a40, emissiveIntensity: 0.6, roughness: 0.9, color: 0xffe8e0, transparent: true, opacity: 1, fog: false });
    // round disc that fills the lumen (ring geometry has radial segments for the bumps)
    const geo = new THREE.RingGeometry(1, R * 1.02, 128, 48);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      p.setZ(i, Math.sin(x * 0.02) * Math.cos(y * 0.017) * 25 - Math.hypot(x, y) * 0.02);
    }
    geo.computeVertexNormals();
    this.face = new THREE.Mesh(geo, faceMat);
    world.group.add(this.face);

    // loose fibrin strands in front of the face (visible close-up detail)
    this.strands = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.8, transparent: true, opacity: 1 });
    for (let k = 0; k < 60; k++) {
      const pts = [];
      const s0 = new THREE.Vector3((Math.random() - 0.5) * 160, (Math.random() - 0.5) * 120, -Math.random() * 30);
      for (let i = 0; i < 4; i++) pts.push(s0.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, Math.random() * 25 * i)));
      this.strands.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.35 + Math.random() * 0.4, 5), sm));
    }
    world.group.add(this.strands);

    // trapped red cells on the face
    this.trapped = new THREE.InstancedMesh(world.rbcGeo, world.rbcMat, 40);
    const d = new THREE.Object3D();
    for (let k = 0; k < 40; k++) {
      d.position.set((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 150, Math.random() * 3);
      d.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      d.updateMatrix();
      this.trapped.setMatrixAt(k, d.matrix);
    }
    world.group.add(this.trapped);

    // effects
    this.bursts = [];
    this.emboli = [];
    this.burstGeo = new THREE.SphereGeometry(1, 12, 8);
    this.opened = false;
    ctx.tools.select('laser');
    ctx.hud.setObjective(`<b>${t('m3_name')}</b><br>${t('c_approach')}`);
  }

  sonarRange = 3000;
  sonarTargets(ctx) {
    return [{ x: 0, y: 0, z: ctx.world.zOf(CLOT_AT, ctx.ship), color: '#ff6b6b', size: 9 }];
  }

  flowMod(ship) {
    if (this.opened) return 1;
    // stasis: flow dies away in front of the occlusion
    const d = CLOT_AT - ship.dist;
    return Math.max(0.1, Math.min(1, d / 1000));
  }

  autopilotTarget(ship) {
    return this.phase === 'approach' ? { x: ship.x * 0.6, y: ship.y * 0.6 } : null;
  }

  update(dt, ctx) {
    const { world, ship, hud, input, tools, audio } = ctx;
    const zFace = this.opened ? world.zOf(CLOT_AT, ship) : world.zOf(CLOT_AT, ship);
    this.face.position.set(0, 0, zFace);
    this.strands.position.set(ship.x, ship.y, zFace + 30);
    this.trapped.position.set(ship.x, ship.y, zFace + 2);

    if (this.phase === 'approach') {
      tools.aimForward(60);
      hud.setStats(`${t('hud_dist')}: <b>${Math.max(0, CLOT_AT - DOCK_GAP - ship.dist).toFixed(0)} µm</b>`);
      if (ship.dist >= CLOT_AT - DOCK_GAP) {
        ship.dist = CLOT_AT - DOCK_GAP;
        ctx.requestAnchor(true);
        this.phase = 'lyse';
        tools.select('laser');
        hud.setObjective(`<b>${t('m3_name')}</b><br>${t('c_hint')}`);
        this.openMap(ctx);
      }
      return null;
    }

    // effects
    for (const b of this.bursts) {
      b.t += dt;
      b.mesh.scale.setScalar(b.size * (0.3 + b.t * 1.5));
      b.mesh.material.opacity = Math.max(0, 0.8 - b.t);
      if (b.t > 1) world.group.remove(b.mesh);
    }
    this.bursts = this.bursts.filter((b) => b.t <= 1);
    for (const e of this.emboli) {
      e.mesh.position.z -= dt * 60;
      e.mesh.rotation.x += dt * 0.5;
      if (e.mesh.position.z < -900) world.group.remove(e.mesh);
    }
    // strands thin out as the clot dissolves
    const open = C.openFraction(this.clot);
    this.strands.children.forEach((s, i) => (s.visible = i / this.strands.children.length > open * 1.2));
    tools.aimAtWorld(new THREE.Vector3(ship.x + (this.aimOff?.x ?? 0), ship.y + (this.aimOff?.y ?? 0), zFace + 3));

    if (this.phase === 'lyse') {
      if (this.mapDirty) this.drawMap();
      if (C.clotFinished(this.clot)) {
        this.phase = 'release';
        this.relT = 0;
        const o = C.clotOutcome(this.clot);
        if (o.reached) {
          this.opened = true;
          ctx.requestAnchor(false);
          audio.sfx('ok');
          hud.toast(t('c_reopened'), 'ok', 4);
        }
        ctx.hud.closePanel();
        this.result = {
          quality: o.quality,
          damage: o.damage,
          lines: [
            `${t('c_open')}: ${Math.round(o.open * 100)} % (${t('c_goal')})`,
            `${t('c_emboli')}: ${this.clot.emboli}`,
            `${t('c_microfr')}: ${this.clot.microFragments}`,
          ],
        };
      }
      return null;
    }
    if (this.phase === 'release') {
      this.relT += dt;
      if (this.opened) this.face.material.opacity = Math.max(0, 1 - this.relT / 2.5);
      if (this.relT > 4) return this.result;
    }
    return null;
  }

  // ----- ultrasound lysis map (holographic overlay) -----
  openMap(ctx) {
    ctx.input.unlock();
    const p = ctx.hud.openPanel(`<h2>${t('c_map')}</h2>
      <div class="clot-wrap"><canvas class="clot-map" width="540" height="540"></canvas>
      <div class="clot-side">
        <div class="tool-pick">
          <button class="btn sm" data-tool="laser">1 · ${t('tool_laser')}</button>
          <button class="btn sm" data-tool="tpa">6 · ${t('tool_tpa')}</button>
        </div>
        <div class="clot-stats"></div>
        <p class="muted">${t('c_rules')}</p>
      </div></div>`);
    p.classList.add('wide');
    this.canvas = p.querySelector('canvas');
    this.statsEl = p.querySelector('.clot-stats');
    p.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => ctx.tools.select(b.dataset.tool)));
    this.canvas.addEventListener('mousemove', (e) => {
      this.hover = this.cellAt(e);
      this.mapDirty = true;
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hover = null;
      this.mapDirty = true;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const c = this.cellAt(e);
      if (c) this.apply(ctx, c.i, c.j);
    });
    this.mapDirty = true;
  }

  cellAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const i = Math.floor(((e.clientX - r.left) / r.width) * this.clot.n);
    const j = Math.floor(((e.clientY - r.top) / r.height) * this.clot.n);
    return C.inLumen(this.clot, i, j) ? { i, j } : null;
  }

  apply(ctx, i, j) {
    const tool = ctx.tools.target === 'tpa' ? 'tpa' : 'laser';
    if (!C.canUse(this.clot, tool)) {
      ctx.hud.toast(t('c_empty'), 'warn');
      return;
    }
    const ev = C.applyTool(this.clot, tool, i, j);
    if (!ev) return;
    const n = this.clot.n;
    this.aimOff = { x: ((i - (n - 1) / 2) / n) * 120, y: (-(j - (n - 1) / 2) / n) * 90 };
    ctx.tools.fire({ duration: tool === 'laser' ? 0.7 : 0.9 });
    ctx.audio.sfx(tool === 'laser' ? 'laser' : 'spray');
    // 3D burst on the face
    const zFace = this.face.position.z;
    const col = tool === 'laser' ? 0x9ff6ff : 0xd9a0ff;
    const m = new THREE.Mesh(this.burstGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(this.ctx.ship.x + this.aimOff.x, this.ctx.ship.y + this.aimOff.y, zFace + 2);
    this.ctx.world.group.add(m);
    this.bursts.push({ mesh: m, t: 0, size: tool === 'laser' ? 6 : 14 });
    for (const f of ev.fragments) {
      if (f.embolus) {
        ctx.hud.toast(t('c_embolus'), 'bad', 4);
        ctx.radio('r_c_embolus', null, { priority: 2 });
        ctx.audio.sfx('bad');
        const e = new THREE.Mesh(new THREE.DodecahedronGeometry(18 + f.cells.length * 2, 1), this.face.material.clone());
        e.material.opacity = 1;
        e.position.set(this.ctx.ship.x + this.aimOff.x, this.ctx.ship.y + this.aimOff.y, zFace - 10);
        this.ctx.world.group.add(e);
        this.emboli.push({ mesh: e });
      } else ctx.hud.toast(t('c_micro'), 'ok', 1.5);
    }
    this.mapDirty = true;
  }

  drawMap() {
    this.mapDirty = false;
    const g = this.canvas.getContext('2d');
    const W = this.canvas.width;
    const n = this.clot.n;
    const cs = W / n;
    g.clearRect(0, 0, W, W);
    g.strokeStyle = 'rgba(127,243,255,0.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    g.stroke();
    const tool = this.ctx.tools.target === 'tpa' ? 'tpa' : 'laser';
    const spread = C.TOOLS[tool].spread;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const c = this.clot.cells[j][i];
        if (!c) continue;
        const x = i * cs;
        const y = j * cs;
        if (c.hp <= 0) {
          g.fillStyle = 'rgba(80,20,20,0.35)';
          g.fillRect(x + 2, y + 2, cs - 4, cs - 4);
          continue;
        }
        const shade = ['#000', '#c9544a', '#d9a080', '#f1e6cf'][c.hp];
        g.fillStyle = shade;
        g.fillRect(x + 2, y + 2, cs - 4, cs - 4);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.font = `${cs * 0.35}px system-ui`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(c.hp), x + cs / 2, y + cs / 2);
      }
    if (this.hover) {
      const { i, j } = this.hover;
      g.strokeStyle = tool === 'laser' ? '#9ff6ff' : '#d9a0ff';
      g.lineWidth = 3;
      g.strokeRect(i * cs + 1, j * cs + 1, cs - 2, cs - 2);
      if (spread)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!C.inLumen(this.clot, i + dx, j + dy)) continue;
          g.setLineDash([4, 4]);
          g.strokeRect((i + dx) * cs + 3, (j + dy) * cs + 3, cs - 6, cs - 6);
          g.setLineDash([]);
        }
    }
    const open = C.openFraction(this.clot);
    this.statsEl.innerHTML = `${t('c_open')}: <b>${Math.round(open * 100)} %</b> / 60 %
      <div class="meter"><div style="width:${Math.min(100, (open / 0.6) * 100)}%"></div></div>
      ${t('c_laser')}: <b>${this.clot.laserLeft}</b><br>${t('c_tpa')}: <b>${this.clot.tpaLeft}</b><br>
      ${t('c_emboli')}: <b class="${this.clot.emboli ? 'bad' : ''}">${this.clot.emboli}</b>`;
    this.canvas.parentElement.parentElement.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === tool));
  }

  onToolChange() {
    this.mapDirty = true;
  }

  dispose() {}
}
