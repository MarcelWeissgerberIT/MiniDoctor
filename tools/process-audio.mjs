// Extracts the soundtracks of the OpenArt video generations in assets-src/audio/
// (music + ambience beds) into small, loudness-normalised .m4a files.
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';

const SRC = 'assets-src/audio';
// seconds to skip at the start (generations open with an untypical intro)
const TRIM = { amb_heart: 0.7, amb_lung: 2.0 };
const OUT = 'public/assets/audio';
mkdirSync(OUT, { recursive: true });

for (const f of readdirSync(SRC).filter((f) => f.endsWith('.mp4'))) {
  const name = f.replace(/\.mp4$/, '');
  const music = name.startsWith('music_');
  // normalise loudness, short fade-in; loops are crossfaded at runtime
  const filters = ['-af', `loudnorm=I=${music ? -18 : -22}:TP=-2:LRA=11,afade=t=in:d=0.3`, '-ac', '2', '-ar', '48000'];
  const input = ['-y', '-loglevel', 'error', '-ss', String(TRIM[name] ?? 0), '-i', `${SRC}/${f}`, '-vn'];
  // Opus (Chrome, Firefox, Edge, new Safari) + AAC fallback (older Safari)
  execFileSync(ffmpeg, [...input, ...filters, '-c:a', 'libopus', '-b:a', music ? '96k' : '64k', `${OUT}/${name}.ogg`]);
  execFileSync(ffmpeg, [...input, ...filters, '-c:a', 'aac', '-b:a', music ? '112k' : '80k', `${OUT}/${name}.m4a`]);
  console.log('audio', name);
}
