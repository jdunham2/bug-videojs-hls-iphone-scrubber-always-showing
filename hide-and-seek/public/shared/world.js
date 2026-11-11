// Shared world definition: used by the server (bots, validation) and the client (rendering, collision).
// Everything is generated deterministically so both sides agree without sending the map.

export const HALF = 75; // world spans -HALF..HALF on x and z
export const FLOOR_H = 3.4; // height of one storey
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
// What a player can look like. Indexes into these lists travel over the wire as [character, colour, hat, pattern].
export const LOOKS = {
  chars: ['Blob', 'Robot', 'Cat', 'Bear', 'Penguin', 'Ghost', 'Frog', 'Alien'],
  hats: ['No hat', 'Beanie', 'Cap', 'Top hat', 'Crown', 'Party hat', 'Headphones', 'Halo'],
  pats: ['Plain', 'Stripes', 'Dots', 'Two-tone'],
  colors: 16,
};
export function cleanLook(l) {
  const v = (x, n) => (Number.isInteger(x) && x >= 0 && x < n ? x : (Math.random() * n) | 0);
  l = Array.isArray(l) ? l : [];
  return [v(l[0], LOOKS.chars.length), v(l[1], LOOKS.colors), v(l[2], LOOKS.hats.length), v(l[3], LOOKS.pats.length)];
}

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
// Boxes, spots and coins carry a level: 0 is the ground, 1 is the upstairs floor of a two-storey house.
function kit(seed) {
  const R = mulberry(seed);
  const boxes = [], spots = [], houses = [], keepOut = [], lamps = [], beacons = [], stairs = [], upper = [], extraCoins = [];
  const add = (x, z, w, d, h, kind, o = {}) => {
    const b = { x, z, w, d, h, kind, ...o };
    boxes.push(b);
    return b;
  };
  const spot = (kind, x, z, ex, ez, lv = 0) => spots.push({ id: spots.length, kind, x, z, ex: x + ex, ez: z + ez, lv });
  const see = { see: true };
  const up = { lv: 1 };

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

  const walls = (cx, cz, w, d, h, doors, dw, o) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.3;
    line(x0, z0, x1, z0, t, h, 'hwall', (doors.N || []).map((v) => [cx + v, dw]), o);
    line(x0, z1, x1, z1, t, h, 'hwall', (doors.S || []).map((v) => [cx + v, dw]), o);
    line(x0, z0, x0, z1, t, h, 'hwall', (doors.W || []).map((v) => [cz + v, dw]), o);
    line(x1, z0, x1, z1, t, h, 'hwall', (doors.E || []).map((v) => [cz + v, dw]), o);
    keepOut.push([x0 - 2.5, z0 - 2.5, x1 + 2.5, z1 + 2.5]);
  };
  const locker = (x, z, ex, lv = 0) => { add(x, z, 0.8, 0.8, 2, 'locker', { lv }); spot('locker', x, z, ex, 0, lv); };

  // An empty single-storey building
  const house = (cx, cz, w, d, h, color, doors, dw = 2) => {
    walls(cx, cz, w, d, h, doors, dw, { color });
    houses.push({ x: cx, z: cz, w, d, h, color, floors: 1 });
  };
  // A furnished single-storey home: bed in the north-west corner, locker in the north-east, table by the south wall.
  // Keep doors away from those (no W door north of centre, no S door east of centre).
  const home = (cx, cz, w, d, color, doors) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    house(cx, cz, w, d, 3.2, color, doors);
    add(x0 + 1.2, z0 + 1.6, 1.4, 2.2, 0.6, 'bed');
    add(cx + 1.4, z1 - 1.3, 1.8, 1.1, 0.8, 'table');
    locker(x1 - 0.75, z0 + 0.75, -1.3);
  };
  // A two-storey house. The staircase runs along the inside of the north wall, climbing from west to east,
  // so keep doors off the north wall and put east/west doors at the centre. Upstairs has no doors: the only way up or down is the stairs.
  const manor = (cx, cz, w, d, color, doors) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, H = FLOOR_H;
    walls(cx, cz, w, d, H, doors, 2, { color });
    walls(cx, cz, w, d, H, {}, 2, { color, lv: 1 });
    const st = { xa: x0 + 2.5, xb: x0 + 7.5, x0: x0 + 2.5, x1: x0 + 7.5, z0: z0 + 0.3, z1: z0 + 2.3 };
    stairs.push(st);
    upper.push([x0, z0, x1, z1]);
    houses.push({ x: cx, z: cz, w, d, h: H * 2, color, floors: 2, stair: st });
    // Downstairs the staircase is a solid block you can only walk onto from its low end
    add((st.x0 + st.x1) / 2, st.z1, 5, 0.12, H, 'stairside');
    add(st.xb, (st.z0 + st.z1) / 2, 0.12, 2, H, 'stairside');
    // Upstairs it is a hole in the floor with a railing, open at its high end
    add((st.x0 + st.x1) / 2, st.z1, 5, 0.12, 1, 'rail', { lv: 1, see: true });
    add(st.xa, (st.z0 + st.z1) / 2, 0.12, 2, 1, 'rail', { lv: 1, see: true });
    // Ground floor
    add(cx + 3.5, cz + 1, 1.8, 1.1, 0.8, 'table');
    add(x0 + 0.9, z1 - 1.6, 1, 2.2, 0.7, 'sofa', { flip: true });
    add(x1 - 0.6, z1 - 1.8, 0.6, 2.4, 2, 'shelf');
    locker(x1 - 0.75, z0 + 0.75, -1.3);
    // Upstairs
    add(x1 - 1.2, z1 - 1.6, 1.4, 2.2, 0.6, 'bed', up);
    add(cx + 1, z1 - 1.2, 1.8, 1.1, 0.8, 'table', up);
    add(x1 - 0.6, z0 + 2.2, 0.6, 2.4, 2, 'shelf', up);
    locker(x0 + 0.75, z1 - 0.75, 1.3, 1);
    extraCoins.push({ x: cx - 1.5, z: cz + 1.5, lv: 1 }, { x: x1 - 2.5, z: cz - 0.5, lv: 1 });
  };

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
  const dumpster = (x, z, ex) => { add(x, z, 1.2, 2.2, 1.3, 'dumpster'); spot('dumpster', x, z, ex, 0); };

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
    while (k < n && tries++ < 12000) {
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
    const N = GN * GN, m = PR + 0.03;
    const bl = [boxes.filter((b) => !b.lv), boxes.filter((b) => b.lv === 1)];
    // Navigation grids, one per level: a cell is blocked if a player-sized circle at its centre would touch a box
    const blocked = [new Uint8Array(N), new Uint8Array(N).fill(1)];
    const cells = (x0, z0, x1, z1, fn) => {
      const ix0 = Math.max(0, Math.ceil((x0 + HALF) / CELL - 0.5)), ix1 = Math.min(GN - 1, Math.floor((x1 + HALF) / CELL - 0.5));
      const iz0 = Math.max(0, Math.ceil((z0 + HALF) / CELL - 0.5)), iz1 = Math.min(GN - 1, Math.floor((z1 + HALF) / CELL - 0.5));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) fn(iz * GN + ix, -HALF + (ix + 0.5) * CELL);
    };
    for (const u of upper) cells(u[0], u[1], u[2], u[3], (c) => { blocked[1][c] = 0; });
    for (let lv = 0; lv < 2; lv++) for (const b of bl[lv]) cells(b.x - b.w / 2 - m, b.z - b.d / 2 - m, b.x + b.w / 2 + m, b.z + b.d / 2 + m, (c) => { blocked[lv][c] = 1; });
    // Stairs: the low half belongs to the ground level, the high half to upstairs, joined by portals in the middle
    const portal = new Int32Array(N * 2).fill(-1);
    for (const st of stairs) {
      const dir = Math.sign(st.xb - st.xa), tOf = (x) => (x - st.xa) / (st.xb - st.xa);
      cells(st.x0, st.z0, st.x1, st.z1, (c, x) => { blocked[tOf(x) < 0.5 ? 1 : 0][c] = 1; });
      cells(st.x0, st.z0, st.x1, st.z1, (c, x) => {
        if (tOf(x) >= 0.5 || tOf(x + dir * CELL) < 0.5 || blocked[0][c] || blocked[1][c + dir]) return;
        portal[c] = N + c + dir;
        portal[N + c + dir] = c;
      });
    }
    // Flood fill from the plaza to find everything a player can actually reach, on both levels
    const reach = new Uint8Array(N * 2);
    const q = [cellIdx(0, -5)];
    reach[q[0]] = 1;
    const visit = (n) => { if (!reach[n]) { reach[n] = 1; q.push(n); } };
    while (q.length) {
      const n = q.pop(), lv = n >= N ? 1 : 0, c = n - lv * N, ix = c % GN, iz = (c / GN) | 0, B = blocked[lv], o = lv * N;
      if (ix > 0 && !B[c - 1]) visit(o + c - 1);
      if (ix < GN - 1 && !B[c + 1]) visit(o + c + 1);
      if (iz > 0 && !B[c - GN]) visit(o + c - GN);
      if (iz < GN - 1 && !B[c + GN]) visit(o + c + GN);
      if (portal[n] >= 0) visit(portal[n]);
    }
    const list = [], list0 = [];
    for (let n = 0; n < N * 2; n++) if (reach[n]) { list.push(n); if (n < N) list0.push(n); }
    // Coins and power-up boxes on reachable ground, spread out
    const sprinkle = (n, gap, minR, avoid = []) => {
      const out = [];
      let tries = 0;
      while (out.length < n && tries++ < 12000) {
        const c = list0[(R() * list0.length) | 0];
        const x = -HALF + ((c % GN) + 0.5) * CELL, z = -HALF + (((c / GN) | 0) + 0.5) * CELL;
        if (Math.hypot(x, z) < minR) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap) || avoid.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
        out.push({ id: out.length, x, z, lv: 0 });
      }
      return out;
    };
    const coins = sprinkle(44, 8.5, 7);
    for (const c of extraCoins) coins.push({ id: coins.length, ...c });
    const items = sprinkle(9, 26, 14, coins);
    return {
      i, id: MAPS[i].id, name: MAPS[i].name, theme: THEMES[MAPS[i].id],
      boxes, bl, spots, coins, items, beacons, houses, lamps, stairs, upper, jail, lever,
      los: [bl[0].filter((b) => !b.see && b.h >= 1.6), bl[1].filter((b) => !b.see && b.h >= 1.6)],
      nav: { blocked, reach, list, list0, portal },
      seekerSpawn: [0, -5], ...extra,
    };
  };
  return { R, add, spot, line, house, home, manor, locker, dumpster, plaza, lamp, clear, scatter, beacon, finish, keepOut, see };
}

