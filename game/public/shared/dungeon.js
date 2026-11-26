// Procedural dungeon generation shared by server (AI/collision/events) and client (visuals).
// Grid cell values: 0 wall, 1 floor, 2 gate (wall while closed), 3 lava, 4 ice.
import { RNG } from './rng.js';
import { AFFIX_KEYS } from './enemies.js';

export const TILE = 3;
export const BIOMES = ['crypt', 'forge', 'frozen'];
export const BIOME_INFO = {
  crypt: { name: 'The Bone Crypts', weights: [['skeleton', 6], ['cultist', 2], ['brute', 1.4], ['imp', 1.2], ['shieldbearer', 1.2], ['healer', 0.8]] },
  forge: { name: 'The Molten Forge', weights: [['imp', 4], ['brute', 2.4], ['cultist', 2], ['skeleton', 2], ['bomber', 1.6], ['burrower', 0.9]] },
  frozen: { name: 'The Frozen Catacombs', weights: [['skeleton', 5], ['wraith', 3], ['brute', 1.4], ['cultist', 1], ['burrower', 1.2], ['healer', 1], ['shieldbearer', 1]] },
};
export const BOSS_ROTATION = ['boss', 'matriarch', 'drake'];
const MINION = { boss: 'skeleton', matriarch: 'spiderling', drake: 'imp' };
export const LEVER_COLORS = ['#ff5a3a', '#5ab0ff', '#5eea8a'];
export const LEVER_NAMES = ['Ember', 'Frost', 'Verdant'];
export const SHRINES = {
  fury: { name: 'Shrine of Fury', desc: '+50% damage', color: '#ff4a2a', dur: 40 },
  swift: { name: 'Shrine of Swiftness', desc: '+30% speed, −25% cooldowns', color: '#5eea8a', dur: 40 },
  fortune: { name: 'Shrine of Fortune', desc: '+100% gold find', color: '#ffd34d', dur: 60 },
  warding: { name: 'Shrine of Warding', desc: '+50% armor', color: '#5ab0ff', dur: 40 },
};

