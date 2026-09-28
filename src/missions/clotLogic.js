import { mulberry32 } from '../physics.js';

// Thrombolysis puzzle on a cross-section of the occluded vein.
// Cells have fibrin density 1–3 (organised, older clot sits at the wall).
// Tools:
//   tPA   – drug spray: −2 on target, −1 on the 4 neighbours (diffuses)
//   laser – precise ablation: −3 on target only, costs more energy
// Unanchored fragments float away: ≤ 3 cells dissolve harmlessly,
// larger ones become a pulmonary embolus.

export const TOOLS = {
  tpa: { target: 2, spread: 1, cost: 1 },
  laser: { target: 3, spread: 0, cost: 1 },
};
export const FRAGMENT_SAFE = 3;

export function createClot(seed = 7, n = 9) {
  const rnd = mulberry32(seed);
  const c = (n - 1) / 2;
  const rad = n / 2 + 0.1;
  const cells = [];
  for (let j = 0; j < n; j++) {
    const row = [];
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(i - c, j - c);
      if (d > rad - 0.5) {
        row.push(null); // outside the lumen (vessel wall)
        continue;
      }
      const edge = d / (rad - 0.5);
      let hp = 1 + (rnd() < edge * 0.9 ? 1 : 0) + (rnd() < edge * edge * 0.8 ? 1 : 0);
      row.push({ hp, maxHp: hp });
    }
    cells.push(row);
  }
  const total = cells.flat().filter(Boolean).length;
  return {
    n,
    cells,
    total,
    cleared: 0,
    emboli: 0,
    microFragments: 0,
    tpaLeft: 14,
    laserLeft: 8,
    moves: 0,
  };
}

export function inLumen(clot, i, j) {
  return i >= 0 && j >= 0 && i < clot.n && j < clot.n && clot.cells[j][i] !== null;
}
function alive(clot, i, j) {
  const c = inLumen(clot, i, j) && clot.cells[j][i];
  return c && c.hp > 0;
}
const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function touchesWall(clot, i, j) {
  return N4.some(([dx, dy]) => !inLumen(clot, i + dx, j + dy));
}

export function openFraction(clot) {
  return clot.cleared / clot.total;
}

export function canUse(clot, tool) {
  return tool === 'tpa' ? clot.tpaLeft > 0 : clot.laserLeft > 0;
}

/** Apply a tool at (i, j). Returns an event summary for animations. */
export function applyTool(clot, tool, i, j) {
  if (!alive(clot, i, j) || !canUse(clot, tool)) return null;
  const t = TOOLS[tool];
  if (tool === 'tpa') clot.tpaLeft--;
  else clot.laserLeft--;
  clot.moves++;
  const dissolved = [];
  const hit = (x, y, dmg) => {
    if (!alive(clot, x, y)) return;
    const c = clot.cells[y][x];
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.hp = 0;
      clot.cleared++;
      dissolved.push([x, y]);
    }
  };
  hit(i, j, t.target);
  if (t.spread) for (const [dx, dy] of N4) hit(i + dx, j + dy, t.spread);

  // Find fragments no longer anchored to the vessel wall.
  const seen = new Set();
  const released = [];
  for (let y = 0; y < clot.n; y++)
    for (let x = 0; x < clot.n; x++) {
      const k = y * clot.n + x;
      if (seen.has(k) || !alive(clot, x, y)) continue;
      const comp = [];
      let anchored = false;
      const stack = [[x, y]];
      seen.add(k);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.push([cx, cy]);
        if (touchesWall(clot, cx, cy)) anchored = true;
        for (const [dx, dy] of N4) {
          const nx = cx + dx;
          const ny = cy + dy;
          const nk = ny * clot.n + nx;
          if (!seen.has(nk) && alive(clot, nx, ny)) {
            seen.add(nk);
            stack.push([nx, ny]);
          }
        }
      }
      if (!anchored) released.push(comp);
    }
  const fragments = [];
  for (const comp of released) {
    const embolus = comp.length > FRAGMENT_SAFE;
    if (embolus) clot.emboli++;
    else clot.microFragments++;
    for (const [x, y] of comp) {
      clot.cells[y][x].hp = 0;
      clot.cleared++;
    }
    fragments.push({ cells: comp, embolus });
  }
  return { dissolved, fragments };
}

export const TARGET_OPEN = 0.6;

export function clotFinished(clot) {
  return openFraction(clot) >= TARGET_OPEN || (clot.tpaLeft <= 0 && clot.laserLeft <= 0);
}

export function clotOutcome(clot) {
  const open = openFraction(clot);
  const reached = open >= TARGET_OPEN;
  let damage = clot.emboli * 25;
  if (!reached) damage += Math.round(40 * (1 - open / TARGET_OPEN)) + 10;
  const quality = Math.max(0, Math.min(1, (reached ? 1 : open / TARGET_OPEN) - clot.emboli * 0.3));
  return { open, reached, damage, quality };
}
