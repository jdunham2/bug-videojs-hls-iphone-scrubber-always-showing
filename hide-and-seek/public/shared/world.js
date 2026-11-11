// Shared world definition: used by the server (bots, validation) and the client (rendering, collision).
// Everything is generated deterministically so both sides agree without sending the map.

export const HALF = 50; // world spans -HALF..HALF on x and z
export const PR = 0.4; // player collision radius
export const CELL = 0.5; // nav grid cell size
export const GN = (HALF * 2) / CELL; // nav grid cells per side

export const SPEED = {
  hider: { walk: 4.2, sprint: 7.0 },
  seeker: { walk: 4.4, sprint: 7.4 },
  crouch: 2.0,
  winded: 3.0,
};
export const STAM = { drain: 22, regenMove: 12, regenIdle: 20, windedFor: 3.5 };

// Player state flags sent over the wire
export const F_SPRINT = 1, F_CROUCH = 2, F_MOVE = 4, F_USE = 8, F_WIND = 16;

// How far each kind of noise carries (metres)
export const NOISE_RANGE = { run: 22, breath: 10, taunt: 60, rock: 35 };

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _world = null;
export function getWorld() {
  return _world || (_world = buildWorld());
}

function buildWorld() {
  const R = mulberry(20241);
  const boxes = [], spots = [], coins = [], houses = [], keepOut = [];
  const add = (x, z, w, d, h, kind, o = {}) => {
    const b = { x, z, w, d, h, kind, ...o };
    boxes.push(b);
    return b;
  };
  const spot = (kind, x, z, ex, ez) => spots.push({ id: spots.length, kind, x, z, ex: x + ex, ez: z + ez });

  // Perimeter
  add(0, -HALF - 0.5, HALF * 2 + 2, 1, 4, 'wall');
  add(0, HALF + 0.5, HALF * 2 + 2, 1, 4, 'wall');
  add(-HALF - 0.5, 0, 1, HALF * 2 + 2, 4, 'wall');
  add(HALF + 0.5, 0, 1, HALF * 2 + 2, 4, 'wall');

  // Axis-aligned wall from (x1,z1) to (x2,z2) with gaps [[centre, width], ...] along its axis
  const line = (x1, z1, x2, z2, t, h, kind, gaps = [], o = {}) => {
    const horiz = z1 === z2;
    const a = horiz ? Math.min(x1, x2) : Math.min(z1, z2);
    const b = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
    const gs = gaps.map((g) => [g[0] - g[1] / 2, g[0] + g[1] / 2]).sort((p, q) => p[0] - q[0]);
    let s = a;
    const segs = [];
    for (const [g0, g1] of gs) {
      if (g0 > s) segs.push([s, g0]);
      s = Math.max(s, g1);
    }
    if (b > s) segs.push([s, b]);
    for (const [p, q] of segs) {
      const c = (p + q) / 2, len = q - p;
      if (len < 0.05) continue;
      if (horiz) add(c, z1, len, t, h, kind, o);
      else add(x1, c, t, len, h, kind, o);
    }
  };

  const house = (cx, cz, w, d, h, color, doors, dw = 2) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.3;
    const o = { color };
    line(x0, z0, x1, z0, t, h, 'hwall', (doors.N || []).map((v) => [cx + v, dw]), o);
    line(x0, z1, x1, z1, t, h, 'hwall', (doors.S || []).map((v) => [cx + v, dw]), o);
    line(x0, z0, x0, z1, t, h, 'hwall', (doors.W || []).map((v) => [cz + v, dw]), o);
    line(x1, z0, x1, z1, t, h, 'hwall', (doors.E || []).map((v) => [cz + v, dw]), o);
    houses.push({ x: cx, z: cz, w, d, h, color });
    keepOut.push([x0 - 2.5, z0 - 2.5, x1 + 2.5, z1 + 2.5]);
  };
  const inner = { color: 0xcfc4b0, inner: true };

  // House 1 (north-west)
  house(-30, -28, 14, 10, 3.2, 0xd9a273, { S: [3], E: [0] });
  line(-32, -33, -32, -23, 0.25, 3.2, 'hwall', [[-26, 1.8]], inner);
  add(-35.3, -30.5, 1.4, 2.2, 0.6, 'bed');
  add(-27, -30.5, 1.8, 1.1, 0.8, 'table');
  add(-24, -31.6, 1, 2.2, 0.7, 'sofa');
  add(-36.3, -24, 0.8, 0.8, 2, 'locker');
  spot('locker', -36.3, -24, 1.3, 0);

  // House 2 (north-east)
  house(30, -28, 12, 12, 3.2, 0x8fb0c9, { S: [-2], W: [2] });
  line(24, -29, 36, -29, 0.25, 3.2, 'hwall', [[33, 1.8]], inner);
  add(26, -32, 2.2, 1.4, 0.6, 'bed');
  add(31.5, -25, 1.8, 1.1, 0.8, 'table');
  add(35.4, -25, 0.6, 2.4, 2, 'shelf');
  add(35.3, -33.3, 0.8, 0.8, 2, 'locker');
  spot('locker', 35.3, -33.3, -1.3, 0);

  // House 3 (south-west)
  house(-30, 28, 12, 12, 3.2, 0xc98f9b, { N: [2], E: [-2] });
  line(-30, 22, -30, 34, 0.25, 3.2, 'hwall', [[31, 1.8]], inner);
  add(-34.5, 24.5, 1.4, 2.2, 0.6, 'bed');
  add(-26.5, 31, 1.1, 1.8, 0.8, 'table');
  add(-35.3, 33.3, 0.8, 0.8, 2, 'locker');
  spot('locker', -35.3, 33.3, 1.3, 0);

  // House 4 (south-east)
  house(30, 28, 16, 10, 3.2, 0xa9c48a, { N: [-4], W: [0] });
  line(33, 23, 33, 33, 0.25, 3.2, 'hwall', [[26, 1.8]], inner);
  add(36.5, 29.5, 1.4, 2.2, 0.6, 'bed');
  add(28, 30.5, 1.8, 1.1, 0.8, 'table');
  add(32.4, 31, 0.6, 2.4, 2, 'shelf');
  add(37.3, 32.3, 0.8, 0.8, 2, 'locker');
  spot('locker', 37.3, 32.3, -1.3, 0);

  // Warehouse (north)
  house(0, -36, 22, 12, 4.5, 0x8a8f9c, { S: [-6, 6] }, 3);
  for (const [x, z, h] of [[-8, -40, 2.6], [-6.6, -40, 1.3], [-2, -37, 2.6], [0, -39.5, 1.3], [1.35, -39.5, 2.6],
    [5, -36, 1.3], [8.5, -40.5, 2.6], [8.6, -32.5, 1.3], [-9.5, -34, 1.3], [2.5, -33.5, 2.6]]) add(x, z, 1.3, 1.3, h, 'crate');
  add(10.3, -36.5, 0.8, 0.8, 2, 'locker');
  spot('locker', 10.3, -36.5, -1.3, 0);

  // Dumpsters beside the houses
  for (const [x, z, ex] of [[-21.5, -31, 1.4], [22.5, -33, -1.4], [-22.5, 33, 1.4], [20.5, 32, -1.4]]) {
    add(x, z, 1.2, 2.2, 1.3, 'dumpster');
    spot('dumpster', x, z, ex, 0);
  }

  // Hedge maze (south)
  const MZ = { x0: -10, z0: 30, cw: 4, cols: 5, rows: 3 };
  {
    const { x0, z0, cw, cols, rows } = MZ, t = 0.6, hh = 2.3;
    const seen = new Uint8Array(cols * rows), openE = new Uint8Array(cols * rows), openS = new Uint8Array(cols * rows);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1], c = cur % cols, r = (cur / cols) | 0;
      const nb = [];
      if (c > 0 && !seen[cur - 1]) nb.push(cur - 1);
      if (c < cols - 1 && !seen[cur + 1]) nb.push(cur + 1);
      if (r > 0 && !seen[cur - cols]) nb.push(cur - cols);
      if (r < rows - 1 && !seen[cur + cols]) nb.push(cur + cols);
      if (!nb.length) { stack.pop(); continue; }
      const n = nb[(R() * nb.length) | 0];
      if (n === cur + 1) openE[cur] = 1;
      else if (n === cur - 1) openE[n] = 1;
      else if (n === cur + cols) openS[cur] = 1;
      else openS[n] = 1;
      seen[n] = 1;
      stack.push(n);
    }
    const xe = x0 + cols * cw, ze = z0 + rows * cw;
    line(x0, z0, xe, z0, t, hh, 'hedge', [[0, 2.4]]);
    line(x0, ze, xe, ze, t, hh, 'hedge', [[-8, 2.4]]);
    line(x0, z0, x0, ze, t, hh, 'hedge');
    line(xe, z0, xe, ze, t, hh, 'hedge', [[36, 2.4]]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c < cols - 1 && !openE[i]) add(x0 + (c + 1) * cw, z0 + (r + 0.5) * cw, t, cw + t, hh, 'hedge');
      if (r < rows - 1 && !openS[i]) add(x0 + (c + 0.5) * cw, z0 + (r + 1) * cw, cw + t, t, hh, 'hedge');
    }
    keepOut.push([x0 - 2, z0 - 3, xe + 3, ze + 2.5]);
  }

  // Jail cage + rescue lever, fountain
  const jail = { x: 0, z: 13, s: 5 };
  const see = { see: true };
  line(-2.5, 10.5, 2.5, 10.5, 0.2, 3, 'cage', [], see);
  line(-2.5, 15.5, 2.5, 15.5, 0.2, 3, 'cage', [], see);
  line(-2.5, 10.5, -2.5, 15.5, 0.2, 3, 'cage', [], see);
  line(2.5, 10.5, 2.5, 15.5, 0.2, 3, 'cage', [], see);
  const lever = { x: 4, z: 13 };
  add(lever.x, lever.z, 0.4, 0.4, 1.1, 'lever', see);
  add(0, 0, 3.6, 3.6, 0.9, 'fountain', see);

  // Parked cars and street lamps
  const carColors = [0xd94f4f, 0x4f8fd9, 0xe0b23a, 0x6fbf73];
  [[-18, 4.9], [16, -4.9], [-40, -4.9], [38, 4.9]].forEach(([x, z], i) => add(x, z, 4.4, 1.9, 1.5, 'car', { color: carColors[i], see: true }));
  const lamps = [[-12, 6], [12, -6], [-28, -6], [28, 6], [-6, -20], [6, 20], [-44, 6], [44, -6]];
  for (const [x, z] of lamps) add(x, z, 0.3, 0.3, 5, 'lamp', see);

  // Scatter outdoor props
  keepOut.push([-HALF, -3.6, HALF, 3.6], [-3.6, -29, 3.6, 29], [-5.5, 8, 8, 18]);
  const clear = (x, z, w, d, m) => {
    if (Math.abs(x) > HALF - 2 - w / 2 || Math.abs(z) > HALF - 2 - d / 2) return false;
    if (Math.hypot(x, z) < 10) return false;
    for (const k of keepOut) if (x > k[0] - w / 2 && x < k[2] + w / 2 && z > k[1] - d / 2 && z < k[3] + d / 2) return false;
    for (const b of boxes) if (Math.abs(x - b.x) < (w + b.w) / 2 + m && Math.abs(z - b.z) < (d + b.d) / 2 + m) return false;
    for (const s of spots) if (Math.abs(x - s.x) < w / 2 + 1.6 + m && Math.abs(z - s.z) < d / 2 + 1.6 + m) return false;
    return true;
  };
  const scatter = (n, w, d, m, fn) => {
    let k = 0, tries = 0;
    while (k < n && tries++ < 6000) {
      const x = (R() * 2 - 1) * (HALF - 3), z = (R() * 2 - 1) * (HALF - 3);
      if (clear(x, z, w, d, m)) { fn(x, z); k++; }
    }
  };
  scatter(9, 1.6, 1.6, 2, (x, z) => spot('bush', x, z, 0, 0));
  scatter(46, 0.7, 0.7, 1.5, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() }));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.4 ? 2.6 : 1.3, 'crate'));
  scatter(7, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(8, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(8, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(5, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', { see: true }));

  // Navigation grid: a cell is blocked if a player-sized circle at its centre would touch a box
  const blocked = new Uint8Array(GN * GN);
  const m = PR + 0.03;
  for (const b of boxes) {
    const ix0 = Math.max(0, Math.ceil((b.x - b.w / 2 - m + HALF) / CELL - 0.5));
    const ix1 = Math.min(GN - 1, Math.floor((b.x + b.w / 2 + m + HALF) / CELL - 0.5));
    const iz0 = Math.max(0, Math.ceil((b.z - b.d / 2 - m + HALF) / CELL - 0.5));
    const iz1 = Math.min(GN - 1, Math.floor((b.z + b.d / 2 + m + HALF) / CELL - 0.5));
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) blocked[iz * GN + ix] = 1;
  }
  // Flood fill from the plaza to find everything a player can actually reach
  const reach = new Uint8Array(GN * GN);
  const start = cellIdx(0, -5);
  const q = [start];
  reach[start] = 1;
  while (q.length) {
    const i = q.pop(), ix = i % GN, iz = (i / GN) | 0;
    if (ix > 0 && !blocked[i - 1] && !reach[i - 1]) { reach[i - 1] = 1; q.push(i - 1); }
    if (ix < GN - 1 && !blocked[i + 1] && !reach[i + 1]) { reach[i + 1] = 1; q.push(i + 1); }
    if (iz > 0 && !blocked[i - GN] && !reach[i - GN]) { reach[i - GN] = 1; q.push(i - GN); }
    if (iz < GN - 1 && !blocked[i + GN] && !reach[i + GN]) { reach[i + GN] = 1; q.push(i + GN); }
  }
  const list = [];
  for (let i = 0; i < GN * GN; i++) if (reach[i]) list.push(i);

  // Coins on reachable ground, spread out
  let tries = 0;
  while (coins.length < 30 && tries++ < 5000) {
    const i = list[(R() * list.length) | 0];
    const x = -HALF + ((i % GN) + 0.5) * CELL, z = -HALF + (((i / GN) | 0) + 0.5) * CELL;
    if (Math.hypot(x, z) < 7) continue;
    if (coins.some((c) => Math.hypot(c.x - x, c.z - z) < 7)) continue;
    coins.push({ id: coins.length, x, z });
  }

  return {
    boxes, spots, coins, houses, lamps, jail, lever, maze: MZ,
    los: boxes.filter((b) => !b.see && b.h >= 1.6),
    nav: { blocked, reach, list },
    seekerSpawn: [0, -5],
  };
}

export function cellIdx(x, z) {
  const ix = Math.max(0, Math.min(GN - 1, Math.floor((x + HALF) / CELL)));
  const iz = Math.max(0, Math.min(GN - 1, Math.floor((z + HALF) / CELL)));
  return iz * GN + ix;
}
const cellX = (i) => -HALF + ((i % GN) + 0.5) * CELL;
const cellZ = (i) => -HALF + (((i / GN) | 0) + 0.5) * CELL;

// Push a circle out of all boxes. Returns [x, z].
export function collide(W, x, z, r = PR) {
  for (let it = 0; it < 3; it++) {
    let hit = false;
    for (const b of W.boxes) {
      const hx = b.w / 2, hz = b.d / 2, dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) > hx + r || Math.abs(dz) > hz + r) continue;
      const cx = Math.max(-hx, Math.min(hx, dx)), cz = Math.max(-hz, Math.min(hz, dz));
      const ox = dx - cx, oz = dz - cz, d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x += (ox / d) * (r - d);
        z += (oz / d) * (r - d);
      } else {
        const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
        if (px < pz) x += (dx < 0 ? -1 : 1) * (px + r);
        else z += (dz < 0 ? -1 : 1) * (pz + r);
      }
    }
    if (!hit) break;
  }
  return [x, z];
}

