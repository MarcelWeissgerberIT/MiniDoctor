import * as THREE from 'three';

const FONT = "'DejaVu Sans Mono','Consolas',monospace";

/**
 * Combiner-glass head-up display mounted above the dash: green symbology
 * drawn into a canvas and added on top of the view.
 */
export class HUD {
  constructor(width, height) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 600;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color: new THREE.Color(1.6, 1.6, 1.6),
      opacity: 0,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.mat);
    this.mesh.renderOrder = 10;
    this.level = 0;
    this.on = false;
  }

  update(dt, s) {
    const target = this.on ? 1 : 0;
    this.level += (target - this.level) * Math.min(1, dt * 4);
    this.mat.opacity = this.level * (0.9 + Math.random() * 0.06);
    if (this.level < 0.01) return;
    const g = this.g;
    const W = 1024;
    const H = 600;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = '#6dff7c';
    g.fillStyle = '#6dff7c';
    g.lineWidth = 3;
    g.shadowColor = '#6dff7c';
    g.shadowBlur = 10;
    g.font = `bold 26px ${FONT}`;
    g.textBaseline = 'middle';

    // heading tape
    const deg = ((-s.heading * 180) / Math.PI + 3600) % 360;
    g.textAlign = 'center';
    for (let d = -30; d <= 30; d += 5) {
      const a = Math.round(deg / 5) * 5 + d;
      const x = W / 2 + (a - deg) * 9;
      if (x < 300 || x > 724) continue;
      const major = ((a % 10) + 10) % 10 === 0;
      g.beginPath();
      g.moveTo(x, 40);
      g.lineTo(x, major ? 62 : 52);
      g.stroke();
      if (major) {
        const n = ((a % 360) + 360) % 360;
        g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[n] ?? String(n).padStart(3, '0'), x, 82);
      }
    }
    g.beginPath();
    g.moveTo(W / 2, 36);
    g.lineTo(W / 2 - 9, 22);
    g.lineTo(W / 2 + 9, 22);
    g.closePath();
    g.fill();

    // boresight reticle
    const cx = W / 2;
    const cy = H / 2 + 10;
    g.beginPath();
    g.arc(cx, cy, 34, 0, Math.PI * 2);
    g.moveTo(cx - 70, cy);
    g.lineTo(cx - 40, cy);
    g.moveTo(cx + 40, cy);
    g.lineTo(cx + 70, cy);
    g.moveTo(cx, cy + 40);
    g.lineTo(cx, cy + 58);
    g.stroke();
    g.beginPath();
    g.arc(cx, cy, 3, 0, Math.PI * 2);
    g.fill();

    // torso/head twist indicator
    const tw = THREE.MathUtils.clamp(s.look / 1.9, -1, 1);
    g.beginPath();
    g.moveTo(cx - 120, H - 70);
    g.lineTo(cx + 120, H - 70);
    g.stroke();
    g.beginPath();
    g.moveTo(cx - tw * 120, H - 82);
    g.lineTo(cx - tw * 120 - 8, H - 96);
    g.lineTo(cx - tw * 120 + 8, H - 96);
    g.closePath();
    g.fill();

    // speed box (left)
    g.textAlign = 'right';
    g.strokeRect(150, cy - 24, 120, 48);
    g.font = `bold 34px ${FONT}`;
    g.fillText(String(Math.round(Math.abs(s.speed) * 3.6)).padStart(3, ' '), 258, cy + 1);
    g.font = `bold 22px ${FONT}`;
    g.fillText('KM/H', 270, cy + 46);
    if (s.speed < -0.1) g.fillText('REV', 270, cy - 44);

    // throttle bar (right)
    const tx = 800;
    g.strokeRect(tx, cy - 110, 26, 220);
    const zero = cy + 110 - 220 * (0.3 / 1.3);
    g.beginPath();
    g.moveTo(tx - 10, zero);
    g.lineTo(tx + 36, zero);
    g.stroke();
    const ty = zero - s.throttle * (220 / 1.3);
    g.fillRect(tx + 4, Math.min(ty, zero), 18, Math.abs(zero - ty));
    g.textAlign = 'left';
    g.font = `bold 22px ${FONT}`;
    g.fillText(`${Math.round(s.throttle * 100)}%`, tx + 40, ty);
    g.fillText('THR', tx - 4, cy + 136);

    // status line
    g.textAlign = 'center';
    g.font = `bold 22px ${FONT}`;
    const flags = [s.stab ? 'STAB' : 'STAB OFF', s.nv ? 'NV' : '', s.lights ? '' : 'DARK', 'WPN SAFE'].filter(Boolean);
    g.fillText(flags.join('   '), cx, H - 30);
    if (s.warning && Math.floor(s.time * 3) % 2 === 0) {
      g.font = `bold 34px ${FONT}`;
      g.fillStyle = '#ffd25a';
      g.fillText(s.warning, cx, cy - 110);
    }
    this.tex.needsUpdate = true;
  }
}