function buildTown(i) {
  const K = kit(20241), { R, add, spot, line, house, home, manor, locker, dumpster, scatter } = K;
  // Inner ring of homes around the plaza
  home(-30, -27, 14, 10, 0xd9a273, { S: [-3], E: [1] });
  home(30, -27, 12, 12, 0x8fb0c9, { S: [-2], W: [2] });
  home(-30, 27, 12, 12, 0xc98f9b, { N: [0], E: [2] });
  home(30, 27, 16, 10, 0xa9c48a, { N: [0], W: [2] });
  // Outer homes
  home(57, -44, 12, 10, 0xd9c27a, { S: [-2], W: [2] });
  home(-57, 44, 12, 10, 0x9ab8d9, { S: [-2], E: [2] });
  home(-60, -13, 10, 10, 0xc9a08f, { S: [-2], E: [2] });
  home(60, 15, 10, 10, 0xb8c98f, { S: [-2], W: [2] });
  // Two-storey houses
  manor(-54, -50, 14, 10, 0xb5654a, { S: [0], E: [0] });
  manor(54, 50, 16, 11, 0x5f86a8, { S: [0], W: [0] });
  manor(0, 60, 16, 10, 0xa87fb0, { S: [0], W: [0], E: [0] });
  // Warehouse (north)
  house(0, -54, 26, 14, 4.5, 0x8a8f9c, { S: [-7, 7] }, 3);
  for (const [x, z, h] of [[-10, -58, 2.6], [-8.6, -58, 1.3], [-3, -55, 2.6], [0, -58.5, 1.3], [1.35, -58.5, 2.6], [6, -54, 1.3],
    [10.5, -59, 2.6], [10.6, -50, 1.3], [-11, -51, 1.3], [3, -50.5, 2.6], [-5, -50, 1.3], [-6.4, -60, 2.6]]) add(x, z, 1.3, 1.3, h, 'crate');
  locker(12.2, -55, -1.3); locker(-12.2, -56, 1.3);

  for (const [x, z, ex] of [[-21.5, -30, 1.4], [22.5, -31, -1.4], [-22.5, 31, 1.4], [20.5, 31, -1.4], [49.5, -45, -1.4], [-49.5, 45, 1.4], [-45.5, -52, 1.4], [44.5, 53, -1.4]]) dumpster(x, z, ex);

  // Hedge maze (south)
  const MZ = { x0: -14, z0: 26, cw: 4, cols: 7, rows: 4 };
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
    line(x0, ze, xe, ze, t, hh, 'hedge', [[-12, 2.4], [8, 2.4]]);
    line(x0, z0, x0, ze, t, hh, 'hedge', [[36, 2.4]]);
    line(xe, z0, xe, ze, t, hh, 'hedge', [[32, 2.4]]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const j = r * cols + c;
      if (c < cols - 1 && !openE[j]) add(x0 + (c + 1) * cw, z0 + (r + 0.5) * cw, t, cw + t, hh, 'hedge');
      if (r < rows - 1 && !openS[j]) add(x0 + (c + 0.5) * cw, z0 + (r + 1) * cw, cw + t, t, hh, 'hedge');
    }
    K.keepOut.push([x0 - 3, z0 - 3, xe + 3, ze + 3]);
  }

  K.plaza('fountain');
  const carColors = [0xd94f4f, 0x4f8fd9, 0xe0b23a, 0x6fbf73, 0xc77dff, 0xf5f5f5];
  [[-18, 4.9], [16, -4.9], [-44, -4.9], [40, 4.9], [-64, 4.9], [62, -4.9]].forEach(([x, z], n) => add(x, z, 4.4, 1.9, 1.5, 'car', { color: carColors[n], see: true }));
  for (const [x, z] of [[-12, 6], [12, -6], [-30, -6], [30, 6], [-6, -20], [6, 20], [-52, 6], [52, -6], [-6, -40], [-70, -6], [70, 6], [6, -30]]) K.lamp(x, z);
  K.beacon(-67, 22); K.beacon(67, -24); K.beacon(26, 69);

  K.keepOut.push([-HALF, -3.6, HALF, 3.6], [-3.6, -46, 3.6, 24]);
  scatter(17, 1.6, 1.6, 2, (x, z) => spot('bush', x, z, 0, 0));
  scatter(100, 0.7, 0.7, 1.5, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() }));
  scatter(22, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.4 ? 2.6 : 1.3, 'crate'));
  scatter(13, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(15, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(14, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(9, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', { see: true }));
  return K.finish(i, { maze: MZ });
}

function buildCamp(i) {
  const K = kit(7771), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const logs = 0x8a5a3a, dark = 0x7a4f34;
  home(-34, -30, 10, 9, logs, { S: [-2] });
  home(34, -32, 10, 9, dark, { S: [-2], W: [1] });
  home(-32, 34, 10, 10, dark, { N: [0], E: [2] });
  home(36, 31, 12, 9, logs, { N: [0], W: [2] });
  home(-62, 4, 10, 9, logs, { S: [-2], E: [2] });
  home(60, -58, 10, 9, dark, { S: [-2], W: [2] });
  // Two-storey chalets
  manor(-56, -54, 14, 10, 0x9a6a44, { S: [0], E: [0] });
  manor(56, 54, 14, 10, 0x8a5a3a, { S: [0], W: [0] });
  manor(-58, 56, 14, 10, 0x7a4f34, { S: [0], E: [0] });
  // The lodge
  house(0, -58, 20, 12, 4.2, 0x9a6a44, { S: [-5, 5] }, 2.4);
  for (const x of [-6, 0, 6]) add(x, -59.5, 2.6, 1.1, 0.8, 'table');
  add(-9.2, -62.4, 0.6, 2.2, 2, 'shelf'); locker(9.2, -55, -1.3); locker(-9.2, -55, 1.3);

  K.plaza('campfire');
  for (const [x, z, w, d] of [[-8.6, -3, 0.6, 2], [8.6, -3, 0.6, 2], [0, -9, 2, 0.6]]) add(x, z, w, d, 0.5, 'bench', see);
  for (const [x, z] of [[-14, -10], [14, -10], [-14, 12], [16, 16], [-40, 2], [50, 0], [0, -36], [0, 40], [-44, -40], [44, 42]]) K.lamp(x, z);
  K.keepOut.push([14, -12, 46, 12]); // the frozen pond stays open
  K.beacon(-68, -24); K.beacon(67, -30); K.beacon(8, 68);

  scatter(10, 3, 3, 2, (x, z) => spot('tent', x, z, 0, 0));
  scatter(14, 1.6, 1.6, 2, (x, z) => spot('snowdrift', x, z, 0, 0));
  scatter(160, 0.7, 0.7, 1.4, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() * 0.54 }));
  scatter(20, 2.4, 2.4, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 2.4, 1, 1.0, 'logs', see) : add(x, z, 1, 2.4, 1.0, 'logs', see)));
  scatter(16, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(11, 0.9, 0.9, 1.2, (x, z) => add(x, z, 0.9, 0.9, 1.7, 'snowman', { v: R(), see: true }));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.3 ? 2.6 : 1.3, 'crate'));
  scatter(9, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i, { pond: [30, 0, 15, 11] });
}