export function generateDungeon(seed, level) {
  const rng = new RNG(seed);
  const biome = BIOMES[(level - 1) % 3];
  const W = 60, H = 60;
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const want = 9 + Math.min(level, 5);
  for (let a = 0; a < 600 && rooms.length < want; a++) {
    const big = rooms.length === 0 ? false : rng.chance(0.25);
    const w = rng.int(big ? 9 : 6, big ? 13 : 10), h = rng.int(big ? 9 : 6, big ? 13 : 10);
    const x = rng.int(3, W - w - 4), y = rng.int(3, H - h - 4);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) });
  }
  const order = [rooms[0]];
  const left = rooms.slice(1);
  while (left.length) {
    const last = order[order.length - 1];
    let bi = 0, bd = 1e9;
    left.forEach((r, i) => { const d = Math.hypot(r.cx - last.cx, r.cy - last.cy); if (d < bd) { bd = d; bi = i; } });
    order.push(left.splice(bi, 1)[0]);
  }
  // make the boss room big enough for a proper arena
  const bossR = order[order.length - 1];
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
  const inRoom = (x, y, r, m = 0) => x >= r.x - m && x < r.x + r.w + m && y >= r.y - m && y < r.y + r.h + m;
  const roomOf = (x, y) => order.find((r) => inRoom(x, y, r));
  // gate: corridor tiles touching the boss room ring
  const gateTiles = [];
  for (let y = bossR.y - 1; y <= bossR.y + bossR.h; y++) for (let x = bossR.x - 1; x <= bossR.x + bossR.w; x++) {
    if (inRoom(x, y, bossR)) continue;
    if (grid[y * W + x] === 1 && !order.some((r) => r !== bossR && inRoom(x, y, r))) { grid[y * W + x] = 2; gateTiles.push({ x, y }); }
  }
  const start = order[0], boss = bossR;
  const tc = (r) => ({ x: (r.cx + 0.5) * TILE, z: (r.cy + 0.5) * TILE });
  const randIn = (r, m = 1) => ({ x: rng.range(r.x + m, r.x + r.w - m) * TILE, z: rng.range(r.y + m, r.y + r.h - m) * TILE });
  // rooms reachable from the start while the gate is closed (avoid soft-locking the lever puzzle)
  const seen = new Uint8Array(W * H);
  const q = [start.cy * W + start.cx]; seen[q[0]] = 1;
  while (q.length) {
    const k = q.pop(), x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (y + dy) * W + x + dx;
      if (!seen[n] && grid[n] === 1) { seen[n] = 1; q.push(n); }
    }
  }
  const middle = order.slice(1, -1);
  // events: levers, shrines, champion pack, goblin
  const reach = middle.filter((r) => seen[r.cy * W + r.cx]);
  const pool = reach.concat(middle.filter((r) => !reach.includes(r))).slice(0, Math.max(reach.length, 0));
  const rest = middle.filter((r) => !pool.includes(r));
  pool.sort(() => rng.next() - 0.5);
  pool.push(...rest);
  const leverRooms = pool.slice(0, Math.min(3, reach.length));
  const levers = leverRooms.map((r, i) => ({ i, ...randIn(r, 1.5), color: LEVER_COLORS[i] }));
  const leverOrder = levers.map((l) => l.i).sort(() => rng.next() - 0.5);
  const shrineKinds = Object.keys(SHRINES).sort(() => rng.next() - 0.5);
  const shrines = pool.slice(3, 5).map((r, i) => ({ i, ...randIn(r, 2), kind: shrineKinds[i] }));
  const champRoom = pool[5] || pool[0];
  const champAffix = rng.pick(AFFIX_KEYS);
  const spawns = [];
  const W8 = BIOME_INFO[biome].weights.map(([t, w]) => [t, t === 'brute' && level < 2 ? w * 0.35 : w]);
  order.forEach((r, idx) => {
    if (idx === 0) return;
    if (r === boss) {
      const bt = BOSS_ROTATION[(level - 1) % 3];
      spawns.push({ type: bt, ...tc(r) });
      for (let k = 0; k < 2; k++) spawns.push({ type: MINION[bt], ...randIn(r) });
      return;
    }
    const n = Math.min(8, rng.int(2, 4) + Math.floor(level / 2));
    for (let k = 0; k < n; k++) spawns.push({ type: rng.weighted(W8), ...randIn(r) });
    if (r === champRoom) for (let k = 0; k < 3; k++) spawns.push({ type: rng.weighted(W8.filter((w) => w[0] !== 'cultist')), ...randIn(r), elite: champAffix });
    else if (rng.chance(0.12 + level * 0.02)) spawns.push({ type: rng.weighted(W8), ...randIn(r), elite: rng.pick(AFFIX_KEYS) });
  });
  if (rng.chance(0.55)) spawns.push({ type: 'goblin', ...randIn(rng.pick(middle)) });

  // biome hazard tiles
  const lava = [], ice = [];
  if (biome !== 'crypt') {
    for (const r of middle) {
      if (leverRooms.includes(r) && biome === 'forge' && rng.chance(0.5)) continue;
      if (!rng.chance(biome === 'forge' ? 0.7 : 0.85)) continue;
      const blobs = biome === 'forge' ? rng.int(1, 2) : rng.int(2, 3);
      for (let b = 0; b < blobs; b++) {
        const bx = rng.int(r.x + 1, r.x + r.w - 2), by = rng.int(r.y + 1, r.y + r.h - 2);
        const rad = biome === 'forge' ? rng.range(1, 2.2) : rng.range(1.5, 3.2);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
          if (Math.hypot(x - bx, y - by) > rad || grid[y * W + x] !== 1) continue;
          if (Math.abs(x - r.cx) < 1 && Math.abs(y - r.cy) < 1) continue;
          grid[y * W + x] = biome === 'forge' ? 3 : 4;
          (biome === 'forge' ? lava : ice).push({ x, y });
        }
      }
    }
  }
  // spike traps in corridors
  const traps = [];
  const corridorTiles = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y * W + x] === 1 && !roomOf(x, y)) corridorTiles.push({ x, y });
  for (let k = 0; k < 10 && corridorTiles.length; k++) { const t = corridorTiles.splice(rng.int(0, corridorTiles.length - 1), 1)[0]; traps.push({ ...t, phase: rng.range(0, 3) }); }

  // decorations
  const torches = [], pillars = [], props = [];
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || grid[y * W + x] === 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!solid(x, y)) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !solid(x + dx, y + dy));
    if (dirs.length === 1 && rng.chance(0.07)) torches.push({ x, y, dx: dirs[0][0], dy: dirs[0][1] });
  }
  for (const r of order) {
    if (r.w >= 9 && r.h >= 9 && r !== boss) {
      for (const [px, py] of [[r.x + 2, r.y + 2], [r.x + r.w - 3, r.y + 2], [r.x + 2, r.y + r.h - 3], [r.x + r.w - 3, r.y + r.h - 3]]) pillars.push({ x: px, y: py });
    }
    if (r !== start && r !== boss) {
      const n = rng.int(1, 4);
      for (let k = 0; k < n; k++) props.push({ kind: rng.pick(['barrel', 'crate', 'bones', 'urn']), x: rng.range(r.x + 0.6, r.x + r.w - 0.6), y: rng.chance(0.5) ? r.y + 0.6 : r.y + r.h - 0.6, rot: rng.range(0, 6.28) });
    }
  }
  return { w: W, h: H, grid, rooms: order, start: tc(start), boss: tc(boss), bossRoom: boss, spawns, torches, pillars, props, level, seed, biome, gateTiles, gateOpen: levers.length === 0, levers, leverOrder, shrines, traps, lava, ice, bossType: BOSS_ROTATION[(level - 1) % 3] };
}

export function tileAt(d, x, z) {
  const i = Math.floor(x / TILE), j = Math.floor(z / TILE);
  if (i < 0 || j < 0 || i >= d.w || j >= d.h) return 0;
  return d.grid[j * d.w + i];
}

function solidTile(d, i, j) {
  if (i < 0 || j < 0 || i >= d.w || j >= d.h) return true;
  const v = d.grid[j * d.w + i];
  return v === 0 || (v === 2 && !d.gateOpen);
}

export function isFloor(d, x, z) { return !solidTile(d, Math.floor(x / TILE), Math.floor(z / TILE)); }

// Resolve a circle (pos {x,z}) against wall tiles. Mutates pos.
export function dungeonCollide(d, pos, r) {
  const i0 = Math.floor((pos.x - r) / TILE), i1 = Math.floor((pos.x + r) / TILE);
  const j0 = Math.floor((pos.z - r) / TILE), j1 = Math.floor((pos.z + r) / TILE);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (!solidTile(d, i, j)) continue;
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

export function dungeonLOS(d, x0, z0, x1, z1) {
  const dist = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(dist / (TILE * 0.35));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!isFloor(d, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
  }
  return true;
}
