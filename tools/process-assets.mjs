// Turns the raw Higgsfield / Meshy generations in assets-src/ into game-ready
// files in public/assets/.
//
//   node tools/process-assets.mjs            (everything)
//   node tools/process-assets.mjs tex glb    (only some steps)
//
// Steps
//   tex    PBR texture sets: albedo, normal map (derived from luminance height)
//          and a packed ORM map (R = ambient occlusion, G = roughness, B = metalness)
//          derived from colour: rust is rough dielectric, bare steel is metal.
//   fx     glass grime, smoke and fire sprites
//   decals the 2x4 decal sheet cut into single trimmed decals
//   pano   battlefield panorama made horizontally seamless and split in two halves
//   ui     title key art
//   glb    Meshy GLBs: textures to WebP (max 1024), welded, world props simplified, meshopt-compressed
//   audio  sound effects and radio voice lines, copied as is (loops are made seamless at runtime)
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'assets-src';
const OUT = 'public/assets';
const steps = process.argv.slice(2);
const KNOWN = ['tex', 'fx', 'decals', 'pano', 'ui', 'glb', 'audio', 'faces'];
const want = (s) => !steps.some((x) => KNOWN.includes(x)) || steps.includes(s);
const mk = (d) => fs.mkdirSync(d, { recursive: true });

/* ------------------------------------------------------------------ helpers */

async function readRGB(file, size) {
  const { data, info } = await sharp(file)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// Blend a half-offset copy over the borders so the texture tiles without seams.
function makeTileable({ data, w, h }, feather = 0.14) {
  const out = Buffer.alloc(data.length);
  const f = Math.max(1, Math.round(w * feather));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x);
      const dy = Math.min(y, h - 1 - y);
      const t = Math.min(1, Math.min(dx, dy) / f);
      const a = t * t * (3 - 2 * t); // weight of the original
      const ox = (x + (w >> 1)) % w;
      const oy = (y + (h >> 1)) % h;
      const i = (y * w + x) * 3;
      const j = (oy * w + ox) * 3;
      for (let c = 0; c < 3; c++) out[i + c] = data[i + c] * a + data[j + c] * (1 - a);
    }
  }
  return { data: out, w, h };
}

function luminance({ data, w, h }) {
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    L[i] = (0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]) / 255;
  }
  return L;
}

