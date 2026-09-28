// Asteroids-style virus aggregates: hitting a cluster splits it.
// level 3 = large aggregate (~12 virions), 2 = small (~4), 1 = single virion.
export const CLUSTER = {
  3: { radius: 0.45, virions: 12, points: 20 },
  2: { radius: 0.25, virions: 4, points: 50 },
  1: { radius: 0.05, virions: 1, points: 100 },
};

/** Split a hit cluster into two children one level lower. */
export function splitCluster(c, rnd = Math.random) {
  if (c.level <= 1) return [];
  const kids = [];
  for (let k = 0; k < 2; k++) {
    const a = rnd() * Math.PI * 2;
    const b = (rnd() - 0.5) * Math.PI;
    const sp = 0.6 + rnd() * 0.6;
    kids.push({
      level: c.level - 1,
      x: c.x,
      y: c.y,
      z: c.z,
      vx: c.vx + Math.cos(a) * Math.cos(b) * sp,
      vy: c.vy + Math.sin(b) * sp,
      vz: c.vz + Math.sin(a) * Math.cos(b) * sp,
    });
  }
  return kids;
}

/** Hit test: projectile sphere vs cluster sphere (µm). */
export function hits(p, c, pr = 0.35) {
  const r = CLUSTER[c.level].radius + pr;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const dz = p.z - c.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

export function virusOutcome(infections, killed) {
  // infections = sum of aggregate levels that reached the endothelium
  const damage = Math.min(60, infections * 4);
  const quality = Math.max(0, 1 - infections / 15);
  return { damage, quality, killed };
}
