// Post-processes the raw OpenArt generations in assets-src/ into
// web-ready files in public/assets/ (chroma key, crops, compression).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets-src';
const OUT = 'public/assets';
mkdirSync(OUT, { recursive: true });

async function cockpit() {
  const img = sharp(`${SRC}/cockpit_raw.png`).resize(1920);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = g - Math.max(r, b); // "greenness"
    if (key > 90) data[i + 3] = 0;
    else if (key > 30) {
      data[i + 3] = Math.round(255 * (1 - (key - 30) / 60));
      data[i + 1] = Math.max(r, b); // despill
    }
  }
  await sharp(data, { raw: info }).webp({ quality: 88, alphaQuality: 90 }).toFile(`${OUT}/cockpit.webp`);
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
for (const n of ['tex_endothelium', 'tex_plaque', 'tex_fibrin']) await simple(n, 1024, 85);
// The RBC generation came out as a field of cells; a small patch of one cell
// gives the smooth, mottled membrane surface we need.
await sharp(`${SRC}/tex_rbc.png`).extract({ left: 590, top: 400, width: 70, height: 70 }).resize(512, 512, { kernel: 'cubic' }).blur(6).webp({ quality: 85 }).toFile(`${OUT}/tex_rbc.webp`);
for (const n of ['transition_start', 'transition_end']) await simple(n, 1920, 80);
for (const n of ['brief_stent', 'brief_virus', 'brief_clot', 'ship_concept']) await simple(n, 960);
for (const n of ['keyart', 'outcome_survived', 'outcome_died']) await simple(n, 1920);
console.log('assets processed');
