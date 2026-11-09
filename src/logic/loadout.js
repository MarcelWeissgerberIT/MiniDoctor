// The hangar: parts the pilot can fit to BB-07, what they change, and the payload budget.
// Pure logic (no three.js) so it can be unit tested. Parts unlock as missions are won.

// payload of the chassis in tonnes; weapons, armour and kit share it
export const PAYLOAD = 50;

export const SLOTS = [
  ['gun', 'HAUPTWAFFE'],
  ['mg', 'SEKUNDÄRWAFFE'],
  ['missiles', 'RAKETENSYSTEM'],
  ['armor', 'PANZERUNG'],
  ['lights', 'SCHEINWERFER'],
  ['extra', 'ZUSATZAUSRÜSTUNG'],
  ['paint', 'LACKIERUNG'],
  ['emblem', 'ABZEICHEN'],
];

/**
 * unlock: missions that must be won first. stats feed the weapon and mech models;
 * fields a part leaves out keep their default.
 */
export const PARTS = {
  gun: {
    ac30: {
      name: 'MK-30 Maschinenkanone',
      short: 'KAN 30mm',
      desc: 'Bewährter Allrounder: 5 Schuss pro Sekunde, gute Präzision, 240 Schuss.',
      t: 9,
      unlock: 0,
      stats: { rpm: 300, ammo: 240, speed: 1100, damage: 12, heatPerShot: 0.06, cool: 0.16, spread: 0.0018 },
      look: { barrel: 2.0, radius: 0.075, pitch: 1 },
    },
    ac40: {
      name: 'SK-40 Schwere Kanone',
      short: 'KAN 40mm',
      desc: 'Langsamer, aber jeder Treffer sitzt: doppelter Schaden, knackt Frontpanzer.',
      t: 12,
      unlock: 2,
      stats: { rpm: 140, ammo: 120, speed: 1000, damage: 27, heatPerShot: 0.11, cool: 0.16, spread: 0.0014 },
      look: { barrel: 2.3, radius: 0.1, pitch: 0.72 },
    },
    gat20: {
      name: 'GR-20 Gatling',
      short: 'GAT 20mm',
      desc: 'Sechs rotierende Läufe, 15 Schuss pro Sekunde. Zerlegt Schützenpanzer, wird schnell heiß.',
      t: 10,
      unlock: 4,
      stats: { rpm: 900, ammo: 720, speed: 1050, damage: 4.6, heatPerShot: 0.022, cool: 0.2, spread: 0.0042 },
      look: { barrel: 1.7, radius: 0.04, pitch: 1.35, gatling: true },
    },
    rail: {
      name: 'EM-9 Railgun',
      short: 'RAIL',
      desc: 'Elektromagnetisch, 3000 m/s: kein Vorhalt nötig, durchschlägt alles. Ein Schuss alle 1,5 s.',
      t: 14,
      unlock: 8,
      stats: { rpm: 40, ammo: 40, speed: 3000, damage: 62, heatPerShot: 0.3, cool: 0.18, spread: 0.0004 },
      look: { barrel: 2.6, radius: 0.06, pitch: 0.55, rail: true },
    },
  },
  mg: {
    mg762: {
      name: 'MG 7,62 mm',
      short: 'MG 7,62',
      desc: 'Leicht und schnell gegen Fahrzeuge ohne Panzer.',
      t: 2,
      unlock: 0,
      stats: { rpm: 900, ammo: 1500, speed: 850, damage: 1.6, spread: 0.0045 },
    },
    hmg127: {
      name: 'sMG 12,7 mm',
      short: 'sMG 12,7',
      desc: 'Überschweres MG: mehr als der doppelte Schaden, auch gegen Schützenpanzer.',
      t: 4,
      unlock: 3,
      stats: { rpm: 550, ammo: 800, speed: 900, damage: 3.8, spread: 0.004 },
    },
    flamer: {
      name: 'FW-2 Flammenwerfer',
      short: 'FLAMMEN',
      desc: 'Bis 70 m, setzt Ziele in Brand. Im Dschungel unschlagbar, sonst Nahkampf.',
      t: 4,
      unlock: 6,
      stats: { flamer: true, range: 70, dps: 10, ammo: 30 },
    },
  },
  missiles: {
    lr12: {
      name: 'LR-12 Lenkraketen',
      short: 'LR ×12',
      desc: 'Zwölf gelenkte Panzerabwehrraketen mit Aufschaltung, auch im Steilangriff.',
      t: 8,
      unlock: 0,
      stats: { count: 12, damage: 70, lockTime: 1.2, lockRange: 1600, reload: 1.0, guided: true },
    },
    rw24: {
      name: 'RW-24 Raketenwerfer',
      short: 'RW ×24',
      desc: 'Ungelenkte Raketen in Vierersalven auf den Zielpunkt: Flächenfeuer ohne Aufschalten.',
      t: 7,
      unlock: 4,
      stats: { count: 24, damage: 34, lockTime: 0, lockRange: 900, reload: 0.15, guided: false, burst: 4 },
    },
    sl6: {
      name: 'SL-6 Schwere Lenkraketen',
      short: 'SL ×6',
      desc: 'Sechs schwere Raketen, 2400 m Reichweite, zerstören fast alles mit einem Treffer.',
      t: 10,
      unlock: 7,
      stats: { count: 6, damage: 130, lockTime: 1.7, lockRange: 2400, reload: 1.8, guided: true },
    },
    none: {
      name: 'Kein Raketensystem',
      short: '—',
      desc: 'Spart Gewicht für Panzerung und Zusatzausrüstung.',
      t: 0,
      unlock: 0,
      stats: { count: 0, guided: true },
    },
  },
  armor: {
    light: {
      name: 'Leichte Panzerung',
      short: 'LEICHT',
      desc: 'Weniger Schutz, dafür schneller und wendiger.',
      t: 10,
      unlock: 0,
      stats: { armor: 0.78, speed: 1.12 },
    },
    standard: {
      name: 'Standardpanzerung',
      short: 'STANDARD',
      desc: 'Verbundpanzerung ab Werk.',
      t: 16,
      unlock: 0,
      stats: { armor: 1, speed: 1 },
    },
    heavy: {
      name: 'Schwere Panzerung',
      short: 'SCHWER',
      desc: 'Hält ein Drittel mehr aus, kostet aber Tempo.',
      t: 24,
      unlock: 5,
      stats: { armor: 1.35, speed: 0.88 },
    },
  },
  lights: {
    none: { name: 'Keine Scheinwerfer', short: 'AUS', desc: 'Unsichtbar bei Nacht – und blind.', t: 0, unlock: 0, stats: {} },
    halogen: {
      name: 'Halogen-Scheinwerfer',
      short: 'HALOGEN',
      desc: 'Zwei warme Scheinwerfer am Rumpf, 70 m weit. Taste U.',
      t: 0.5,
      unlock: 0,
      stats: { range: 70, angle: 0.42, intensity: 60, color: [1, 0.86, 0.66], visible: true },
    },
    led: {
      name: 'LED-Flutlicht',
      short: 'LED',
      desc: 'Breites kaltweißes Flutlicht, 140 m. Verrät dich aber auf große Entfernung.',
      t: 1,
      unlock: 2,
      stats: { range: 140, angle: 0.62, intensity: 140, color: [0.86, 0.93, 1], visible: true },
    },
    ir: {
      name: 'IR-Strahler',
      short: 'IR',
      desc: 'Unsichtbares Infrarot: nur durch die Nachtsicht hell, der Feind sieht nichts.',
      t: 1,
      unlock: 5,
      stats: { range: 120, angle: 0.55, intensity: 0, color: [1, 1, 1], visible: false, nvBoost: 1 },
    },
  },
  extra: {
    none: { name: 'Keine', short: '—', desc: 'Volle Nutzlast für Waffen und Panzerung.', t: 0, unlock: 0, stats: {} },
    smoke: {
      name: 'Nebelwurfanlage',
      short: 'NEBEL',
      desc: 'Taste J: eine Nebelwand rund um den Mech, drei Ladungen. Bricht Sichtlinien und Raketen.',
      t: 2,
      unlock: 1,
      stats: { smoke: 3 },
    },
    ecm: {
      name: 'Störsender ECM',
      short: 'ECM',
      desc: 'Feindliche Richtschützen treffen ein Viertel seltener.',
      t: 3,
      unlock: 4,
      stats: { ecm: 0.75 },
    },
    plates: {
      name: 'Zusatzpanzerung Front',
      short: 'PLATTEN',
      desc: 'Angeschweißte Platten: Treffer von vorn richten ein Viertel weniger an.',
      t: 5,
      unlock: 3,
      stats: { front: 0.75 },
    },
    battery: {
      name: 'Drohnen-Akku XL',
      short: 'AKKU XL',
      desc: 'Die Drohne fliegt 60 % länger.',
      t: 1,
      unlock: 2,
      stats: { droneFlight: 1.6 },
    },
  },
  paint: {
    urban: { name: 'Stadt-Grau', short: 'GRAU', desc: 'Der Werksanstrich.', t: 0, unlock: 0, stats: { base: [0.62, 0.64, 0.66], camo: null } },
    olive: { name: 'Oliv', short: 'OLIV', desc: 'Klassisches Militär-Oliv.', t: 0, unlock: 0, stats: { base: [0.5, 0.55, 0.36], camo: null } },
    desert: { name: 'Wüsten-Tarn', short: 'WÜSTE', desc: 'Sand, Ocker und Braun.', t: 0, unlock: 0, stats: { base: [0.86, 0.74, 0.52], camo: [[0.72, 0.56, 0.36], [0.5, 0.38, 0.26]] } },
    jungle: { name: 'Dschungel-Tarn', short: 'DSCHUNGEL', desc: 'Grün, Braun und Schwarz.', t: 0, unlock: 0, stats: { base: [0.42, 0.5, 0.3], camo: [[0.3, 0.26, 0.17], [0.13, 0.15, 0.12]] } },
    urbanCamo: { name: 'Stadt-Tarn', short: 'SPLITTER', desc: 'Splittertarnung in Grau und Schwarz.', t: 0, unlock: 0, stats: { base: [0.66, 0.67, 0.68], camo: [[0.4, 0.42, 0.44], [0.16, 0.17, 0.18]] } },
    black: { name: 'Nachtschwarz', short: 'SCHWARZ', desc: 'Für Einsätze bei Nacht.', t: 0, unlock: 0, stats: { base: [0.16, 0.17, 0.18], camo: null } },
    red: { name: 'Signalrot', short: 'ROT', desc: 'Auffällig. Sehr auffällig.', t: 0, unlock: 0, stats: { base: [0.66, 0.16, 0.12], camo: null } },
  },
  emblem: {
    none: { name: 'Kein Abzeichen', short: '—', desc: 'Nur die Kennung.', t: 0, unlock: 0, stats: {} },
    star: { name: 'Stern', short: 'STERN', desc: 'Weißer Stern auf der Schulter.', t: 0, unlock: 0, stats: { shape: 'star' } },
    bolt: { name: 'Blitz', short: 'BLITZ', desc: 'Gelber Blitz auf der Schulter.', t: 0, unlock: 0, stats: { shape: 'bolt' } },
    skull: { name: 'Totenkopf', short: 'SCHÄDEL', desc: 'Für die, die es ernst meinen.', t: 0, unlock: 0, stats: { shape: 'skull' } },
    chevron: { name: 'Winkel', short: 'WINKEL', desc: 'Drei Dienstwinkel.', t: 0, unlock: 0, stats: { shape: 'chevron' } },
    wolf: { name: 'Wolfskopf', short: 'WOLF', desc: 'Das Zeichen der Lanze Hammer.', t: 0, unlock: 1, stats: { shape: 'wolf' } },
  },
};

