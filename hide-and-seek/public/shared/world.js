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
export const F_SPRINT = 1, F_CROUCH = 2, F_MOVE = 4, F_USE = 8, F_WIND = 16, F_JUMP = 32;

// Power-ups: what each one is called, and who can get it
export const ITEMS = [null, { name: 'Energy drink', icon: '🥤', role: 0 }, { name: 'Shadow cloak', icon: '🫥', role: 0 }, { name: 'Radar', icon: '📡', role: 1 }, { name: 'Rocket boots', icon: '🥾', role: 1 }];

// How far each kind of noise carries (metres)
export const NOISE_RANGE = { run: 22, breath: 10, taunt: 60, rock: 35, beacon: 70 };

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

export const MAPS = [
  { id: 'town', name: 'Dusk Hollow', blurb: 'A sleepy town at sunset: houses, a hedge maze, parked cars.' },
  { id: 'camp', name: 'Frostpine Camp', blurb: 'A snowy campground in daylight: cabins, tents, thick pines.' },
  { id: 'docks', name: 'Midnight Docks', blurb: 'A container yard at night: tight alleys, a warehouse, deep shadows.' },
];
const THEMES = {
  town: { sky: [[0.03, 0.04, 0.14], [0.24, 0.13, 0.36], [1, 0.48, 0.28]], glow: 0.6, fog: [0x3a2a55, 0.011], hemi: [0x8f93e0, 0x33284a, 1.25],
    sun: [0xff9a66, 2.2], disc: 0xffd9a0, stars: 0.8, hills: 0x2a2244, outer: 0x2c4a30, roof: 0x5a3a4a, exposure: 1.2 },
  camp: { sky: [[0.2, 0.42, 0.8], [0.55, 0.74, 0.96], [0.93, 0.96, 1]], glow: 0.35, fog: [0xcfe0f2, 0.009], hemi: [0xe6efff, 0x8fa0b8, 1.7],
    sun: [0xfff0d8, 2.3], disc: 0xffffff, stars: 0, hills: 0xdde6f0, outer: 0xe6edf5, roof: 0xf2f5fa, exposure: 1.0, snow: true },
  docks: { sky: [[0.01, 0.02, 0.05], [0.03, 0.06, 0.12], [0.09, 0.17, 0.24]], glow: 0.15, fog: [0x0a1420, 0.015], hemi: [0x5a7a9a, 0x141a24, 0.85],
    sun: [0x9fb8ff, 0.9], disc: 0xdfe8ff, stars: 1, hills: 0x0c121c, outer: 0x0b1824, roof: 0x2a2f3a, exposure: 1.25 },
};

const _worlds = [];
export function getWorld(i = 0) {
  i = ((i | 0) % MAPS.length + MAPS.length) % MAPS.length;
  return _worlds[i] || (_worlds[i] = [buildTown, buildCamp, buildDocks][i](i));
}