function buildDocks(i) {
  const K = kit(424242), { R, add, spot, house, manor, locker, dumpster, scatter } = K;
  const paint = [0xc94f3d, 0x3d7fc9, 0xd9a52e, 0x4f9a5f, 0x8a5fc9, 0xd97a2e, 0x7d8894, 0x2e9aa0];
  // Warehouse (north)
  house(0, -58, 28, 14, 5, 0x6f7785, { S: [-8, 8] }, 3);
  for (const [x, z, h] of [[-11.5, -62.5, 2.6], [-10.1, -62.5, 1.3], [-3, -59, 2.6], [1, -62, 1.3], [2.4, -62, 2.6], [11.5, -60, 2.6], [5, -54.5, 1.3], [-6, -54, 1.3], [-12, -54, 2.6]]) add(x, z, 1.3, 1.3, h, 'crate');
  add(0, -56, 0.6, 3.4, 2.2, 'shelf');
  locker(13.2, -55.5, -1.3); locker(-13.2, -58, 1.3);
  // Two-storey harbour office (south) and customs house (north-east), plus a small gatehouse
  manor(0, 60, 16, 10, 0x8c8f7a, { W: [0], E: [0] });
  manor(58, -58, 14, 10, 0x7a8590, { S: [0], W: [0] });
  house(-60, 60, 10, 8, 3.2, 0x8a7f6a, { N: [0], E: [1] });
  add(-63.4, 62, 1.8, 1.1, 0.8, 'table'); locker(-56, 62.8, -1.3);

  // Container stacks on a loose grid, leaving alleys between them, the two main roads and the building yards clear
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) {
    const cx = sx * (12.5 + a * 9), cz = sz * (12.5 + b * 9);
    const along = R() < 0.5, jx = (R() - 0.5) * 1.4, jz = (R() - 0.5) * 1.4, tall = R() < 0.35, c1 = paint[(R() * paint.length) | 0], c2 = paint[(R() * paint.length) | 0];
    if (R() < 0.26) continue;
    if (K.keepOut.some((k) => cx > k[0] - 5 && cx < k[2] + 5 && cz > k[1] - 5 && cz < k[3] + 5)) continue;
    add(cx + jx, cz + jz, along ? 6 : 2.5, along ? 2.5 : 6, tall ? 5.2 : 2.6, 'container', { color: c1, color2: c2 });
  }

  K.plaza('tower');
  for (const [x, z, ex] of [[-7, -21, 1.4], [7, 23, -1.4], [-22, 6.6, 1.4], [25, -6.6, -1.4], [-49, -6.6, 1.4], [52, 6.6, -1.4], [7, -42, -1.4], [-7, 44, 1.4]]) dumpster(x, z, ex);
  [[-16, 5.4], [18, -5.4], [-40, 5.4], [44, -5.4]].forEach(([x, z]) => add(x, z, 4.4, 1.9, 1.5, 'car', { color: 0xe0b23a, see: true }));
  [[-5.4, -30], [5.4, 32]].forEach(([x, z]) => add(x, z, 1.9, 4.4, 1.5, 'car', { color: 0xe0b23a, see: true, turn: true }));
  for (const [x, z] of [[-8, -8], [8, 8], [-8, 30], [8, -30], [-34, 8], [34, -8], [-60, -8], [60, 8], [-8, -48], [8, 50], [-8, 8], [8, -8]]) K.lamp(x, z);
  K.beacon(-70, 0); K.beacon(70, 0); K.beacon(24, 70);

  // Open containers you can climb into
  scatter(10, 4.4, 2.6, 1.1, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'hidebox', { color: paint[(R() * paint.length) | 0] }); spot('container', x - 0.6, z, 1.95, 0); });
  scatter(30, 1.3, 1.3, 1.1, (x, z) => add(x, z, 1.3, 1.3, R() < 0.45 ? 2.6 : 1.3, 'crate'));
  scatter(24, 0.8, 0.8, 1.1, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(9, 6, 6, 1.1, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i);
}