export function defaultLoadout() {
  return { gun: 'ac30', mg: 'mg762', missiles: 'lr12', armor: 'standard', lights: 'halogen', extra: 'none', paint: 'urban', emblem: 'star', callsign: 'BB-07' };
}

/** a stored loadout cleaned up: unknown or locked parts fall back to the default */
export function sanitize(l, won = Infinity) {
  const d = defaultLoadout();
  const out = { ...d };
  for (const [slot] of SLOTS) {
    const id = l?.[slot];
    const p = PARTS[slot][id];
    if (p && won >= p.unlock) out[slot] = id;
  }
  const cs = String(l?.callsign ?? d.callsign)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 6);
  out.callsign = cs || d.callsign;
  return out;
}

export function tonnage(l) {
  return SLOTS.reduce((s, [slot]) => s + (PARTS[slot][l[slot]]?.t ?? 0), 0);
}

/** can it fly? over the payload, or with parts not yet unlocked, it cannot */
export function validate(l, won = Infinity) {
  const errors = [];
  const tons = tonnage(l);
  if (tons > PAYLOAD + 1e-9) errors.push(`ÜBERLADEN: ${fmtT(tons)} von ${PAYLOAD} t`);
  for (const [slot, label] of SLOTS) {
    const p = PARTS[slot][l[slot]];
    if (!p) errors.push(`${label}: UNBEKANNT`);
    else if (won < p.unlock) errors.push(`${p.name}: GESPERRT`);
  }
  return { ok: !errors.length, tons, payload: PAYLOAD, errors };
}