// Shared construction kit for every map. All maps keep the same centre: a plaza with the jail cage and its lever.
function kit(seed) {
  const R = mulberry(seed);
  const boxes = [], spots = [], houses = [], keepOut = [], lamps = [], beacons = [];
  const add = (x, z, w, d, h, kind, o = {}) => {
    const b = { x, z, w, d, h, kind, ...o };
    boxes.push(b);
    return b;
  };
  const spot = (kind, x, z, ex, ez) => spots.push({ id: spots.length, kind, x, z, ex: x + ex, ez: z + ez });
  const see = { see: true };

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
  const locker = (x, z, ex) => { add(x, z, 0.8, 0.8, 2, 'locker'); spot('locker', x, z, ex, 0); };

  const jail = { x: 0, z: 13, s: 5 }, lever = { x: 4, z: 13 };
  const plaza = (centre) => {
    line(-2.5, 10.5, 2.5, 10.5, 0.2, 3, 'cage', [], see);
    line(-2.5, 15.5, 2.5, 15.5, 0.2, 3, 'cage', [], see);
    line(-2.5, 10.5, -2.5, 15.5, 0.2, 3, 'cage', [], see);
    line(2.5, 10.5, 2.5, 15.5, 0.2, 3, 'cage', [], see);
    add(lever.x, lever.z, 0.4, 0.4, 1.1, 'lever', see);
    add(0, 0, 3.6, 3.6, 0.9, centre, see);
    keepOut.push([-5.5, 8, 8, 18]);
  };
  const lamp = (x, z) => { lamps.push([x, z]); add(x, z, 0.3, 0.3, 5, 'lamp', see); };

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
  // A beacon the hiders can light. Placed at the nearest open ground to the requested point.
  const beacon = (x, z) => {
    for (let r = 0; r < 12; r++) for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r;
      if (!clear(px, pz, 0.8, 0.8, 1.6)) continue;
      add(px, pz, 0.8, 0.8, 1.4, 'beacon', { see: true, bi: beacons.length });
      beacons.push({ id: beacons.length, x: px, z: pz });
      return;
    }
  };

  const finish = (i, extra = {}) => {
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
      const c = q.pop(), ix = c % GN, iz = (c / GN) | 0;
      if (ix > 0 && !blocked[c - 1] && !reach[c - 1]) { reach[c - 1] = 1; q.push(c - 1); }
      if (ix < GN - 1 && !blocked[c + 1] && !reach[c + 1]) { reach[c + 1] = 1; q.push(c + 1); }
      if (iz > 0 && !blocked[c - GN] && !reach[c - GN]) { reach[c - GN] = 1; q.push(c - GN); }
      if (iz < GN - 1 && !blocked[c + GN] && !reach[c + GN]) { reach[c + GN] = 1; q.push(c + GN); }
    }
    const list = [];
    for (let c = 0; c < GN * GN; c++) if (reach[c]) list.push(c);
    // Coins and power-up boxes on reachable ground, spread out
    const sprinkle = (n, gap, minR, avoid = []) => {
      const out = [];
      let tries = 0;
      while (out.length < n && tries++ < 8000) {
        const c = list[(R() * list.length) | 0];
        const x = -HALF + ((c % GN) + 0.5) * CELL, z = -HALF + (((c / GN) | 0) + 0.5) * CELL;
        if (Math.hypot(x, z) < minR) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap) || avoid.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
        out.push({ id: out.length, x, z });
      }
      return out;
    };
    const coins = sprinkle(30, 7, 7);
    const items = sprinkle(6, 20, 12, coins);
    return {
      i, id: MAPS[i].id, name: MAPS[i].name, theme: THEMES[MAPS[i].id],
      boxes, spots, coins, items, beacons, houses, lamps, jail, lever,
      los: boxes.filter((b) => !b.see && b.h >= 1.6),
      nav: { blocked, reach, list },
      seekerSpawn: [0, -5], ...extra,
    };
  };
  return { R, add, spot, line, house, locker, plaza, lamp, clear, scatter, beacon, finish, keepOut, see };
}