// Separable box blur with wrap-around (keeps maps tileable).
function blur(src, w, h, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[y * w + ((k + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += src[y * w + ((x + r + 1) % w)] - src[y * w + ((x - r + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[((k + h) % h) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[((y + r + 1) % h) * w + x] - tmp[((y - r + h) % h) * w + x];
    }
  }
  return out;
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 1e-5) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, max > 0 ? d / max : 0, max];
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------------------------------------------------------- textures */

// cfg: per material heuristics for the derived maps
const TEXTURES = {
  armor: { src: 'tex_armor', size: 1024, tile: true, bump: 5, paintRough: 0.62, steel: 0.62, rustRough: 0.92 },
  rivets: { src: 'tex_rivets', size: 1024, tile: false, bump: 7, paintRough: 0.7, steel: 0.6, rustRough: 0.9 },
  floor: { src: 'tex_floor', size: 1024, tile: false, bump: 9, paintRough: 0.75, steel: 0.5, rustRough: 0.92 },
  console: { src: 'tex_console', size: 1024, tile: true, bump: 2.5, paintRough: 0.78, steel: 0.62, rustRough: 0.9 },
  hazard: { src: 'tex_hazard', size: 1024, tile: false, bump: 3, paintRough: 0.66, steel: 0.7, rustRough: 0.92 },
  concrete: { src: 'tex_concrete', size: 1024, tile: true, bump: 6, paintRough: 0.95, steel: 2, rustRough: 0.95, noMetal: true },
  ground: { src: 'tex_ground', size: 1024, tile: true, bump: 7, paintRough: 0.97, steel: 2, rustRough: 0.97, noMetal: true },
};

async function processTexture(name, cfg) {
  let img = await readRGB(path.join(SRC, 'img', cfg.src + '.png'), cfg.size);
  if (cfg.tile) img = makeTileable(img);
  const { data, w, h } = img;
  const L = luminance(img);

  // height: fine detail minus large-scale shading
  const fine = blur(L, w, h, 1);
  const coarse = blur(L, w, h, Math.round(w / 48));
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = fine[i] - coarse[i] * 0.85;

  const normal = Buffer.alloc(w * h * 3);
  const s = cfg.bump;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = (xx, yy) => H[((yy + h) % h) * w + ((xx + w) % w)];
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * s;
      let ny = dy * s; // OpenGL convention (green up)
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 3;
      normal[i] = (nx * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz * 0.5 + 0.5) * 255;
    }
  }

  // ORM
  const cavity = blur(L, w, h, Math.round(w / 128));
  const orm = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3] / 255;
    const g = data[i * 3 + 1] / 255;
    const b = data[i * 3 + 2] / 255;
    const [hue, sat, val] = rgbToHsv(r, g, b);
    // rust: saturated orange/brown
    const rustHue = hue > 8 && hue < 45 ? 1 : 0;
    const rust = rustHue * smooth(0.28, 0.55, sat) * smooth(0.12, 0.3, val);
    // bare steel: bright, desaturated
    const steel = cfg.noMetal ? 0 : smooth(cfg.steel - 0.08, cfg.steel + 0.1, val) * (1 - smooth(0.12, 0.3, sat));
    const metal = Math.min(1, steel) * (1 - rust);
    let rough = cfg.paintRough * (1 - rust) + cfg.rustRough * rust;
    rough = rough * (1 - metal) + (0.32 + 0.25 * (1 - val)) * metal;
    rough += (Math.random() - 0.5) * 0.03;
    const ao = Math.min(1, Math.max(0.35, 1 - (cavity[i] - L[i]) * 2.2));
    orm[i * 3] = ao * 255;
    orm[i * 3 + 1] = Math.min(1, Math.max(0.05, rough)) * 255;
    orm[i * 3 + 2] = metal * 255;
  }

  const dir = path.join(OUT, 'tex');
  mk(dir);
  const raw = { raw: { width: w, height: h, channels: 3 } };
  await sharp(data, raw).webp({ quality: 86 }).toFile(path.join(dir, `${name}_c.webp`));
  await sharp(normal, raw).webp({ quality: 90 }).toFile(path.join(dir, `${name}_n.webp`));
  await sharp(orm, raw).webp({ quality: 88 }).toFile(path.join(dir, `${name}_orm.webp`));
  console.log('tex', name);
}

/* --------------------------------------------------------------------- fx */

async function processFx() {
  const dir = path.join(OUT, 'fx');
  mk(dir);
  // glass grime -> alpha map with a 10% baseline so the pane itself stays visible
  const g = await sharp(path.join(SRC, 'img/glass_grime.png')).resize(1024, 1024).greyscale().raw().toBuffer();
  const ga = Buffer.alloc(g.length);
  for (let i = 0; i < g.length; i++) ga[i] = Math.min(255, 22 + g[i] * 0.95);
  await sharp(ga, { raw: { width: 1024, height: 1024, channels: 1 } }).webp({ quality: 88 }).toFile(path.join(dir, 'glass_grime.webp'));

  // smoke: luminance becomes alpha, colour is set in the material
  const s = await sharp(path.join(SRC, 'img/smoke.png')).resize(512, 512).greyscale().raw().toBuffer();
  for (let i = 0; i < s.length; i++) s[i] = Math.min(255, Math.max(0, (s[i] - 6) * 1.25));
  // fade to zero at the borders
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++) {
      const d = Math.hypot(x - 256, y - 256) / 256;
      s[y * 512 + x] *= 1 - smooth(0.78, 1.0, d);
    }
  await sharp(s, { raw: { width: 512, height: 512, channels: 1 } }).webp({ quality: 85 }).toFile(path.join(dir, 'smoke.webp'));

  await sharp(path.join(SRC, 'img/fire.png')).resize(512, 512).webp({ quality: 85 }).toFile(path.join(dir, 'fire.webp'));
  // combat: fireball and muzzle flash (additive, black = transparent), visor crack (alpha mask)
  await sharp(path.join(SRC, 'combat/fireball.png')).resize(512, 512).webp({ quality: 85 }).toFile(path.join(dir, 'fireball.webp'));
  await sharp(path.join(SRC, 'combat/muzzle.png')).resize(512, 512).webp({ quality: 85 }).toFile(path.join(dir, 'muzzle.webp'));
  const cr = await sharp(path.join(SRC, 'combat/crack.png')).resize(1024, 1024).greyscale().raw().toBuffer();
  for (let i = 0; i < cr.length; i++) cr[i] = Math.min(255, Math.max(0, (cr[i] - 18) * 1.4));
  await sharp(cr, { raw: { width: 1024, height: 1024, channels: 1 } }).webp({ quality: 88 }).toFile(path.join(dir, 'crack.webp'));
  console.log('fx');
}