export function cellIdx(x, z) {
  const ix = Math.max(0, Math.min(GN - 1, Math.floor((x + HALF) / CELL)));
  const iz = Math.max(0, Math.min(GN - 1, Math.floor((z + HALF) / CELL)));
  return iz * GN + ix;
}
const N = GN * GN;
const cellX = (c) => -HALF + ((c % GN) + 0.5) * CELL;
const cellZ = (c) => -HALF + (((c / GN) | 0) + 0.5) * CELL;

// Which level a player is on and how high their feet are, given where they stand. Stairs move you between levels.
// Returns [level, height].
export function levelAt(W, x, z, lv) {
  for (const st of W.stairs) {
    if (x < st.x0 || x > st.x1 || z < st.z0 || z > st.z1) continue;
    const t = (x - st.xa) / (st.xb - st.xa);
    return [t >= 0.5 ? 1 : 0, t * FLOOR_H];
  }
  return [lv, lv * FLOOR_H];
}
// Upstairs only exists inside two-storey houses
export function validLevel(W, x, z, lv) {
  return lv === 1 && W.upper.some((u) => x > u[0] && x < u[2] && z > u[1] && z < u[3]) ? 1 : 0;
}

// Push a circle out of all boxes on one level. Returns [x, z].
export function collide(W, x, z, r = PR, lv = 0) {
  for (let it = 0; it < 3; it++) {
    let hit = false;
    for (const b of W.bl[lv]) {
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

// True if nothing tall blocks the straight line between two points on the same level.
export function hasLOS(W, x1, z1, x2, z2, lv = 0) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const b of W.los[lv]) {
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

// Nearest reachable nav node (level * N + cell) to a point, or -1.
function nearFree(W, x, z, lv) {
  const { reach } = W.nav, o = lv * N;
  const c = cellIdx(x, z);
  if (reach[o + c]) return o + c;
  const cx = c % GN, cz = (c / GN) | 0;
  let best = -1, bd = 1e9;
  for (let r = 1; r <= 10 && best < 0; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) continue;
      const n = o + iz * GN + ix;
      if (!reach[n]) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
  }
  return best;
}

export function walkable(W, x1, z1, x2, z2, lv = 0) {
  const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 0.25), B = W.nav.blocked[lv];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (B[cellIdx(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)]) return false;
  }
  return true;
}