function buildTown(i) {
  const K = kit(20241), { R, add, spot, line, house, locker, scatter, see } = K;
  const inner = { color: 0xcfc4b0, inner: true };

  // House 1 (north-west)
  house(-30, -28, 14, 10, 3.2, 0xd9a273, { S: [3], E: [0] });
  line(-32, -33, -32, -23, 0.25, 3.2, 'hwall', [[-26, 1.8]], inner);
  add(-35.3, -30.5, 1.4, 2.2, 0.6, 'bed');
  add(-27, -30.5, 1.8, 1.1, 0.8, 'table');
  add(-24, -31.6, 1, 2.2, 0.7, 'sofa');
  locker(-36.3, -24, 1.3);

  // House 2 (north-east)
  house(30, -28, 12, 12, 3.2, 0x8fb0c9, { S: [-2], W: [2] });
  line(24, -29, 36, -29, 0.25, 3.2, 'hwall', [[33, 1.8]], inner);
  add(26, -32, 2.2, 1.4, 0.6, 'bed');
  add(31.5, -25, 1.8, 1.1, 0.8, 'table');
  add(35.4, -25, 0.6, 2.4, 2, 'shelf');
  locker(35.3, -33.3, -1.3);

  // House 3 (south-west)
  house(-30, 28, 12, 12, 3.2, 0xc98f9b, { N: [2], E: [-2] });
  line(-30, 22, -30, 34, 0.25, 3.2, 'hwall', [[31, 1.8]], inner);
  add(-34.5, 24.5, 1.4, 2.2, 0.6, 'bed');
  add(-26.5, 31, 1.1, 1.8, 0.8, 'table');
  locker(-35.3, 33.3, 1.3);

  // House 4 (south-east)
  house(30, 28, 16, 10, 3.2, 0xa9c48a, { N: [-4], W: [0] });
  line(33, 23, 33, 33, 0.25, 3.2, 'hwall', [[26, 1.8]], inner);
  add(36.5, 29.5, 1.4, 2.2, 0.6, 'bed');
  add(28, 30.5, 1.8, 1.1, 0.8, 'table');
  add(32.4, 31, 0.6, 2.4, 2, 'shelf');
  locker(37.3, 32.3, -1.3);

  // Warehouse (north)
  house(0, -36, 22, 12, 4.5, 0x8a8f9c, { S: [-6, 6] }, 3);
  for (const [x, z, h] of [[-8, -40, 2.6], [-6.6, -40, 1.3], [-2, -37, 2.6], [0, -39.5, 1.3], [1.35, -39.5, 2.6],
    [5, -36, 1.3], [8.5, -40.5, 2.6], [8.6, -32.5, 1.3], [-9.5, -34, 1.3], [2.5, -33.5, 2.6]]) add(x, z, 1.3, 1.3, h, 'crate');
  locker(10.3, -36.5, -1.3);

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
      const j = r * cols + c;
      if (c < cols - 1 && !openE[j]) add(x0 + (c + 1) * cw, z0 + (r + 0.5) * cw, t, cw + t, hh, 'hedge');
      if (r < rows - 1 && !openS[j]) add(x0 + (c + 0.5) * cw, z0 + (r + 1) * cw, cw + t, t, hh, 'hedge');
    }
    K.keepOut.push([x0 - 2, z0 - 3, xe + 3, ze + 2.5]);
  }

  K.plaza('fountain');
  const carColors = [0xd94f4f, 0x4f8fd9, 0xe0b23a, 0x6fbf73];
  [[-18, 4.9], [16, -4.9], [-40, -4.9], [38, 4.9]].forEach(([x, z], n) => add(x, z, 4.4, 1.9, 1.5, 'car', { color: carColors[n], see: true }));
  for (const [x, z] of [[-12, 6], [12, -6], [-28, -6], [28, 6], [-6, -20], [6, 20], [-44, 6], [44, -6]]) K.lamp(x, z);
  K.beacon(-44, 14); K.beacon(44, -14); K.beacon(16, 45);

  K.keepOut.push([-HALF, -3.6, HALF, 3.6], [-3.6, -29, 3.6, 29]);
  scatter(9, 1.6, 1.6, 2, (x, z) => spot('bush', x, z, 0, 0));
  scatter(46, 0.7, 0.7, 1.5, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() }));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.4 ? 2.6 : 1.3, 'crate'));
  scatter(7, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(8, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(8, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(5, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', { see: true }));
  return K.finish(i, { maze: MZ });
}

function buildCamp(i) {
  const K = kit(7771), { R, add, spot, house, locker, scatter, see } = K;
  const logs = 0x8a5a3a;
  // Four cabins and the main lodge
  house(-32, -30, 10, 8, 3, logs, { S: [0] });
  add(-35.6, -32.6, 1.4, 2.2, 0.6, 'bed'); add(-29, -32.8, 1.8, 1.1, 0.8, 'table'); locker(-28, -27, -1.3);
  house(31, -31, 10, 8, 3, 0x7a4f34, { S: [-2], W: [1] });
  add(34.6, -33.6, 1.4, 2.2, 0.6, 'bed'); add(30, -33.8, 1.8, 1.1, 0.8, 'table'); locker(35.2, -28, -1.3);
  house(-31, 30, 10, 10, 3, 0x7a4f34, { N: [0], E: [2] });
  add(-34.6, 33.2, 1.4, 2.2, 0.6, 'bed'); add(-28.5, 33.5, 1.8, 1.1, 0.8, 'table'); locker(-35.2, 26.2, 1.3);
  house(32, 29, 12, 8, 3, logs, { N: [2], W: [0] });
  add(36.4, 31.2, 1.4, 2.2, 0.6, 'bed'); add(31, 31.6, 1.8, 1.1, 0.8, 'table'); locker(37.2, 26, -1.3);
  house(0, -38, 18, 10, 4.2, 0x9a6a44, { S: [-5, 5] }, 2.4);
  for (const x of [-5, 0, 5]) add(x, -39.5, 2.6, 1.1, 0.8, 'table');
  add(-8.2, -41.8, 0.6, 2.2, 2, 'shelf'); locker(8.2, -36, -1.3);

  K.plaza('campfire');
  // Benches around the fire, lamps along the trails
  for (const [x, z, w, d] of [[-8.6, -3, 0.6, 2], [8.6, -3, 0.6, 2], [0, -9, 2, 0.6]]) add(x, z, w, d, 0.5, 'bench', see);
  for (const [x, z] of [[-14, -10], [14, -10], [-14, 12], [16, 14], [-36, 2], [38, 0]]) K.lamp(x, z);
  K.keepOut.push([13, -9, 37, 11]); // the frozen pond stays open
  K.beacon(-44, -4); K.beacon(42, -16); K.beacon(6, 44);

  scatter(6, 3, 3, 2, (x, z) => spot('tent', x, z, 0, 0));
  scatter(8, 1.6, 1.6, 2, (x, z) => spot('snowdrift', x, z, 0, 0));
  scatter(75, 0.7, 0.7, 1.4, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() * 0.54 }));
  scatter(10, 2.4, 2.4, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 2.4, 1, 1.0, 'logs', see) : add(x, z, 1, 2.4, 1.0, 'logs', see)));
  scatter(9, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(6, 0.9, 0.9, 1.2, (x, z) => add(x, z, 0.9, 0.9, 1.7, 'snowman', { v: R(), see: true }));
  scatter(6, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.3 ? 2.6 : 1.3, 'crate'));
  scatter(5, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i, { pond: [25, 1, 11, 9] });
}

