// The board computer: a widescreen terminal on the right wall with its own view (key 7).
// It holds the target list, the drone with its camera and the fire-control settings;
// the page sits on the left, a side bar with the details of the moment on the right.
import { Region, UI, drawTargetList, drawDrone, drawComputer } from './displays.js';

const { text, key, bar, G, W, GD, AMBER, RED } = UI;
const CYAN = '#9fe8ff';

export const COMPUTER_UNITS = [800, 450];
// where the 512 x 384 page sits (display units); the drone picture fills exactly this
export const PAGE_RECT = { x: 8, y: 52, w: 512, h: 384 };
export const COMP_PAGES = [
  ['targets', 'ZIELE'],
  ['drone', 'DROHNE'],
  ['fc', 'FEUERLEITUNG'],
];

const DRONE_STATE = { docked: 'ANGEDOCKT', launch: 'START', transit: 'ANFLUG', orbit: 'SUCHE', return: 'RÜCKKEHR', land: 'LANDUNG', lost: 'VERLOREN', manual: 'HANDFLUG' };
const DRONE_MODE = { orbit: 'KREISEN', escort: 'BEGLEITEN', ahead: 'VORAUS', manual: 'MANUELL' };
const TYPE_LONG = { tank: 'KAMPFPANZER', apc: 'SCHÜTZENPANZER', depot: 'DEPOT', bunker: 'BUNKER', artillery: 'HAUBITZE', aa: 'FLAKPANZER', heli: 'KAMPFHUBSCHRAUBER', truck: 'LASTWAGEN', mech: 'KAMPFMECH' };

/** feed rectangle for the display shader (uv, y up) */
export function pageFeedRect() {
  const [W0, H0] = COMPUTER_UNITS;
  const r = PAGE_RECT;
  return [r.x / W0, 1 - (r.y + r.h) / H0, (r.x + r.w) / W0, 1 - r.y / H0];
}