// True if nothing tall blocks the straight line between two points.
export function hasLOS(W, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const b of W.los) {
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (Math.abs(x1 - b.x) > b.w / 2) ok = false;
    } else {
      let a = (b.x - b.w / 2 - x1) / dx, c = (b.x + b.w / 2 - x1) / dx;
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) ok = false;
    }
    if (!ok) continue;
    if (Math.abs(dz) < 1e-9) {
      if (Math.abs(z1 - b.z) > b.d / 2) ok = false;
    } else {
      let a = (b.z - b.d / 2 - z1) / dz, c = (b.z + b.d / 2 - z1) / dz;
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) ok = false;
    }
    if (ok) return false;
  }
  return true;
}

function nearFree(W, x, z) {
  const { reach } = W.nav;
  const c = cellIdx(x, z);
  if (reach[c]) return c;
  const cx = c % GN, cz = (c / GN) | 0;
  let best = -1, bd = 1e9;
  for (let r = 1; r <= 10 && best < 0; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) continue;
      const i = iz * GN + ix;
      if (!reach[i]) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return best;
}

export function walkable(W, x1, z1, x2, z2) {
  const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 0.25);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (W.nav.blocked[cellIdx(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)]) return false;
  }
  return true;
}

export function randomPoint(W, rnd = Math.random) {
  const i = W.nav.list[(rnd() * W.nav.list.length) | 0];
  return [cellX(i), cellZ(i)];
}