export const fmtT = (t) => `${(Math.round(t * 10) / 10).toString().replace('.', ',')}`;

/**
 * Everything the game needs from a loadout: weapon parameters, armour and speed factors,
 * lights and kit. Heavier mechs are a little slower on top of what the armour costs.
 */
export function effects(l) {
  const P = (slot) => PARTS[slot][l[slot]] ?? PARTS[slot][defaultLoadout()[slot]];
  const gun = P('gun');
  const mg = P('mg');
  const ms = P('missiles');
  const armor = P('armor').stats;
  const extra = P('extra').stats;
  const tons = tonnage(l);
  const load = Math.min(1.1, Math.max(0.82, 1.14 - tons * 0.004));
  return {
    gun: { ...gun.stats, id: l.gun, short: gun.short, look: gun.look },
    mg: { ...mg.stats, id: l.mg, short: mg.short },
    missile: { ...ms.stats, id: l.missiles, short: ms.short },
    armor: armor.armor * (extra.armor ?? 1),
    front: extra.front ?? 1,
    speed: armor.speed * load,
    lights: { id: l.lights, ...P('lights').stats },
    smoke: extra.smoke ?? 0,
    ecm: extra.ecm ?? 1,
    droneFlight: extra.droneFlight ?? 1,
    paint: P('paint').stats,
    emblem: P('emblem').stats.shape ?? null,
    callsign: l.callsign,
    tons,
  };
}

/** bars for the hangar, 0..1: firepower, protection, speed, range */
export function ratings(l) {
  const e = effects(l);
  const gunDps = (e.gun.rpm / 60) * e.gun.damage; // 30 mm: 60
  const mgDps = e.mg.flamer ? e.mg.dps * 1.4 : (e.mg.rpm / 60) * e.mg.damage; // 7.62: 24
  const msl = (e.missile.count || 0) * (e.missile.damage || 0); // LR-12: 840
  const fire = Math.min(1, (gunDps + mgDps * 0.5 + msl / 25) / 130);
  const protect = Math.min(1, (e.armor * (1 + (1 - e.front) * 0.8) - 0.6) / 0.95);
  const speed = Math.min(1, Math.max(0, (e.speed - 0.7) / 0.55));
  const reach = Math.min(1, Math.max(e.missile.lockRange || 0, e.gun.speed * 0.9) / 2700);
  return { fire, protect, speed, reach };
}

/** how many missions must be won for the next locked part, and which one */
export function nextUnlock(won) {
  let best = null;
  for (const [slot] of SLOTS)
    for (const [id, p] of Object.entries(PARTS[slot])) if (p.unlock > won && (!best || p.unlock < best.unlock)) best = { slot, id, ...p };
  return best;
}