const deg = (a) => String(Math.round((((-a * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, '0');

function row(g, label, value, y, color = W) {
  text(g, label, 544, y, { size: 13, color: GD, weight: 'bold' });
  text(g, value, 784, y, { size: 15, color, align: 'right', weight: 'bold' });
}

function heading(g, title, y, color = W) {
  text(g, title, 544, y, { size: 17, color, weight: 'bold' });
  g.strokeStyle = GD;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(540, y + 13);
  g.lineTo(788, y + 13);
  g.stroke();
}

/**
 * s: { page, time, targets: {...drawTargetList state}, drone: {...drawDrone state},
 *      fc: {...drawComputer state}, sel, des, locked, weapons, threats }
 */
export function drawBoardComputer(mfd, s) {
  const g = mfd.begin();
  // title bar: name, the three pages, clock and a close key
  g.fillStyle = 'rgba(255,160,64,0.08)';
  g.fillRect(0, 0, 800, 44);
  text(g, 'BORDCOMPUTER', 14, 22, { size: 18, color: W, weight: 'bold' });
  let x = 176;
  for (const [id, label] of COMP_PAGES) {
    const w = label.length * 11 + 34;
    key(mfd, g, label, x, 8, w, { type: 'page', page: id }, { on: s.page === id, h: 28 });
    x += w + 8;
  }
  text(g, s.time, 690, 22, { size: 16, color: G, align: 'right' });
  key(mfd, g, '✕', 700, 8, 92, { type: 'close' }, { h: 28 });
  g.strokeStyle = GD;
  g.lineWidth = 2;
  g.strokeRect(PAGE_RECT.x - 1, PAGE_RECT.y - 1, PAGE_RECT.w + 2, PAGE_RECT.h + 2);
  g.strokeRect(532, PAGE_RECT.y - 1, 260, PAGE_RECT.h + 2);

  // the page
  mfd.region ??= new Region(mfd, PAGE_RECT.x, PAGE_RECT.y);
  if (s.page === 'drone') drawDrone(mfd.region, s.drone);
  else if (s.page === 'fc') drawComputer(mfd.region, s.fc);
  else drawTargetList(mfd.region, s.targets);

  // the side bar
  if (s.page === 'drone') droneBar(mfd, g, s);
  else if (s.page === 'fc') weaponsBar(mfd, g, s);
  else targetBar(mfd, g, s);
  mfd.end();
}

/** ZIELE: everything about the selected (or assigned) vehicle */
function targetBar(mfd, g, s) {
  const t = s.sel || s.des;
  heading(g, t ? `${t.label} · ${TYPE_LONG[t.type] || t.name || ''}` : 'ZIELDATEN', 68, t ? (t.aiming ? RED : W) : W);
  if (!t) {
    text(g, 'Zeile in der Liste anklicken', 544, 104, { size: 14, color: GD });
    text(g, 'oder TAB: nächstes Ziel', 544, 124, { size: 14, color: GD });
  } else {
    const st = t.stale ? 'LETZTE POSITION' : t.visible ? 'IN SICHT' : t.marked ? 'DROHNE SIEHT ES' : 'GEMELDET';
    row(g, 'ENTFERNUNG', `${Math.round(t.dist)} m`, 100);
    row(g, 'RICHTUNG', `${t.clock} Uhr · ${deg(t.brg)}°`, 120);
    row(g, 'FAHRT', `${Math.round(t.kmh || 0)} km/h`, 140);
    row(g, 'LAGE', t.stale ? '—' : t.state, 160);
    row(g, 'ZEIGT DIR', t.face || '—', 180);
    row(g, 'ERFASSUNG', st, 200, t.stale ? GD : t.marked && !t.visible ? CYAN : W);
    text(g, 'ZUSTAND', 544, 222, { size: 13, color: GD, weight: 'bold' });
    bar(g, 620, 214, 120, 16, t.hp, t.hp > 0.5 ? G : t.hp > 0.25 ? AMBER : RED);
    text(g, `${Math.round(t.hp * 100)}%`, 784, 222, { size: 15, color: W, align: 'right', weight: 'bold' });
    if (t.aiming) text(g, '! RICHTET SEIN ROHR AUF DICH', 544, 246, { size: 14, color: RED, weight: 'bold' });
    const isDes = t.id === s.desId;
    key(mfd, g, isDes ? 'FREI' : 'AUFSCHALTEN', 540, 262, 120, isDes ? { type: 'release' } : { type: 'designate' }, { on: isDes, warn: isDes && s.locked, dim: t !== s.sel && !isDes });
    key(mfd, g, 'DROHNE HIN', 668, 262, 120, { type: 'droneTo' }, { dim: t !== s.sel || s.droneDisabled });
  }
  // the seeker and the computer
  heading(g, 'SUCHER', 310);
  const d = s.des;
  row(g, 'ZIEL', d ? `${d.label} ${Math.round(d.dist)} m` : 'FREI', 340, d ? (s.locked ? RED : AMBER) : GD);
  row(g, 'STATUS', d ? (s.locked ? 'LOCK · F = FEUER' : `AUFSCHALTEN ${Math.round((s.lockT || 0) * 100)}%`) : '—', 360, s.locked ? RED : W);
  row(g, 'RAKETEN', `${s.weapons.missiles} · ${s.weapons.profile} ×${s.weapons.salvo}`, 380);
  key(mfd, g, s.autoTarget ? 'AUTO-ZIEL AN' : 'AUTO-ZIEL AUS', 540, 400, 248, { type: 'fc', key: 'autoTarget', value: !s.autoTarget }, { on: s.autoTarget, h: 28 });
}

/** DROHNE: telemetry, modes and what the pilot can do right now */
function droneBar(mfd, g, s) {
  const d = s.drone.drone;
  const up = d.state !== 'docked' && d.state !== 'lost';
  heading(g, `DROHNE · ${DRONE_MODE[d.mode] || ''}`, 68, CYAN);
  row(g, 'ZUSTAND', d.jammed ? 'GESTÖRT' : DRONE_STATE[d.state] || d.state, 100, d.state === 'lost' || d.jammed ? RED : W);
  text(g, 'AKKU', 544, 122, { size: 13, color: GD, weight: 'bold' });
  bar(g, 620, 114, 120, 16, d.battery, d.battery > 0.35 ? G : d.battery > 0.22 ? AMBER : RED);
  text(g, `${Math.round(d.battery * 100)}%`, 784, 122, { size: 15, color: W, align: 'right', weight: 'bold' });
  const left = Math.max(0, Math.round(d.battery * 95));
  row(g, up ? 'RESTFLUGZEIT' : 'FLUGZEIT VOLL', up ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '1:35', 142);
  row(g, 'HÖHE · ENTF', up ? `${Math.round(d.alt)} m · ${Math.round(d.dist)} m` : '—', 162);
  row(g, 'TEMPO · KURS', up ? `${Math.round((d.speed || 0) * 3.6)} km/h · ${deg(d.heading)}°` : '—', 182);
  row(g, 'MARKIERT', `${d.marks} · ERSATZ ${d.spares}`, 202);
  // modes
  text(g, 'MODUS', 544, 228, { size: 13, color: GD, weight: 'bold' });
  [
    ['orbit', 'KREISEN'],
    ['escort', 'BEGLEITEN'],
    ['ahead', 'VORAUS'],
    ['manual', 'MANUELL'],
  ].forEach(([m, l], i) => key(mfd, g, l, 540 + (i % 2) * 126, 240 + Math.floor(i / 2) * 32, 122, { type: 'droneMode', mode: m }, { on: d.mode === m, dim: d.jammed, h: 26 }));
  const up2 = up && d.state !== 'land';
  key(mfd, g, up ? 'RÜCKRUF' : 'START', 540, 310, 122, up2 ? { type: 'recall' } : { type: 'launch' }, { on: up, dim: d.jammed || d.state === 'lost' || (up && !up2), h: 26 });
  key(mfd, g, 'ZUM ZIEL', 666, 310, 122, { type: 'droneTo' }, { dim: s.sel == null || d.jammed || d.state === 'lost', h: 26 });
  // what the sticks do
  if (d.mode === 'manual') {
    const flying = d.state === 'manual';
    text(g, flying ? 'HANDFLUG' : up ? 'MANUELL: ÜBERNIMMT GLEICH' : 'MANUELL: START MIT Q', 544, 352, { size: 14, color: CYAN, weight: 'bold' });
    text(g, 'W/S TEMPO · A/D DREHEN', 544, 372, { size: 13, color: G });
    text(g, 'R/F HÖHE', 544, 390, { size: 13, color: G });
    text(g, 'Ziel im Bild = zuweisen', 544, 408, { size: 12, color: GD });
    text(g, 'Der Mech steht still', 544, 424, { size: 12, color: GD });
  } else if (up) {
    text(g, 'Sie markiert jedes Fahrzeug,', 544, 360, { size: 13, color: G });
    text(g, 'das ihre Kamera sieht (30 s).', 544, 378, { size: 13, color: G });
    text(g, 'Ziel im Bild = zuweisen', 544, 400, { size: 13, color: GD });
  } else if (d.state === 'docked') {
    text(g, 'Q startet sie in Blickrichtung,', 544, 360, { size: 13, color: G });
    text(g, 'ZUM ZIEL zum gewählten Fahrzeug.', 544, 378, { size: 13, color: G });
  }
}

/** FEUERLEITUNG: the weapons and who threatens us */
function weaponsBar(mfd, g, s) {
  const w = s.weapons;
  heading(g, 'WAFFEN', 68);
  row(g, 'KANONE 30 mm', `${w.ammo}`, 98, w.ammo < 40 ? AMBER : W);
  text(g, 'ROHRHITZE', 544, 120, { size: 13, color: GD, weight: 'bold' });
  bar(g, 640, 112, 144, 16, w.heat, w.overheated ? RED : w.heat > 0.7 ? AMBER : G);
  row(g, 'FEUERART', `${w.gunMode} · ${w.gunAim}`, 140);
  row(g, 'MG 7,62', `${w.mg}`, 160);
  row(g, 'RAKETEN', `${w.missiles} · ${w.profile} ×${w.salvo}`, 180);
  row(g, 'SUCHER', s.des ? `${s.des.label} ${s.locked ? 'LOCK' : 'SUCHT'}` : 'FREI', 200, s.locked ? RED : s.des ? AMBER : GD);
  heading(g, `BEDROHUNGEN ${s.threats.length}`, 232, s.threats.length ? RED : W);
  if (!s.threats.length) text(g, 'Kein Rohr auf dich gerichtet', 544, 264, { size: 14, color: GD });
  s.threats.slice(0, 6).forEach((t, i) => {
    const y = 264 + i * 24;
    text(g, t.label, 544, y, { size: 15, color: RED, weight: 'bold' });
    text(g, `${Math.round(t.dist)} m · ${t.clock} Uhr`, 784, y, { size: 15, color: W, align: 'right' });
    mfd.hits.push({ x: 540, y: y - 11, w: 248, h: 22, action: { type: 'select', id: t.id } });
  });
}