/* ----------------------------------------------------------------- decals */

const DECALS = ['nameplate', 'danger', 'eject', 'reactor', 'hydraulic', 'radiation', 'weapons', 'nostep'];

async function processDecals() {
  const dir = path.join(OUT, 'decals');
  mk(dir);
  const file = path.join(SRC, 'img/decals.png');
  const meta = await sharp(file).metadata();
  const cw = Math.floor(meta.width / 2);
  const ch = Math.floor(meta.height / 4);
  const sizes = {};
  for (let i = 0; i < 8; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const buf = await sharp(file)
      .extract({ left: col * cw, top: row * ch, width: cw, height: ch })
      .png()
      .toBuffer();
    const trimmed = await sharp(buf).trim({ threshold: 10 }).png().toBuffer({ resolveWithObject: true });
    await sharp(trimmed.data).resize({ width: 512, withoutEnlargement: true }).webp({ quality: 88, alphaQuality: 90 }).toFile(path.join(dir, DECALS[i] + '.webp'));
    sizes[DECALS[i]] = +(trimmed.info.width / trimmed.info.height).toFixed(3);
  }
  fs.writeFileSync(path.join(dir, 'decals.json'), JSON.stringify(sizes, null, 2));
  console.log('decals', sizes);
}

/* ------------------------------------------------------------------- pano */

async function processPano() {
  const dir = path.join(OUT, 'sky');
  mk(dir);
  const file = path.join(SRC, 'img/panorama.png');
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const F = Math.round(W * 0.03); // crossfade width
  const outW = W - F;
  const out = Buffer.alloc(outW * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < outW; x++) {
      const o = (y * outW + x) * 3;
      if (x < F) {
        const t = smooth(0, 1, x / F);
        const a = (y * W + (W - F + x)) * 3;
        const b = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) out[o + c] = data[a + c] * (1 - t) + data[b + c] * t;
      } else {
        const a = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) out[o + c] = data[a + c];
      }
    }
  }
  // sky colours for the dome above the panorama and the fog at the horizon
  const avgRow = (y0, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < outW; x += 7) {
        const i = (y * outW + x) * 3;
        r += out[i]; g += out[i + 1]; b += out[i + 2]; n++;
      }
    return [r / n / 255, g / n / 255, b / n / 255].map((v) => +v.toFixed(4));
  };
  const finalW = 8192;
  const finalH = Math.round((H * finalW) / outW);
  const resized = await sharp(out, { raw: { width: outW, height: H, channels: 3 } })
    .resize(finalW, finalH, { fit: 'fill' })
    .raw()
    .toBuffer();
  const half = finalW / 2;
  for (let k = 0; k < 2; k++) {
    await sharp(resized, { raw: { width: finalW, height: finalH, channels: 3 } })
      .extract({ left: k * half, top: 0, width: half, height: finalH })
      .webp({ quality: 82 })
      .toFile(path.join(dir, `pano_${k}.webp`));
  }
  const meta = {
    width: finalW,
    height: finalH,
    horizon: 0.635, // horizon row, as a fraction from the top
    top: avgRow(0, Math.round(H * 0.04)),
    haze: avgRow(Math.round(H * 0.6), Math.round(H * 0.66)),
  };
  fs.writeFileSync(path.join(dir, 'pano.json'), JSON.stringify(meta, null, 2));
  console.log('pano', meta);
}

