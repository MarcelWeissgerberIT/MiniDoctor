// Post-processes the raw OpenArt generations in assets-src/ into
// web-ready files in public/assets/ (chroma key, crops, compression).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets-src';
const OUT = 'public/assets';
mkdirSync(OUT, { recursive: true });

// Grip regions on the 2752×1536 cockpit (also used by src/cockpit.js).
export const GRIPS = {
  left: { x: 400, y: 1330, w: 470, h: 206 },
  right: { x: 1885, y: 1330, w: 470, h: 206 },
};

function chromaKey(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = g - Math.max(r, b); // "greenness"
    if (key > 90) data[i + 3] = 0;
    else if (key > 30) {
      data[i + 3] = Math.round(255 * (1 - (key - 30) / 60));
      data[i + 1] = Math.max(r, b); // despill
    }
  }
}

async function cockpit() {
  // The control grips become separate, animated layers: the base image gets
  // the grip-less version (second OpenArt generation) patched in under the grips.
  const orig = await sharp(`${SRC}/cockpit_raw.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const nog = await sharp(`${SRC}/cockpit_nogrips.png`).resize(orig.info.width, orig.info.height).ensureAlpha().raw().toBuffer();
  const { width: W, height: H } = orig.info;
  const base = Buffer.from(orig.data);
  const scale = 1920 / W;
  for (const [name, r] of Object.entries(GRIPS)) {
    // grip mask = where the two generations differ
    const mask = new Float32Array(r.w * r.h);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const k = ((r.y + y) * W + r.x + x) * 4;
        const d = Math.abs(orig.data[k] - nog[k]) + Math.abs(orig.data[k + 1] - nog[k + 1]) + Math.abs(orig.data[k + 2] - nog[k + 2]);
        mask[y * r.w + x] = Math.min(1, Math.max(0, (d - 25) / 45));
      }
    // Solid grip shape: flood-fill the background from the top/left/right
    // borders; everything unreachable (grip + enclosed holes) is grip.
    const outside = new Uint8Array(mask.length);
    const stack = [];
    const push = (x, y) => {
      const i = y * r.w + x;
      if (x < 0 || y < 0 || x >= r.w || y >= r.h || outside[i] || mask[i] > 0.5) return;
      outside[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < r.w; x++) push(x, 0);
    for (let y = 0; y < r.h; y++) push(0, y), push(r.w - 1, y);
    while (stack.length) {
      const i = stack.pop();
      const x = i % r.w;
      const y = (i / r.w) | 0;
      push(x + 1, y), push(x - 1, y), push(x, y + 1), push(x, y - 1);
    }
    // keep only the largest connected grip component (drops stray specks)
    const comp = new Int32Array(mask.length).fill(-1);
    let best = -1;
    let bestSize = 0;
    for (let i0 = 0; i0 < mask.length; i0++) {
      if (outside[i0] || comp[i0] >= 0) continue;
      const q = [i0];
      comp[i0] = i0;
      let n = 0;
      while (q.length) {
        const i = q.pop();
        n++;
        const x = i % r.w;
        const y = (i / r.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= r.w || yy >= r.h) continue;
          const j = yy * r.w + xx;
          if (!outside[j] && comp[j] < 0) {
            comp[j] = i0;
            q.push(j);
          }
        }
      }
      if (n > bestSize) (bestSize = n), (best = i0);
    }
    const solid = new Float32Array(mask.length);
    for (let i = 0; i < mask.length; i++) solid[i] = comp[i] === best ? 1 : 0;
    // soft 1-2 px edge
    const soft = new Float32Array(mask.length);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        let m = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < r.w && yy < r.h) (m += solid[yy * r.w + xx]), n++;
          }
        soft[y * r.w + x] = m / n;
      }
    const layer = Buffer.alloc(r.w * r.h * 4);
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const i = y * r.w + x;
        const k = ((r.y + y) * W + r.x + x) * 4;
        const a = soft[i];
        for (let c = 0; c < 3; c++) {
          layer[i * 4 + c] = orig.data[k + c];
          base[k + c] = Math.round(orig.data[k + c] * (1 - a) + nog[k + c] * a);
        }
        layer[i * 4 + 3] = Math.round(a * 255);
      }
    await sharp(layer, { raw: { width: r.w, height: r.h, channels: 4 } })
      .resize(Math.round(r.w * scale))
      .webp({ quality: 90, alphaQuality: 95 })
      .toFile(`${OUT}/grip_${name}.webp`);
  }
  chromaKey(base);
  await sharp(base, { raw: { width: W, height: H, channels: 4 } }).resize(1920).webp({ quality: 88, alphaQuality: 90 }).toFile(`${OUT}/cockpit.webp`);
}

async function icons() {
  const names = ['laser', 'scalpel', 'antibody', 'anchor', 'scanner'];
  // Tiles measured on the 3168×1344 sheet.
  const top = 412, size = 520, lefts = [172, 752, 1331, 1910, 2490];
  for (let k = 0; k < 5; k++)
    await sharp(`${SRC}/tool_icons.png`)
      .extract({ left: lefts[k], top, width: size, height: size })
      .resize(160)
      .webp({ quality: 90 })
      .toFile(`${OUT}/tool_${names[k]}.webp`);
}

async function simple(name, width, q = 82) {
  await sharp(`${SRC}/${name}.png`).resize(width).webp({ quality: q }).toFile(`${OUT}/${name}.webp`);
}

await cockpit();
await icons();
for (const n of ['tex_endothelium', 'tex_plaque', 'tex_fibrin', 'tex_endocardium']) await simple(n, 1024, 85);
// The RBC generation came out as a field of cells; a small patch of one cell
// gives the smooth, mottled membrane surface we need.
await sharp(`${SRC}/tex_rbc.png`).extract({ left: 590, top: 400, width: 70, height: 70 }).resize(512, 512, { kernel: 'cubic' }).blur(6).webp({ quality: 85 }).toFile(`${OUT}/tex_rbc.webp`);
for (const n of ['transition_start', 'transition_end']) await simple(n, 1920, 80);
await simple('bodymap', 480, 85);
for (const n of ['brief_stent', 'brief_virus', 'brief_clot', 'brief_stroke', 'ship_concept']) await simple(n, 960);
for (const n of ['keyart', 'outcome_survived', 'outcome_died']) await simple(n, 1920);
console.log('assets processed');