// A random reachable point as [x, z, level]. Pass ground = true to stay off the upper floors.
export function randomPoint(W, ground = false) {
  const l = ground ? W.nav.list0 : W.nav.list, n = l[(Math.random() * l.length) | 0], lv = n >= N ? 1 : 0;
  return [cellX(n - lv * N), cellZ(n - lv * N), lv];
}

// A* over both nav grids, joined at the stairs. Returns [[x, z, level], ...] or null.
const _g = new Float32Array(N * 2), _from = new Int32Array(N * 2), _closed = new Uint8Array(N * 2);
export function findPath(W, sx, sz, slv, tx, tz, tlv) {
  const { blocked, portal } = W.nav;
  const s = nearFree(W, sx, sz, slv), t = nearFree(W, tx, tz, tlv);
  if (s < 0 || t < 0) return null;
  const node = (n) => { const lv = n >= N ? 1 : 0; return [cellX(n - lv * N), cellZ(n - lv * N), lv]; };
  if (s === t) return [node(t)];
  _g.fill(Infinity); _from.fill(-1); _closed.fill(0);
  const tl = t >= N ? 1 : 0, tx_ = (t - tl * N) % GN, tz_ = ((t - tl * N) / GN) | 0;
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
  // Octile distance; changing level means a detour through a staircase, which the estimate may safely ignore
  const heur = (n) => {
    const c = n >= N ? n - N : n, dx = Math.abs((c % GN) - tx_), dz = Math.abs(((c / GN) | 0) - tz_);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  _g[s] = 0;
  push(heur(s), s);
  while (hf.length) {
    const cur = pop();
    if (cur === t) break;
    if (_closed[cur]) continue;
    _closed[cur] = 1;
    const lv = cur >= N ? 1 : 0, o = lv * N, c = cur - o, B = blocked[lv], cx = c % GN, cz = (c / GN) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue;
      const nc = nz * GN + nx, n = o + nc;
      if (B[nc] || _closed[n]) continue;
      if (dx && dz && (B[cz * GN + nx] || B[nz * GN + cx])) continue;
      const g = _g[cur] + (dx && dz ? 1.4142 : 1);
      if (g < _g[n]) { _g[n] = g; _from[n] = cur; push(g + heur(n), n); }
    }
    const pt = portal[cur];
    if (pt >= 0 && !_closed[pt] && _g[cur] + 1 < _g[pt]) { _g[pt] = _g[cur] + 1; _from[pt] = cur; push(_g[pt] + heur(pt), pt); }
  }
  if (_from[t] < 0) return null;
  const path = [];
  for (let n = t; n !== s && n >= 0; n = _from[n]) path.push(node(n));
  path.reverse();
  return path;
}
