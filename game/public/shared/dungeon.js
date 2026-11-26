// Procedural dungeon generation shared by server (AI/collision) and client (visuals).
import { RNG } from './rng.js';

export const TILE = 3;

export function generateDungeon(seed, level) {
  const rng = new RNG(seed);
  const W = 60, H = 60;
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const want = 9 + Math.min(level, 5);
  for (let a = 0; a < 500 && rooms.length < want; a++) {
    const big = rooms.length === 0 ? false : rng.chance(0.25);
    const w = rng.int(big ? 9 : 6, big ? 13 : 10), h = rng.int(big ? 9 : 6, big ? 13 : 10);
    const x = rng.int(2, W - w - 3), y = rng.int(2, H - h - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }
  // greedy nearest-neighbour chain so the dungeon reads as a path start -> boss
  const order = [rooms[0]];
  const left = rooms.slice(1);
  while (left.length) {
    const last = order[order.length - 1];
    let bi = 0, bd = 1e9;
    left.forEach((r, i) => { const d = Math.hypot(r.cx - last.cx, r.cy - last.cy); if (d < bd) { bd = d; bi = i; } });
    order.push(left.splice(bi, 1)[0]);
  }
  const carve = (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[y * W + x] = 1; };
  for (const r of order) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  const corridor = (a, b) => {
    let x = a.cx, y = a.cy;
    const horizFirst = rng.chance(0.5);
    const stepX = () => { while (x !== b.cx) { carve(x, y); carve(x, y + 1); x += Math.sign(b.cx - x); } };
    const stepY = () => { while (y !== b.cy) { carve(x, y); carve(x + 1, y); y += Math.sign(b.cy - y); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    carve(x, y); carve(x + 1, y); carve(x, y + 1);
  };
  for (let i = 1; i < order.length; i++) corridor(order[i - 1], order[i]);
  for (let k = 0; k < 2; k++) {
    const a = rng.int(0, order.length - 3);
    const b = Math.min(order.length - 2, a + 2 + rng.int(0, 2));
    corridor(order[a], order[b]);
  }
  const start = order[0], boss = order[order.length - 1];
  const tc = (r) => ({ x: (r.cx + 0.5) * TILE, z: (r.cy + 0.5) * TILE });
  const spawns = [];
  const randIn = (r) => ({ x: (rng.range(r.x + 1, r.x + r.w - 1)) * TILE, z: (rng.range(r.y + 1, r.y + r.h - 1)) * TILE });
  order.forEach((r, idx) => {
    if (idx === 0) return;
    if (r === boss) {
      spawns.push({ type: 'boss', ...tc(r) });
      for (let k = 0; k < 2; k++) spawns.push({ type: 'skeleton', ...randIn(r) });
      return;
    }
    const n = Math.min(8, rng.int(2, 4) + Math.floor(level / 2));
    for (let k = 0; k < n; k++) {
      const type = rng.weighted([['skeleton', 6], ['cultist', 2 + level * 0.3], ['brute', level >= 2 ? 1.8 : 0.5], ['imp', 1.2]]);
      spawns.push({ type, ...randIn(r) });
    }
  });
  // decorations
  const torches = [], pillars = [], props = [];
  const floor = (x, y) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 1;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (grid[y * W + x]) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => floor(x + dx, y + dy));
    if (dirs.length === 1 && rng.chance(0.07)) torches.push({ x, y, dx: dirs[0][0], dy: dirs[0][1] });
  }
  for (const r of order) {
    if (r.w >= 9 && r.h >= 9) {
      for (const [px, py] of [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]]) pillars.push({ x: px, y: py });
    }
    if (r !== start && r !== boss) {
      const n = rng.int(1, 4);
      for (let k = 0; k < n; k++) props.push({ kind: rng.pick(['barrel', 'crate', 'bones', 'urn']), x: rng.range(r.x + 0.6, r.x + r.w - 0.6), y: rng.chance(0.5) ? r.y + 0.6 : r.y + r.h - 0.6, rot: rng.range(0, 6.28) });
    }
  }
  return { w: W, h: H, grid, rooms: order, start: tc(start), boss: tc(boss), bossRoom: boss, spawns, torches, pillars, props, level, seed };
}

export function isFloor(d, x, z) {
  const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
  if (i < 0 || j < 0 || i >= d.w || j >= d.h) return false;
  return d.grid[j * d.w + i] === 1;
}

// Resolve a circle (pos {x,z}) against wall tiles. Mutates pos.
export function dungeonCollide(d, pos, r) {
  const i0 = Math.floor((pos.x - r) / TILE), i1 = Math.floor((pos.x + r) / TILE);
  const j0 = Math.floor((pos.z - r) / TILE), j1 = Math.floor((pos.z + r) / TILE);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const wall = i < 0 || j < 0 || i >= d.w || j >= d.h || d.grid[j * d.w + i] === 0;
    if (!wall) continue;
    const cx = Math.max(i * TILE, Math.min(pos.x, (i + 1) * TILE));
    const cz = Math.max(j * TILE, Math.min(pos.z, (j + 1) * TILE));
    const dx = pos.x - cx, dz = pos.z - cz;
    const dd = Math.hypot(dx, dz);
    if (dd < r) {
      if (dd < 1e-5) { pos.x += r; continue; }
      pos.x += (dx / dd) * (r - dd); pos.z += (dz / dd) * (r - dd);
    }
  }
  return pos;
}

// Line of sight along the grid (for ranged enemies / camera).
export function dungeonLOS(d, x0, z0, x1, z1) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(dist / (TILE * 0.35));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!isFloor(d, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}
