// The three battlefields: the ruined city, the jungle, the desert. Everything a world
// looks and sounds like comes from here; the world, the asset loader and the menus read it.

export const THEMES = {
  city: {
    id: 'city',
    name: 'STADT',
    title: 'Sektor Kilo',
    desc: 'Zerbombte Plattenbauten, Rauch und Asche. Deckung überall, Sicht nirgends weit.',
    sky: 'sky',
    ground: 'ground',
    fog: 0.0017,
    sun: { color: 0xffe2c4, intensity: 1.1, pos: [-400, 600, -300] },
    hemi: { ground: 0x3a2e24, intensity: 1.3 },
    exposure: 1.05,
    terrain: 'city',
    craters: 260,
    particles: 'ash',
    ambience: null,
    models: ['ruin', 'hedgehog'],
  },
  jungle: {
    id: 'jungle',
    name: 'DSCHUNGEL',
    title: 'Tal von Ixtal',
    desc: 'Dichter Regenwald, Tempelruinen und Hügel. Unter dem Blätterdach sieht man den Gegner erst, wenn er schießt.',
    sky: 'sky_jungle',
    ground: 'ground_jungle',
    fog: 0.0034,
    sun: { color: 0xffe9c2, intensity: 1.15, pos: [300, 700, -200] },
    hemi: { ground: 0x26301c, intensity: 1.15 },
    exposure: 1.0,
    terrain: 'jungle',
    craters: 70,
    particles: 'mist',
    ambience: 'amb_jungle',
    models: ['jungle_tree', 'palm', 'bush', 'temple', 'rock'],
  },
  desert: {
    id: 'desert',
    name: 'WÜSTE',
    title: 'Al-Haddar-Becken',
    desc: 'Dünen, Tafelberge und verlassene Lehmdörfer. Weite Sicht, kaum Deckung, gnadenlose Sonne.',
    sky: 'sky_desert',
    ground: 'ground_desert',
    fog: 0.00095,
    sun: { color: 0xfff1d6, intensity: 2.1, pos: [500, 900, 200] },
    hemi: { ground: 0x8a6a45, intensity: 1.05 },
    exposure: 0.95,
    terrain: 'desert',
    craters: 50,
    particles: 'sand',
    ambience: 'amb_desert',
    models: ['rock', 'adobe', 'palm', 'hedgehog'],
  },
};

export const THEME_ORDER = ['city', 'jungle', 'desert'];
const KEY = 'battlebot-world';

/** the world this page runs: ?world=... wins over the last choice, the city is the default */
export function currentTheme() {
  const q = new URLSearchParams(location.search).get('world');
  if (q && THEMES[q]) return q;
  try {
    const s = localStorage.getItem(KEY);
    if (s && THEMES[s]) return s;
  } catch {}
  return 'city';
}

/** pick another world: it is built on the next load */
export function chooseTheme(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  const u = new URL(location.href);
  u.searchParams.delete('world');
  u.searchParams.delete('mission');
  location.href = u.toString();
}