// A* over the nav grid. Returns [[x,z], ...] or null.
const _g = new Float32Array(GN * GN), _from = new Int32Array(GN * GN), _closed = new Uint8Array(GN * GN);
export function findPath(W, sx, sz, tx, tz) {
  const { blocked } = W.nav;
  const s = nearFree(W, sx, sz), t = nearFree(W, tx, tz);
  if (s < 0 || t < 0) return null;
  if (s === t) return [[cellX(t), cellZ(t)]];
  _g.fill(Infinity); _from.fill(-1); _closed.fill(0);
  const tx_ = t % GN, tz_ = (t / GN) | 0;
  const hf = [], hi = [];
  const push = (f, i) => {
    let n = hf.length;
    hf.push(f); hi.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hf[p] <= f) break;
      hf[n] = hf[p]; hi[n] = hi[p];
      n = p;
    }
    hf[n] = f; hi[n] = i;
  };
  const pop = () => {
    const top = hi[0], lf = hf.pop(), li = hi.pop(), len = hf.length;
    if (len) {
      let n = 0;
      for (;;) {
        let c = n * 2 + 1;
        if (c >= len) break;
        if (c + 1 < len && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hf[n] = hf[c]; hi[n] = hi[c];
        n = c;
      }
      hf[n] = lf; hi[n] = li;
    }
    return top;
  };
  const heur = (i) => {
    const dx = Math.abs((i % GN) - tx_), dz = Math.abs(((i / GN) | 0) - tz_);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  _g[s] = 0;
  push(heur(s), s);
  while (hf.length) {
    const cur = pop();
    if (cur === t) break;
    if (_closed[cur]) continue;
    _closed[cur] = 1;
    const cx = cur % GN, cz = (cur / GN) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue;
      const n = nz * GN + nx;
      if (blocked[n] || _closed[n]) continue;
      if (dx && dz && (blocked[cz * GN + nx] || blocked[nz * GN + cx])) continue;
      const g = _g[cur] + (dx && dz ? 1.4142 : 1);
      if (g < _g[n]) { _g[n] = g; _from[n] = cur; push(g + heur(n), n); }
    }
  }
  if (_from[t] < 0) return null;
  const path = [];
  for (let i = t; i !== s && i >= 0; i = _from[i]) path.push([cellX(i), cellZ(i)]);
  path.reverse();
  return path;
}