/* --------------------------------------------------------------------- ui */

async function processUi() {
  const dir = path.join(OUT, 'ui');
  mk(dir);
  await sharp(path.join(SRC, 'img/concept.png')).resize(1920).webp({ quality: 82 }).toFile(path.join(dir, 'keyart.webp'));
  console.log('ui');
}

/* -------------------------------------------------------------------- glb */

async function processGlb() {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const { dedup, prune, weld, simplify, textureCompress, meshopt } = await import('@gltf-transform/functions');
  const { MeshoptEncoder, MeshoptSimplifier } = await import('meshoptimizer');
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  // battlefield props are instanced many times and seen from afar: fewer triangles
  const SIMPLIFY = { hedgehog: 0.25, ruin: 0.4, tank: 0.4, sandbags: 0.5, mech_rigged: 0.35, enemy_tank: 0.35, enemy_apc: 0.35 };
  // `glb name1 name2` limits the run to those models
  const only = steps.filter((s) => !KNOWN.includes(s));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const srcDir = path.join(SRC, 'glb');
  const dir = path.join(OUT, 'models');
  mk(dir);
  for (const f of fs.readdirSync(srcDir).filter((f) => f.endsWith('.glb'))) {
    if (only.length && !only.includes(f.replace('.glb', ''))) continue;
    const doc = await io.read(path.join(srcDir, f));
    // the player's own mech is seen up close during boarding
    const max = f === 'mech.glb' ? 2048 : 1024;
    const ratio = SIMPLIFY[f.replace('.glb', '')];
    await doc.transform(
      dedup(),
      weld(),
      ...(ratio ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.012 })] : []),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [max, max], quality: 85 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    await io.write(path.join(dir, f), doc);
    const kb = (fs.statSync(path.join(dir, f)).size / 1024).toFixed(0);
    console.log('glb', f, kb + ' KB');
  }
}

/* ------------------------------------------------------------------ faces */

// radio video link: portrait stills (WebP) and the talking clips (WebM + MP4, no sound,
// the game plays the voice separately)
async function processFaces() {
  const src = path.join(SRC, 'faces');
  const still = path.join(OUT, 'faces');
  const vid = path.join(OUT, 'video');
  mk(still);
  mk(vid);
  for (const f of fs.readdirSync(src)) {
    const id = f.replace(/\.[^.]+$/, '');
    if (f.endsWith('.png')) await sharp(path.join(src, f)).resize(512, 384, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(still, `${id}.webp`));
    if (f.endsWith('.mp4')) {
      const vf = 'scale=512:384:force_original_aspect_ratio=increase,crop=512:384,fps=24';
      const { execFileSync } = await import('node:child_process');
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(src, f), '-an', '-vf', vf, '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(vid, `face_${id}.mp4`)]);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(src, f), '-an', '-vf', vf, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', '-row-mt', '1', path.join(vid, `face_${id}.webm`)]);
    }
  }
  console.log('faces');
}

/* ------------------------------------------------------------------ audio */

function processAudio() {
  for (const sub of ['audio', 'voice']) {
    const dir = path.join(OUT, sub);
    mk(dir);
    for (const f of fs.readdirSync(path.join(SRC, sub))) fs.copyFileSync(path.join(SRC, sub, f), path.join(dir, f));
  }
  console.log('audio + voice');
}

/* ------------------------------------------------------------------- main */

if (want('tex')) for (const [k, v] of Object.entries(TEXTURES)) await processTexture(k, v);
if (want('fx')) await processFx();
if (want('decals')) await processDecals();
if (want('pano')) await processPano();
if (want('ui')) await processUi();
if (want('glb') && fs.existsSync(path.join(SRC, 'glb'))) await processGlb();
if (want('audio')) processAudio();
if (want('faces') && fs.existsSync(path.join(SRC, 'faces'))) await processFaces();