function buildDocks(i) {
  const K = kit(424242), { R, add, spot, line, house, locker, scatter, see } = K;
  const paint = [0xc94f3d, 0x3d7fc9, 0xd9a52e, 0x4f9a5f, 0x8a5fc9, 0xd97a2e, 0x7d8894, 0x2e9aa0];
  // Warehouse (north) and the harbour office (south)
  house(0, -38, 24, 12, 5, 0x6f7785, { S: [-7, 7] }, 3);
  for (const [x, z, h] of [[-9.5, -42, 2.6], [-8.1, -42, 1.3], [-3, -39, 2.6], [1, -41.5, 1.3], [2.4, -41.5, 2.6], [9.5, -40, 2.6], [5, -35.5, 1.3], [-6, -34.5, 1.3]]) add(x, z, 1.3, 1.3, h, 'crate');
  add(0, -36, 0.6, 3.4, 2.2, 'shelf');
  locker(11.2, -35.5, -1.3); locker(-11.2, -38, 1.3);
  house(0, 39.5, 12, 7, 3.2, 0x8c8f7a, { N: [3], W: [0] });
  add(-2.5, 41.5, 1.8, 1.1, 0.8, 'table'); locker(5.2, 41.8, -1.3);

  // Container stacks on a loose grid, leaving alleys between them and the two main roads clear
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    const cx = sx * (12.5 + a * 9), cz = sz * (12.5 + b * 9);
    if (R() < 0.24) continue;
    if (Math.abs(cx) < 16 && cz < -26) continue; // warehouse apron
    if (Math.abs(cx) < 10 && cz > 30) continue; // office yard
    const along = R() < 0.5, jx = (R() - 0.5) * 1.4, jz = (R() - 0.5) * 1.4;
    add(cx + jx, cz + jz, along ? 6 : 2.5, along ? 2.5 : 6, R() < 0.35 ? 5.2 : 2.6, 'container', { color: paint[(R() * paint.length) | 0], color2: paint[(R() * paint.length) | 0] });
  }

  K.plaza('tower');
  for (const [x, z, ex] of [[-7, -21, 1.4], [7, 23, -1.4], [-22, 6.6, 1.4], [25, -6.6, -1.4]]) {
    add(x, z, 1.2, 2.2, 1.3, 'dumpster');
    spot('dumpster', x, z, ex, 0);
  }
  [[-16, 5.4], [18, -5.4], [-5.4, -26], [5.4, 28]].forEach(([x, z], n) => (n < 2 ? add(x, z, 4.4, 1.9, 1.5, 'car', { color: 0xe0b23a, see: true }) : add(x, z, 1.9, 4.4, 1.5, 'car', { color: 0xe0b23a, see: true, turn: true })));
  for (const [x, z] of [[-8, -8], [8, 8], [-8, 26], [8, -24], [-30, 8], [30, -8], [-44, -8], [44, 8]]) K.lamp(x, z);
  K.beacon(-46, 0); K.beacon(46, 0); K.beacon(18, 46);

  // Open containers you can climb into
  scatter(6, 4.4, 2.6, 1.1, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'hidebox', { color: paint[(R() * paint.length) | 0] }); spot('container', x - 0.6, z, 1.95, 0); });
  scatter(16, 1.3, 1.3, 1.1, (x, z) => add(x, z, 1.3, 1.3, R() < 0.45 ? 2.6 : 1.3, 'crate'));
  scatter(14, 0.8, 0.8, 1.1, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(5, 6, 6, 1.1, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i);
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
