(() => {
'use strict';
// Art is embedded by build.py: character sprites from the LPC project, tiles from Kenney's Tiny packs.
const ASSETS = __ASSETS__;
const ATLAS = __ATLAS__;
// The overworld (OW wide) and the dungeons (each DW wide, side by side east of it) share one tile grid.
const T = 32, OW = 72, DW = 40, NDUN = 25, W = OW + 2 + DW * NDUN, H = 56, GOAL = 400, SEED = 7;
const SAVE_KEY = 'brindle-isle-save-v1';
const $ = id => document.getElementById(id);
const cvs = $('game'), ctx = cvs.getContext('2d');
const mini = $('minimap'), mctx = mini.getContext('2d');
const IMG = {};

// ---------- sound: tiny synthesized effects, no audio files ----------
const SFX = (() => {
  let ac = null, muted = false;
  try { muted = localStorage.getItem('brindle-mute') === '1'; } catch (_) {}
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(a, f, dur, type = 'square', vol = 0.06, slide = 0, delay = 0) {
    const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, f + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(a, dur, vol, freq, delay = 0) {
    const t0 = a.currentTime + delay, len = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(a.destination); src.start(t0);
  }
  const FX = {
    swing: a => noise(a, 0.13, 0.18, 2200),
    hit: a => { tone(a, 200, 0.1, 'square', 0.06, -110); noise(a, 0.06, 0.12, 1200); },
    chop: a => { tone(a, 150, 0.09, 'triangle', 0.14, -70); noise(a, 0.07, 0.14, 800); },
    mine: a => { tone(a, 1200, 0.06, 'square', 0.035); noise(a, 0.07, 0.14, 3500); },
    pick: a => tone(a, 520, 0.08, 'triangle', 0.08, 320),
    collect: a => tone(a, 880, 0.06, 'triangle', 0.05, 220),
    coin: a => { tone(a, 988, 0.06, 'square', 0.035); tone(a, 1319, 0.12, 'square', 0.035, 0, 0.06); },
    hurt: a => tone(a, 330, 0.25, 'sawtooth', 0.07, -220),
    special: a => [523, 659, 784, 1047].forEach((f, i) => tone(a, f, 0.1, 'square', 0.04, 0, i * 0.05)),
    dash: a => noise(a, 0.18, 0.12, 700),
    fall: a => { noise(a, 0.5, 0.14, 300); tone(a, 90, 0.35, 'triangle', 0.12, -40, 0.15); },
    crumble: a => { noise(a, 0.3, 0.16, 1500); noise(a, 0.2, 0.1, 500, 0.08); },
    slime: a => tone(a, 160, 0.16, 'sine', 0.14, 260),
    craft: a => [392, 523, 659, 784].forEach((f, i) => tone(a, f, 0.14, 'triangle', 0.07, 0, i * 0.08)),
    lucky: a => [1047, 1319, 1568].forEach((f, i) => tone(a, f, 0.1, 'square', 0.03, 0, i * 0.05)),
    drink: a => [300, 420, 360, 520].forEach((f, i) => tone(a, f, 0.07, 'sine', 0.08, 80, i * 0.09)),
    leap: a => tone(a, 260, 0.16, 'triangle', 0.07, 260),
    thud: a => { tone(a, 70, 0.25, 'sine', 0.22, -30); noise(a, 0.15, 0.1, 300); },
    slam: a => { tone(a, 55, 0.5, 'sine', 0.3, -25); noise(a, 0.45, 0.2, 250); },
    boss: a => [196, 185, 175, 147].forEach((f, i) => tone(a, f, 0.32, 'sawtooth', 0.06, 0, i * 0.22)),
    wisp: a => tone(a, 700, 0.25, 'sine', 0.05, -400),
  };
  return {
    play(n) { if (muted) return; const a = audio(); if (a && FX[n]) try { FX[n](a); } catch (_) {} },
    get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem('brindle-mute', muted ? '1' : '0'); } catch (_) {} if (!muted) audio(); },
  };
})();

// ---------- random + noise ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = mulberry32(SEED);
function hash(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + SEED * 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const s = t => t * t * (3 - 2 * t), u = s(xf), v = s(yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------- world generation ----------
const DEEP = 0, LAND = 2, PATH = 6, PLANK = 9, WALL = 10, FLOOR = 11, GATE = 12, LOCK = 13, BDOOR = 14, STAIRS = 15, POOL = 16, ICE = 17;
const REGIONS = ['village', 'grove', 'quarry', 'meadow', 'forest'];
const REGION_TINT = [null, 'rgba(96,44,160,.34)', 'rgba(128,110,84,.38)', 'rgba(255,226,90,.10)', 'rgba(8,52,28,.30)'];
const tiles = new Uint8Array(W * H), region = new Uint8Array(W * H);
const cx = OW / 2, cy = H / 2;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? DEEP : tiles[y * W + x];
const isLand = t => t >= LAND && t !== 20 && t !== WALL && t !== GATE && t !== LOCK && t !== BDOOR && t !== POOL;
const inDungeon = x => x >= (OW + 2) * T;
function regionOf(x, y) {
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy < 40) return 0;
  const a = Math.atan2(dy, dx) + (vnoise(x / 5, y / 5) - 0.5) * 0.7;
  if (a > -2.36 && a < -0.79) return 1;
  if (a >= -0.79 && a < 0.79) return 2;
  if (a >= 0.79 && a < 2.36) return 3;
  return 4;
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - cx) / (OW * 0.46), dy = (y - cy) / (H * 0.46);
  const d = Math.hypot(dx, dy) + (vnoise(x / 7, y / 7) - 0.5) * 0.32 + (vnoise(x / 3, y / 3) - 0.5) * 0.08;
  tiles[y * W + x] = d > 0.86 ? DEEP : LAND;
  region[y * W + x] = regionOf(x, y);
}
// remove single-tile water notches and spits so shorelines tile cleanly
for (let pass = 0; pass < 2; pass++) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const n = isLand(tileAt(x, y - 1)), s = isLand(tileAt(x, y + 1)), e = isLand(tileAt(x + 1, y)), w = isLand(tileAt(x - 1, y));
  const t = tiles[y * W + x];
  if (!isLand(t) && ((n && s) || (e && w))) tiles[y * W + x] = LAND;
  if (isLand(t) && ((!n && !s) || (!e && !w))) tiles[y * W + x] = DEEP;
}
for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 10) tiles[(cy + y) * W + cx + x] = PATH;
function road(dx, dy, len) {
  for (let k = 0; k < len; k++) for (let w = -1; w <= 0; w++) {
    const x = cx + dx * k + (dy ? w : 0), y = cy + dy * k + (dx ? w : 0);
    if (isLand(tileAt(x, y)) && isLand(tileAt(x + dx * 2, y + dy * 2))) tiles[y * W + x] = PATH;
  }
}
// boss arena at the island's north tip
let arenaTY = 0;
for (let y = 0; y < cy; y++) if (isLand(tileAt(cx, y)) && isLand(tileAt(cx - 1, y))) { arenaTY = y + 8; break; }
const ARENA = { x: cx * T, y: arenaTY * T + 16, r: 5 * T };
for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (x * x + y * y <= 26) { const i = (arenaTY + y) * W + cx + x; if (i >= 0 && i < W * H && isLand(tiles[i])) tiles[i] = LAND; }
const nearArena = (tx, ty, d) => Math.hypot(tx - cx, ty - arenaTY) < d;
// ---------- dungeon entrances on the island ----------
function findSpot(xs, ys, rg) {
  for (const x of xs) for (const y of ys) {
    let ok = true;
    for (let yy = y - 2; yy <= y + 1; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (!isLand(tileAt(xx, yy)) || tileAt(xx, yy) === PATH) ok = false;
    if (ok && (rg === undefined || region[y * W + x] === rg)) return { x: x * T, y: y * T + 4, tx: x, ty: y };
  }
  return null;
}
const range = (a, b) => { const r = []; if (a <= b) for (let i = a; i <= b; i++) r.push(i); else for (let i = a; i >= b; i--) r.push(i); return r; };
function pathLine(x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    for (const [xx, yy] of [[x, y], [x - 1, y], [x, y + 1], [x - 1, y + 1]]) if (isLand(tileAt(xx, yy))) tiles[yy * W + xx] = PATH;
  }
}
const MINE = findSpot(range(cx + 15, cx + 23), range(cy - 3, cy + 1)) || { x: (cx + 16) * T, y: (cy - 1) * T + 4, tx: cx + 16, ty: cy - 1 };
const TEMPLE = findSpot(range(cx - 9, cx - 20), range(cy + 9, cy + 15), 3) || findSpot(range(cx - 6, cx - 16), range(cy + 6, cy + 14)) || { x: (cx - 10) * T, y: (cy + 10) * T + 4, tx: cx - 10, ty: cy + 10 };
const CRYPT = findSpot(range(cx - 15, cx - 24), range(cy - 3, cy + 1), 4) || findSpot(range(cx - 14, cx - 22), range(cy - 6, cy + 3)) || { x: (cx - 16) * T, y: (cy - 1) * T + 4, tx: cx - 16, ty: cy - 1 };
const ENTRANCES = [MINE, TEMPLE, CRYPT];
const nearMine = (tx, ty, d) => ENTRANCES.some(E => Math.hypot(tx - E.tx, ty - E.ty) < d);
road(1, 0, MINE.tx - cx + 1); road(-1, 0, cx - CRYPT.tx + 1); road(0, -1, Math.max(12, cy - arenaTY - 5));
for (const E of [MINE, CRYPT]) for (let y = Math.min(E.ty, cy); y <= Math.max(E.ty, cy); y++) for (const x of [E.tx, E.tx - 1]) { const i = y * W + x; if (isLand(tiles[i])) tiles[i] = PATH; }
pathLine(cx - 2, cy + 3, TEMPLE.tx, TEMPLE.ty + 1);

// ---------- dungeons: each one is a 40-wide strip of the grid east of the island ----------
const DUNGEONS = [];
function makeDungeon(id, name, i, entrance, opts) {
  const D = { id, name, x0: OW + 2 + i * DW, entrance, doors: [], chests: [], torches: [], switches: [], ...opts };
  D.start = { x: (D.x0 + 20) * T, y: 40 * T + 16 };
  DUNGEONS.push(D); return D;
}
for (let y = 0; y < H; y++) for (let x = OW; x < W; x++) { tiles[y * W + x] = x >= OW + 2 ? WALL : DEEP; region[y * W + x] = 5; }
const dset = (D, x, y, t) => { tiles[y * W + D.x0 + x] = t; };
function carve(D, x0, y0, x1, y1, t = FLOOR) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dset(D, x, y, t); }
function addDoor(D, id, kind, cells, t, below) { for (const [x, y] of cells) dset(D, x, y, t); D.doors.push({ id, kind, cells, below: below || [cells[0][0], cells[0][1] + 1], D }); }
function entryHall(D) { carve(D, 13, 35, 26, 42); for (let x = 18; x <= 21; x++) dset(D, x, 42, STAIRS); }

const MINE_D = makeDungeon('mine', 'The Old Mine', 0, MINE, { tint: null,
  locked: () => !S.mineOpen && !S.tools.pickaxe, lockMsg: 'Rubble blocks the Old Mine. A pickaxe could clear it.',
  unlock: () => { if (!S.mineOpen) { S.mineOpen = true; SFX.play('crumble'); toast('You clear the rubble with your pickaxe.'); } },
  gateMsg: 'Sealed by old magic. Defeat every creature in the cavern to open it.', bossDoorMsg: 'A heavy door with a skull lock. Rockjaw guards its key.',
  objective: g => !g.open.gate ? 'Defeat every creature in the crystal cavern to open the sealed gate to the north.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the locked door in the hall\'s west wall.' : 'Find a small key. A chest hides in a corner of the crystal cavern.')
    : !S.defeated.golem ? 'Defeat Rockjaw in the west chamber. Make him charge into a wall.'
    : !g.open.boss ? 'Open the skull door in the hall\'s east wall with the Boss Key.'
    : !S.defeated.wizard ? 'Defeat the Hollow Wizard. Swing at his orb to send it back.' : 'The Old Mine is quiet now. Take the stairs back up.' });
{
  const D = MINE_D;
  carve(D, 2, 1, 17, 11); carve(D, 22, 1, 37, 11); carve(D, 3, 13, 36, 21); carve(D, 2, 23, 37, 32);
  for (let y = 23; y <= 32; y++) for (let x = 2; x <= 37; x++) {
    const edge = y === 23 || y === 32 || x === 2 || x === 37;
    if (edge && Math.abs(x - 19.5) > 3 && !(x <= 4 && y <= 25) && hash(x + 300, y) < 0.45) dset(D, x, y, WALL);
  }
  carve(D, 19, 33, 20, 34); entryHall(D);
  addDoor(D, 'gate', 'gate', [[19, 22], [20, 22]], GATE);
  addDoor(D, 'lock', 'lock', [[9, 12], [10, 12]], LOCK);
  addDoor(D, 'boss', 'boss', [[29, 12], [30, 12]], BDOOR);
  for (const [x, y] of [[6, 0], [13, 0], [25, 0], [34, 0], [5, 12], [16, 12], [23, 12], [35, 12], [9, 22], [30, 22], [15, 34], [24, 34]]) D.torches.push({ x, y });
}

const TEMPLE_D = makeDungeon('temple', 'The Overgrown Temple', 1, TEMPLE, { tint: 'rgb(170,225,200)',
  gateMsg: 'Sealed. Light all three crystal switches to open it.', bossDoorMsg: 'A skull door wrapped in roots. The Spider Queen keeps its key.',
  objective: g => !g.open.sw ? 'Strike the three crystal switches in the entry hall to open the gate.'
    : !S.defeated.queen ? 'The Spider Queen nests in the west chamber off the flooded hall.'
    : !g.open.boss ? 'Open the skull door in the flooded hall\'s north wall with the Boss Key.'
    : !S.defeated.crab ? 'Defeat King Clawdius. His shell shrugs off blows until he flips over.' : 'The temple is at peace. Take the stairs back up.' });
{
  const D = TEMPLE_D;
  carve(D, 12, 1, 35, 11);                       // King Clawdius's pool chamber
  carve(D, 14, 13, 36, 25);                      // flooded hall
  carve(D, 23, 18, 27, 20, POOL);
  carve(D, 1, 13, 12, 25); carve(D, 13, 18, 13, 20); // the Spider Queen's nest + opening
  carve(D, 19, 26, 20, 32); carve(D, 24, 28, 34, 32); carve(D, 21, 30, 23, 30); // corridor + side room
  for (const [x, y] of [[12, 1], [35, 1], [12, 11], [35, 11], [13, 1], [34, 1]]) dset(D, x, y, POOL);
  entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 33], [20, 33]], GATE);
  addDoor(D, 'boss', 'boss', [[23, 12], [24, 12]], BDOOR);
  for (const [i, x, y] of [[1, 14, 37], [2, 25, 37], [3, 22, 40]]) D.switches.push({ id: 's' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[14, 33], [25, 33], [16, 12], [33, 12], [16, 0], [31, 0], [4, 12], [9, 12], [26, 27], [32, 27]]) D.torches.push({ x, y });
}

const CRYPT_D = makeDungeon('crypt', 'The Haunted Crypt', 2, CRYPT, { tint: 'rgb(170,160,215)',
  gateMsg: 'Sealed by restless spirits. Defeat everything in the nave to open it.', bossDoorMsg: 'A skull door, cold to the touch. Nightwing roosts with its key.',
  objective: g => !g.open.gate ? 'Defeat every creature in the great nave to open the gate to the north.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the locked door in the antechamber\'s west wall.' : 'Find a small key. Look in the nave\'s east alcove.')
    : !S.defeated.bat ? 'Defeat Nightwing. Strike when it swoops low, and when it lands to rest.'
    : !g.open.boss ? 'Open the skull door north of the antechamber with the Boss Key.'
    : !S.defeated.knight ? 'Defeat the Bone Knight. Strike right after he swings, or while he\'s dizzy.' : 'The crypt is silent. Take the stairs back up.' });
{
  const D = CRYPT_D;
  carve(D, 12, 1, 35, 9);                        // the Bone Knight's hall
  carve(D, 15, 11, 32, 18);                      // antechamber
  carve(D, 1, 3, 12, 18); carve(D, 14, 15, 14, 16); // Nightwing's roost + passage
  carve(D, 3, 21, 36, 31); carve(D, 37, 24, 38, 26); carve(D, 23, 19, 24, 19); // nave, key alcove, gate passage
  carve(D, 19, 32, 20, 34); entryHall(D);
  addDoor(D, 'gate', 'gate', [[23, 20], [24, 20]], GATE);
  addDoor(D, 'lock', 'lock', [[13, 15], [13, 16]], LOCK, [12, 15]);
  addDoor(D, 'boss', 'boss', [[23, 10], [24, 10]], BDOOR);
  for (const [x, y] of [[15, 34], [24, 34], [6, 20], [12, 20], [30, 20], [35, 20], [17, 10], [30, 10], [15, 0], [32, 0], [4, 2], [9, 2]]) D.torches.push({ x, y });
}
// ---------- the Frostmoor: the snowy mainland across the bridge (an outdoor strip of the grid) ----------
const FROST_D = makeDungeon('frost', 'The Frostmoor', 3, null, { outdoor: true,
  objective: g => !S.defeated.jarl ? 'Jarl Frostbeard holds the war camp to the southeast. Swing at his thrown axe to disarm him.'
    : !S.defeated.wraith ? 'The Hailwraith haunts the frozen shrine to the southwest. Only the real one casts a shadow.'
    : 'The Frostmoor is free. Rest by the campfire, then head home across the bridge.' });
{
  const D = FROST_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 23) / 20.5;
    const d = Math.hypot(dx, dy) + (vnoise(x / 6, y / 6) - 0.5) * 0.34;
    tiles[y * W + x] = y < 44 && d < 0.9 ? LAND : DEEP; region[y * W + x] = 6;
  }
  for (let y = 0; y < 8; y++) for (const lx of [19, 20]) if (!isLand(tiles[y * W + X + lx]) || y < 3) tiles[y * W + X + lx] = PLANK;
  for (let y = 15; y <= 21; y++) for (let lx = 17; lx <= 26; lx++) if (((lx - 21.5) / 4.5) ** 2 + ((y - 18) / 3.2) ** 2 < 1) tiles[y * W + X + lx] = ICE;
  D.camp = { x: (X + 31) * T, y: 30 * T }; D.shrine = { x: (X + 9) * T, y: 31 * T }; D.fire = { x: (X + 22) * T, y: 7 * T };
  for (const A of [D.camp, D.shrine]) for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 40) { const tx = Math.round(A.x / T) + x, ty = Math.round(A.y / T) + y; if (tx > X && tx < X + DW - 1 && ty > 0 && ty < 43) tiles[ty * W + tx] = LAND; }
  pathLine(X + 20, 8, X + 31, 24); pathLine(X + 20, 8, X + 10, 25); pathLine(X + 20, 4, X + 20, 9);
  D.start = { x: (X + 20) * T, y: 4 * T };
}
// ---------- the Sunward Isles: a desert island reached by Nell's boat ----------
const SUN_D = makeDungeon('sun', 'The Sunward Isles', 4, null, { outdoor: true, theme: 'sand',
  objective: g => !S.defeated.wyrm ? 'Mirra Oasis sits at the heart of the isle, Corsair\'s Cove on the east shore. The Sand Wyrm lurks in the Sunken Ruins to the southwest.'
    : 'The Sunward Isles are safe. Nell\'s boat waits at the north dock to take you home.' });
{
  const D = SUN_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 22) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 5, y / 5) - 0.5) * 0.36;
    tiles[y * W + x] = y < 44 && d < 0.9 ? LAND : DEEP; region[y * W + x] = 8;
  }
  for (let y = 0; y < 8; y++) for (const lx of [19, 20]) if (!isLand(tiles[y * W + X + lx]) || y < 3) tiles[y * W + X + lx] = PLANK;
  D.mirra = { x: (X + 20) * T, y: 15 * T }; D.cove = { x: (X + 31) * T, y: 30 * T }; D.ruins = { x: (X + 10) * T, y: 32 * T };
  for (const A of [D.ruins, D.cove]) for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (x * x + y * y <= 40) { const tx = Math.round(A.x / T) + x, ty = Math.round(A.y / T) + y; if (tx > X && tx < X + DW - 1 && ty > 0 && ty < 43) tiles[ty * W + tx] = LAND; }
  for (let y = 10; y <= 22; y++) for (let lx = 12; lx <= 28; lx++) if (((lx - 20) / 8.5) ** 2 + ((y - 16) / 6) ** 2 < 1) tiles[y * W + X + lx] = LAND;
  for (let y = 15; y <= 19; y++) for (let lx = 17; lx <= 23; lx++) if (((lx - 20) / 3.3) ** 2 + ((y - 17) / 2.3) ** 2 < 1) tiles[y * W + X + lx] = DEEP; // the oasis pond
  pathLine(X + 20, 4, X + 20, 13); pathLine(X + 20, 13, X + 15, 21); pathLine(X + 20, 13, X + 25, 21);
  pathLine(X + 25, 21, X + 31, 27); pathLine(X + 15, 21, X + 11, 28);
  D.start = { x: (X + 20) * T, y: 4 * T };
}
const nearSunSite = (tx, ty, d) => [SUN_D.mirra, SUN_D.cove, SUN_D.ruins].some(A => Math.hypot(tx - A.x / T, ty - A.y / T) < d);
// ---------- the Sunken Tomb: a pyramid dungeon on the Sunward Isles ----------
const TOMB = findSpot(range(SUN_D.x0 + 5, SUN_D.x0 + 10), range(9, 22)) || findSpot(range(SUN_D.x0 + 4, SUN_D.x0 + 14), range(6, 28)) || { x: (SUN_D.x0 + 8) * T, y: 16 * T + 4, tx: SUN_D.x0 + 8, ty: 16 };
ENTRANCES.push(TOMB);
pathLine(SUN_D.x0 + 15, 21, TOMB.tx, TOMB.ty + 1);
const TOMB_D = makeDungeon('tomb', 'The Sunken Tomb', 5, TOMB, { tint: 'rgb(240,214,160)', traps: [],
  locked: () => !S.defeated.wyrm, lockMsg: 'Drifted sand seals the tomb. Something huge moving underground might shake it loose...',
  unlock: () => { if (!S.found.tombOpen) { S.found.tombOpen = true; toast('The sand around the doorway has slid away. The tomb is open.'); } },
  gateMsg: 'Sealed by an ancient curse. Defeat everything in the trap hall to open it.', bossDoorMsg: 'A golden door marked with a scarab. The Mummy King holds its key.',
  objective: g => !g.open.gate ? 'Cross the trap hall, time the spike floors, and defeat every creature to open the gate.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the sealed door in the west wall of the pillared hall.' : 'Find a small key. Look in the trap hall\'s east alcove.')
    : !S.defeated.mummy ? 'Defeat the Mummy King. Strike right after his bandage lash.'
    : !g.open.boss ? 'Open the golden door north of the pillared hall with the Boss Key.'
    : !S.defeated.scarab ? 'Defeat the Golden Scarab. Leap over its sunbeam and strike while it is overheated.' : 'The tomb is quiet. Take the stairs back up.' });
{
  const D = TOMB_D;
  carve(D, 8, 1, 31, 10);                          // the Golden Scarab's sanctum
  carve(D, 12, 12, 33, 20);                        // pillared hall
  carve(D, 1, 12, 10, 20);                         // the Mummy King's burial chamber
  carve(D, 4, 22, 35, 30); carve(D, 36, 25, 37, 27); // trap hall + key alcove
  carve(D, 19, 31, 20, 34); entryHall(D);
  addDoor(D, 'gate', 'gate', [[19, 21], [20, 21]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 15], [11, 16]], LOCK, [10, 15]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [x, y] of [[15, 34], [24, 34], [8, 21], [30, 21], [14, 11], [26, 11], [12, 0], [27, 0], [3, 11], [8, 11]]) D.torches.push({ x, y });
  // spike traps: a row in the entry hall, then waves across the trap hall
  for (let x = 14; x <= 25; x++) if (x < 17 || x > 22) D.traps.push([x, 38, x * 0.25]);
  for (let y = 23; y <= 29; y++) for (let x = 6; x <= 33; x++) if ((x + y * 2) % 5 === 0 && !(x >= 18 && x <= 21 && y >= 29)) D.traps.push([x, y, x * 0.18 + y * 0.1]);
}
const TRAPS = TOMB_D.traps.map(([x, y, off]) => ({ x: (TOMB_D.x0 + x) * T, y: y * T, off }));
// ---------- the Mirewood: a misty swamp reached by raft from the island's west beach ----------
const BOG = 19;
const MIRE_D = makeDungeon('mire', 'The Mirewood', 6, null, { outdoor: true, theme: 'swamp',
  objective: g => 'Bogwater Camp sits by the raft landing. Mother Moss pays well for help. Watch your step: bogs slow you, spores sting, and hexes scramble your feet.' });
{
  const D = MIRE_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 22) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 6, y / 6) - 0.5) * 0.34;
    tiles[y * W + x] = y < 44 && d < 0.92 ? LAND : DEEP; region[y * W + x] = 9;
  }
  for (let y = 0; y < 8; y++) for (const lx of [19, 20]) if (!isLand(tiles[y * W + X + lx]) || y < 3) tiles[y * W + X + lx] = PLANK;
  D.camp = { x: (X + 20) * T, y: 11 * T };
  for (let y = 2; y < 42; y++) for (let lx = 2; lx < DW - 2; lx++) {
    const x = X + lx; if (tiles[y * W + x] !== LAND) continue;
    if (Math.hypot(lx - 20, y - 11) < 7) continue;
    if (vnoise(x / 4 + 50, y / 4) > 0.64) tiles[y * W + x] = BOG;
    else if (vnoise(x / 5 + 90, y / 5) > 0.74) tiles[y * W + x] = DEEP;
  }
  pathLine(X + 20, 4, X + 20, 14); pathLine(X + 20, 14, X + 9, 30); pathLine(X + 20, 14, X + 31, 32); pathLine(X + 20, 14, X + 20, 38);
  D.start = { x: (X + 20) * T, y: 4 * T };
}
const nearMireSite = (tx, ty, d) => Math.hypot(tx - MIRE_D.camp.x / T, ty - MIRE_D.camp.y / T) < d;
// ---------- the Rotting Hollow: a dungeon inside a giant tree in the Mirewood ----------
const HOLLOW = findSpot(range(MIRE_D.x0 + 18, MIRE_D.x0 + 23), range(39, 33)) || findSpot(range(MIRE_D.x0 + 12, MIRE_D.x0 + 28), range(40, 28)) || { x: (MIRE_D.x0 + 20) * T, y: 38 * T + 4, tx: MIRE_D.x0 + 20, ty: 38 };
ENTRANCES.push(HOLLOW);
pathLine(MIRE_D.x0 + 20, 30, HOLLOW.tx, HOLLOW.ty + 1);
const HOLLOW_D = makeDungeon('hollow', 'The Rotting Hollow', 7, HOLLOW, { tint: 'rgb(175,210,150)',
  gateMsg: 'Roots seal the way. Strike all four glowstones in the root maze.', bossDoorMsg: 'A door of living bark. The Bog Hag keeps its key.',
  objective: g => !g.open.sw ? 'Find and strike the four glowstones in the root maze. Cut through thorny vines with your sword.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the root-sealed door in the west wall of the great hall.' : 'Find a small key. Look in the root maze\'s east alcove.')
    : !S.defeated.hag ? 'Defeat the Bog Hag. When she hides, smash the cauldron that bubbles the most.'
    : !g.open.boss ? 'Open the bark door north of the great hall with the Boss Key.'
    : !S.defeated.treant ? 'Defeat the Rotroot. Its bark is tough: strike its heart after it slams the ground.' : 'The Hollow is still. Take the stairs back up.' });
{
  const D = HOLLOW_D;
  carve(D, 6, 1, 33, 10);                          // the Rotroot's heart chamber
  carve(D, 19, 12, 20, 12);
  carve(D, 12, 13, 33, 21);                        // great hall
  carve(D, 1, 12, 10, 21);                         // the Bog Hag's den
  carve(D, 3, 23, 36, 33); carve(D, 37, 27, 38, 28); // root maze + key alcove
  for (let x = 3; x <= 36; x++) { if (!(x === 8 || x === 9 || x === 24 || x === 25)) dset(D, x, 26, WALL); if (!(x === 15 || x === 16 || x === 30 || x === 31)) dset(D, x, 30, WALL); }
  for (const [x0, x1, y0, y1] of [[11, 14, 27, 29], [26, 28, 23, 25], [4, 7, 31, 33]]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dset(D, x, y, BOG);
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 22], [20, 22]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 16], [11, 17]], LOCK, [10, 16]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 24], [2, 34, 24], [3, 5, 28], [4, 34, 32]]) D.switches.push({ id: 'g' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 22], [30, 22], [14, 12], [28, 12], [10, 0], [29, 0], [3, 11], [8, 11]]) D.torches.push({ x, y });
}

// ---------- Cinder Peak: a volcanic island reached by hot-air balloon ----------
const LAVA = 20;
const CINDER_D = makeDungeon('cinder', 'Cinder Peak', 8, null, { outdoor: true, theme: 'ash',
  objective: g => 'Ashfall Outpost sits by the balloon landing. Brakka the smith pays for help. Keep clear of the lava, and watch the ground: glowing vents erupt in bursts of flame.' });
{
  const D = CINDER_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 23) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 5 + 30, y / 5) - 0.5) * 0.3;
    tiles[y * W + x] = y < 44 && d < 0.93 ? LAND : DEEP; region[y * W + x] = 10;
  }
  for (let y = 2; y < 9; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + X + lx] = LAND;
  D.camp = { x: (X + 20) * T, y: 10 * T }; D.peak = { x: (X + 20) * T, y: 28 * T };
  // the crater lake and the lava rivers that run from it to the sea
  for (let y = 20; y < 36; y++) for (let lx = 12; lx < 29; lx++) if (Math.hypot(lx - 20, (y - 28) / 0.8) + (vnoise(lx / 2, y / 2) - 0.5) * 0.8 < 3.6) tiles[y * W + X + lx] = LAVA;
  const river = (pts) => { for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2; for (let k = 0; k <= n; k++) { const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n); for (const [ox, oy] of [[0, 0], [1, 0]]) if (tiles[(y + oy) * W + X + x + ox] === LAND) tiles[(y + oy) * W + X + x + ox] = LAVA; } } };
  river([[17, 30], [13, 34], [11, 38], [7, 42], [4, 44]]);
  river([[23, 30], [27, 35], [30, 38], [34, 43]]);
  river([[24, 26], [29, 24], [33, 21], [38, 20]]);
  // cooled obsidian causeways over the lava
  const cross = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (const [xx, yy] of [[x, y], [x - 1, y], [x, y + 1], [x - 1, y + 1]]) { const t = tiles[yy * W + X + xx]; if (t === LAND || t === LAVA || t === PATH) tiles[yy * W + X + xx] = PATH; } } };
  cross(20, 4, 20, 20); cross(20, 20, 9, 26); cross(20, 20, 31, 26); cross(31, 26, 33, 15);
  cross(9, 26, 9, 33); cross(9, 33, 18, 38); cross(31, 26, 31, 33); cross(31, 33, 22, 38);
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearCinderSite = (tx, ty, d) => Math.hypot(tx - CINDER_D.camp.x / T, ty - CINDER_D.camp.y / T) < d || Math.hypot(tx - CINDER_D.x0 - 20, ty - 4) < 4 || Math.hypot(tx - CINDER_D.x0 - 20, ty - 40) < 5;
// erupting vents: a cycle of rest, a glowing warning, then a column of flame
const VENTS = [];
{
  let s = 0;
  for (let i = 0; i < 6000 && VENTS.length < 26; i++) {
    const lx = 2 + Math.floor(hash(i, 313) * (DW - 4)), y = 3 + Math.floor(hash(313, i) * 39), x = CINDER_D.x0 + lx;
    if (tiles[y * W + x] !== LAND || nearCinderSite(x, y, 7) || VENTS.some(v => Math.hypot(v.tx - x, v.ty - y) < 3.5)) continue;
    VENTS.push({ tx: x, ty: y, x: x * T + 16, y: y * T + 18, off: (s++ * 0.77) % 3.2 });
  }
}
const ventState = v => { const ph = (time + v.off) % 3.2; return ph < 2.1 ? 0 : ph < 2.75 ? 1 : 2; };
const fireDmg = n => gearA().fireproof ? 1 : n;
// ---------- the Molten Forge: a dungeon beneath Cinder Peak ----------
const FORGE = { x: (CINDER_D.x0 + 20) * T, y: 40 * T + 4, tx: CINDER_D.x0 + 20, ty: 40 };
for (let y = 37; y <= 43; y++) for (let lx = 17; lx <= 23; lx++) if (tiles[y * W + CINDER_D.x0 + lx] === DEEP || tiles[y * W + CINDER_D.x0 + lx] === LAVA) tiles[y * W + CINDER_D.x0 + lx] = LAND;
for (let y = 38; y <= 42; y++) for (let lx = 18; lx <= 22; lx++) tiles[y * W + CINDER_D.x0 + lx] = LAND;
ENTRANCES.push(FORGE); pathLine(CINDER_D.x0 + 20, 37, CINDER_D.x0 + 20, 41);
const FORGE_D = makeDungeon('forge', 'The Molten Forge', 9, FORGE, { tint: 'rgb(235,190,170)',
  gateMsg: 'The foundry gate is sealed. Defeat every creature in the foundry.', bossDoorMsg: 'A great iron door, warm to the touch. The Forgemaster keeps its key.',
  objective: g => !g.open.gate ? 'Defeat every creature in the foundry to open the gate to the north.'
    : !g.open.sw ? 'Lava blocks the way. Strike the three cooling crystals to harden a bridge: two in the foundry, one by the lava river.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the iron door in the west wall, north of the lava river.' : 'Find a small key. Look in the alcove east of the lava river.')
    : !S.defeated.forge ? 'Defeat the Forgemaster. He is red-hot: smash a water barrel next to him to quench him, then strike.'
    : !g.open.boss ? 'Open the great iron door north of the lava river with the Boss Key.'
    : !S.defeated.drake ? 'Defeat the Magma Drake. Lure its dive into a fallen boulder to knock it down.' : 'The forge fires are calm. Take the stairs back up.' });
{
  const D = FORGE_D;
  carve(D, 8, 1, 31, 10);                          // the Magma Drake's lair
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // the lava river crossing
  for (let x = 12; x <= 27; x++) for (const y of [18, 19]) dset(D, x, y, LAVA);
  carve(D, 28, 21, 30, 23);                        // key alcove
  carve(D, 1, 13, 10, 24);                         // the Forgemaster's smithy
  carve(D, 3, 26, 36, 33);                         // foundry
  for (const [x0, x1, y0, y1] of [[8, 10, 29, 30], [29, 31, 28, 29], [17, 22, 31, 31]]) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dset(D, x, y, LAVA);
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'gate', 'gate', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'sw', 'switch', [[19, 18], [20, 18], [19, 19], [20, 19]], LAVA, [19, 20]);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 32], [3, 14, 22]]) D.switches.push({ id: 'c' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [12, 0], [27, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
  for (const [x, y, off] of [[13, 28, 0], [25, 27, 1.1], [33, 29, 2.2], [6, 32, 0.6], [16, 21, 1.6], [24, 23, 2.6], [22, 15, 0.3], [15, 16, 1.9]]) VENTS.push({ tx: D.x0 + x, ty: y, x: (D.x0 + x) * T + 16, y: y * T + 18, off });
}
// ---------- the Cloudspire Isles: floating islands reached on Cinder Peak's great updraft ----------
const CLOUD = 21, WIND = 22, JET = new Map();
const SKY_D = makeDungeon('sky', 'The Cloudspire Isles', 10, null, { outdoor: true, theme: 'sky',
  objective: g => 'Zephyr Roost perches on the north isle. Aeris the Windkeeper watches the skies. Cloud bridges link the isles, and jet streams carry you one way, fast.' });
{
  const D = SKY_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) { tiles[y * W + X + lx] = DEEP; region[y * W + X + lx] = 11; }
  const isle = (cx0, cy0, rx, ry) => { for (let y = cy0 - ry - 2; y <= cy0 + ry + 2; y++) for (let lx = cx0 - rx - 2; lx <= cx0 + rx + 2; lx++) { if (lx < 1 || lx > DW - 2 || y < 1 || y > 42) continue; const d = Math.hypot((lx - cx0) / rx, (y - cy0) / ry) + (vnoise((X + lx) / 3, y / 3) - 0.5) * 0.35; if (d < 1) tiles[y * W + X + lx] = LAND; } };
  isle(20, 8, 9, 5); isle(8, 22, 6, 6); isle(31, 20, 6, 5); isle(19, 34, 10, 6); isle(19, 21, 3, 3);
  for (let y = 3; y <= 6; y++) for (let lx = 17; lx <= 23; lx++) tiles[y * W + X + lx] = LAND;
  const bridge = (x0, y0, x1, y1, t, dir) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const k = (y + oy) * W + X + x + ox; if (tiles[k] === DEEP) { tiles[k] = t; if (dir) JET.set(k, dir); } } } };
  bridge(19, 12, 19, 18, CLOUD); bridge(17, 21, 12, 22, CLOUD); bridge(22, 20, 26, 20, CLOUD); bridge(9, 27, 13, 31, CLOUD); bridge(30, 24, 25, 30, CLOUD);
  // jet streams: one-way rides back north
  bridge(5, 20, 5, 9, WIND, [0, -1]); bridge(5, 8, 12, 8, WIND, [1, 0]);
  bridge(26, 37, 31, 37, WIND, [1, 0]); bridge(33, 38, 33, 22, WIND, [0, -1]);
  pathLine(X + 20, 4, X + 20, 11); pathLine(X + 19, 30, X + 19, 38);
  D.roost = { x: (X + 20) * T, y: 9 * T }; D.ruins = { x: (X + 19) * T, y: 35 * T };
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearSkySite = (tx, ty, d) => Math.hypot(tx - SKY_D.roost.x / T, ty - SKY_D.roost.y / T) < d || Math.hypot(tx - SKY_D.x0 - 20, ty - 4) < 3 || Math.hypot(tx - SKY_D.x0 - 24, ty - 36) < 4;
// ---------- the Storm Spire: a sky temple on the south isle of the Cloudspire Isles ----------
const SPIRE = { x: (SKY_D.x0 + 24) * T, y: 36 * T + 4, tx: SKY_D.x0 + 24, ty: 36 };
for (let y = 33; y <= 38; y++) for (let lx = 21; lx <= 27; lx++) if (tiles[y * W + SKY_D.x0 + lx] === DEEP) tiles[y * W + SKY_D.x0 + lx] = LAND;
ENTRANCES.push(SPIRE); pathLine(SKY_D.x0 + 19, 35, SKY_D.x0 + 24, 37);
const SPIRE_D = makeDungeon('spire', 'The Storm Spire', 11, SPIRE, { tint: 'rgb(205,218,245)',
  gateMsg: 'The wind gate is sealed. Strike the three storm crystals in the Gust Gallery.', bossDoorMsg: 'A door crackling with lightning. The Colossus Sentinel keeps its key.',
  objective: g => !g.open.sw ? 'Strike the three storm crystals in the Gust Gallery. The wind lanes push hard: dash (Shift) to cut across them.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall of the Hall of Winds.' : 'Find a small key. Look in the alcove east of the Hall of Winds.')
    : !S.defeated.aegis ? 'Defeat the Colossus Sentinel. Its shield blocks hits from the front: get behind it, or strike after its laser overheats.'
    : !g.open.boss ? 'Open the lightning door north of the Hall of Winds with the Boss Key.'
    : !S.defeated.storm ? 'Defeat the Stormlord. Knock its storm orb back with your sword to bring it down.' : 'The storm has passed. Take the stairs back down.' });
{
  const D = SPIRE_D;
  carve(D, 6, 1, 33, 10);                          // the Stormlord's open-air summit
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // Hall of Winds
  carve(D, 28, 20, 30, 22);                        // key alcove
  carve(D, 1, 13, 10, 24);                         // the Colossus Sentinel's vault
  carve(D, 3, 26, 36, 33);                         // Gust Gallery
  for (let x = 3; x <= 36; x++) { for (const y of [28, 29]) { dset(D, x, y, WIND); JET.set(y * W + D.x0 + x, [1, 0]); } for (const y of [30, 31]) { dset(D, x, y, WIND); JET.set(y * W + D.x0 + x, [-1, 0]); } }
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 4, 27], [2, 35, 27], [3, 5, 33]]) D.switches.push({ id: 'w' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
}
// ---------- Duskhollow: a haunted moonlit vale reached through the Spirit Gate ----------
const DUSK_D = makeDungeon('dusk', 'Duskhollow', 12, null, { outdoor: true, theme: 'dusk',
  objective: g => 'Lanternrest sits by the Spirit Gate. Old Morrow keeps watch. The vale is dark: strike the spirit lanterns to light them, and shades can only be hurt in their glow.' });
{
  const D = DUSK_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 22) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 6 + 70, y / 6) - 0.5) * 0.32;
    tiles[y * W + x] = y < 44 && d < 0.92 ? LAND : DEEP; region[y * W + x] = 12;
  }
  for (let y = 2; y < 9; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + X + lx] = LAND;
  for (let y = 4; y < 42; y++) for (let lx = 3; lx < DW - 3; lx++) { if (Math.hypot(lx - 20, y - 10) < 7) continue; if (vnoise((X + lx) / 5 + 120, y / 5) > 0.76) tiles[y * W + X + lx] = DEEP; }
  D.camp = { x: (X + 20) * T, y: 10 * T }; D.yard = { x: (X + 28) * T, y: 31 * T }; D.chapel = { x: (X + 10) * T, y: 32 * T };
  for (const A of [D.yard, D.chapel]) for (let y = -5; y <= 5; y++) for (let x = -6; x <= 6; x++) if (x * x / 36 + y * y / 25 <= 1) tiles[(Math.round(A.y / T) + y) * W + Math.round(A.x / T) + x] = LAND;
  pathLine(X + 20, 4, X + 20, 16); pathLine(X + 20, 16, X + 10, 28); pathLine(X + 20, 16, X + 28, 27); pathLine(X + 20, 16, X + 20, 38);
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearDuskSite = (tx, ty, d) => [DUSK_D.camp, DUSK_D.yard, DUSK_D.chapel].some(A => Math.hypot(tx - A.x / T, ty - A.y / T) < d) || Math.hypot(tx - DUSK_D.x0 - 20, ty - 4) < 3;
// spirit lanterns: strike one to light it for good
const LANTERNS = [[8, 14], [32, 13], [6, 25], [34, 23], [14, 21], [26, 19], [13, 38], [30, 39]].map(([lx, y], i) => {
  for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = DUSK_D.x0 + lx + dx, yy = y + dy; if (tiles[yy * W + x] === LAND && tiles[(yy + 1) * W + x] !== DEEP) return { i, tx: x, ty: yy, x: x * T + 16, y: yy * T + 22 }; }
  return { i, tx: DUSK_D.x0 + lx, ty: y, x: (DUSK_D.x0 + lx) * T + 16, y: y * T + 22 };
});
const lanternLit = L => !!(S.found && S.found['lan' + L.i]);
const litLanterns = () => LANTERNS.filter(lanternLit).length;
const inLanternLight = (x, y) => LANTERNS.some(L => lanternLit(L) && Math.hypot(L.x - x, (L.y - y) / 0.8) < 165) || Math.hypot(x - DUSK_D.camp.x - 10, y - DUSK_D.camp.y - 60) < 150 || (dungeonAt(x) === OSS_D && OSS_D.switches.some(sw => dgs(OSS_D).switches[sw.id] && Math.hypot(sw.x - x, (sw.y - y) / 0.8) < 165));
// ---------- the Moonveil Ossuary: a dark crypt beneath Duskhollow's ruined chapel ----------
const OSS = { x: DUSK_D.chapel.x + 16, y: DUSK_D.chapel.y + 4, tx: Math.round(DUSK_D.chapel.x / T), ty: Math.round(DUSK_D.chapel.y / T) };
for (let y = OSS.ty - 2; y <= OSS.ty + 2; y++) for (let x = OSS.tx - 3; x <= OSS.tx + 3; x++) if (tiles[y * W + x] === DEEP) tiles[y * W + x] = LAND;
ENTRANCES.push(OSS); pathLine(DUSK_D.x0 + 10, 28, OSS.tx, OSS.ty + 2);
const OSS_D = makeDungeon('ossuary', 'The Moonveil Ossuary', 13, OSS, { tint: 'rgb(190,190,225)',
  gateMsg: 'The bone gate is sealed. Light the four braziers in the ossuary.', bossDoorMsg: 'A door of fused bones. Your Shadow keeps its key.',
  objective: g => !g.open.sw ? 'Light the four braziers in the dark ossuary. Shades can only be hurt in their light.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall of the Hall of Braziers.' : 'Find a small key. Look in the alcove east of the Hall of Braziers.')
    : !S.defeated.shadow ? 'Defeat your Shadow. It mirrors you, and can only be hurt inside the lit circle.'
    : !g.open.boss ? 'Open the bone door north of the Hall of Braziers with the Boss Key.'
    : !S.defeated.lich ? 'Defeat the Lich King. Smash his soul jars to break his shield.' : 'The dead rest at last. Take the stairs back up.' });
{
  const D = OSS_D;
  carve(D, 6, 1, 33, 10);                          // the Lich King's throne hall
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // Hall of Braziers
  carve(D, 28, 20, 30, 22);                        // key alcove
  carve(D, 1, 13, 10, 24);                         // the Hall of Mirrors
  carve(D, 3, 26, 36, 33);                         // the ossuary
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 27], [3, 6, 32], [4, 33, 32]]) D.switches.push({ id: 'b' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
}
// ---------- Glimmerdeep: a crystal cavern far below the Old Mine ----------
const CAVE_D = makeDungeon('cave', 'Glimmerdeep', 14, null, { outdoor: true, theme: 'cave',
  objective: g => 'Glimmer Camp sits by the lift. Prospector Quill needs a hand. Chasms split the caverns: ride the mine carts across, and follow the glow of the crystals.' });
const RAILS = [];
{
  const D = CAVE_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) { tiles[y * W + X + lx] = DEEP; region[y * W + X + lx] = 13; }
  const cavern = (cx0, cy0, rx, ry) => { for (let y = cy0 - ry - 2; y <= cy0 + ry + 2; y++) for (let lx = cx0 - rx - 2; lx <= cx0 + rx + 2; lx++) { if (lx < 1 || lx > DW - 2 || y < 1 || y > 42) continue; if (Math.hypot((lx - cx0) / rx, (y - cy0) / ry) + (vnoise((X + lx) / 3 + 200, y / 3) - 0.5) * 0.3 < 1) tiles[y * W + X + lx] = LAND; } };
  cavern(20, 9, 10, 5); cavern(9, 25, 6, 7); cavern(32, 23, 5, 5); cavern(24, 37, 9, 4);
  for (let y = 3; y <= 6; y++) for (let lx = 17; lx <= 23; lx++) tiles[y * W + X + lx] = LAND;
  const walk = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) tiles[(y + oy) * W + X + x + ox] = LAND; } };
  walk(14, 12, 10, 19); walk(31, 27, 27, 34);
  pathLine(X + 20, 4, X + 20, 12);
  // mine cart rails: hub to east cavern, and west cavern to the south cavern
  const rail = pts => RAILS.push({ pts: pts.map(([lx, y]) => [(X + lx) * T + 16, y * T + 16]) });
  rail([[26, 11], [28, 14], [30, 17], [31, 20]]);
  rail([[11, 30], [13, 33], [16, 36], [18, 37]]);
  D.camp = { x: (X + 20) * T, y: 9 * T };
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearCaveSite = (tx, ty, d) => Math.hypot(tx - CAVE_D.camp.x / T, ty - CAVE_D.camp.y / T) < d || Math.hypot(tx - CAVE_D.x0 - 20, ty - 4) < 3 || RAILS.some(R => R.pts.some(([x, y]) => Math.hypot(tx - x / T, ty - y / T) < 2.5)) || Math.hypot(tx - CAVE_D.x0 - 28, ty - 38) < 4;
// ---------- the Prism Vault: a crystal vault in Glimmerdeep's south cavern ----------
const VAULT = { x: (CAVE_D.x0 + 28) * T, y: 38 * T + 4, tx: CAVE_D.x0 + 28, ty: 38 };
for (let y = 35; y <= 40; y++) for (let lx = 25; lx <= 31; lx++) if (tiles[y * W + CAVE_D.x0 + lx] === DEEP) tiles[y * W + CAVE_D.x0 + lx] = LAND;
ENTRANCES.push(VAULT); pathLine(CAVE_D.x0 + 24, 36, CAVE_D.x0 + 28, 39);
const VAULT_D = makeDungeon('vault', 'The Prism Vault', 15, VAULT, { tint: 'rgb(200,200,240)',
  gateMsg: 'A crystal seal blocks the way. Strike the three crystal switches in the gallery.', bossDoorMsg: 'A door of solid amethyst. The Mole King keeps its key.',
  objective: g => !g.open.sw ? 'Strike the three crystal switches in the dark gallery to open the seal.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall, north of the chasm.' : 'Find a small key. Look in the alcove east of the chasm hall. Ride the mine cart to cross the chasm.')
    : !S.defeated.mole ? 'Defeat the Mole King. Stand by a crystal pillar when he tunnels: he will crash into it.'
    : !g.open.boss ? 'Open the amethyst door north of the chasm with the Boss Key.'
    : !S.defeated.hydra ? 'Defeat the Crystal Hydra. Dodge a head\'s bite, then strike it while it is stuck in the ground.' : 'The vault is still. Take the stairs back up.' });
{
  const D = VAULT_D;
  carve(D, 6, 1, 33, 10);                          // the Crystal Hydra's lair
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // the chasm hall
  for (let x = 12; x <= 27; x++) for (let y = 16; y <= 20; y++) dset(D, x, y, DEEP);
  carve(D, 28, 21, 30, 23);                        // key alcove (south bank)
  carve(D, 1, 13, 10, 24);                         // the Mole King's den
  carve(D, 3, 26, 36, 33);                         // the dark gallery
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 27], [3, 20, 32]]) D.switches.push({ id: 'p' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
  RAILS.push({ pts: [[(D.x0 + 23) * T + 16, 22 * T + 16], [(D.x0 + 23) * T + 16, 14 * T + 8]] });
}
// ---------- the Verdant Wilds: a jungle island reached on the back of an old sea turtle ----------
const JUNGLE_D = makeDungeon('jungle', 'The Verdant Wilds', 16, null, { outdoor: true, theme: 'jungle',
  objective: g => 'Canopy Camp sits by the turtle\'s landing. Ranger Tavi knows these woods. Cut through the tall grass, cross the river on the rope bridges, and watch out for thieving monkeys.' });
{
  const D = JUNGLE_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 23) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 5 + 300, y / 5) - 0.5) * 0.32;
    tiles[y * W + x] = y < 44 && d < 0.93 ? LAND : DEEP; region[y * W + x] = 14;
  }
  for (let y = 0; y < 8; y++) for (const lx of [19, 20]) if (!isLand(tiles[y * W + X + lx]) || y < 3) tiles[y * W + X + lx] = PLANK;
  // the river
  const pts = [[2, 17], [10, 19], [18, 23], [26, 21], [33, 25], [38, 27]];
  for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2; for (let k = 0; k <= n; k++) { const x = Math.round(ax + (bx - ax) * k / n), y = Math.round(ay + (by - ay) * k / n); for (let oy = -1; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) tiles[(y + oy) * W + X + x + ox] = DEEP; } }
  const road = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); for (const [xx, yy] of [[x, y], [x - 1, y], [x, y + 1], [x - 1, y + 1]]) { const k = yy * W + X + xx; if (tiles[k] === DEEP && yy > 8 && yy < 40) tiles[k] = PLANK; else if (isLand(tiles[k]) && tiles[k] !== PLANK) tiles[k] = PATH; } } };
  road(20, 4, 20, 14); road(20, 14, 11, 31); road(20, 14, 30, 30);
  D.camp = { x: (X + 20) * T, y: 11 * T }; D.temple = { x: (X + 30) * T, y: 33 * T };
  for (let y = 30; y <= 36; y++) for (let lx = 26; lx <= 34; lx++) tiles[y * W + X + lx] = PATH;
  D.start = { x: (X + 20) * T, y: 4 * T };
}
const nearJungleSite = (tx, ty, d) => [JUNGLE_D.camp, JUNGLE_D.temple].some(A => Math.hypot(tx - A.x / T, ty - A.y / T) < d) || Math.hypot(tx - JUNGLE_D.x0 - 20, ty - 4) < 3;
// ---------- the Serpent Temple: beneath the overgrown ruins of the Verdant Wilds ----------
const SERP = { x: JUNGLE_D.temple.x + 16, y: JUNGLE_D.temple.y - 2 * T + 4, tx: Math.round(JUNGLE_D.temple.x / T), ty: Math.round(JUNGLE_D.temple.y / T) - 2 };
ENTRANCES.push(SERP);
const SERP_D = makeDungeon('serpent', 'The Serpent Temple', 17, SERP, { tint: 'rgb(195,225,175)',
  gateMsg: 'A jade seal blocks the way. Strike the three jade switches in the gallery.', bossDoorMsg: 'A door carved like a great snake\'s mouth. The chameleon guards its key.',
  objective: g => !g.open.sw ? 'Strike the three jade switches in the gallery to break the seal.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall of the dart hall.' : 'Find a small key in the alcove east of the dart hall. Time your steps between the darts.')
    : !S.defeated.chameleon ? 'Defeat the Giant Chameleon. Watch the grass shake to find it, then strike while it is visible.'
    : !g.open.boss ? 'Open the serpent door north of the dart hall with the Boss Key.'
    : !S.defeated.serpent ? 'Defeat the Serpent Queen. Her scales are too tough: strike the glowing gem on her tail.' : 'The temple is silent. Take the stairs back up.' });
const DART_TRAPS = [];
{
  const D = SERP_D;
  carve(D, 6, 1, 33, 10);                          // the Serpent Queen's sanctum
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // the dart hall
  carve(D, 28, 20, 30, 22);                        // key alcove
  carve(D, 1, 13, 10, 24);                         // the chameleon's garden
  carve(D, 3, 26, 36, 33);                         // the gallery
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 27], [3, 20, 32]]) D.switches.push({ id: 'j' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
  for (const [x, y, dir, off] of [[11, 17, 1, 0], [11, 20, 1, 0.8], [11, 23, 1, 1.6], [28, 16, -1, 0.4], [28, 19, -1, 1.2]]) DART_TRAPS.push({ x: (D.x0 + x) * T + (dir > 0 ? 30 : 2), y: y * T + 4, dir, off, last: -1 });
}
// ---------- Petalfall Vale: a hidden blossom valley beyond the Frostmoor's mountain pass ----------
const LILY = 23;
const VALE_D = makeDungeon('vale', 'Petalfall Vale', 18, null, { outdoor: true, theme: 'blossom',
  objective: g => 'The village of Petalfall sits by the mountain pass. Grandmother Wren tends the shrine. Cross the ponds on the lily pads, but keep moving: they sink if you stand still.' });
const KOI_SPOTS = [];
{
  const D = VALE_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 23) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 5 + 400, y / 5) - 0.5) * 0.3;
    tiles[y * W + x] = y < 44 && d < 0.93 ? LAND : DEEP; region[y * W + x] = 15;
  }
  for (let y = 2; y < 9; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + X + lx] = LAND;
  const pond = (cx0, cy0, rx, ry) => { for (let y = cy0 - ry; y <= cy0 + ry; y++) for (let lx = cx0 - rx; lx <= cx0 + rx; lx++) if (Math.hypot((lx - cx0) / rx, (y - cy0) / ry) + (vnoise((X + lx) / 3 + 500, y / 3) - 0.5) * 0.25 < 1) tiles[y * W + X + lx] = DEEP; };
  pond(9, 24, 5, 4); pond(31, 19, 5, 4); pond(20, 34, 9, 5);
  for (let y = 33; y <= 35; y++) for (let lx = 19; lx <= 21; lx++) tiles[y * W + X + lx] = LAND; // the islet
  const pads = (x0, y0, x1, y1) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n + Math.sin(i * 1.3) * 0.6), y = Math.round(y0 + (y1 - y0) * i / n); for (const ox of [0, 1]) { const k = y * W + X + x + ox; if (tiles[k] === DEEP) tiles[k] = LILY; } } };
  pads(20, 27, 20, 33); pads(20, 35, 20, 41); pads(3, 24, 15, 24); pads(31, 14, 31, 24);
  for (const [cx0, cy0, rx, ry] of [[9, 24, 4, 3], [31, 19, 4, 3], [20, 34, 8, 4]]) for (let i = 0; i < 3; i++) { const a = i * 2.1 + cx0, x = Math.round(cx0 + Math.cos(a) * rx * 0.6), y = Math.round(cy0 + Math.sin(a) * ry * 0.6); if (tiles[y * W + X + x] === DEEP) KOI_SPOTS.push([X + x, y]); }
  pathLine(X + 20, 4, X + 20, 16); pathLine(X + 20, 16, X + 9, 19); pathLine(X + 20, 16, X + 30, 25);
  D.camp = { x: (X + 20) * T, y: 10 * T }; D.islet = { x: (X + 20) * T + 16, y: 34 * T + 16 };
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearValeSite = (tx, ty, d) => Math.hypot(tx - VALE_D.camp.x / T, ty - VALE_D.camp.y / T) < d || Math.hypot(tx - VALE_D.x0 - 20, ty - 4) < 3 || Math.hypot(tx - VALE_D.x0 - 20, ty - 34) < 2;
// ---------- the Shrine of Falling Petals: a sacred shrine in Petalfall Vale ----------
const SHRINE = findSpot(range(VALE_D.x0 + 28, VALE_D.x0 + 35), range(26, 38)) || findSpot(range(VALE_D.x0 + 4, VALE_D.x0 + 12), range(30, 40)) || { x: (VALE_D.x0 + 32) * T, y: 30 * T + 4, tx: VALE_D.x0 + 32, ty: 30 };
ENTRANCES.push(SHRINE); pathLine(VALE_D.x0 + 30, 25, SHRINE.tx, SHRINE.ty + 1);
const SHRINE_D = makeDungeon('shrine', 'The Shrine of Falling Petals', 19, SHRINE, { tint: 'rgb(240,218,232)',
  gateMsg: 'The shrine gate is sealed. Ring the three bells in the gallery.', bossDoorMsg: 'A sacred door painted with a dragon. The Elder Fox keeps its key.',
  objective: g => !g.open.sw ? 'Ring the three bells in the gallery to open the shrine gate.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall, north of the lily pond.' : 'Find a small key in the alcove east of the lily pond. Keep moving on the lily pads!')
    : !S.defeated.elderfox ? 'Defeat the Elder Fox. Strike the great bell to shatter her illusions.'
    : !g.open.boss ? 'Open the dragon door north of the lily pond with the Boss Key.'
    : !S.defeated.koidragon ? 'Defeat the Koi Dragon. Step off the island when it lunges, then strike it while it is stranded.' : 'Peace returns to the shrine. Take the stairs back up.' });
{
  const D = SHRINE_D;
  carve(D, 6, 1, 33, 10);                          // the Koi Dragon's sacred pool
  for (let y = 2; y <= 9; y++) for (let x = 8; x <= 31; x++) dset(D, x, y, DEEP);
  for (let y = 4; y <= 7; y++) for (let x = 17; x <= 22; x++) dset(D, x, y, FLOOR);   // the islet
  for (let y = 8; y <= 9; y++) for (const x of [19, 20]) dset(D, x, y, FLOOR);          // stone bridge
  for (const [x, y] of [[13, 3], [14, 3], [12, 5], [12, 6], [13, 8], [14, 8], [25, 3], [26, 3], [27, 5], [27, 6], [25, 8], [26, 8], [16, 2], [23, 2], [10, 7], [29, 7]]) dset(D, x, y, LILY);
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // the lily pond hall
  for (let y = 16; y <= 20; y++) for (let x = 12; x <= 27; x++) dset(D, x, y, DEEP);
  for (let y = 16; y <= 20; y++) { const o = (y % 2) ? 0 : 1; for (const x of [18 + o, 19 + o, 20 + o]) dset(D, x, y, LILY); }
  carve(D, 28, 20, 30, 22);                        // key alcove (south bank)
  carve(D, 1, 13, 10, 24);                         // the Elder Fox's courtyard
  carve(D, 3, 26, 36, 33);                         // the gallery
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 27], [3, 20, 32]]) D.switches.push({ id: 'k' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
}
// ---------- the Sunken Reef: a coral seabed reached by diving bell from Saltmarsh ----------
const REEF_D = makeDungeon('reef', 'The Sunken Reef', 20, null, { outdoor: true, theme: 'reef',
  objective: g => 'The Bubble Dome sits by the diving bell. Diver Marlo knows these waters. Watch your air: breathe at the bubble vents or inside the dome.' });
const AIR_VENTS = [];
{
  const D = REEF_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 22) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 6 + 600, y / 6) - 0.5) * 0.3;
    tiles[y * W + x] = y < 44 && d < 0.94 ? LAND : DEEP; region[y * W + x] = 16;
  }
  for (let y = 2; y < 9; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + X + lx] = LAND;
  // coral reefs: rocky outcrops across the seabed
  for (let y = 3; y < 42; y++) for (let lx = 3; lx < DW - 3; lx++) { if (Math.hypot(lx - 20, y - 10) < 7.5) continue; if (vnoise((X + lx) / 4 + 700, y / 4) > 0.7) tiles[y * W + X + lx] = DEEP; }
  pathLine(X + 20, 4, X + 20, 18); pathLine(X + 20, 18, X + 9, 32); pathLine(X + 20, 18, X + 31, 30); pathLine(X + 20, 18, X + 20, 38);
  D.camp = { x: (X + 20) * T, y: 10 * T };
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
  for (let i = 0; i < 4000 && AIR_VENTS.length < 12; i++) {
    const lx = 3 + Math.floor(hash(i, 919) * (DW - 6)), y = 14 + Math.floor(hash(919, i) * 28), x = X + lx;
    if (tiles[y * W + x] !== LAND || AIR_VENTS.some(v => Math.hypot(v.tx - x, v.ty - y) < 7)) continue;
    AIR_VENTS.push({ tx: x, ty: y, x: x * T + 16, y: y * T + 20 });
  }
}
const nearReefSite = (tx, ty, d) => Math.hypot(tx - REEF_D.camp.x / T, ty - REEF_D.camp.y / T) < d || Math.hypot(tx - REEF_D.x0 - 20, ty - 4) < 3 || AIR_VENTS.some(v => Math.hypot(v.tx - tx, v.ty - ty) < 2) || Math.hypot(tx - REEF_D.x0 - 20, ty - 39) < 4;
// ---------- the Drowned Palace: sunken ruins at the south of the reef ----------
const PALACE = { x: (REEF_D.x0 + 20) * T, y: 39 * T + 4, tx: REEF_D.x0 + 20, ty: 39 };
for (let y = 36; y <= 42; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + REEF_D.x0 + lx] = LAND;
ENTRANCES.push(PALACE);
const PALACE_D = makeDungeon('palace', 'The Drowned Palace', 21, PALACE, { tint: 'rgb(175,210,238)',
  gateMsg: 'The palace gate is sealed. Strike the three giant clams in the gallery.', bossDoorMsg: 'A great door carved with tentacles. The Siren keeps its key.',
  objective: g => !g.open.sw ? 'Strike the three giant clams in the flooded gallery. Mind your air!'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall of the eel hall.' : 'Find a small key in the alcove east of the eel hall.')
    : !S.defeated.siren ? 'Defeat the Siren. Her song drags you in and shields her: back away, then strike when she stops singing.'
    : !g.open.boss ? 'Open the tentacle door north of the eel hall with the Boss Key.'
    : !S.defeated.kraken ? 'Defeat the Kraken. Sever its tentacles while they rest on the floor, and its head will surface.' : 'The palace is quiet. Take the stairs back up.' });
{
  const D = PALACE_D;
  carve(D, 6, 1, 33, 10);                          // the Kraken's throne room
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // the eel hall
  carve(D, 28, 20, 30, 22);                        // key alcove
  carve(D, 1, 13, 10, 24);                         // the Siren's grotto
  carve(D, 3, 26, 36, 33);                         // the flooded gallery
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 27], [3, 20, 32]]) D.switches.push({ id: 'c' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
  for (const [x, y] of [[23, 38], [10, 30], [29, 30], [20, 19], [8, 18], [9, 3], [30, 3]]) AIR_VENTS.push({ tx: D.x0 + x, ty: y, x: (D.x0 + x) * T + 16, y: y * T + 20 });
}
// ---------- the Cogwork Ruins: an ancient clockwork city split into sealed sections ----------
const COG_D = makeDungeon('cog', 'The Cogwork Ruins', 22, null, { outdoor: true, theme: 'cog',
  objective: g => 'Tinker Ada works at the north gate. Machine walls split the ruins: step on a glowing teleport pad to jump to its twin.' });
const TELEPADS = [];
{
  const D = COG_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 22) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 6 + 800, y / 6) - 0.5) * 0.25;
    tiles[y * W + x] = y < 44 && d < 0.95 ? LAND : DEEP; region[y * W + x] = 17;
  }
  for (let y = 2; y < 9; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + X + lx] = LAND;
  // machine walls: one across the middle, one down the south half
  for (let lx = 0; lx < DW; lx++) for (const y of [17, 18]) tiles[y * W + X + lx] = DEEP;
  for (let y = 17; y < H; y++) for (const lx of [19, 20]) tiles[y * W + X + lx] = DEEP;
  // machine blocks scattered as obstacles
  for (const [lx, y, w, h] of [[6, 8, 2, 2], [31, 8, 3, 2], [10, 25, 3, 2], [27, 26, 2, 3], [5, 33, 2, 2], [33, 34, 2, 2], [13, 31, 2, 2], [25, 33, 3, 2]]) for (let yy = y; yy < y + h; yy++) for (let xx = lx; xx < lx + w; xx++) tiles[yy * W + X + xx] = DEEP;
  pathLine(X + 20, 4, X + 20, 14); pathLine(X + 20, 14, X + 8, 14); pathLine(X + 20, 14, X + 32, 14);
  const pad = (ax, ay, bx, by, col) => { for (const [x, y] of [[ax, ay], [bx, by]]) for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (tiles[yy * W + X + xx] === DEEP) tiles[yy * W + X + xx] = LAND; TELEPADS.push({ a: { x: (X + ax) * T + 16, y: ay * T + 16 }, b: { x: (X + bx) * T + 16, y: by * T + 16 }, col }); };
  pad(8, 14, 8, 22, '#7fe0f0'); pad(32, 14, 32, 22, '#ffd65a'); pad(15, 38, 25, 38, '#e888b4');
  D.camp = { x: (X + 20) * T, y: 9 * T };
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearCogSite = (tx, ty, d) => Math.hypot(tx - COG_D.camp.x / T, ty - COG_D.camp.y / T) < d || Math.hypot(tx - COG_D.x0 - 20, ty - 4) < 3 || TELEPADS.some(p => [p.a, p.b].some(q => Math.hypot(tx - q.x / T, ty - q.y / T) < 2.5));
// ---------- the Clock Tower: the heart of the Cogwork Ruins ----------
const TOWER = findSpot(range(COG_D.x0 + 6, COG_D.x0 + 14), range(30, 40)) || findSpot(range(COG_D.x0 + 3, COG_D.x0 + 16), range(22, 41)) || { x: (COG_D.x0 + 9) * T, y: 36 * T + 4, tx: COG_D.x0 + 9, ty: 36 };
ENTRANCES.push(TOWER);
const TOWER_D = makeDungeon('tower', 'The Clock Tower', 23, TOWER, { tint: 'rgb(235,215,180)',
  gateMsg: 'The tower gate is locked tight. Pull the three levers in the gear gallery.', bossDoorMsg: 'A door shaped like a clock face. The Clockwork Knight keeps its key.',
  objective: g => !g.open.sw ? 'Pull the three levers in the gear gallery. The conveyor belts carry you: dash across them.'
    : !g.open.lock ? (g.keys ? 'Use the small key on the door in the west wall of the turret hall.' : 'The key alcove is sealed: find the teleport pad in the turret hall that leads inside.')
    : !S.defeated.knight2 ? 'Defeat the Clockwork Knight. Lure him into the swinging pendulum to smash his armor.'
    : !g.open.boss ? 'Open the clock-face door north of the turret hall with the Boss Key.'
    : !S.defeated.clock ? 'Defeat the Great Clock. Strike the three escapement gears while they glow to jam it, then hit its face.' : 'The clock has stopped for good. Take the stairs back down.' });
{
  const D = TOWER_D;
  carve(D, 6, 1, 33, 10);                          // the Great Clock's chamber
  carve(D, 19, 11, 20, 12);
  carve(D, 12, 13, 27, 24);                        // the turret hall
  carve(D, 29, 19, 32, 23);                        // sealed key alcove (reached by teleport)
  carve(D, 1, 13, 10, 24);                         // the Clockwork Knight's hall
  carve(D, 3, 26, 36, 33);                         // the gear gallery
  for (let x = 3; x <= 36; x++) { for (const y of [28, 29]) { dset(D, x, y, WIND); JET.set(y * W + D.x0 + x, [-1, 0]); } for (const y of [30, 31]) { dset(D, x, y, WIND); JET.set(y * W + D.x0 + x, [1, 0]); } }
  carve(D, 19, 34, 20, 34); entryHall(D);
  addDoor(D, 'sw', 'switch', [[19, 25], [20, 25]], GATE);
  addDoor(D, 'lock', 'lock', [[11, 14], [11, 15]], LOCK, [10, 14]);
  addDoor(D, 'boss', 'boss', [[19, 11], [20, 11]], BDOOR);
  for (const [i, x, y] of [[1, 5, 27], [2, 34, 27], [3, 34, 33]]) D.switches.push({ id: 'l' + i, x: (D.x0 + x) * T + 16, y: y * T + 22 });
  for (const [x, y] of [[15, 34], [24, 34], [8, 25], [30, 25], [14, 12], [25, 12], [10, 0], [29, 0], [3, 12], [8, 12]]) D.torches.push({ x, y });
  TELEPADS.push({ a: { x: (D.x0 + 25) * T + 16, y: 22 * T + 16 }, b: { x: (D.x0 + 30) * T + 16, y: 22 * T + 16 }, col: '#7fe07a' });
}
// ---------- Starfall Plateau: a night plateau above the clouds, reached on a moonbeam ----------
const STAR_D = makeDungeon('star', 'Starfall Plateau', 24, null, { outdoor: true, theme: 'star',
  objective: g => 'The Observatory sits by the moonbeam. Astronomer Lio studies the falling stars. When a meteor shower starts, get out of the red rings, then grab the star shards they leave.' });
{
  const D = STAR_D, X = D.x0;
  for (let y = 0; y < H; y++) for (let lx = 0; lx < DW; lx++) {
    const x = X + lx, dx = (lx - 19.5) / 18.5, dy = (y - 22) / 21;
    const d = Math.hypot(dx, dy) + (vnoise(x / 5 + 900, y / 5) - 0.5) * 0.36;
    tiles[y * W + x] = y < 44 && d < 0.9 ? LAND : DEEP; region[y * W + x] = 18;
  }
  for (let y = 2; y < 9; y++) for (let lx = 16; lx <= 24; lx++) tiles[y * W + X + lx] = LAND;
  pathLine(X + 20, 4, X + 20, 16); pathLine(X + 20, 16, X + 9, 28); pathLine(X + 20, 16, X + 31, 27); pathLine(X + 20, 16, X + 20, 36);
  D.camp = { x: (X + 20) * T, y: 10 * T };
  D.start = { x: (X + 20) * T, y: 4 * T + 8 };
}
const nearStarSite = (tx, ty, d) => Math.hypot(tx - STAR_D.camp.x / T, ty - STAR_D.camp.y / T) < d || Math.hypot(tx - STAR_D.x0 - 20, ty - 4) < 3;
const trapState = tr => { const ph = (time + tr.off) % 2.4; return ph < 1.3 ? 0 : ph < 1.75 ? 1 : 2; };


// ---------- houses, villages and their interiors ----------
const MAT = 18;
const HOUSE = { x: cx * T - 84, y: cy * T - 66 }; // bottom-center of Oma's cottage
const HOUSES = [{ id: 'oma', name: 'Oma\'s Cottage', style: 'red', kind: 'home', x: HOUSE.x, y: HOUSE.y, tx: Math.floor(HOUSE.x / T), ty: Math.floor(HOUSE.y / T) }];
function houseFits(tx, ty) {
  for (let y = ty - 3; y <= ty; y++) for (let x = tx - 2; x <= tx + 2; x++) {
    const t = tileAt(x, y);
    if (!isLand(t) || t === ICE || t === PLANK || (t === PATH && y < ty)) return false;
  }
  if (HOUSES.some(h => Math.abs(h.tx - tx) < 5 && Math.abs(h.ty - ty) < 5)) return false;
  if (ENTRANCES.some(E => Math.hypot(E.tx - tx, E.ty - ty) < 5) || nearArena(tx, ty, 8)) return false;
  return true;
}
function addHouse(id, name, style, kind, wx, wy) {
  const offs = []; for (let r = 0; r <= 7; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) offs.push([dx, dy]);
  for (const [dx, dy] of offs) {
    const tx = wx + dx, ty = wy + dy;
    if (houseFits(tx, ty)) { const h = { id, name, style, kind, tx, ty, x: tx * T + 16, y: ty * T + 2 }; HOUSES.push(h); return h; }
  }
  return null;
}
addHouse('pell', 'Pell\'s Farmhouse', 'red', 'home', cx + 6, cy + 7);
addHouse('marla', 'The Guardhouse', 'stone', 'guard', cx + 5, cy - 4);
addHouse('hob', 'The Chapel', 'stone', 'chapel', cx - 8, cy - 2);
// Saltmarsh Hamlet, a fishing hamlet on the southeast coast
const HAM1 = addHouse('nell', 'Nell\'s Cottage', 'red', 'home', cx + 11, cy + 12);
const HAM2 = addHouse('hut', 'The Fisher\'s Hut', 'stone', 'home', cx + 16, cy + 12);
if (HAM1) pathLine(cx + 1, cy + 3, HAM1.tx, HAM1.ty + 1);
if (HAM1 && HAM2) pathLine(HAM1.tx, HAM1.ty + 1, HAM2.tx, HAM2.ty + 1);
const HAMLET = HAM1 ? { x: ((HAM1.tx + (HAM2 ? HAM2.tx : HAM1.tx + 5)) / 2) * T + 16, y: (HAM1.ty + 2) * T } : null;
// Frosthold, a snowy village by the Frostmoor dock
{
  const X = FROST_D.x0;
  const F1 = addHouse('ysolde', 'Frosthold Trading Post', 'snow', 'shop', X + 14, 12);
  const F2 = addHouse('bjorn', 'Bjorn\'s Longhouse', 'snow', 'home', X + 28, 12);
  const F3 = addHouse('inn', 'The Hearth Inn', 'snow', 'inn', X + 11, 18);
  for (const F of [F1, F2, F3]) if (F) pathLine(X + 20, 9, F.tx, F.ty + 1);
}
const FROSTHOLD = { x: (FROST_D.x0 + 20) * T, y: 11 * T };
// Mirra Oasis and Corsair's Cove on the Sunward Isles
{
  const X = SUN_D.x0;
  const M1 = addHouse('zahir', 'Zahir\'s Bazaar', 'sand', 'shop', X + 14, 14);
  const M2 = addHouse('amara', 'Amara\'s House', 'sand', 'home', X + 26, 14);
  const M3 = addHouse('mirrainn', 'The Palm Inn', 'sand', 'inn', X + 14, 25);
  const C1 = addHouse('rosa', 'Captain Rosa\'s Quarters', 'sand', 'guard', X + 30, 31);
  const C2 = addHouse('tavern', 'The Salty Anchor', 'stone', 'inn', X + 35, 27);
  for (const F of [M1, M2, M3]) if (F) pathLine(X + 20, 13, F.tx, F.ty + 1);
  for (const F of [C1, C2]) if (F) pathLine(X + 31, 27, F.tx, F.ty + 1);
}
const MOSSHUT = addHouse('moss', 'Mother Moss\'s Hut', 'red', 'home', MIRE_D.x0 + 15, 10);
if (MOSSHUT) pathLine(MIRE_D.x0 + 20, 12, MOSSHUT.tx, MOSSHUT.ty + 1);
const nearHouse = (tx, ty, d) => HOUSES.some(h => Math.hypot(tx - h.tx, ty - h.ty + 1.5) < d) || (HAMLET && Math.hypot(tx - HAMLET.x / T, ty - HAMLET.y / T) < 5);
// interiors live in the unused rows under the first three dungeon strips, three rooms per strip
const INTERIORS = [];
HOUSES.forEach((h, i) => {
  if (i >= 15) return;
  const s = Math.floor(i / 3), k = i % 3, ix = OW + 2 + s * DW + 1 + k * 13;
  const I = { id: h.id, name: h.name, house: h, x0: ix, style: h.style, kind: h.kind };
  h.interior = I; INTERIORS.push(I);
  for (let y = 46; y <= 54; y++) for (let x = ix; x <= ix + 11; x++) { tiles[y * W + x] = WALL; region[y * W + x] = 7; }
  for (let y = 47; y <= 53; y++) for (let x = ix + 1; x <= ix + 10; x++) tiles[y * W + x] = FLOOR;
  tiles[54 * W + ix + 5] = MAT; tiles[54 * W + ix + 6] = MAT;
  I.start = { x: (ix + 6) * T, y: 52 * T + 16 };
});
const interiorAt = (x, y) => INTERIORS.find(I => x >= I.x0 * T && x < (I.x0 + 12) * T && y >= 46 * T && y < 55 * T);

const nearFrostSite = (tx, ty, d) => [FROST_D.camp, FROST_D.shrine, FROST_D.fire].some(A => Math.hypot(tx - A.x / T, ty - A.y / T) < d);
const dungeonAt = x => DUNGEONS.find(D => x >= D.x0 * T && x < (D.x0 + DW) * T);
const dgs = D => (S.dgs[D.id] = S.dgs[D.id] || { open: {}, chests: {}, switches: {}, keys: 0, bossKey: false });
// flood-fill rooms (doors count as walls) so a gate knows which creatures guard it
const dreg = new Int16Array(W * H).fill(-1);
{
  let id = 0;
  for (let y = 0; y < H; y++) for (let x = OW + 2; x < W; x++) {
    const t0 = tiles[y * W + x]; if ((t0 !== FLOOR && t0 !== STAIRS && t0 !== BOG) || dreg[y * W + x] >= 0) continue;
    const q = [[x, y]]; dreg[y * W + x] = id;
    while (q.length) { const [qx, qy] = q.pop(); for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) { const t = tileAt(nx, ny); if ((t === FLOOR || t === STAIRS || t === BOG) && dreg[ny * W + nx] < 0) { dreg[ny * W + nx] = id; q.push([nx, ny]); } } }
    id++;
  }
  for (const D of DUNGEONS) for (const d of D.doors) d.reg = dreg[d.below[1] * W + D.x0 + d.below[0]];
}
let dockY = cy;
for (let y = cy; y < H; y++) if (isLand(tileAt(cx, y)) && isLand(tileAt(cx - 1, y))) dockY = y; else break;
for (let y = cy; y <= dockY; y++) { tiles[y * W + cx] = PATH; tiles[y * W + cx - 1] = PATH; }
const bridgeTiles = [];
for (let y = dockY + 1; y < H; y++) bridgeTiles.push([cx - 1, y], [cx, y]);
const isBridge = (x, y) => (x === cx - 1 || x === cx) && y > dockY;

// ---------- sprite helpers ----------
function spr(c, key, x, y, scale = 2) { const a = ATLAS[key]; if (a) c.drawImage(IMG.kenney_atlas, a[0], a[1], 16, 16, x, y, 16 * scale, 16 * scale); }
// draw a 16px sprite anchored at its bottom-center
function sprB(c, key, x, bottom, scale) { spr(c, key, Math.round(x - 8 * scale), Math.round(bottom - 16 * scale), scale); }
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
function ellipse(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill(); }
function diamond(c, x, y, w, h) { c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + w, y); c.lineTo(x, y + h * 0.5); c.lineTo(x - w, y); c.closePath(); c.fill(); }

// ---------- terrain cache ----------
// The terrain is pre-rendered into 1024px-wide chunks; cctx broadcasts drawing to the chunk(s) in focus.
const CHUNK = 32, CW = CHUNK * T, NCH = Math.ceil(W / CHUNK);
const chunks = Array.from({ length: NCH }, (_, i) => { const cv = document.createElement('canvas'); cv.width = CW; cv.height = H * T; const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, -i * CW, 0); return { cv, g }; });
const cctx = (() => {
  const all = chunks.map(c => c.g); let targets = all;
  const api = { focus(x) { targets = [all[Math.min(NCH - 1, Math.floor(x / CHUNK))]]; }, focusAll() { targets = all; } };
  return new Proxy(api, {
    get(_, k) { if (k in api) return api[k]; const v = all[0][k]; if (typeof v === 'function') return (...a) => { let r; for (const g of targets) r = g[k](...a); return r; }; return v; },
    set(_, k, v) { for (const g of all) g[k] = v; return true; },
  });
})();
function refreshMini() { const m = miniCache.getContext('2d'); m.imageSmoothingEnabled = true; chunks.forEach((ch, i) => m.drawImage(ch.cv, 0, 0, CW, H * T, i * CHUNK * 2, 0, CHUNK * 2, H * 2)); }
const miniCache = document.createElement('canvas'); miniCache.width = W * 2; miniCache.height = H * 2;
function edgeKey(prefix, other, x, y) {
  const n = other(x, y - 1), s = other(x, y + 1), e = other(x + 1, y), w = other(x - 1, y);
  if (n && w) return prefix + 'tl'; if (n && e) return prefix + 'tr';
  if (s && w) return prefix + 'bl'; if (s && e) return prefix + 'br';
  if (n) return prefix + 't'; if (s) return prefix + 'b'; if (w) return prefix + 'l'; if (e) return prefix + 'r';
  if (other(x - 1, y - 1)) return prefix + 'inw'; if (other(x + 1, y - 1)) return prefix + 'ine';
  if (other(x + 1, y + 1)) return prefix + 'ise'; if (other(x - 1, y + 1)) return prefix + 'isw';
  return prefix + 'c';
}
const landForShore = (x, y) => isLand(tileAt(x, y)) && !isBridge(x, y);
const notPath = (x, y) => tileAt(x, y) !== PATH;
const floorLike = t => t === FLOOR || t === STAIRS || t === BOG || t === WIND || t === GATE || t === LOCK || t === BDOOR;
function drawOutdoorTile(c, x, y, px, py, t) {
  if (dungeonAt(px).theme === 'sky') { drawSkyTile(c, x, y, px, py, t); return; }
  if (dungeonAt(px).theme === 'cave') { drawCaveTile(c, x, y, px, py, t); return; }
  if (dungeonAt(px).theme === 'blossom') { drawBlossomTile(c, x, y, px, py, t); return; }
  if (dungeonAt(px).theme === 'reef') { drawReefTile(c, x, y, px, py, t); return; }
  if (dungeonAt(px).theme === 'cog') { drawCogTile(c, x, y, px, py, t); return; }
  if (dungeonAt(px).theme === 'star') { drawStarTile(c, x, y, px, py, t); return; }
  if (t === BOG) {
    const hb = hash(x, y); c.fillStyle = '#2e3a1e'; c.fillRect(px, py, T, T); c.fillStyle = '#3d4a26'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
    c.fillStyle = 'rgba(120,140,60,.35)'; ellipse(c, px + 8 + hb * 16, py + 10 + hb * 10, 4, 2); ellipse(c, px + 22 - hb * 10, py + 22, 3, 1.5);
    if (hb > 0.6) { c.fillStyle = '#4f9a4a'; ellipse(c, px + 10, py + 22, 6, 3); c.fillStyle = '#2f6b3a'; c.fillRect(px + 10, py + 21, 6, 1); }
    return;
  }
  const h = hash(x, y), landish = (xx, yy) => isLand(tileAt(xx, yy)) && tileAt(xx, yy) !== ICE;
  if (t === LAVA) {
    c.fillStyle = '#c8401a'; c.fillRect(px, py, T, T); c.fillStyle = '#ff7a2a'; c.fillRect(px + 3, py + 3, T - 6, T - 6);
    c.fillStyle = '#ffb347'; ellipse(c, px + 8 + h * 14, py + 10 + h * 8, 5, 2.5); ellipse(c, px + 22 - h * 8, py + 22, 4, 2);
    c.fillStyle = '#2a1a16'; for (const [ox, oy, ok] of [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]]) if (isLand(tileAt(x + ox, y + oy))) { if (ok < 2) c.fillRect(px, py + (ok ? T - 4 : 0), T, 4); else c.fillRect(px + (ok === 3 ? T - 4 : 0), py, 4, T); }
    return;
  }
  if (t === ICE) {
    spr(c, 'w_c', px, py); c.fillStyle = 'rgba(232,246,255,.78)'; c.fillRect(px, py, T, T);
    c.strokeStyle = 'rgba(150,200,230,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + h * 20, py + 4); c.lineTo(px + 10 + h * 10, py + 18); c.lineTo(px + 26, py + 22 + h * 6); c.stroke();
  } else if (!isLand(t)) {
    spr(c, edgeKey('w_', (xx, yy) => isLand(tileAt(xx, yy)), x, y), px, py); c.fillStyle = { sand: 'rgba(40,200,190,.18)', swamp: 'rgba(25,55,30,.5)', ash: 'rgba(30,20,24,.55)', dusk: 'rgba(8,12,36,.62)', jungle: 'rgba(20,120,90,.32)' }[dungeonAt(px).theme] || 'rgba(40,90,140,.28)'; c.fillRect(px, py, T, T);
  } else if (t === PLANK) {
    c.fillStyle = '#6a4a30'; c.fillRect(px, py, T, T); c.fillStyle = '#8a6440'; for (let i = 0; i < 4; i++) c.fillRect(px, py + i * 8 + 1, T, 6);
    if (!dungeonAt(px).theme) { c.fillStyle = 'rgba(240,247,255,.45)'; c.fillRect(px, py, T, T); }
  } else if (dungeonAt(px).theme === 'jungle') {
    spr(c, h < 0.4 ? 'grass1' : 'grass0', px, py);
    if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    c.fillStyle = t === PATH ? 'rgba(90,70,30,.18)' : 'rgba(20,90,30,.32)'; c.fillRect(px, py, T, T);
    if (t !== PATH && h > 0.8) { c.fillStyle = 'rgba(30,70,20,.5)'; c.beginPath(); c.ellipse(px + h * 22, py + 8 + h * 14, 6, 3, h * 3, 0, Math.PI * 2); c.fill(); }
    if (t === PATH && h < 0.15) { c.fillStyle = 'rgba(80,90,70,.35)'; c.fillRect(px + 4, py + 4, 10, 8); c.fillRect(px + 16, py + 16, 10, 8); }
  } else if (dungeonAt(px).theme === 'dusk') {
    spr(c, h < 0.3 ? 'grass1' : 'grass0', px, py);
    if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    c.fillStyle = t === PATH ? 'rgba(30,30,60,.5)' : 'rgba(18,26,58,.55)'; c.fillRect(px, py, T, T);
    if (t !== PATH && h > 0.85) { c.fillStyle = 'rgba(150,140,200,.4)'; c.fillRect(px + h * 22, py + 6 + h * 14, 2, 5); }
  } else if (dungeonAt(px).theme === 'ash') {
    spr(c, 'p_c', px, py);
    c.fillStyle = t === PATH ? 'rgba(28,22,26,.72)' : 'rgba(58,48,46,.74)'; c.fillRect(px, py, T, T);
    if (t === PATH) { c.fillStyle = 'rgba(120,100,140,.25)'; c.fillRect(px + h * 20, py + 4 + h * 18, 6, 2); }
    else { if (h > 0.78) { c.fillStyle = 'rgba(20,16,16,.55)'; c.fillRect(px + h * 22, py + 6 + h * 14, 4, 3); } if (h < 0.06) { c.fillStyle = 'rgba(255,120,40,.6)'; c.fillRect(px + 10, py + 18, 2, 2); } }
  } else if (dungeonAt(px).theme === 'swamp') {
    spr(c, h < 0.3 ? 'grass1' : 'grass0', px, py);
    if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    c.fillStyle = t === PATH ? 'rgba(30,40,20,.38)' : 'rgba(20,48,30,.48)'; c.fillRect(px, py, T, T);
    if (t !== PATH && h > 0.82) { c.fillStyle = 'rgba(150,200,110,.45)'; c.fillRect(px + h * 22, py + 6 + h * 14, 2, 5); c.fillRect(px + h * 22 + 3, py + 8 + h * 14, 2, 4); }
  } else if (dungeonAt(px).theme === 'sand') {
    spr(c, 'p_c', px, py);
    c.fillStyle = t === PATH ? 'rgba(120,80,40,.22)' : 'rgba(255,232,170,.28)'; c.fillRect(px, py, T, T);
    if (h > 0.75) { c.fillStyle = 'rgba(150,100,50,.35)'; c.fillRect(px + h * 22, py + 6 + h * 14, 3, 2); c.fillRect(px + 4 + h * 10, py + 20, 2, 2); }
    if (h < 0.08) { c.strokeStyle = 'rgba(160,110,60,.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 4, py + 12); c.quadraticCurveTo(px + 16, py + 8, px + 28, py + 12); c.stroke(); }
  } else {
    spr(c, h < 0.35 ? 'grass1' : 'grass0', px, py);
    if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    c.fillStyle = t === PATH ? 'rgba(236,244,252,.42)' : 'rgba(242,248,255,.72)'; c.fillRect(px, py, T, T);
    if (t !== PATH && h > 0.7) { c.fillStyle = 'rgba(180,205,230,.6)'; c.fillRect(px + h * 22, py + 6 + h * 14, 6, 2); }
  }
}
function drawDungeonTile(c, x, y) {
  if (c.focus) c.focus(x);
  const t = tileAt(x, y), px = x * T, py = y * T, D = dungeonAt(px + 16);
  c.fillStyle = '#0b0910'; c.fillRect(px, py, T, T);
  const IN = interiorAt(px + 16, py + 16);
  if (IN) { drawInteriorTile(c, x, y, IN); return; }
  if (!D) return;
  if (D.outdoor) { drawOutdoorTile(c, x, y, px, py, t); return; }
  const lx = x - D.x0;
  if (D.id === 'shrine' && (t === DEEP || t === LILY)) { drawBlossomTile(c, x, y, px, py, t); return; }
  if (t === LAVA) {
    const h = hash(x, y); c.fillStyle = '#c8401a'; c.fillRect(px, py, T, T); c.fillStyle = '#ff7a2a'; c.fillRect(px + 3, py + 3, T - 6, T - 6);
    c.fillStyle = '#ffb347'; ellipse(c, px + 8 + h * 14, py + 10 + h * 8, 5, 2.5); ellipse(c, px + 22 - h * 8, py + 22, 4, 2);
    c.fillStyle = '#2a1a16'; if (floorLike(tileAt(x, y - 1))) c.fillRect(px, py, T, 4); if (floorLike(tileAt(x, y + 1))) c.fillRect(px, py + T - 4, T, 4); if (floorLike(tileAt(x - 1, y))) c.fillRect(px, py, 4, T); if (floorLike(tileAt(x + 1, y))) c.fillRect(px + T - 4, py, 4, T);
    return;
  }
  if (t === DEEP) { c.fillStyle = '#030308'; c.fillRect(px, py, T, T); if (floorLike(tileAt(x, y - 1))) { c.fillStyle = '#2a2638'; c.fillRect(px, py, T, 12); c.fillStyle = '#1a1826'; c.fillRect(px, py + 8, T, 4); } return; }
  if (t === POOL) spr(c, 'w_c', px, py);
  else if (floorLike(t)) {
    const h = hash(x, y); spr(c, h < 0.03 ? 'd_floor2' : h < 0.12 ? 'd_floor1' : 'd_floor0', px, py);
    if (!floorLike(tileAt(x, y - 1))) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(px, py, T, 8); }
    if (t === STAIRS) spr(c, 'd_stairs', px, py);
    if (t === GATE) spr(c, 'd_gate', px, py);
    if (t === LOCK) spr(c, 'd_door', px, py);
    if (t === BDOOR) spr(c, 'd_bossdoor', px, py);
    if (t === WIND && D.id === 'tower') { c.fillStyle = '#2a2830'; c.fillRect(px, py, T, T); c.fillStyle = '#3a3840'; for (let i = 0; i < 4; i++) c.fillRect(px + i * 8, py + 2, 4, T - 4); c.fillStyle = '#8a7a50'; c.fillRect(px, py, T, 2); c.fillRect(px, py + T - 2, T, 2); }
    else if (t === WIND) { c.fillStyle = 'rgba(190,235,255,.45)'; c.fillRect(px, py, T, T); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px, py + 14, T, 3); }
    if (t === BOG) {
      const hb = hash(x, y); c.fillStyle = 'rgba(40,58,24,.82)'; c.fillRect(px, py, T, T);
      c.fillStyle = 'rgba(120,150,60,.35)'; ellipse(c, px + 8 + hb * 16, py + 10 + hb * 10, 4, 2); ellipse(c, px + 22 - hb * 10, py + 22, 3, 1.5);
      if (hb > 0.6) { c.fillStyle = '#4f9a4a'; ellipse(c, px + 10, py + 22, 6, 3); }
    }
  } else if (floorLike(tileAt(x, y + 1))) {
    spr(c, D.torches.some(q => q.x === lx && q.y === y) ? 'd_walltorch' : 'd_wall', px, py);
  } else {
    let near = false; for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (floorLike(tileAt(x + xx, y + yy))) near = true;
    if (near) spr(c, 'd_top', px, py);
  }
  if (D.tint && t !== POOL) { c.globalCompositeOperation = 'multiply'; c.fillStyle = D.tint; c.fillRect(px, py, T, T); c.globalCompositeOperation = 'source-over'; }
}
function redrawArea(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= OW + 2) drawDungeonTile(cctx, x, y);
  refreshMini();
}
function buildCache() {
  const c = cctx; c.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++) for (let x = OW + 2; x < W; x++) drawDungeonTile(c, x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < OW; x++) {
    const t = tiles[y * W + x], px = x * T, py = y * T, h = hash(x, y), rg = region[y * W + x];
    c.focus(x);
    if (!isLand(t) || isBridge(x, y)) { spr(c, edgeKey('w_', landForShore, x, y), px, py); }
    else {
      const flowers = rg === 3 ? 0.22 : rg === 0 ? 0.08 : 0.05;
      spr(c, h < flowers ? 'grass2' : h < 0.35 ? 'grass1' : 'grass0', px, py);
      if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    }
  }
  // region color washes: one pixel per tile, scaled up smoothly so biomes blend instead of forming squares
  const tint = document.createElement('canvas'); tint.width = W; tint.height = H;
  const tc = tint.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < OW; x++) {
    const t = tiles[y * W + x], rg = region[y * W + x];
    if (isLand(t) && t !== PATH && !isBridge(x, y) && REGION_TINT[rg]) { tc.fillStyle = REGION_TINT[rg]; tc.fillRect(x, y, 1, 1); }
  }
  c.focusAll(); c.imageSmoothingEnabled = true; c.drawImage(tint, 0, 0, W * T, H * T); c.imageSmoothingEnabled = false;
  // arena floor: worn stone circle with a rune ring
  c.fillStyle = 'rgba(60,48,96,.30)'; ellipse(c, ARENA.x, ARENA.y, ARENA.r, ARENA.r * 0.82);
  c.strokeStyle = 'rgba(230,224,255,.45)'; c.lineWidth = 4; c.beginPath(); c.ellipse(ARENA.x, ARENA.y, ARENA.r - 10, ARENA.r * 0.82 - 10, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(230,224,255,.35)';
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.fillRect(ARENA.x + Math.cos(a) * (ARENA.r - 26) - 3, ARENA.y + Math.sin(a) * (ARENA.r * 0.82 - 22) - 3, 6, 6); }
  for (const [x, y] of bridgeTiles) {
    const px = x * T, py = y * T;
    if (S.bridge) {
      c.fillStyle = '#7a4a28'; c.fillRect(px, py, T, T);
      c.fillStyle = '#9a6234'; for (let i = 0; i < 4; i++) c.fillRect(px, py + i * 8 + 1, T, 6);
      c.fillStyle = '#3b2414'; c.fillRect(x === cx - 1 ? px : px + T - 3, py, 3, T);
    } else if ((y - dockY) % 2 === 1) {
      c.fillStyle = '#4b3220'; c.fillRect(px + 6, py + 10, 5, 14); c.fillRect(px + 21, py + 10, 5, 14);
    }
  }
  refreshMini();
}
const walkable = (px, py) => { const x = Math.floor(px / T), y = Math.floor(py / T); return isLand(tileAt(x, y)) && (!isBridge(x, y) || S.bridge); };

// ---------- state ----------
const ITEMS = {
  wood:    { name: 'Wood', price: 2 },
  stone:   { name: 'Stone', price: 3 },
  herb:    { name: 'Herb', price: 3 },
  goo:     { name: 'Slime Goo', price: 4 },
  crystal: { name: 'Crystal', price: 15 },
  planks:  { name: 'Plank Bundle', price: 14 },
  potion:  { name: 'Meadow Tonic', price: 20 },
  charm:   { name: 'Crystal Charm', price: 70 },
  crown:   { name: 'Slime Crown', price: 120 },
  gem:     { name: 'Hollow Gem', price: 250 },
  pearl:   { name: 'Sea Pearl', price: 200 },
  relic:   { name: 'Knight\'s Relic', price: 300 },
  horn:    { name: 'Jarl\'s Horn', price: 300 },
  frostheart: { name: 'Frost Heart', price: 350 },
  fang:    { name: 'Wyrm Fang', price: 400 },
  heartwood: { name: 'Heartwood', price: 500 },
  dragonscale: { name: 'Dragon Scale', price: 600 },
  stormcore: { name: 'Storm Core', price: 650 },
  soulgem: { name: 'Soul Gem', price: 700 },
  prismheart: { name: 'Prism Heart', price: 700 },
  serpenteye: { name: 'Serpent\'s Eye', price: 750 },
  dragonpearl: { name: 'Dragon Pearl', price: 800 },
  krakenbeak: { name: 'Kraken Beak', price: 850 },
  clockheart: { name: 'Clockwork Heart', price: 900 },
  obsidian: { name: 'Obsidian', price: 10 },
  feather: { name: 'Gale Feather', price: 8 },
  ectoplasm: { name: 'Ectoplasm', price: 9 },
  glimmer: { name: 'Glimmerstone', price: 12 },
  jade: { name: 'Jade', price: 11 },
  petal: { name: 'Spirit Petal', price: 10 },
  coral: { name: 'Sea Coral', price: 11 },
  gear: { name: 'Brass Gear', price: 12 },
  starshard: { name: 'Star Shard', price: 14 },
  sunstone: { name: 'Sunstone', price: 450 },
};
// Weapons and armor: craft them at the workbench, then equip one of each.
const WEAPONS = {
  wood:    { name: 'Wooden Sword', dmg: 1, col: '#d8c7a0', desc: 'Your trusty starter sword.' },
  stone:   { name: 'Stone Sword', dmg: 2, col: '#cfcac2', cost: { wood: 4, stone: 6 }, desc: 'Double damage. Heavy and reliable.' },
  crystal: { name: 'Crystal Blade', dmg: 2, col: '#b9a8ff', cost: { crystal: 3, wood: 3 }, reach: 8, desc: 'Double damage with a longer reach.' },
  venom:   { name: 'Venom Fang', dmg: 2, col: '#7fd17a', cost: { goo: 8, herb: 4, crystal: 2 }, poison: true, desc: 'Poisons whatever it cuts, bosses included: 3 extra damage over time.' },
  royal:   { name: 'Royal Blade', dmg: 3, col: '#f4b740', cost: { crown: 1, crystal: 4 }, lifesteal: true, desc: 'Forged from the Slime Crown. Triple damage, and each foe you defeat restores a heart.' },
  arcane:  { name: 'Arcane Edge', dmg: 3, col: '#d6b8ff', cost: { gem: 1, crystal: 5 }, beam: true, desc: 'Cut from the Hollow Gem. Triple damage, and fires a sword beam while your hearts are full.' },
  frost:   { name: 'Frostbite Blade', dmg: 3, col: '#9fe8ff', cost: { frostheart: 1, crystal: 6 }, freeze: true, desc: 'Forged from the Frost Heart. Triple damage, and freezes foes so they move at a crawl.' },
  sun:     { name: 'Sunblade', dmg: 4, col: '#ffd65a', cost: { sunstone: 1, crystal: 8 }, beam: true, beamAlways: true, desc: 'Forged from the Sunstone. Quadruple damage, and every swing fires a beam of sunlight.' },
  comet:   { name: 'Comet Edge', dmg: 4, col: '#9fd4ff', cost: { starshard: 8, crystal: 6 }, beam: true, desc: 'Forged from star shards. Quadruple damage, and fires a beam of starlight while your hearts are full.' },
  chrono:  { name: 'Chronoblade', dmg: 5, col: '#f2dca0', cost: { clockheart: 1, gear: 8 }, chain: true, reach: 6, desc: 'Ticking with the Clockwork Heart. Five times damage, long reach, and its sparks leap to nearby foes.' },
  clockblade: { name: 'Clockwork Blade', dmg: 3, col: '#d0aa5c', cost: { gear: 6, crystal: 4 }, chain: true, desc: 'A humming brass blade. Triple damage, and its sparks often leap to a nearby foe.' },
  coralsaber: { name: 'Coral Saber', dmg: 3, col: '#e8703a', cost: { coral: 6, crystal: 4 }, reach: 10, freeze: true, desc: 'A blade of living coral. Triple damage, long reach, and its sting slows foes.' },
  bloom:   { name: 'Blossom Blade', dmg: 3, col: '#f2a0c8', cost: { petal: 6, crystal: 4 }, bloom: true, desc: 'Petals bloom along the edge. Triple damage, and some hits restore a heart.' },
  jadefang: { name: 'Jade Fang', dmg: 3, col: '#5ab87a', cost: { jade: 6, goo: 4 }, poison: true, desc: 'Carved from jungle jade. Triple damage, and poisons whatever it cuts.' },
  prism:   { name: 'Prism Blade', dmg: 3, col: '#c8bcff', cost: { glimmer: 6, crystal: 4 }, crit: true, desc: 'Cut from glimmerstone. Triple damage, and one swing in four strikes twice as hard.' },
  pearl:   { name: 'Moonpearl Blade', dmg: 5, col: '#ffe9f2', cost: { dragonpearl: 1, petal: 8 }, beam: true, beamAlways: true, desc: 'Set with the Dragon Pearl. Five times damage, and every swing fires a beam of moonlight.' },
  soul:    { name: 'Soulreaver', dmg: 5, col: '#7fe07a', cost: { soulgem: 1, ectoplasm: 8 }, lifesteal: true, desc: 'Bound to the Soul Gem. Five times damage, the strongest blade there is, and each foe you defeat restores a heart.' },
  storm:   { name: 'Stormbrand', dmg: 4, col: '#fff6a8', cost: { stormcore: 1, feather: 6 }, beam: true, reach: 8, desc: 'Forged around the Storm Core. Quadruple damage, long reach, and fires a lightning beam while your hearts are full.' },
  moon:    { name: 'Moonblade', dmg: 3, col: '#d6e2ff', cost: { ectoplasm: 6, crystal: 4 }, glow: true, desc: 'Silvered with ectoplasm. Triple damage, lights up the dark, and strikes shades anywhere.' },
  gale:    { name: 'Gale Blade', dmg: 3, col: '#bfefff', cost: { feather: 5, crystal: 4 }, reach: 12, desc: 'Light as the wind. Triple damage with the longest reach of any blade.' },
  obsidian: { name: 'Obsidian Edge', dmg: 3, col: '#6a5a8a', cost: { obsidian: 6, crystal: 3 }, desc: 'Volcanic glass, sharp as a razor. Triple damage, no trophy needed.' },
  great:   { name: 'Bone Greatsword', dmg: 4, col: '#e6ecff', cost: { relic: 1, stone: 10 }, heavy: true, desc: 'The Bone Knight\'s blade. Quadruple damage in a wide arc, but slower swings.' },
};
const ARMORS = {
  cloth:   { name: 'Traveler\'s Clothes', hearts: 0, desc: 'Comfortable, not protective.' },
  plank:   { name: 'Plank Armor', hearts: 1, tint: ['#3b2414', '#8a5a32', '#c99a63'], cost: { planks: 3, goo: 2 }, desc: '+1 heart.' },
  silk:    { name: 'Silk Cloak', hearts: 1, tint: ['#6b6878', '#d9d6e6', '#ffffff'], cost: { goo: 10, herb: 6 }, speed: 1.15, desc: '+1 heart and 15% faster movement.' },
  stone:   { name: 'Stone Mail', hearts: 2, tint: ['#2c2a2a', '#6c6764', '#b4b1ab'], cost: { stone: 10, planks: 2 }, desc: '+2 hearts.' },
  crystal: { name: 'Crystal Plate', hearts: 3, tint: ['#2b2060', '#6c5ce7', '#d8d0ff'], cost: { crystal: 4, stone: 6 }, sturdy: true, desc: '+3 hearts, and hits barely knock you back.' },
  sunfang: { name: 'Sunfang Scale', hearts: 4, tint: ['#6b4a1c', '#d9a23c', '#ffe9a8'], cost: { fang: 1, goo: 6 }, speed: 1.1, desc: 'Scales of the Sand Wyrm. +4 hearts and 10% faster movement.' },
  fur:     { name: 'Jarl\'s Fur Mantle', hearts: 4, tint: ['#4a3524', '#a07b56', '#efe6d8'], cost: { horn: 1, goo: 8 }, warm: true, desc: '+4 hearts, and too warm to be slowed by ice, webs or chills.' },
  dragonscale: { name: 'Dragonscale Mail', hearts: 6, tint: ['#3a0e0a', '#8a2a1a', '#ffb347'], cost: { dragonscale: 1, obsidian: 6 }, sturdy: true, fireproof: true, desc: 'Scales of the Magma Drake. +6 hearts, barely knocked back, and fire only deals 1 damage.' },
  barkskin: { name: 'Barkskin Mail', hearts: 5, tint: ['#2a1c10', '#5a3e26', '#7fb85a'], cost: { heartwood: 1, herb: 10 }, regen: true, desc: 'Grown from the Rotroot\'s heart. +5 hearts, and slowly heals you anywhere.' },
  abyssal: { name: 'Abyssal Plate', hearts: 8, tint: ['#1a1030', '#6a3a8a', '#9fe8ff'], cost: { krakenbeak: 1, coral: 8 }, sturdy: true, breath: 3, desc: 'Forged from the Kraken\'s beak. +8 hearts, the most of any armor, barely knocked back, and triple air underwater.' },
  serpentscale: { name: 'Serpent Scale Armor', hearts: 7, tint: ['#1a3a1a', '#4a8a3a', '#ffd65a'], cost: { serpenteye: 1, jade: 8 }, sturdy: true, regen: true, desc: 'Scales of the Serpent Queen. +7 hearts, the most of any armor, barely knocked back, and slowly heals you.' },
  prismplate: { name: 'Prismatic Plate', hearts: 6, tint: ['#2a2050', '#a593ff', '#9fe8ff'], cost: { prismheart: 1, glimmer: 6 }, speed: 1.15, sturdy: true, desc: 'Grown from the Hydra\'s heart. +6 hearts, 15% faster, and hits barely knock you back.' },
  stargazer: { name: 'Stargazer Robe', hearts: 5, tint: ['#1a1840', '#5a4a9a', '#ffe9a8'], cost: { starshard: 8, goo: 6 }, regen: true, desc: 'Embroidered with star shards. +5 hearts, and slowly heals you anywhere.' },
  brassplate: { name: 'Brass Plate', hearts: 5, tint: ['#5a4020', '#b08a44', '#f2dca0'], cost: { gear: 8, stone: 6 }, sturdy: true, desc: 'Riveted brass armor. +5 hearts, and hits barely knock you back.' },
  coralmail: { name: 'Diver\'s Coral Mail', hearts: 4, tint: ['#2a3a5a', '#e8703a', '#9fd4f5'], cost: { coral: 8, goo: 6 }, breath: 2, desc: '+4 hearts, and you can hold your breath twice as long underwater.' },
  petalrobe: { name: 'Petalweave Robe', hearts: 4, tint: ['#6a3a5a', '#f2a0c8', '#ffe9f2'], cost: { petal: 8, herb: 6 }, regen: true, desc: 'Woven from spirit petals. +4 hearts, and slowly heals you anywhere.' },
  ranger:  { name: 'Ranger\'s Garb', hearts: 4, tint: ['#2a3a1a', '#5a7a3a', '#c9d68a'], cost: { jade: 8, herb: 6 }, speed: 1.2, desc: 'Light jungle leathers. +4 hearts and 20% faster movement.' },
  glimmermail: { name: 'Glimmer Mail', hearts: 4, tint: ['#2a3a6a', '#5a7ab0', '#9fe8ff'], cost: { glimmer: 8, crystal: 4 }, speed: 1.1, desc: 'Light crystal scales. +4 hearts and 10% faster movement.' },
  gravecoat: { name: 'Gravewarden Coat', hearts: 4, tint: ['#14121a', '#3a3650', '#b8a8ff'], cost: { ectoplasm: 8, stone: 4 }, sturdy: true, desc: '+4 hearts, and hits barely knock you back.' },
  windweave: { name: 'Windweave Cloak', hearts: 3, tint: ['#3a5a7a', '#9fd4f5', '#ffffff'], cost: { feather: 8, goo: 4 }, speed: 1.25, desc: 'Woven from gale feathers. +3 hearts and 25% faster movement.' },
  ashguard: { name: 'Ashguard Plate', hearts: 3, tint: ['#1a1414', '#4a3e3a', '#ff7a2a'], cost: { obsidian: 8, stone: 6 }, sturdy: true, fireproof: true, desc: '+3 hearts, barely knocked back, and fire, flame vents and fireballs only deal 1 damage.' },
  tide:    { name: 'Tide Mail', hearts: 3, tint: ['#0d4b5a', '#2fa6b8', '#d6f7ff'], cost: { pearl: 1, goo: 6 }, regen: true, desc: 'Woven around the Sea Pearl. +3 hearts, and slowly heals you anywhere.' },
};
const gearW = () => WEAPONS[S.gear.weapon] || WEAPONS.wood;
const gearA = () => ARMORS[S.gear.armor] || ARMORS.cloth;
const maxHp = () => 6 + gearA().hearts;
const weaponDmg = () => { if (gearW().crit && rng() < 0.25) { floatText(P.x, P.y - 70, 'Prism crit!', '#c8bcff'); return gearW().dmg * 2; } return gearW().dmg; };
let craftTab = 'items', shopName = 'Oma Fen\'s Shop';
// ---------- quests ----------
const QUESTS = [
  { id: 'pests', giver: 'pell', name: 'Pest Control', goal: { kill: [['green', 5]] }, reward: { gold: 40, items: { potion: 2 } },
    offer: ['Slimes keep oozing into my turnip patch! Ruined half the crop.', 'Squash five of the green ones for me and I\'ll make it worth your while.'],
    done: ['Not a slime in sight! Here, take these tonics and a bit of coin.'] },
  { id: 'herbs', giver: 'oma', name: 'Herbal Remedy', goal: { bring: { herb: 6 } }, reward: { gold: 20, items: { potion: 3 } },
    offer: ['My knees ache something fierce when the sea air rolls in.', 'Bring me six herbs and I\'ll brew enough tonic for the both of us.'],
    done: ['Lovely, fresh herbs! Here are three tonics, still warm.'] },
  { id: 'bandits', giver: 'marla', name: 'Bandit Trouble', goal: { kill: [['bandit', 3]] }, reward: { gold: 60, items: { crystal: 2 } },
    offer: ['Bandits wash up with every storm and prey on travelers along the roads.', 'They grab your purse and run. Catch three of them and the island owes you.'],
    done: ['Three fewer thieves on my roads. Good work, recruit. Your pay.'] },
  { id: 'ring', giver: 'pell', name: 'The Lost Ring', req: 'pests', goal: { find: 'ring' }, reward: { gold: 50, items: { crystal: 3 } },
    offer: ['I dropped my wife\'s ring while gathering firewood in the western forest.', 'Look for something sparkling between the trees. Please, before she notices!'],
    done: ['That\'s it! You saved my marriage. Take this, I found these crystals in the field.'] },
  { id: 'lumber', giver: 'tobin', name: 'Lumber for the Crew', goal: { bring: { wood: 10, planks: 4 } }, reward: { gold: 90 },
    offer: ['The crew will need extra timber for scaffolding.', 'Bring ten wood and four plank bundles and I\'ll pay above market.'],
    done: ['Fine timber. The crew will be glad. Here, as promised.'] },
  { id: 'rats', giver: 'pell', name: 'Rat Catcher', req: 'ring', goal: { kill: [['rat', 6]] }, reward: { gold: 50, items: { goo: 5 } },
    offer: ['Rats from the quarry are chewing through my grain sacks.', 'Six of the little thieves should send the rest a message.'],
    done: ['My grain is safe. You\'re handier than any cat.'] },
  { id: 'hunter', giver: 'marla', name: 'Monster Hunter', req: 'bandits', goal: { kill: [['snail', 3], ['mage', 3]] }, reward: { gold: 100, items: { crystal: 5 } },
    offer: ['Giant snails in the meadow and hooded cultists in the grove. Strange times.', 'Bring down three of each. Hit snails before they hide, and watch for fireballs.'],
    done: ['You\'ve the makings of a fine hunter. Take these crystals for your next blade.'] },
  { id: 'mine', giver: 'hob', name: 'Into the Old Mine', goal: { boss: ['wizard'] }, reward: { gold: 150 },
    offer: ['A darkness has nested beneath the quarry. The Old Mine.', 'Its master is a hollow sorcerer. Free the mine and the shrine will reward you.'],
    done: ['I felt the darkness lift from here. Bless you, and take this offering.'] },
  { id: 'cleanse', giver: 'hob', name: 'Cleanse the Island', req: 'mine', goal: { boss: ['crab', 'knight'] }, reward: { gold: 200, items: { crystal: 5 } },
    offer: ['Two more shadows remain: the drowned temple to the southwest, and the crypt in the western woods.', 'Defeat King Clawdius and the Bone Knight.'],
    done: ['The island breathes easy at last. You have done a great deed.'] },
  { id: 'voyage', giver: 'nell', name: 'Sunward Bound', req: 'bisque', hint: 'Sail Nell\'s boat to the Sunward Isles', foundText: 'You reached the isles! Tell Nell.', goal: { find: 'sun' }, reward: { gold: 40, items: { potion: 1 } },
    offer: ['My boat can carry you south to the Sunward Isles. Desert, palms, and trouble.', 'Take her out and come tell me what you think of the place.'],
    done: ['Sunburnt already! Told you. Keep the boat ready whenever you need it.'] },
  { id: 'spores', giver: 'moss', name: 'Spore Samples', goal: { kill: [['shroom', 5]] }, reward: { gold: 100, items: { potion: 3 } },
    offer: ['Hello, dearie. The shroomlings are breeding faster than I can brew.', 'Squash five of them for me. And hold your breath near their spore clouds!'],
    done: ['Lovely, lovely. These spores will make a fine tonic. Take some, on the house.'] },
  { id: 'hexes', giver: 'moss', name: 'Hex Breaker', req: 'spores', goal: { kill: [['hexer', 3], ['bogslime', 3]] }, reward: { gold: 140, items: { crystal: 4 } },
    offer: ['Hooded hexers are cursing the bog, and the bog slimes grow fat on their magic.', 'Three hexers and three bog slimes, dearie. Mind the purple light: it turns your feet around.'],
    done: ['The curse is weakening already. You\'re braver than you look.'] },
  { id: 'sprites', giver: 'lio', name: 'Twinkle Trouble', goal: { kill: [['starsprite', 5]] }, reward: { gold: 160, items: { starshard: 4 } },
    offer: ['Welcome to the Observatory! I\'m Lio. The star sprites keep flitting in front of my telescope.', 'Catch five of them, would you? They burst into little stars when they attack: dodge sideways.'],
    done: ['Clear skies at last! Here, some star shards. They glow beautifully in a blade.'] },
  { id: 'lens', giver: 'lio', name: 'The Lost Lens', req: 'sprites', hint: 'Search Starfall Plateau for Lio\'s telescope lens', foundText: 'Found it! Bring it to Lio.', goal: { find: 'lens' }, reward: { gold: 180, items: { potion: 3 } },
    offer: ['A meteor knocked the lens right out of my telescope! It rolled off somewhere on the plateau.', 'Keep an eye on the sky while you look. The showers come often.'],
    done: ['My lens! Not a scratch on it. Now I can see the stars again.'] },
  { id: 'starfoes', giver: 'lio', name: 'Fallen Stars', req: 'lens', goal: { kill: [['voidorb', 3], ['mgolem', 3], ['hopper', 3]] }, reward: { gold: 280, items: { crystal: 6, starshard: 4 } },
    offer: ['Void orbs pull travelers in, meteor golems burn and blow up, and lunar hoppers come crashing down from on high.', 'Three of each. Step away from a golem when it falls, and never stand where a hopper is about to land!'],
    done: ['The plateau is safe for stargazing again. Thank you, friend.'] },
  { id: 'tower', giver: 'ada', name: 'The Clock Tower', req: 'clockfoes', goal: { boss: ['knight2', 'clock'] }, reward: { gold: 600, items: { crystal: 16 } },
    offer: ['The tower in the southwest still ticks. Inside is the Great Clock that powers every machine in the ruins.', 'A clockwork knight guards it, and the clock itself has gone wild. Jam its gears and stop it. Carefully!'],
    done: ['Silence, at last! The Clockwork Heart is yours. Set it in a blade and time itself will be on your side.'] },
  { id: 'bots', giver: 'ada', name: 'Rogue Machines', goal: { kill: [['sparkbot', 4], ['turret', 2]] }, reward: { gold: 150, items: { gear: 4 } },
    offer: ['Oh! A visitor! Mind the wires. I\'m Ada, I study these ruins. The old machines have woken up, and they\'re not friendly.', 'Shut down four sparkbots and two gear turrets. Turrets turn slowly: come at them from the side.'],
    done: ['Marvelous! Look at these gears, perfectly preserved. Take some, they make excellent armor.'] },
  { id: 'mainspring', giver: 'ada', name: 'The Mainspring', req: 'bots', hint: 'Search the Cogwork Ruins for the great mainspring', foundText: 'Found it! Bring it to Ada.', goal: { find: 'mainspring' }, reward: { gold: 170, items: { potion: 3 } },
    offer: ['The heart of this whole city is a great mainspring. I think it came loose and rolled off somewhere.', 'The ruins are split into sections. Step on the glowing pads to jump between them.'],
    done: ['The mainspring! With this I can finally wind up the old clock tower. Thank you!'] },
  { id: 'clockfoes', giver: 'ada', name: 'Wind Them Down', req: 'mainspring', goal: { kill: [['soldier', 3], ['beetle', 3]] }, reward: { gold: 260, items: { crystal: 6, gear: 4 } },
    offer: ['Clockwork soldiers march the ruins, and bomb beetles leave ticking presents everywhere.', 'Three of each. A soldier winds down after three thrusts: that\'s your chance. And run from the bombs!'],
    done: ['Quiet at last. You\'d make a fine engineer, you know.'] },
  { id: 'palace', giver: 'marlo', name: 'The Drowned Palace', req: 'deepreef', goal: { boss: ['siren', 'kraken'] }, reward: { gold: 580, items: { crystal: 16 } },
    offer: ['At the south edge of the reef lie the ruins of a sunken palace. Sailors say a Siren sings there, luring divers in.', 'And below her throne waits the Kraken. Bring plenty of air, friend, and cover your ears.'],
    done: ['The Kraken, beaten! Every diver on the reef owes you a drink. That beak will make armor fit for the deep.'] },
  { id: 'jellies', giver: 'marlo', name: 'Stinging Waters', goal: { kill: [['jellyfish', 5]] }, reward: { gold: 150, items: { coral: 4 } },
    offer: ['Ahoy, diver! Marlo\'s the name. The jellyfish are swarming over the reef, stinging anyone who passes.', 'Pop five of them. When one glows yellow, back off: it\'s about to zap everything around it.'],
    done: ['Much better! Take some coral. The smiths up top will know what to do with it.'] },
  { id: 'compass', giver: 'marlo', name: 'The Lost Compass', req: 'jellies', hint: 'Search the Sunken Reef for Marlo\'s brass compass', foundText: 'Found it! Bring it to Marlo.', goal: { find: 'compass' }, reward: { gold: 170, items: { potion: 3 } },
    offer: ['A shark chased me and I dropped my lucky compass somewhere on the reef.', 'Watch your air while you search. The bubble vents will refill it.'],
    done: ['My compass! It still points true. You\'re a natural diver.'] },
  { id: 'deepreef', giver: 'marlo', name: 'Teeth and Spines', req: 'compass', goal: { kill: [['shark', 3], ['puffer', 3], ['eel', 3]] }, reward: { gold: 260, items: { crystal: 6, coral: 4 } },
    offer: ['Sharks circle the deep, pufferfish puff up full of spines, and moray eels lunge out of every hole in the reef.', 'Three of each. Hit a pufferfish only when it\'s deflated, and strike an eel right after it lunges.'],
    done: ['The reef is safe for divers again. You\'ve earned your fins, friend.'] },
  { id: 'shrine', giver: 'wren', name: 'The Shrine of Falling Petals', req: 'tricks', goal: { boss: ['elderfox', 'koidragon'] }, reward: { gold: 560, items: { crystal: 15 } },
    offer: ['The old shrine to the east has been closed for years. The Elder Fox guards its gate with tricks and illusions.', 'Within lies the sacred pool, and the great koi there has grown into a dragon. Ring the great bell to see through the fox\'s tricks, dear.'],
    done: ['The shrine bells are ringing again! Keep the Dragon Pearl. It glows like the moon on the pond.'] },
  { id: 'moths', giver: 'wren', name: 'Sleepy Wings', goal: { kill: [['moth', 5]] }, reward: { gold: 150, items: { petal: 4 } },
    offer: ['Oh, a traveler! How lovely. Would you help an old woman? The blossom moths have grown far too many.', 'Their pollen makes everyone so drowsy, the whole village naps past noon. Five of them, if you please. Hold your breath near the pink clouds.'],
    done: ['Wonderful! Here, take some spirit petals. They shimmer so prettily.'] },
  { id: 'comb', giver: 'wren', name: 'The Pearl Comb', req: 'moths', hint: 'Find Wren\'s pearl comb on the islet in the south pond', foundText: 'Found it! Bring it to Wren.', goal: { find: 'comb' }, reward: { gold: 170, items: { potion: 3 } },
    offer: ['A koi leapt up and snatched my pearl comb, then dropped it on the little island in the south pond.', 'You\'ll have to cross on the lily pads. Keep moving, dear: they sink if you stand still!'],
    done: ['My comb! My mother gave me this. Thank you, thank you.'] },
  { id: 'tricks', giver: 'wren', name: 'Tricks and Tails', req: 'comb', goal: { kill: [['tanuki', 3], ['fox', 3], ['koi', 3]] }, reward: { gold: 260, items: { crystal: 6, petal: 4 } },
    offer: ['Tanuki pretend to be pots, spirit foxes make copies of themselves, and the koi leap out to splash passersby.', 'Three of each, if you\'re brave. Watch for pots that blink, and hit a koi while it flops on the shore.'],
    done: ['Peace in Petalfall again. You\'re always welcome for tea, dear.'] },
  { id: 'temple', giver: 'tavi', name: 'The Serpent Temple', req: 'wilds', goal: { boss: ['chameleon', 'serpent'] }, reward: { gold: 540, items: { crystal: 14 } },
    offer: ['Beneath the ruins lies the Serpent Temple. The old folk worshipped the Serpent Queen there, and she never left.', 'A giant chameleon prowls her garden, unseen. Watch for the grass moving. Then face the Queen herself. Her tail is her weakness.'],
    done: ['You did it! The Wilds will tell stories about you for a hundred years. That eye will make armor no claw can pierce.'] },
  { id: 'snaps', giver: 'tavi', name: 'Hungry Plants', goal: { kill: [['snapjaw', 4], ['dartfrog', 3]] }, reward: { gold: 150, items: { jade: 4 } },
    offer: ['Welcome to the Wilds! I\'m Tavi, the ranger here. The snapjaws have spread onto the paths, and the dart frogs spit poison.', 'Four snapjaws and three dart frogs. Snapjaws can\'t move, so stay out of biting range and strike after they snap.'],
    done: ['The paths are safe again. Take this jade: the smiths love it.'] },
  { id: 'jadeidol', giver: 'tavi', name: 'The Jade Idol', req: 'snaps', hint: 'Search the Verdant Wilds for a small jade idol', foundText: 'Found it! Bring it to Tavi.', goal: { find: 'jadeidol' }, reward: { gold: 170, items: { potion: 3 } },
    offer: ['A monkey ran off with the jade idol from the temple shrine! It must have dropped it somewhere in the jungle.', 'Search the tall grass and the riverbanks. Cut the grass with your sword to look underneath.'],
    done: ['The idol is home! The old temple feels a little less angry already.'] },
  { id: 'wilds', giver: 'tavi', name: 'Wild Things', req: 'jadeidol', goal: { kill: [['raptor', 4], ['monkey', 3]] }, reward: { gold: 250, items: { crystal: 6, jade: 4 } },
    offer: ['Raptors hunt in pairs on the jungle floor, and the thief monkeys keep raiding my camp.', 'Four raptors and three monkeys. If a monkey grabs your gold, chase it down to get it back!'],
    done: ['Ha! You\'re a true ranger now. The Wilds are lucky to have you.'] },
  { id: 'vault', giver: 'quill', name: 'The Prism Vault', req: 'deep', goal: { boss: ['mole', 'hydra'] }, reward: { gold: 520, items: { crystal: 14 } },
    offer: ['In the south cavern there\'s a sealed vault of pure crystal. The old miners called it the Prism Vault.', 'The Mole King guards its door, and something with three heads sleeps at the bottom. Bring me back a story, friend.'],
    done: ['A three-headed crystal hydra! I\'ll be telling this one for years. That Prism Heart will make armor fit for a king.'] },
  { id: 'shards', giver: 'quill', name: 'Prickly Neighbors', goal: { kill: [['shardback', 4], ['geode', 2]] }, reward: { gold: 150, items: { glimmer: 4 } },
    offer: ['Careful where you step, friend! Shardbacks fire splinters when you hit them, and the geode golems pack a punch.', 'Clear out four shardbacks and two geodes so I can get back to digging. Hit a shardback, then step back!'],
    done: ['Ha! The tunnels are mine again. Here, some glimmerstone. It makes a mighty sharp blade.'] },
  { id: 'goldpick', giver: 'quill', name: 'The Golden Pick', req: 'shards', hint: 'Search Glimmerdeep for Quill\'s golden pickaxe', foundText: 'Found it! Bring it to Quill.', goal: { find: 'goldpick' }, reward: { gold: 170, items: { potion: 3 } },
    offer: ['I dropped my lucky golden pickaxe when the burrowers chased me. Somewhere out past the chasms.', 'Take the mine carts across. They\'re rickety, but they\'ve never thrown anyone off. Well. Rarely.'],
    done: ['My lucky pick! Fifty years I\'ve had this. Thank you kindly.'] },
  { id: 'deep', giver: 'quill', name: 'Things That Dig', req: 'goldpick', goal: { kill: [['glimbat', 6], ['burrower', 4]] }, reward: { gold: 260, items: { crystal: 8 } },
    offer: ['Glimmerbats swarm the high caves, and burrowers pop up and pelt my carts with rocks.', 'Six glimmerbats and four burrowers. A burrower is safe underground: wait for it to pop up, then strike!'],
    done: ['Peace and quiet, and plenty of crystals. You\'re welcome down here any time.'] },
  { id: 'ossuary', giver: 'morrow', name: 'The Moonveil Ossuary', req: 'restless', goal: { boss: ['shadow', 'lich'] }, reward: { gold: 500, items: { crystal: 12 } },
    offer: ['Beneath the ruined chapel lies the ossuary. The Lich King sleeps there, and his magic is what keeps the dead from resting.', 'They say whoever enters must first face their own shadow. Take a light, and end this curse.'],
    done: ['The vale is quiet. Truly quiet. That Soul Gem is yours: bind it to a blade, and nothing will stand against you.'] },
  { id: 'lanterns', giver: 'morrow', name: 'Light the Way', goal: { lanterns: 8 }, reward: { gold: 150, items: { potion: 3 } },
    offer: ['A living soul? In Duskhollow? Well, well. I\'m Morrow. I keep the lanterns, or I did, until my knees gave out.', 'Eight spirit lanterns stand across the vale. Strike each one to light it. The shades fear their glow, and in it they can be hurt.'],
    done: ['Look at them shine! The vale hasn\'t been this bright in a hundred years. Take these, you\'ve earned them.'] },
  { id: 'bones', giver: 'morrow', name: 'Restless Bones', req: 'lanterns', goal: { kill: [['skeleton', 6]] }, reward: { gold: 160, items: { crystal: 4 } },
    offer: ['The skeletons in the old graveyard keep climbing out of their plots. Rude, I call it.', 'Put six back to rest. Mind you: when one falls apart, smash the bones, or it gets right back up.'],
    done: ['Quiet in the graveyard at last. Thank you, young one.'] },
  { id: 'restless', giver: 'morrow', name: 'Things in the Dark', req: 'bones', goal: { kill: [['shade', 4], ['banshee', 3], ['hound', 4]] }, reward: { gold: 250, items: { crystal: 6, ectoplasm: 4 } },
    offer: ['Shades drift through the dark, banshees wail in the hollows, and gloom hounds hunt anything that moves.', 'Four shades, three banshees and four hounds. Fight the shades by the lanterns, step away when a banshee starts to wail, and sidestep a hound\'s pounce.'],
    done: ['You have a brave heart. Keep that ectoplasm: silvered into a blade, it shines like the moon.'] },
  { id: 'spire', giver: 'aeris', name: 'The Storm Spire', req: 'skyfoes', goal: { boss: ['aegis', 'storm'] }, reward: { gold: 450, items: { crystal: 10 } },
    offer: ['See the white tower on the south isle? The Storm Spire. The old sky folk built it to tame the weather.', 'Now the Stormlord rules it, guarded by a great stone colossus. Climb the spire and break the storm, friend.'],
    done: ['Blue skies, for the first time in years! Take that Storm Core to a workbench. It will make a blade worthy of the wind.'] },
  { id: 'hawks', giver: 'aeris', name: 'Feathers on the Wind', goal: { kill: [['hawk', 5]] }, reward: { gold: 130, items: { feather: 4 } },
    offer: ['Welcome to the clouds, ground-walker! The gale hawks have grown bold, diving at anyone on the bridges.', 'Drive off five of them. When one hovers and screeches, it is about to swoop: step aside!'],
    done: ['The skies are calmer already. Keep those feathers: woven together, they make you fast as the wind.'] },
  { id: 'chime', giver: 'aeris', name: 'The Lost Wind Chime', req: 'hawks', hint: 'Search the Cloudspire Isles for a fallen wind chime', foundText: 'Found it! Bring it to Aeris.', goal: { find: 'chime' }, reward: { gold: 160, items: { potion: 3 } },
    offer: ['A storm tore my wind chime from the roost. Without it, I cannot hear the weather coming.', 'It must have landed on one of the other isles. The jet streams will carry you back quickly.'],
    done: ['Listen to it sing! Thank you, friend. These tonics will keep you steady up here.'] },
  { id: 'skyfoes', giver: 'aeris', name: 'Calm the Storm', req: 'chime', goal: { kill: [['puff', 4], ['windling', 4], ['sentinel', 2]] }, reward: { gold: 240, items: { crystal: 6, feather: 4 } },
    offer: ['Storm puffs throw lightning, windlings blow travelers around, and the old stone sentinels have woken.', 'Four puffs, four windlings and two sentinels. Sentinels block from the front: circle around and strike their backs.'],
    done: ['The isles are peaceful again. You may walk the clouds whenever you like.'] },
  { id: 'magma', giver: 'brakka', name: 'Hot Hoppers', goal: { kill: [['magmite', 6]] }, reward: { gold: 120, items: { obsidian: 4 } },
    offer: ['Magmites! Little blobs of lava, hopping into my forge and setting my boots on fire.', 'Pop six of them. Don\'t stand in the puddles they leave.'],
    done: ['Ha! My boots thank you. Here, some good obsidian. Bring more and I\'ll forge you a fine blade.'] },
  { id: 'bloom', giver: 'brakka', name: 'The Ember Bloom', req: 'magma', hint: 'Search Cinder Peak for a glowing Ember Bloom', foundText: 'Found it! Bring it to Brakka.', goal: { find: 'bloom' }, reward: { gold: 150, items: { potion: 3 } },
    offer: ['An Ember Bloom grows somewhere on this mountain. Its petals burn hotter than coal.', 'I need one to temper my steel. Look among the ash fields, and mind the vents!'],
    done: ['Look at that glow! My forge will sing tonight. Take these tonics, you\'ve earned them.'] },
  { id: 'cinderfoes', giver: 'brakka', name: 'Trouble on the Mountain', req: 'bloom', goal: { kill: [['imp', 4], ['boulderback', 3], ['salamander', 3]] }, reward: { gold: 220, items: { crystal: 5, obsidian: 4 } },
    offer: ['Imps throw fire at my ore carts, boulderbacks bowl them over, and salamanders spit flames at anyone passing.', 'Four imps, three boulderbacks and three salamanders. Tip: let a boulderback roll into a rock, then hit it while it\'s on its back!'],
    done: ['The road to the crater is safe again. You\'re tougher than obsidian, friend.'] },
  { id: 'forge', giver: 'brakka', name: 'The Molten Forge', req: 'cinderfoes', goal: { boss: ['forge', 'drake'] }, reward: { gold: 400, items: { crystal: 10 } },
    offer: ['Beneath the peak lies the old dwarven forge. Its iron master still works the anvil, and he won\'t let anyone pass.', 'Worse, a Magma Drake nests at the bottom. Its roar shakes my tools off the wall. End them both.'],
    done: ['The mountain is quiet! Bring that dragon scale to any workbench. It makes the finest armor I\'ve ever seen.'] },
  { id: 'hollow', giver: 'moss', name: 'The Rotting Hollow', req: 'hexes', goal: { boss: ['hag', 'treant'] }, reward: { gold: 350, items: { crystal: 8 } },
    offer: ['At the south end of the bog stands a great hollow tree. Something rotten has taken root inside.', 'My old rival, the Bog Hag, brews her poisons down there, and the tree itself has woken. Put them both to rest, dearie.'],
    done: ['The bog smells sweet again! Here, you\'ve earned every coin. Bring that heartwood to the bench: it makes fine armor.'] },
  { id: 'tomb', giver: 'amara', name: 'The Sunken Tomb', req: 'scorpions', goal: { boss: ['mummy', 'scarab'] }, reward: { gold: 300, items: { crystal: 6 } },
    offer: ['West of the oasis stands a pyramid swallowed by sand. My grandmother said a golden beast sleeps inside.', 'If the Sand Wyrm ever stops thrashing, the doors will clear. End the curse within.'],
    done: ['The curse is lifted! The oasis is filling again. You are Mirra\'s hero.'] },
  { id: 'scorpions', giver: 'amara', name: 'Scorpion Plague', goal: { kill: [['scorpion', 5]] }, reward: { gold: 90, items: { potion: 2 } },
    offer: ['Sand scorpions have been stinging our water carriers on the way to the oasis.', 'Please, thin them out. Five should make them wary.'],
    done: ['The carriers can walk in peace again. Mirra thanks you.'] },
  { id: 'idol', giver: 'rosa', name: 'The Golden Idol', hint: 'Search the Sunward Isles for a golden idol', foundText: 'Found it! Bring it to Rosa.', goal: { find: 'idol' }, reward: { gold: 120, items: { crystal: 4 } },
    offer: ['A storm scattered my treasure across the isle. One piece matters most: a golden idol.', 'Find it out in the dunes and there\'s a cut of the haul in it for you.'],
    done: ['My precious idol! Fair\'s fair, here\'s your share.'] },
  { id: 'wyrm', giver: 'rosa', name: 'The Sand Wyrm', req: 'idol', goal: { boss: ['wyrm'] }, reward: { gold: 250, items: { crystal: 6 } },
    offer: ['Something huge swims beneath the sand near the Sunken Ruins. It swallowed half my crew.', 'Kill the Sand Wyrm and I\'ll make you an honorary corsair.'],
    done: ['The beast is dead! Welcome to the crew, matey.'] },
  { id: 'bisque', giver: 'nell', name: 'Crab Stew', goal: { kill: [['crab', 4]] }, reward: { gold: 70, items: { potion: 2 } },
    offer: ['Welcome to Saltmarsh! I\'m Nell. I make the island\'s finest crab stew.', 'Trouble is, the meadow crabs fight back. Bring down four of them for me?'],
    done: ['Four fine crabs! There\'ll be stew for the whole hamlet. Here, for your trouble.'] },
  { id: 'raiderwatch', giver: 'bjorn', name: 'Raider Watch', goal: { kill: [['raider', 4]] }, reward: { gold: 120, items: { crystal: 3 } },
    offer: ['Raiders from the Jarl\'s camp prowl right up to our walls.', 'Drive off four of them and Frosthold will remember your name.'],
    done: ['Ha! They\'ll think twice before coming back. Take this, with our thanks.'] },
  { id: 'north', giver: 'tobin', name: 'Across the Bridge', cond: () => S.bridge, hint: 'Cross the bridge to the mainland', foundText: 'You made it! Return to Tobin.', goal: { find: 'frost' }, reward: { gold: 60, items: { potion: 2 } },
    offer: ['The bridge is sturdy as an oak. Now someone ought to see what\'s on the other side.', 'Walk south across it and tell me what you find on the mainland.'],
    done: ['Snow? A whole moor of it? I\'ll pack a heavier coat. Thanks, friend.'] },
  { id: 'winter', giver: 'marla', name: 'Winter\'s Bane', req: 'north', goal: { boss: ['jarl', 'wraith'] }, reward: { gold: 300, items: { crystal: 6 } },
    offer: ['Scouts say a viking warlord and a spirit of hail rule the Frostmoor.', 'Raiders have been eyeing our island. Put an end to Jarl Frostbeard and the Hailwraith.'],
    done: ['The raiders scattered the moment word spread. You\'re a legend now.'] },
  { id: 'hero', giver: 'hob', name: 'Hero of Brindle', req: 'cleanse', goal: { boss: ['slime', 'golem', 'wizard', 'queen', 'crab', 'bat', 'knight'] }, reward: { gold: 500 },
    offer: ['One last trial, should you seek it. Every great beast of this isle must fall.', 'All seven. Then the songs will be about you.'],
    done: ['Seven beasts, one hero. The bards are already arguing over rhymes. This is yours.'] },
];
const IDLE_TALK = {
  pell: ['Fine weather for turnips.', 'The chickens get nervous when slimes are near.'],
  marla: ['Keep your blade sharp and your purse close.', 'I\'ve seen fireballs in the grove. Cultists, mark my words.'],
  hob: ['May the tides guide you.', 'The shrine keeps watch over every soul on the isle.'],
  nell: ['The crabs have been bold this year. Bold and tasty.', 'Mind the nets, they bite back if you tangle them.'],
  amara: ['The oasis has never been so dry. Something drinks it from below.', 'Stay in the shade at midday, traveler.'],
  rosa: ['Arr, the sea is calm and the gold is warm.', 'Every sailor here owes me a favor. Or three.'],
  bjorn: ['Seventy winters I\'ve seen. This one has teeth.', 'Warm yourself at the Hearth Inn, friend. The bed is free.'],
};
const qState = id => S.quests[id];
const killsFor = (q, kind) => (S.kills[kind] || 0) - ((qState(q.id) && qState(q.id).base[kind]) || 0);
function questDone(q) {
  const g = q.goal;
  if (g.kill) return g.kill.every(([k, n]) => killsFor(q, k) >= n);
  if (g.bring) return Object.entries(g.bring).every(([k, n]) => S.inv[k] >= n);
  if (g.find) return !!S.found[g.find];
  if (g.boss) return g.boss.every(b => S.defeated[b]);
  if (g.lanterns) return litLanterns() >= g.lanterns;
  return false;
}
function questProgress(q) {
  const g = q.goal;
  if (g.kill) return g.kill.map(([k, n]) => `${ENEMY[k].name}s ${Math.min(n, killsFor(q, k))}/${n}`).join(', ');
  if (g.bring) return Object.entries(g.bring).map(([k, n]) => `${ITEMS[k].name} ${Math.min(n, S.inv[k])}/${n}`).join(', ');
  if (g.find) return S.found[g.find] ? (q.foundText || 'Found! Return it.') : (q.hint || 'Search the western forest');
  if (g.boss) return `Bosses ${g.boss.filter(b => S.defeated[b]).length}/${g.boss.length}`;
  if (g.lanterns) return `Spirit lanterns ${Math.min(g.lanterns, litLanterns())}/${g.lanterns}`;
  return '';
}
const questAvailable = q => !qState(q.id) && (!q.cond || q.cond()) && (!q.req || (qState(q.req) && qState(q.req).state === 'done'));
const questReady = q => qState(q.id) && qState(q.id).state === 'active' && questDone(q);
function questMark(id) {
  if (QUESTS.some(q => q.giver === id && questReady(q))) return '?';
  if (QUESTS.some(q => q.giver === id && questAvailable(q))) return '!';
  return null;
}
let questReadyNotified = {};
function questTick() {
  for (const q of QUESTS) if (questReady(q) && !questReadyNotified[q.id]) { questReadyNotified[q.id] = true; toast(`Quest complete: ${q.name}. Return to ${NPCS.find(n => n.id === q.giver).name}.`, 3500); SFX.play('lucky'); }
  updateHUD();
}
function spawnFind(item, rg, x0, w) {
  if (S.found[item] || pickups.some(p => p.item === item)) return;
  for (let i = 0; i < 4000; i++) {
    const x = x0 + 2 + Math.floor(hash(i, 131) * (w - 4)), y = 2 + Math.floor(hash(131, i) * 40);
    if (tiles[y * W + x] === LAND && region[y * W + x] === rg && !nearSunSite(x, y, 7) && !nearHouse(x, y, 4) && !(rg === 11 && nearSkySite(x, y, 9)) && !(rg === 13 && (nearCaveSite(x, y, 8) || y < 14)) && !(rg === 14 && nearJungleSite(x, y, 8)) && !(rg === 15 && nearValeSite(x, y, 8)) && !(rg === 16 && nearReefSite(x, y, 8)) && !(rg === 17 && nearCogSite(x, y, 7)) && !(rg === 18 && nearStarSite(x, y, 7)) && !(rg === 10 && (nearCinderSite(x, y, 8) || VENTS.some(v => Math.hypot(v.tx - x, v.ty - y) < 2)))) { pickups.push({ x: x * T + 16, y: y * T + 16, vx: 0, vy: 0, item, t: 0.4, keep: true }); return; }
  }
}
function spawnComb() { if (S.found.comb || pickups.some(p => p.item === 'comb')) return; pickups.push({ x: VALE_D.islet.x, y: VALE_D.islet.y, vx: 0, vy: 0, item: 'comb', t: 0.4, keep: true }); }
function spawnRing() {
  if (S.found.ring || pickups.some(p => p.item === 'ring')) return;
  for (let i = 0; i < 4000; i++) {
    const x = 2 + Math.floor(hash(i, 77) * (OW - 4)), y = 2 + Math.floor(hash(77, i) * (H - 4));
    if (tiles[y * W + x] === LAND && region[y * W + x] === 4 && Math.hypot(x - cx, y - cy) > 14) { pickups.push({ x: x * T + 16, y: y * T + 16, vx: 0, vy: 0, item: 'ring', t: 0.4, keep: true }); return; }
  }
}
function acceptQuest(q) {
  S.quests[q.id] = { state: 'active', base: { ...S.kills } };
  if (q.goal.find === 'ring') spawnRing();
  if (q.goal.find === 'idol') spawnFind('idol', 8, SUN_D.x0, DW);
  if (q.goal.find === 'bloom') spawnFind('bloom', 10, CINDER_D.x0, DW);
  if (q.goal.find === 'chime') spawnFind('chime', 11, SKY_D.x0, DW);
  if (q.goal.find === 'comb') spawnComb();
  if (q.goal.find === 'lens') spawnFind('lens', 18, STAR_D.x0, DW);
  if (q.goal.find === 'mainspring') spawnFind('mainspring', 17, COG_D.x0, DW);
  if (q.goal.find === 'compass') spawnFind('compass', 16, REEF_D.x0, DW);
  if (q.goal.find === 'jadeidol') spawnFind('jadeidol', 14, JUNGLE_D.x0, DW);
  if (q.goal.find === 'goldpick') spawnFind('goldpick', 13, CAVE_D.x0, DW);
  banner(`New quest: ${q.name}`, '#ffe08a'); SFX.play('collect'); questTick(); save();
}
function completeQuest(q) {
  if (q.goal.bring) for (const [k, n] of Object.entries(q.goal.bring)) S.inv[k] -= n;
  S.quests[q.id].state = 'done';
  if (q.reward.gold) { addGold(q.reward.gold); floatText(P.x, P.y - 70, `+${q.reward.gold}g`, '#f4b740'); burst(P.x, P.y - 40, '#f4b740', 18); SFX.play('coin'); }
  for (const [k, n] of Object.entries(q.reward.items || {})) S.inv[k] += n;
  banner(`Quest complete: ${q.name}`, '#ffe08a'); SFX.play('craft'); P.pendingCheer = null;
  setTimeout(() => { if (!P.act) { P.fx = 0; P.fy = 1; startAct('cheer', () => burst(P.x, P.y - 50, '#ffe08a', 16)); } }, 300);
  updateHUD(); save();
}
// returns true when a quest conversation took over the interaction
function questInteract(n, after) {
  const ready = QUESTS.find(q => q.giver === n.id && questReady(q));
  if (ready) { say(n.name, ready.done, () => { completeQuest(ready); if (after) after(); }); return true; }
  const avail = QUESTS.find(q => q.giver === n.id && questAvailable(q));
  if (avail) { say(n.name, avail.offer, () => { acceptQuest(avail); if (after) after(); }); return true; }
  return false;
}
const RECIPES = [
  { id: 'pickaxe', name: 'Stone Pickaxe', desc: 'Lets you mine crystals. Breaks rocks twice as fast and doubles stone.', cost: { wood: 5, stone: 4 }, tool: true },
  { id: 'planks', name: 'Plank Bundle', desc: 'Sells for 14g, much more than loose wood.', cost: { wood: 4 } },
  { id: 'potion', name: 'Meadow Tonic', desc: 'Restores 3 hearts (press Q). Sells for 20g.', cost: { herb: 2, goo: 1 } },
  { id: 'charm', name: 'Crystal Charm', desc: 'A collector\'s piece. Sells for 70g.', cost: { crystal: 2, stone: 2 } },
];
function freshState() {
  return { gold: 0, inv: { wood: 0, stone: 0, herb: 0, goo: 0, crystal: 0, planks: 0, potion: 0, charm: 0, crown: 0, gem: 0, pearl: 0, relic: 0, horn: 0, frostheart: 0, fang: 0, sunstone: 0, heartwood: 0, obsidian: 0, dragonscale: 0, feather: 0, stormcore: 0, ectoplasm: 0, soulgem: 0, glimmer: 0, prismheart: 0, jade: 0, serpenteye: 0, petal: 0, dragonpearl: 0, coral: 0, krakenbeak: 0, gear: 0, clockheart: 0, starshard: 0 }, quests: {}, kills: {}, found: {}, defeated: {}, mineOpen: false, dgs: {},
    tools: { pickaxe: false }, gear: { weapon: 'wood', armor: 'cloth', weapons: ['wood'], armors: ['cloth'] }, hp: 6, bridge: false, met: {}, intro: false, time: 0, earned: 0,
    px: cx * T, py: (cy + 2) * T };
}
let S = freshState();
const P = { x: 0, y: 0, fx: 0, fy: 1, inv: 0, walkDist: 0, moving: false, kx: 0, ky: 0, healT: 0, act: null,
  combo: 0, lastKind: null, lastActEnd: -9, queued: false, held: false, charge: 0, dash: null, dashCd: 0, dashEnd: -9, trail: [],
  idleT: 0, running: false, pendingCheer: null };
let touchRun = false;
let shake = 0, hitStop = 0;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- objects ----------
const resources = [], enemies = [], pickups = [], particles = [], floats = [], decor = [], animals = [], ambient = [];
const SOLID = { tree: 11, rock: 12, crystal: 11, pot: 8, crate: 11, vine: 15, obsidian: 12, tallgrass: 0 };
const RES_HP = { tree: 3, rock: 4, herb: 1, crystal: 5, pot: 1, crate: 2, vine: 2, obsidian: 5, tallgrass: 1 };
const TREE_KINDS = [null, ['tree_grove'], ['tree_tall', 'tree_small'], ['tree_orange', 'tree_autumn', 'tree_round'], ['tree_round', 'tree_pine', 'tree_fir'], null, ['tree_snow'], null, ['palm'], ['tree_swamp', 'tree_dead'], ['tree_dead'], ['tree_round'], ['tree_dead', 'tree_swamp'], ['tree_dead'], ['palm', 'palm', 'tree_round'], ['blossom', 'blossom', 'tree_round'], ['kelp'], ['tree_dead'], ['tree_fir', 'tree_pine']];
function addRes(type, tx, ty) {
  const r = { type, x: tx * T + 16 + (rng() - 0.5) * 10, y: ty * T + 20 + (rng() - 0.5) * 6, hp: RES_HP[type], max: RES_HP[type], alive: true, respawn: 0, shake: 0, seed: rng() };
  if (type === 'tree') { const k = TREE_KINDS[region[ty * W + tx]] || TREE_KINDS[4]; r.key = k[Math.floor(r.seed * k.length)]; }
  if (type === 'herb') r.key = r.seed > 0.5 ? 'herb_a' : 'herb_b';
  resources.push(r);
}
const nearVillage = (x, y, d) => Math.hypot(x - cx, y - cy) < d;
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const t = tiles[y * W + x];
  if (t !== LAND || nearVillage(x, y, 8) || nearArena(x, y, 7) || nearMine(x, y, 3.5) || nearHouse(x, y, 4)) continue;
  if (!isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng(), rg = region[y * W + x];
  if (rg === 4) { if (r < 0.17) addRes('tree', x, y); else if (r < 0.2) addRes('herb', x, y); else if (r < 0.24) decor.push({ key: r < 0.22 ? 'bush' : 'mush', x: x * T + 16, y: y * T + 22, s: 2 }); }
  else if (rg === 2) { if (r < 0.1) addRes('rock', x, y); else if (r < 0.12) addRes('tree', x, y); else if (r < 0.13) decor.push({ key: 'sprout', x: x * T + 16, y: y * T + 22, s: 2 }); }
  else if (rg === 3) { if (r < 0.09) addRes('herb', x, y); else if (r < 0.12) addRes('tree', x, y); else if (r < 0.13) addRes('rock', x, y); else if (r < 0.16) decor.push({ key: r < 0.145 ? 'bush2' : 'sprout', x: x * T + 16, y: y * T + 22, s: 2 }); }
  else if (rg === 1) { if (r < 0.045) addRes('crystal', x, y); else if (r < 0.09) addRes('rock', x, y); else if (r < 0.115) addRes('tree', x, y); else if (r < 0.13) decor.push({ key: 'mush', x: x * T + 16, y: y * T + 22, s: 2 }); }
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = FROST_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearFrostSite(x, y, 6.5) || nearHouse(x, y, 4) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.13) addRes('tree', x, y); else if (r < 0.165) addRes('rock', x, y); else if (r < 0.19) { addRes('crystal', x, y); resources[resources.length - 1].ice = true; }
  else if (r < 0.2) addRes('herb', x, y);
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = SUN_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearSunSite(x, y, 6) || nearHouse(x, y, 4) || nearMine(x, y, 3.5) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.06) addRes('tree', x, y); else if (r < 0.085) addRes('rock', x, y); else if (r < 0.1) addRes('crystal', x, y);
  else if (r < 0.14) decor.push({ prop: 'cactus', x: x * T + 16, y: y * T + 22, solid: 9, v: Math.floor(r * 300) % 3 });
}
for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, x = Math.floor((SUN_D.mirra.x + Math.cos(a) * 150) / T), y = Math.floor((SUN_D.mirra.y + 64 + Math.sin(a) * 100) / T); if (tiles[y * W + x] === LAND && !nearHouse(x, y, 2.5)) addRes('tree', x, y); }
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = MIRE_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearMireSite(x, y, 6) || nearHouse(x, y, 4) || nearMine(x, y, 4) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.12) addRes('tree', x, y); else if (r < 0.165) addRes('herb', x, y);
  else if (r < 0.2) decor.push({ bigshroom: true, x: x * T + 16, y: y * T + 22, solid: 13, v: Math.floor(r * 1000) % 3 });
  else if (r < 0.21) addRes('rock', x, y);
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = CINDER_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearCinderSite(x, y, 6) || VENTS.some(v => Math.abs(v.tx - x) + Math.abs(v.ty - y) < 2) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.05) addRes('obsidian', x, y); else if (r < 0.08) addRes('rock', x, y); else if (r < 0.12) addRes('tree', x, y); else if (r < 0.13) addRes('herb', x, y);
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = SKY_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearSkySite(x, y, 6) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1)) || !isLand(tileAt(x - 1, y)) || !isLand(tileAt(x + 1, y))) continue;
  const r = rng();
  if (r < 0.09) addRes('tree', x, y); else if (r < 0.12) addRes('crystal', x, y); else if (r < 0.16) addRes('herb', x, y); else if (r < 0.2) decor.push({ prop: 'flowers', x: x * T + 16, y: y * T + 22 });
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = DUSK_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearDuskSite(x, y, 6) || LANTERNS.some(L => Math.abs(L.tx - x) + Math.abs(L.ty - y) < 3) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.1) addRes('tree', x, y); else if (r < 0.13) addRes('herb', x, y); else if (r < 0.15) addRes('rock', x, y); else if (r < 0.18) decor.push({ key: 'mush', x: x * T + 16, y: y * T + 22, s: 2 });
}
for (const L of LANTERNS) decor.push({ lantern: L, x: L.x, y: L.y, solid: 10 });
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = CAVE_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearCaveSite(x, y, 5) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1)) || !isLand(tileAt(x - 1, y)) || !isLand(tileAt(x + 1, y))) continue;
  const r = rng();
  if (r < 0.08) addRes('crystal', x, y); else if (r < 0.13) addRes('rock', x, y); else if (r < 0.19) decor.push({ glowcap: true, x: x * T + 16, y: y * T + 22, v: Math.floor(r * 1000) % 3 });
}
{
  let v = 0; const Y = DUSK_D.yard, C = DUSK_D.chapel;
  for (let gy = -2; gy <= 2; gy++) for (let gx = -2; gx <= 2; gx++) { const x = Math.round(Y.x / T) + gx * 2, y = Math.round(Y.y / T) + gy * 2; if (tiles[y * W + x] === LAND && (gx || gy)) decor.push({ grave: true, v: v++, x: x * T + 16 + (hash(x, y) - 0.5) * 10, y: y * T + 20, solid: 10 }); }
  for (const [ox, oy] of [[-3, -3], [3, -3], [-3, 2], [3, 2], [-1, -3], [1, -3]]) decor.push({ key: 'pillar', x: C.x + ox * T, y: C.y + oy * T, s: 2.5, solid: 13 });
  for (let i = 0; i < 6; i++) { const x = Math.round(C.x / T) - 2 + (i % 3) * 2, y = Math.round(C.y / T) + (i < 3 ? -1 : 1); if (tiles[y * W + x] === LAND) decor.push({ grave: true, v: v++, x: x * T + 16, y: y * T + 20, solid: 10 }); }
}
for (let i = decor.length - 1; i >= 0; i--) if (decor[i].grave && Math.hypot(decor[i].x - OSS.x, decor[i].y - OSS.y) < 3.2 * T) decor.splice(i, 1);
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = JUNGLE_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearJungleSite(x, y, 5) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.15) addRes('tree', x, y); else if (r < 0.18) addRes('herb', x, y); else if (r < 0.34) addRes('tallgrass', x, y); else if (r < 0.35) addRes('rock', x, y); else if (r < 0.38) decor.push({ key: r < 0.365 ? 'bush' : 'bush2', x: x * T + 16, y: y * T + 22, s: 2 });
}
{
  const TP = JUNGLE_D.temple;
  decor.push({ templeIdol: true, x: TP.x + 16, y: TP.y + 8, solid: 22 });
  for (const [ox, oy] of [[-4, -3], [4, -3], [-4, 3], [4, 3], [-2, -3], [2, -3]]) decor.push({ key: 'pillar', x: TP.x + 16 + ox * T, y: TP.y + oy * T, s: 2.5, solid: 13 });
}
for (let i = decor.length - 1; i >= 0; i--) if ((decor[i].templeIdol || decor[i].key === 'pillar') && Math.hypot(decor[i].x - SERP.x, decor[i].y - SERP.y) < 3.2 * T) decor.splice(i, 1);
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = VALE_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearValeSite(x, y, 5) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng(), byWater = [tileAt(x + 1, y), tileAt(x - 1, y), tileAt(x, y + 2)].some(q => q === DEEP || q === LILY);
  if (byWater && r < 0.08) decor.push({ stonelantern: true, x: x * T + 16, y: y * T + 22, solid: 10 });
  else if (r < 0.12) addRes('tree', x, y); else if (r < 0.15) addRes('herb', x, y); else if (r < 0.21) decor.push({ prop: 'flowers', x: x * T + 16, y: y * T + 22 }); else if (r < 0.22) addRes('rock', x, y);
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = REEF_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearReefSite(x, y, 5) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.1) addRes('tree', x, y); else if (r < 0.13) addRes('rock', x, y); else if (r < 0.15) addRes('crystal', x, y);
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = COG_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearCogSite(x, y, 4) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng(), wallUp = tileAt(x, y - 1) === DEEP || tileAt(x, y - 2) === DEEP;
  if (wallUp && r < 0.12) decor.push({ steampipe: true, x: x * T + 16, y: y * T + 20, solid: 9 });
  else if (r < 0.025) decor.push({ biggear: true, x: x * T + 16, y: y * T + 22, solid: 14, v: Math.floor(r * 1000) });
  else if (r < 0.06) addRes('rock', x, y); else if (r < 0.075) addRes('crystal', x, y); else if (r < 0.09) addRes('crate', x, y);
}
for (let y = 1; y < 43; y++) for (let lx = 1; lx < DW - 1; lx++) {
  const x = STAR_D.x0 + lx, t = tiles[y * W + x];
  if (t !== LAND || nearStarSite(x, y, 5) || !isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng();
  if (r < 0.06) addRes('tree', x, y); else if (r < 0.1) addRes('crystal', x, y); else if (r < 0.12) addRes('rock', x, y); else if (r < 0.14) decor.push({ crater: true, x: x * T + 16, y: y * T + 20, v: Math.floor(r * 1000) }); else if (r < 0.17) decor.push({ prop: 'flowers', x: x * T + 16, y: y * T + 22 });
}
function randomTileIn(rg, minDist) {
  for (let i = 0; i < 800; i++) {
    const x = rg === 6 ? FROST_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 8 ? SUN_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 9 ? MIRE_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 10 ? CINDER_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 11 ? SKY_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 12 ? DUSK_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 13 ? CAVE_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 14 ? JUNGLE_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 15 ? VALE_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 16 ? REEF_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 17 ? COG_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : rg === 18 ? STAR_D.x0 + 1 + Math.floor(rng() * (DW - 2)) : 2 + Math.floor(rng() * (OW - 4)), y = 2 + Math.floor(rng() * (H - 4));
    if (tiles[y * W + x] === LAND && region[y * W + x] === rg && !nearVillage(x, y, minDist) && !nearArena(x, y, 9) && !nearMine(x, y, 5) && !(rg === 6 && nearFrostSite(x, y, 8)) && !(rg === 8 && nearSunSite(x, y, 8)) && !(rg === 9 && nearMireSite(x, y, 8)) && !(rg === 10 && nearCinderSite(x, y, 9)) && !(rg === 11 && nearSkySite(x, y, 8)) && !(rg === 12 && nearDuskSite(x, y, 8)) && !(rg === 13 && nearCaveSite(x, y, 7)) && !(rg === 14 && nearJungleSite(x, y, 8)) && !(rg === 15 && nearValeSite(x, y, 8)) && !(rg === 16 && nearReefSite(x, y, 8)) && !(rg === 17 && nearCogSite(x, y, 7)) && !(rg === 18 && nearStarSite(x, y, 7)) && !nearHouse(x, y, 6)) return [x * T + 16, y * T + 16];
  }
  return [cx * T + 300, cy * T];
}
// Each enemy type has its own way of fighting; see updateEnemy.
const ENEMY = {
  green:   { name: 'Slime', sprite: 'slime', hp: 2, sp: 55, dmg: 1, aggro: 160, drops: [['goo', 1], ['gold', 1]], col: '#5fd0b0', hopper: true },
  purple:  { name: 'Grove Slime', sprite: 'slime_p', hp: 4, sp: 72, dmg: 2, aggro: 200, drops: [['goo', 2], ['gold', 3]], col: '#a879ff', hopper: true },
  minion:  { name: 'Slimeling', sprite: 'slime', hp: 1, sp: 85, dmg: 1, aggro: 999, drops: [['goo', 1]], col: '#5fd0b0', hopper: true, small: true },
  bat:     { name: 'Bat', sprite: 'bat', hp: 2, sp: 90, dmg: 1, aggro: 190, drops: [['gold', 2]], col: '#c08a5a', flyer: true },
  spider:  { name: 'Spider', sprite: 'spider', hp: 3, sp: 40, dmg: 1, aggro: 170, drops: [['goo', 1], ['gold', 2]], col: '#9aa0a8' },
  crab:    { name: 'Crab', sprite: 'crab', hp: 6, sp: 40, dmg: 1, aggro: 150, drops: [['stone', 2], ['gold', 2]], col: '#e0584a', heavy: true },
  cyclops: { name: 'Cyclops', sprite: 'cyclops', hp: 4, sp: 34, dmg: 1, aggro: 240, drops: [['stone', 1], ['gold', 3]], col: '#e8b27a' },
  ghost:   { name: 'Ghost', sprite: 'ghost', hp: 3, sp: 36, dmg: 1, aggro: 230, drops: [['crystal', 1], ['gold', 2]], col: '#d6dbe8', flyer: true, ghostly: true },
  bandit:  { name: 'Bandit', sprite: 'bandit', hp: 3, sp: 88, dmg: 1, aggro: 200, drops: [['gold', 3]], col: '#4f9a5a' },
  snail:   { name: 'Snail', sprite: 'snail', hp: 4, sp: 22, dmg: 1, aggro: 130, drops: [['goo', 2], ['herb', 1]], col: '#e0a050' },
  rat:     { name: 'Rat', sprite: 'rat', hp: 1, sp: 105, dmg: 1, aggro: 160, drops: [['gold', 1]], col: '#9a9aa4' },
  frostslime: { name: 'Frost Slime', sprite: 'slime_ice', hp: 3, sp: 60, dmg: 1, aggro: 170, drops: [['goo', 1], ['crystal', 1]], col: '#bfe8ff', hopper: true, chill: true },
  raider:  { name: 'Raider', sprite: 'viking', hp: 5, sp: 55, dmg: 2, aggro: 200, drops: [['gold', 4], ['stone', 1]], col: '#c08a5a', heavy: true },
  scorpion: { name: 'Sand Scorpion', sprite: 'scorpion', ai: 'spider', hp: 3, sp: 46, dmg: 1, aggro: 170, drops: [['gold', 2], ['goo', 1]], col: '#d9a23c' },
  sandraider: { name: 'Sand Raider', sprite: 'bandit_sand', ai: 'bandit', hp: 4, sp: 92, dmg: 1, aggro: 210, drops: [['gold', 4]], col: '#d9a23c' },
  dustspirit: { name: 'Dust Spirit', sprite: 'ghost_sand', ai: 'ghost', hp: 3, sp: 40, dmg: 1, aggro: 230, drops: [['crystal', 1], ['gold', 3]], col: '#e8c88a', flyer: true, ghostly: true },
  mummy:   { name: 'Mummy', sprite: 'mummy', ai: 'crab', hp: 6, sp: 30, dmg: 2, aggro: 170, drops: [['gold', 3], ['herb', 1]], col: '#efe6cf', heavy: true },
  scarab:  { name: 'Scarab', sprite: 'scarab', ai: 'rat', hp: 1, sp: 110, dmg: 1, aggro: 170, drops: [['gold', 1]], col: '#9fd36a' },
  bogslime: { name: 'Bog Slime', sprite: 'slime_bog', hp: 3, sp: 50, dmg: 1, aggro: 160, drops: [['goo', 2]], col: '#6a7a3a', hopper: true },
  bogling: { name: 'Bogling', sprite: 'slime_bog', hp: 1, sp: 80, dmg: 1, aggro: 999, drops: [['goo', 1]], col: '#6a7a3a', hopper: true, small: true },
  shroom:  { name: 'Shroomling', proc: 'shroom', ai: 'shroom', hp: 3, sp: 26, dmg: 1, aggro: 150, drops: [['herb', 1], ['goo', 1]], col: '#b5468a' },
  toad:    { name: 'Swamp Toad', proc: 'toad', ai: 'toad', hp: 3, sp: 60, dmg: 1, aggro: 180, drops: [['goo', 1], ['gold', 2]], col: '#6a8a3a' },
  wisp:    { name: 'Will-o\'-Wisp', proc: 'wisp', ai: 'wisp', hp: 1, sp: 120, dmg: 1, aggro: 220, drops: [['crystal', 1]], col: '#bfffd0', flyer: true },
  hexer:   { name: 'Hexer', sprite: 'mage_hex', ai: 'mage', hp: 3, sp: 40, dmg: 1, aggro: 250, drops: [['crystal', 1], ['gold', 3]], col: '#b58cff' },
  magmite: { name: 'Magmite', proc: 'magmite', ai: 'magmite', hp: 3, sp: 50, dmg: 1, aggro: 170, drops: [['goo', 1], ['obsidian', 1]], col: '#ff7a2a' },
  imp:     { name: 'Ember Imp', proc: 'imp', ai: 'imp', hp: 2, sp: 120, dmg: 1, aggro: 240, drops: [['crystal', 1], ['gold', 2]], col: '#ff9a3c', flyer: true },
  boulderback: { name: 'Boulderback', proc: 'boulder', ai: 'boulder', hp: 6, sp: 30, dmg: 1, aggro: 210, drops: [['stone', 2], ['obsidian', 1], ['gold', 2]], col: '#9c9690', heavy: true },
  salamander: { name: 'Fire Salamander', proc: 'sala', ai: 'sala', hp: 3, sp: 70, dmg: 1, aggro: 200, drops: [['goo', 1], ['gold', 2]], col: '#e8503a' },
  puff:    { name: 'Storm Puff', proc: 'puff', ai: 'puff', hp: 3, sp: 45, dmg: 1, aggro: 230, drops: [['crystal', 1], ['gold', 2]], col: '#e8eef6', flyer: true },
  hawk:    { name: 'Gale Hawk', proc: 'hawk', ai: 'hawk', hp: 2, sp: 120, dmg: 1, aggro: 260, drops: [['feather', 2]], col: '#8a6a44', flyer: true },
  windling: { name: 'Windling', proc: 'windling', ai: 'windling', hp: 3, sp: 75, dmg: 1, aggro: 200, drops: [['feather', 1], ['herb', 1]], col: '#dff6ff' },
  sentinel: { name: 'Cloud Sentinel', proc: 'sentinel', ai: 'sentinel', hp: 5, sp: 20, dmg: 1, aggro: 260, drops: [['crystal', 2], ['gold', 4]], col: '#b4ae9f', heavy: true },
  skeleton: { name: 'Skeleton', proc: 'skel', ai: 'skel', hp: 4, sp: 45, dmg: 1, aggro: 190, drops: [['gold', 2], ['stone', 1]], col: '#e6dcc8' },
  shade:   { name: 'Shade', proc: 'shade', ai: 'shade', hp: 3, sp: 55, dmg: 1, aggro: 220, drops: [['ectoplasm', 1]], col: '#6a5a9a', flyer: true },
  banshee: { name: 'Banshee', proc: 'banshee', ai: 'banshee', hp: 3, sp: 60, dmg: 1, aggro: 240, drops: [['ectoplasm', 2], ['crystal', 1]], col: '#d6e2ff', flyer: true },
  hound:   { name: 'Gloom Hound', proc: 'hound', ai: 'hound', hp: 3, sp: 95, dmg: 1, aggro: 220, drops: [['gold', 2], ['goo', 1]], col: '#4a4660' },
  shardback: { name: 'Shardback', proc: 'shardback', ai: 'shardback', hp: 4, sp: 40, dmg: 1, aggro: 170, drops: [['glimmer', 1], ['crystal', 1]], col: '#a593ff' },
  glimbat: { name: 'Glimmerbat', proc: 'glimbat', ai: 'glimbat', hp: 1, sp: 130, dmg: 1, aggro: 210, drops: [['gold', 1]], col: '#9fe8ff', flyer: true },
  burrower: { name: 'Burrower', proc: 'burrower', ai: 'burrower', hp: 3, sp: 70, dmg: 1, aggro: 200, drops: [['stone', 2], ['gold', 2]], col: '#7a5a40' },
  geode:   { name: 'Geode Golem', proc: 'geode', ai: 'geode', hp: 7, sp: 28, dmg: 1, aggro: 200, drops: [['glimmer', 2], ['crystal', 2]], col: '#a593ff', heavy: true },
  snapjaw: { name: 'Snapjaw', proc: 'snapjaw', ai: 'snapjaw', hp: 4, sp: 0, dmg: 1, aggro: 220, drops: [['jade', 1], ['herb', 1]], col: '#3d8448', rooted: true },
  raptor:  { name: 'Raptor', proc: 'raptor', ai: 'raptor', hp: 3, sp: 110, dmg: 1, aggro: 230, drops: [['jade', 1], ['gold', 2]], col: '#5a8a3a' },
  dartfrog: { name: 'Dart Frog', proc: 'dartfrog', ai: 'dartfrog', hp: 2, sp: 60, dmg: 1, aggro: 190, drops: [['goo', 1], ['gold', 1]], col: '#3a8ae0' },
  monkey:  { name: 'Thief Monkey', proc: 'monkey', ai: 'monkey', hp: 3, sp: 120, dmg: 1, aggro: 220, drops: [['gold', 3]], col: '#6a4424' },
  fox:     { name: 'Spirit Fox', proc: 'fox', ai: 'fox', hp: 3, sp: 95, dmg: 1, aggro: 230, drops: [['petal', 1], ['crystal', 1]], col: '#e8a040' },
  moth:    { name: 'Blossom Moth', proc: 'moth', ai: 'moth', hp: 2, sp: 75, dmg: 1, aggro: 200, drops: [['petal', 1]], col: '#f2a0c8', flyer: true },
  koi:     { name: 'Leaping Koi', proc: 'koi', ai: 'koi', hp: 3, sp: 40, dmg: 1, aggro: 200, drops: [['gold', 3], ['goo', 1]], col: '#e8703a' },
  tanuki:  { name: 'Trickster Tanuki', proc: 'tanuki', ai: 'tanuki', hp: 4, sp: 80, dmg: 1, aggro: 200, drops: [['gold', 5]], col: '#8a6a44' },
  jellyfish: { name: 'Jellyfish', proc: 'jelly', ai: 'jelly', hp: 2, sp: 30, dmg: 1, aggro: 180, drops: [['goo', 2]], col: '#e8b0e8', flyer: true },
  puffer:  { name: 'Pufferfish', proc: 'puffer', ai: 'puffer', hp: 3, sp: 55, dmg: 1, aggro: 180, drops: [['coral', 1], ['gold', 2]], col: '#e8c060' },
  shark:   { name: 'Reef Shark', proc: 'shark', ai: 'shark', hp: 5, sp: 120, dmg: 2, aggro: 240, drops: [['gold', 4], ['coral', 1]], col: '#5a6a80', heavy: true },
  eel:     { name: 'Moray Eel', proc: 'eel', ai: 'eel', hp: 3, sp: 0, dmg: 1, aggro: 160, drops: [['coral', 2]], col: '#4a7a3a', rooted: true },
  soldier: { name: 'Clockwork Soldier', proc: 'soldier', ai: 'soldier', hp: 5, sp: 55, dmg: 1, aggro: 210, drops: [['gear', 1], ['gold', 3]], col: '#b08a44', heavy: true },
  sparkbot: { name: 'Sparkbot', proc: 'sparkbot', ai: 'sparkbot', hp: 2, sp: 70, dmg: 1, aggro: 220, drops: [['gear', 1]], col: '#7fe0f0' },
  beetle:  { name: 'Bomb Beetle', proc: 'beetle', ai: 'beetle', hp: 3, sp: 75, dmg: 1, aggro: 200, drops: [['gear', 1], ['gold', 2]], col: '#3a5a3a' },
  turret:  { name: 'Gear Turret', proc: 'turret', ai: 'turret', hp: 4, sp: 0, dmg: 1, aggro: 250, drops: [['gear', 2]], col: '#8a7a50', rooted: true },
  starsprite: { name: 'Star Sprite', proc: 'sprite', ai: 'sprite', hp: 2, sp: 110, dmg: 1, aggro: 230, drops: [['starshard', 1]], col: '#ffe9a8', flyer: true },
  voidorb: { name: 'Void Orb', proc: 'voidorb', ai: 'voidorb', hp: 3, sp: 40, dmg: 1, aggro: 200, drops: [['crystal', 2]], col: '#8a6ab8', flyer: true },
  mgolem:  { name: 'Meteor Golem', proc: 'mgolem', ai: 'mgolem', hp: 6, sp: 32, dmg: 1, aggro: 200, drops: [['starshard', 1], ['stone', 2]], col: '#ffb347', heavy: true },
  hopper:  { name: 'Lunar Hopper', proc: 'hopper', ai: 'hopper', hp: 4, sp: 60, dmg: 1, aggro: 220, drops: [['goo', 1], ['gold', 3]], col: '#e6e6f2' },
  icemage: { name: 'Ice Mage', sprite: 'mage_ice', hp: 3, sp: 40, dmg: 1, aggro: 250, drops: [['crystal', 2], ['gold', 3]], col: '#9fe8ff' },
  mage:    { name: 'Cultist', sprite: 'mage', hp: 3, sp: 40, dmg: 1, aggro: 250, drops: [['crystal', 1], ['gold', 3]], col: '#e08a3c' },
};
function makeEnemy(kind, x, y) {
  return { kind, x, y, hx: x, hy: y, hp: ENEMY[kind].hp, max: ENEMY[kind].hp, alive: true, respawn: 0, hop: rng() * 6, anim: rng() * 6, hurt: 0,
    kx: 0, ky: 0, wx: 0, wy: 0, wt: 0, state: 'move', st: 0, cd: rng() * 2, phaseT: rng() * 3, faded: false };
}
function addEnemy(kind, rg) { const [x, y] = randomTileIn(rg, 11); enemies.push(makeEnemy(kind, x, y)); }
for (const [kind, rg, n] of [['green', 4, 3], ['bat', 4, 3], ['bandit', 4, 2], ['green', 3, 3], ['crab', 3, 3], ['snail', 3, 4], ['green', 2, 2], ['spider', 2, 2], ['cyclops', 2, 2], ['bandit', 2, 2], ['rat', 2, 4], ['purple', 1, 4], ['ghost', 1, 3], ['mage', 1, 2], ['frostslime', 6, 5], ['raider', 6, 3], ['icemage', 6, 3], ['ghost', 6, 2], ['scorpion', 8, 5], ['sandraider', 8, 3], ['dustspirit', 8, 3], ['bogslime', 9, 4], ['shroom', 9, 4], ['toad', 9, 4], ['wisp', 9, 3], ['hexer', 9, 3], ['toad', 3, 2], ['shroom', 4, 2], ['wisp', 1, 2],
  ['magmite', 10, 7], ['imp', 10, 4], ['boulderback', 10, 3], ['salamander', 10, 4], ['mage', 10, 2], ['bat', 10, 2], ['salamander', 8, 3], ['boulderback', 2, 2], ['imp', 2, 2],
  ['hawk', 11, 5], ['puff', 11, 4], ['windling', 11, 4], ['sentinel', 11, 3], ['hawk', 6, 2], ['hawk', 2, 2], ['windling', 8, 2],
  ['skeleton', 12, 6], ['shade', 12, 4], ['banshee', 12, 3], ['hound', 12, 4], ['bat', 12, 2], ['skeleton', 2, 2], ['hound', 4, 3], ['banshee', 6, 1],
  ['shardback', 13, 4], ['geode', 13, 3], ['burrower', 13, 4], ['shardback', 1, 2], ['burrower', 3, 2],
  ['snapjaw', 14, 5], ['dartfrog', 14, 5], ['monkey', 14, 3], ['snapjaw', 4, 2], ['dartfrog', 9, 3],
  ['moth', 15, 5], ['fox', 15, 3], ['tanuki', 15, 4], ['moth', 3, 2], ['tanuki', 4, 2], ['fox', 12, 2],
  ['jellyfish', 16, 5], ['puffer', 16, 4], ['shark', 16, 3], ['jellyfish', 8, 2], ['jellyfish', 3, 2],
  ['soldier', 17, 4], ['sparkbot', 17, 4], ['beetle', 17, 3], ['turret', 17, 4], ['sparkbot', 2, 2], ['beetle', 8, 2],
  ['starsprite', 18, 5], ['voidorb', 18, 3], ['mgolem', 18, 3], ['hopper', 18, 3], ['starsprite', 12, 2], ['voidorb', 13, 2]])
  for (let i = 0; i < n; i++) addEnemy(kind, rg);
{ let n = 0; for (let i = 0; i < 5000 && n < 6; i++) { const x = REEF_D.x0 + 3 + Math.floor(hash(i, 77) * (DW - 6)), y = 14 + Math.floor(hash(77, i) * 27); if (tiles[y * W + x] === LAND && tiles[(y - 1) * W + x] === DEEP && !nearReefSite(x, y, 6)) { enemies.push(makeEnemy('eel', x * T + 16, y * T + 16)); n++; } } }
for (const [x, y] of KOI_SPOTS) enemies.push(makeEnemy('koi', x * T + 16, y * T + 16));
for (const rg of [14, 14, 14, 3]) { const [x, y] = randomTileIn(rg, 9); for (let i = 0; i < 2; i++) enemies.push(makeEnemy('raptor', x + i * 30, y)); }
for (let g = 0; g < 4; g++) { const [x, y] = randomTileIn(13, 9); for (let i = 0; i < 3; i++) enemies.push(makeEnemy('glimbat', x + (i - 1) * 24, y + (i % 2) * 18)); }
// dungeon creatures never respawn; clearing a room opens its gate
function dSpawn(D, list) {
  for (const [kind, x, y] of list) { const e = makeEnemy(kind, (D.x0 + x) * T + 16, y * T + 16); e.noRespawn = true; e.dreg = dreg[y * W + D.x0 + x]; enemies.push(e); }
}
dSpawn(MINE_D, [['rat', 10, 27], ['rat', 26, 29], ['rat', 31, 24], ['bat', 8, 26], ['bat', 30, 27], ['bat', 20, 29], ['spider', 12, 30], ['spider', 27, 25], ['purple', 6, 29], ['purple', 33, 30],
  ['green', 15, 38], ['green', 24, 38], ['ghost', 8, 15], ['ghost', 31, 15], ['cyclops', 12, 19], ['cyclops', 27, 19], ['purple', 19, 17], ['bat', 22, 15]]);
dSpawn(TEMPLE_D, [['snail', 29, 29], ['snail', 22, 15], ['crab', 16, 39], ['crab', 23, 38], ['spider', 27, 30], ['spider', 32, 31], ['crab', 17, 16], ['crab', 33, 23], ['spider', 20, 22], ['spider', 31, 16], ['ghost', 25, 15], ['purple', 30, 20]]);
dSpawn(CRYPT_D, [['mage', 25, 27], ['mage', 11, 23], ['mage', 24, 13], ['bat', 16, 38], ['bat', 23, 37], ['ghost', 8, 23], ['ghost', 30, 28], ['ghost', 20, 25], ['purple', 12, 29], ['purple', 27, 22], ['bat', 33, 25],
  ['cyclops', 6, 27], ['spider', 34, 30], ['ghost', 18, 14], ['ghost', 29, 16]]);
for (const [x, y] of [[5, 25], [35, 24], [34, 31], [4, 31], [22, 24]]) addRes('crystal', MINE_D.x0 + x, y);
for (const [x, y] of [[10, 24], [15, 31], [25, 31], [30, 25], [14, 37], [25, 40]]) addRes('rock', MINE_D.x0 + x, y);
for (const [x, y] of [[15, 14], [35, 24], [33, 29]]) addRes('crystal', TEMPLE_D.x0 + x, y);
for (const [x, y] of [[16, 24], [34, 14], [25, 31]]) addRes('herb', TEMPLE_D.x0 + x, y);
for (const [x, y] of [[4, 22], [35, 30], [10, 30]]) addRes('rock', CRYPT_D.x0 + x, y);
for (const [x, y] of [[6, 30], [33, 22]]) addRes('crystal', CRYPT_D.x0 + x, y);
const dChest = (D, id, item, x, y) => D.chests.push({ id, item, x: (D.x0 + x) * T + 16, y: y * T + 22 });
dChest(MINE_D, 'key', 'key', 3, 24); dChest(MINE_D, 'hall', 'gold', 35, 14);
dChest(TEMPLE_D, 'side', 'gold', 33, 30); dChest(TEMPLE_D, 'hall', 'gold', 35, 14);
dChest(CRYPT_D, 'key', 'key', 38, 25); dChest(CRYPT_D, 'ante', 'gold', 31, 12);
const dPillars = (D, list) => { for (const [x, y] of list) decor.push({ key: 'pillar', x: (D.x0 + x) * T + 16, y: y * T + 22, s: 2.5, solid: 13 }); };
dPillars(MINE_D, [[8, 17], [31, 17], [24, 3], [35, 3], [24, 9], [35, 9]]);
dPillars(TEMPLE_D, [[18, 15], [32, 15], [18, 23], [32, 23]]);
dPillars(CRYPT_D, [[8, 24], [8, 28], [15, 24], [15, 28], [30, 24], [30, 28], [17, 3], [30, 3], [17, 7], [30, 7]]);
dSpawn(TOMB_D, [['scarab', 15, 37], ['scarab', 24, 37], ['scarab', 21, 40], ['mummy', 8, 24], ['mummy', 30, 27], ['mummy', 18, 26], ['scarab', 12, 28], ['scarab', 26, 24],
  ['scarab', 33, 29], ['scorpion', 6, 29], ['scorpion', 28, 23], ['scarab', 16, 15], ['scarab', 30, 18], ['mummy', 24, 17]]);
dChest(TOMB_D, 'key', 'key', 37, 26); dChest(TOMB_D, 'hall', 'gold', 32, 13);
dPillars(TOMB_D, [[15, 14], [29, 14], [15, 19], [29, 19]]);
for (const [x, y] of [[14, 41], [25, 41], [5, 23], [34, 23]]) addRes('pot', TOMB_D.x0 + x, y);
dSpawn(TOWER_D, [['sparkbot', 15, 38], ['sparkbot', 24, 37], ['soldier', 20, 39], ['beetle', 8, 27], ['beetle', 30, 32], ['soldier', 15, 32], ['sparkbot', 26, 27],
  ['turret', 13, 14], ['turret', 26, 14], ['soldier', 18, 19], ['beetle', 22, 22], ['turret', 14, 23]]);
dChest(TOWER_D, 'key', 'key', 31, 20); dChest(TOWER_D, 'hall', 'gold', 24, 14);
dPillars(TOWER_D, [[16, 17], [23, 17], [6, 32], [33, 26]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [27, 24]]) addRes('crate', TOWER_D.x0 + x, y);
dSpawn(PALACE_D, [['jellyfish', 15, 38], ['jellyfish', 25, 37], ['puffer', 8, 29], ['puffer', 31, 31], ['shark', 20, 29], ['jellyfish', 14, 32], ['puffer', 26, 28],
  ['eel', 13, 14], ['eel', 26, 14], ['eel', 13, 23], ['eel', 26, 23], ['shark', 20, 16]]);
dChest(PALACE_D, 'key', 'key', 30, 21); dChest(PALACE_D, 'hall', 'gold', 24, 14);
dPillars(PALACE_D, [[12, 29], [27, 29], [16, 17], [23, 17], [16, 21], [23, 21]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [27, 24]]) addRes('pot', PALACE_D.x0 + x, y);
dSpawn(SHRINE_D, [['moth', 15, 38], ['tanuki', 24, 39], ['fox', 8, 29], ['moth', 30, 28], ['tanuki', 14, 31], ['tanuki', 27, 30], ['moth', 22, 27], ['fox', 33, 32],
  ['koi', 14, 18], ['koi', 25, 18], ['fox', 24, 14], ['moth', 15, 22]]);
dChest(SHRINE_D, 'key', 'key', 30, 21); dChest(SHRINE_D, 'hall', 'gold', 13, 14);
dPillars(SHRINE_D, [[12, 29], [27, 29], [6, 32], [33, 27]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [27, 23]]) addRes('pot', SHRINE_D.x0 + x, y);
dSpawn(SERP_D, [['dartfrog', 15, 38], ['raptor', 24, 37], ['raptor', 25, 39], ['snapjaw', 6, 28], ['snapjaw', 33, 31], ['raptor', 14, 30], ['raptor', 16, 31], ['dartfrog', 26, 28], ['monkey', 22, 32],
  ['snapjaw', 24, 14], ['dartfrog', 15, 22], ['raptor', 20, 15]]);
dChest(SERP_D, 'key', 'key', 30, 21); dChest(SERP_D, 'hall', 'gold', 26, 13);
dPillars(SERP_D, [[12, 29], [27, 29], [10, 4], [29, 4], [10, 8], [29, 8]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [27, 24]]) addRes('pot', SERP_D.x0 + x, y);
for (const [x, y] of [[7, 30], [9, 31], [31, 28], [29, 32], [18, 28], [23, 30]]) addRes('tallgrass', SERP_D.x0 + x, y);
dSpawn(VAULT_D, [['glimbat', 15, 38], ['glimbat', 17, 37], ['shardback', 24, 39], ['shardback', 8, 29], ['geode', 30, 30], ['glimbat', 14, 27], ['glimbat', 16, 28], ['burrower', 22, 31], ['shardback', 33, 32],
  ['burrower', 16, 22], ['shardback', 25, 23], ['geode', 15, 14], ['glimbat', 24, 14]]);
dChest(VAULT_D, 'key', 'key', 30, 22); dChest(VAULT_D, 'hall', 'gold', 13, 14);
dPillars(VAULT_D, [[12, 29], [27, 29], [6, 32], [33, 27]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [12, 24]]) addRes('pot', VAULT_D.x0 + x, y);
for (const [x, y] of [[4, 31], [35, 30], [26, 13], [12, 23]]) addRes('crystal', VAULT_D.x0 + x, y);
dSpawn(OSS_D, [['skeleton', 15, 38], ['bat', 24, 37], ['skeleton', 24, 39], ['skeleton', 10, 30], ['skeleton', 29, 29], ['shade', 14, 28], ['shade', 26, 31], ['hound', 20, 29], ['banshee', 32, 30],
  ['skeleton', 16, 17], ['shade', 22, 20], ['banshee', 25, 15], ['hound', 14, 22]]);
dChest(OSS_D, 'key', 'key', 30, 21); dChest(OSS_D, 'hall', 'gold', 13, 14);
dPillars(OSS_D, [[15, 19], [24, 17], [12, 28], [27, 31]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [27, 23]]) addRes('pot', OSS_D.x0 + x, y);
dSpawn(SPIRE_D, [['windling', 15, 38], ['puff', 24, 37], ['hawk', 20, 39], ['windling', 10, 33], ['windling', 28, 32], ['puff', 14, 27], ['puff', 30, 27], ['hawk', 22, 32],
  ['sentinel', 16, 17], ['sentinel', 24, 21], ['hawk', 20, 15], ['puff', 14, 22], ['windling', 26, 15]]);
dChest(SPIRE_D, 'key', 'key', 30, 21); dChest(SPIRE_D, 'hall', 'gold', 13, 14);
dPillars(SPIRE_D, [[15, 19], [24, 17], [10, 3], [29, 3], [10, 8], [29, 8]]);
for (const [x, y] of [[14, 41], [25, 41], [36, 33], [3, 26], [27, 23]]) addRes('pot', SPIRE_D.x0 + x, y);
dSpawn(FORGE_D, [['magmite', 15, 38], ['salamander', 24, 38], ['imp', 20, 37], ['magmite', 8, 27], ['magmite', 30, 31], ['salamander', 14, 32], ['salamander', 26, 30], ['boulderback', 20, 28],
  ['mage', 5, 30], ['imp', 33, 27], ['magmite', 24, 33], ['imp', 22, 22], ['salamander', 26, 21], ['magmite', 14, 14], ['boulderback', 24, 15], ['imp', 18, 14]]);
dChest(FORGE_D, 'key', 'key', 30, 22); dChest(FORGE_D, 'hall', 'gold', 26, 14);
dPillars(FORGE_D, [[12, 27], [27, 32], [6, 27], [33, 33]]);
for (const [x, y] of [[14, 41], [25, 41], [4, 33], [35, 26], [27, 24]]) addRes('pot', FORGE_D.x0 + x, y);
dSpawn(HOLLOW_D, [['toad', 15, 38], ['toad', 24, 38], ['bogslime', 20, 37], ['shroom', 10, 32], ['wisp', 25, 32], ['bogslime', 33, 31], ['toad', 20, 28], ['shroom', 30, 28], ['hexer', 8, 28],
  ['wisp', 15, 24], ['bogslime', 20, 24], ['shroom', 31, 24], ['hexer', 16, 15], ['hexer', 30, 15], ['toad', 23, 18], ['bogslime', 26, 19]]);
dChest(HOLLOW_D, 'key', 'key', 38, 28); dChest(HOLLOW_D, 'hall', 'gold', 32, 14);
dPillars(HOLLOW_D, [[16, 17], [29, 17], [12, 3], [27, 3], [12, 8], [27, 8]]);
for (const [x, y] of [[30, 30], [31, 30], [8, 26], [9, 26]]) { addRes('vine', HOLLOW_D.x0 + x, y); const r = resources[resources.length - 1]; r.x = (HOLLOW_D.x0 + x) * T + 16; r.y = y * T + 22; }
for (const [x, y] of [[14, 41], [25, 41], [3, 33], [36, 33], [36, 23]]) addRes('pot', HOLLOW_D.x0 + x, y);
const projectiles = [];
const BOSS_INFO = {
  slime:  { name: 'The Slime King', hp: 50, contact: 38, wake: 4.2 * T, col: '#5fd0b0',
    seq: { 1: ['hop', 'hop', 'hop', 'slam'], 2: ['hop', 'summon', 'hop', 'slam', 'hop'], 3: ['shards', 'hop', 'slam', 'summon', 'shards', 'hop', 'slam'] },
    lines: { 2: 'The King calls his children!', 3: 'The King is furious!' } },
  golem:  { name: 'Rockjaw the Cyclops', hp: 60, contact: 36, wake: 4.5 * T, col: '#e8b27a',
    seq: { 1: ['stomp', 'boulders', 'stomp', 'charge'], 2: ['boulders', 'charge', 'quake', 'stomp', 'charge'], 3: ['quake', 'charge', 'boulders', 'charge', 'quake', 'stomp'] },
    lines: { 2: 'Rockjaw roars! The ceiling shakes!', 3: 'Rockjaw is enraged!' } },
  wizard: { name: 'The Hollow Wizard', hp: 44, contact: 28, wake: 5 * T, col: '#b58cff',
    seq: { 1: ['orb', 'teleport', 'orb', 'spiral'], 2: ['orb', 'summon', 'teleport', 'orb', 'spiral'], 3: ['orb', 'spiral', 'teleport', 'orb', 'summon', 'spiral'] },
    lines: { 2: 'The Wizard calls up the restless dead!', 3: 'The Wizard\'s shield flickers with rage!' } },
  queen:  { name: 'The Spider Queen', hp: 50, contact: 34, wake: 4.2 * T, col: '#c9c4b4',
    seq: { 1: ['skitter', 'web', 'skitter', 'pounce'], 2: ['web', 'eggs', 'skitter', 'pounce', 'web'], 3: ['pounce', 'web', 'skitter', 'pounce', 'eggs', 'web'] },
    lines: { 2: 'Her eggs begin to hatch!', 3: 'The Spider Queen shrieks in fury!' } },
  crab:   { name: 'King Clawdius', hp: 60, contact: 40, wake: 5 * T, col: '#e0584a',
    seq: { 1: ['scuttle', 'bubbles', 'scuttle', 'dive'], 2: ['bubbles', 'summon', 'scuttle', 'dive', 'bubbles'], 3: ['dive', 'bubbles', 'scuttle', 'dive', 'summon', 'bubbles'] },
    lines: { 2: 'Clawdius calls his court!', 3: 'Clawdius snaps his claws in rage!' } },
  bat:    { name: 'Nightwing', hp: 48, contact: 36, wake: 4.2 * T, col: '#c08a5a',
    seq: { 1: ['circle', 'swoop', 'circle', 'swoop', 'perch'], 2: ['screech', 'swoop', 'summon', 'circle', 'swoop', 'perch'], 3: ['swoop', 'screech', 'swoop', 'summon', 'screech', 'swoop', 'perch'] },
    lines: { 2: 'Nightwing calls the swarm!', 3: 'Nightwing\'s screech shakes the crypt!' } },
  mummy:  { name: 'The Mummy King', hp: 60, contact: 32, wake: 4.2 * T, col: '#efe6cf',
    seq: { 1: ['shamble', 'lash', 'shamble', 'lash', 'curse'], 2: ['lash', 'sarcophagus', 'lash', 'curse', 'shamble'], 3: ['sarcophagus', 'lash', 'lash', 'curse', 'sarcophagus', 'lash'] },
    lines: { 2: 'The Mummy King sinks into the sand!', 3: 'The Mummy King\'s curse grows stronger!' } },
  scarab: { name: 'The Golden Scarab', hp: 80, contact: 40, wake: 5 * T, col: '#ffd65a',
    seq: { 1: ['scuttle', 'roll', 'scuttle', 'beam'], 2: ['roll', 'dive', 'beam', 'scuttle', 'roll'], 3: ['beam', 'roll', 'dive', 'roll', 'beam', 'scuttle'] },
    lines: { 2: 'The Golden Scarab takes flight!', 3: 'The Golden Scarab blazes like the sun!' } },
  knight2: { name: 'The Clockwork Knight', hp: 64, contact: 30, wake: 4 * T, col: '#b08a44',
    seq: { 1: ['march', 'march', 'thrust'], 2: ['march', 'thrust', 'march', 'bots'], 3: ['march', 'bots', 'thrust', 'march', 'thrust'] },
    lines: { 2: 'The Clockwork Knight winds up faster!', 3: 'The Clockwork Knight calls his sparkbots!' } },
  clock:  { name: 'The Great Clock', hp: 96, contact: 0, wake: 6 * T, col: '#d0aa5c',
    seq: { 1: ['tick', 'cuckoo', 'tick', 'chime'], 2: ['tick', 'cuckoo', 'chime', 'gears'], 3: ['cuckoo', 'chime', 'tick', 'gears', 'chime'] },
    lines: { 2: 'The Great Clock\'s hands spin faster!', 3: 'The Great Clock strikes midnight!' } },
  siren:  { name: 'The Siren', hp: 62, contact: 26, wake: 4 * T, col: '#4ac8b8',
    seq: { 1: ['swim', 'sing', 'bubbles', 'swim'], 2: ['sing', 'bubbles', 'dive', 'sing'], 3: ['sing', 'jellies', 'bubbles', 'dive', 'sing'] },
    lines: { 2: 'The Siren\'s song grows stronger!', 3: 'The Siren calls the jellyfish!' } },
  kraken: { name: 'The Kraken', hp: 100, contact: 0, wake: 7 * T, col: '#9a5ab8',
    seq: { 1: ['fight'], 2: ['fight'], 3: ['fight'] },
    lines: { 2: 'The Kraken clouds the water with ink!', 3: 'The Kraken thrashes in fury!' } },
  elderfox: { name: 'The Elder Fox', hp: 64, contact: 28, wake: 4 * T, col: '#e8a040',
    seq: { 1: ['prowl', 'fire', 'illusion', 'prowl', 'dash'], 2: ['illusion', 'fire', 'dash', 'prowl', 'fire'], 3: ['illusion', 'fire', 'dash', 'illusion', 'fire', 'dash'] },
    lines: { 2: 'The Elder Fox\'s tails blaze with foxfire!', 3: 'The Elder Fox weaves a dozen illusions!' } },
  koidragon: { name: 'The Koi Dragon', hp: 92, contact: 34, wake: 5 * T, col: '#e8703a',
    seq: { 1: ['swim', 'spit', 'swim', 'wave', 'swim', 'lunge'], 2: ['swim', 'spit', 'lunge', 'swim', 'wave', 'lunge'], 3: ['swim', 'lunge', 'spit', 'lunge', 'wave', 'lunge'] },
    lines: { 2: 'The Koi Dragon churns the sacred pool!', 3: 'The Koi Dragon rages!' } },
  chameleon: { name: 'The Giant Chameleon', hp: 60, contact: 28, wake: 4 * T, col: '#4aa85a',
    seq: { 1: ['stalk', 'stalk'], 2: ['stalk', 'spit', 'stalk'], 3: ['stalk', 'spit', 'frogs', 'stalk'] },
    lines: { 2: 'The Giant Chameleon spits venom!', 3: 'The Giant Chameleon calls its frogs!' } },
  serpent: { name: 'The Serpent Queen', hp: 90, contact: 30, wake: 5.5 * T, col: '#ffd65a',
    seq: { 1: ['chase', 'spit', 'chase'], 2: ['chase', 'coil', 'spit', 'chase'], 3: ['coil', 'spit', 'chase', 'raptors', 'coil', 'chase'] },
    lines: { 2: 'The Serpent Queen coils to crush you!', 3: 'The Serpent Queen calls her raptors!' } },
  mole:   { name: 'The Mole King', hp: 60, contact: 30, wake: 4 * T, col: '#c9a37a',
    seq: { 1: ['burrow', 'rocks', 'burrow'], 2: ['burrow', 'quake', 'burrow', 'rocks'], 3: ['burrow', 'quake', 'pups', 'burrow', 'rocks', 'burrow'] },
    lines: { 2: 'The Mole King shakes the vault! New pillars rise!', 3: 'The Mole King calls his diggers!' } },
  hydra:  { name: 'The Crystal Hydra', hp: 96, contact: 0, wake: 5.5 * T, col: '#a593ff',
    seq: { 1: ['fight'], 2: ['fight'], 3: ['fight'] },
    lines: { 2: 'The Crystal Hydra roars! Glimmerbats swarm!', 3: 'The Crystal Hydra strikes in a frenzy!' } },
  shadow: { name: 'Your Shadow', hp: 50, contact: 0, wake: 4 * T, col: '#6a5a9a',
    seq: { 1: ['mirror', 'mirror', 'daggers'], 2: ['mirror', 'daggers', 'lunge', 'mirror'], 3: ['mirror', 'daggers', 'lunge', 'mirror', 'lunge'] },
    lines: { 2: 'Your Shadow learns your tricks!', 3: 'Your Shadow mirrors you from every side!' } },
  lich:   { name: 'The Lich King', hp: 90, contact: 30, wake: 5.5 * T, col: '#7fe07a',
    seq: { 1: ['float', 'bones', 'skulls', 'float', 'raise'], 2: ['bones', 'blink', 'skulls', 'raise', 'bones'], 3: ['deathring', 'bones', 'blink', 'skulls', 'raise', 'deathring'] },
    lines: { 2: 'The Lich King raises new soul jars!', 3: 'The Lich King unleashes the power of death!' } },
  aegis:  { name: 'The Colossus Sentinel', hp: 70, contact: 34, wake: 4 * T, col: '#7fe0f0',
    seq: { 1: ['hover', 'orbs', 'laser', 'hover', 'slam'], 2: ['laser', 'slam', 'orbs', 'hover', 'laser'], 3: ['laser', 'summon', 'slam', 'laser', 'orbs', 'slam'] },
    lines: { 2: 'The Colossus Sentinel\'s eye burns brighter!', 3: 'The Colossus Sentinel turns faster!' } },
  storm:  { name: 'The Stormlord', hp: 84, contact: 30, wake: 5.5 * T, col: '#fff6a8',
    seq: { 1: ['drift', 'bolts', 'orb', 'drift', 'bolts', 'orb'], 2: ['bolts', 'gust', 'orb', 'bolts', 'summon', 'orb'], 3: ['gust', 'bolts', 'orb', 'bolts', 'gust', 'orb', 'summon'] },
    lines: { 2: 'The Stormlord summons a gale!', 3: 'The Stormlord becomes the storm!' } },
  forge:  { name: 'The Forgemaster', hp: 64, contact: 34, wake: 4 * T, col: '#ff9a3c',
    seq: { 1: ['stomp', 'slam', 'stomp', 'charge'], 2: ['slam', 'sparks', 'charge', 'stomp', 'slam'], 3: ['sparks', 'charge', 'slam', 'summon', 'charge', 'slam'] },
    lines: { 2: 'The Forgemaster stokes his furnace!', 3: 'The Forgemaster burns white-hot!' } },
  drake:  { name: 'The Magma Drake', hp: 96, contact: 40, wake: 5.5 * T, col: '#ff7a2a',
    seq: { 1: ['fly', 'meteors', 'breath', 'dive'], 2: ['meteors', 'dive', 'breath', 'meteors', 'dive'], 3: ['meteors', 'breath', 'dive', 'summon', 'meteors', 'dive', 'dive'] },
    lines: { 2: 'The Magma Drake roars and the cavern shakes!', 3: 'The Magma Drake calls its brood!' } },
  hag:    { name: 'The Bog Hag', hp: 58, contact: 26, wake: 4 * T, col: '#7fd17a',
    seq: { 1: ['float', 'brew', 'hide', 'float', 'brew'], 2: ['brew', 'hide', 'summon', 'brew', 'hide'], 3: ['hexring', 'hide', 'brew', 'hexring', 'summon', 'hide'] },
    lines: { 2: 'The Bog Hag cackles and calls her toads!', 3: 'The Bog Hag\'s hexes fill the den!' } },
  treant: { name: 'The Rotroot', hp: 90, contact: 48, wake: 5.5 * T, col: '#7fe07a',
    seq: { 1: ['roots', 'sweep', 'roots', 'slam'], 2: ['sweep', 'spores', 'roots', 'slam', 'sweep'], 3: ['roots', 'sweep', 'spores', 'slam', 'roots', 'sweep', 'slam'] },
    lines: { 2: 'The Rotroot sheds a cloud of spores!', 3: 'The Rotroot tears itself free of the earth!' } },
  wyrm:   { name: 'The Sand Wyrm', hp: 72, contact: 34, wake: 4.8 * T, col: '#d9a23c',
    seq: { 1: ['slither', 'spit', 'burrow'], 2: ['spit', 'burrow', 'slither', 'spit', 'burrow'], 3: ['burrow', 'spit', 'burrow', 'slither', 'summon', 'burrow'] },
    lines: { 2: 'The Sand Wyrm thrashes in fury!', 3: 'The ground trembles beneath you!' } },
  jarl:   { name: 'Jarl Frostbeard', hp: 70, contact: 34, wake: 4.6 * T, col: '#cfd8e0',
    seq: { 1: ['stride', 'axe', 'stride', 'spikes'], 2: ['axe', 'warcry', 'stride', 'spikes', 'axe'], 3: ['spikes', 'axe', 'warcry', 'axe', 'spikes', 'stride'] },
    lines: { 2: 'The Jarl sounds his war horn!', 3: 'Jarl Frostbeard roars with fury!' } },
  wraith: { name: 'The Hailwraith', hp: 56, contact: 30, wake: 4.6 * T, col: '#bfe8ff',
    seq: { 1: ['drift', 'hail', 'drift', 'breath'], 2: ['mirror', 'hail', 'breath', 'drift', 'hail'], 3: ['mirror', 'blizzard', 'hail', 'breath', 'mirror', 'hail'] },
    lines: { 2: 'The Hailwraith splits into reflections!', 3: 'A blizzard howls across the shrine!' } },
  knight: { name: 'The Bone Knight', hp: 64, contact: 34, wake: 5 * T, col: '#c8d0e0',
    seq: { 1: ['guard', 'slash', 'guard', 'slash', 'slash'], 2: ['guard', 'slash', 'spin', 'ghosts', 'slash'], 3: ['slash', 'spin', 'plunge', 'slash', 'ghosts', 'spin'] },
    lines: { 2: 'The Bone Knight raises the dead!', 3: 'The Bone Knight\'s blade burns cold!' } },
};
function makeBoss(type, x, y, arena) {
  const I = BOSS_INFO[type];
  return { type, name: I.name, x, y, hx: x, hy: y, z: 0, hp: I.hp, max: I.hp, state: 'sleep', st: 0, active: false, hurt: 0, seq: 0, phase: 1,
    sx: 0, sy: 0, tx: 0, ty: 0, vx: 0, vy: 0, volleys: 0, ring: null, anim: 0, arena, alpha: 1, shield: 0, timer: 0, spin: 0, trail: [] };
}
const roomArena = (D, x0, y0, x1, y1) => ({ rect: true, x0: (D.x0 + x0) * T, y0: y0 * T, x1: (D.x0 + x1 + 1) * T, y1: (y1 + 1) * T, cx: (D.x0 + (x0 + x1 + 1) / 2) * T, cy: (y0 + y1 + 1) / 2 * T });
const BOSSES = [
  makeBoss('slime', ARENA.x, ARENA.y, { cx: ARENA.x, cy: ARENA.y, r: ARENA.r }),
  makeBoss('golem', (MINE_D.x0 + 10) * T, 6 * T, roomArena(MINE_D, 2, 1, 17, 11)),
  makeBoss('wizard', (MINE_D.x0 + 30) * T, 5 * T, roomArena(MINE_D, 22, 1, 37, 11)),
  makeBoss('queen', (TEMPLE_D.x0 + 6) * T, 19 * T, roomArena(TEMPLE_D, 1, 13, 12, 25)),
  makeBoss('crab', (TEMPLE_D.x0 + 24) * T, 5 * T, roomArena(TEMPLE_D, 12, 1, 35, 11)),
  makeBoss('bat', (CRYPT_D.x0 + 6) * T + 16, 10 * T, roomArena(CRYPT_D, 1, 3, 12, 18)),
  makeBoss('knight', (CRYPT_D.x0 + 24) * T, 5 * T, roomArena(CRYPT_D, 12, 1, 35, 9)),
  makeBoss('jarl', FROST_D.camp.x, FROST_D.camp.y, { cx: FROST_D.camp.x, cy: FROST_D.camp.y, r: 5.6 * T }),
  makeBoss('mummy', (TOMB_D.x0 + 5) * T + 16, 16 * T, roomArena(TOMB_D, 1, 12, 10, 20)),
  makeBoss('scarab', (TOMB_D.x0 + 20) * T, 5 * T, roomArena(TOMB_D, 8, 1, 31, 10)),
  makeBoss('knight2', (TOWER_D.x0 + 5) * T + 16, 16 * T, roomArena(TOWER_D, 1, 13, 10, 24)),
  makeBoss('clock', (TOWER_D.x0 + 20) * T, 6 * T, roomArena(TOWER_D, 6, 1, 33, 10)),
  makeBoss('siren', (PALACE_D.x0 + 5) * T + 16, 18 * T, roomArena(PALACE_D, 1, 13, 10, 24)),
  makeBoss('kraken', (PALACE_D.x0 + 20) * T, 4 * T, roomArena(PALACE_D, 6, 1, 33, 10)),
  makeBoss('elderfox', (SHRINE_D.x0 + 5) * T + 16, 17 * T, roomArena(SHRINE_D, 1, 13, 10, 24)),
  makeBoss('koidragon', (SHRINE_D.x0 + 24) * T, 9 * T + 8, roomArena(SHRINE_D, 6, 1, 33, 10)),
  makeBoss('chameleon', (SERP_D.x0 + 5) * T + 16, 18 * T + 16, roomArena(SERP_D, 1, 13, 10, 24)),
  makeBoss('serpent', (SERP_D.x0 + 20) * T, 6 * T, roomArena(SERP_D, 6, 1, 33, 10)),
  makeBoss('mole', (VAULT_D.x0 + 5) * T + 16, 18 * T + 16, roomArena(VAULT_D, 1, 13, 10, 24)),
  makeBoss('hydra', (VAULT_D.x0 + 20) * T, 4 * T, roomArena(VAULT_D, 6, 1, 33, 10)),
  makeBoss('shadow', (OSS_D.x0 + 5) * T + 16, 19 * T, roomArena(OSS_D, 1, 13, 10, 24)),
  makeBoss('lich', (OSS_D.x0 + 20) * T, 5 * T, roomArena(OSS_D, 6, 1, 33, 10)),
  makeBoss('aegis', (SPIRE_D.x0 + 5) * T + 16, 19 * T, roomArena(SPIRE_D, 1, 13, 10, 24)),
  makeBoss('storm', (SPIRE_D.x0 + 20) * T, 6 * T, roomArena(SPIRE_D, 6, 1, 33, 10)),
  makeBoss('forge', (FORGE_D.x0 + 5) * T + 16, 19 * T, roomArena(FORGE_D, 1, 13, 10, 24)),
  makeBoss('drake', (FORGE_D.x0 + 20) * T, 6 * T, roomArena(FORGE_D, 8, 1, 31, 10)),
  makeBoss('hag', (HOLLOW_D.x0 + 5) * T + 16, 17 * T + 8, roomArena(HOLLOW_D, 1, 12, 10, 21)),
  makeBoss('treant', (HOLLOW_D.x0 + 20) * T, 6.5 * T, roomArena(HOLLOW_D, 6, 1, 33, 10)),
  makeBoss('wyrm', SUN_D.ruins.x, SUN_D.ruins.y, { cx: SUN_D.ruins.x, cy: SUN_D.ruins.y, r: 5.8 * T }),
  makeBoss('wraith', FROST_D.shrine.x, FROST_D.shrine.y, { cx: FROST_D.shrine.x, cy: FROST_D.shrine.y, r: 5.2 * T }),
];

// village
const NPCS = [
  { id: 'oma', name: 'Oma Fen', x: HOUSE.x, y: HOUSE.y + 18, sheet: 'oma_idle', walk: 'oma_walk', verb: 'Trade with', path: [[HOUSE.x - 46, HOUSE.y + 18], [HOUSE.x + 40, HOUSE.y + 18], [HOUSE.x, HOUSE.y + 18]] },
  { id: 'bench', name: 'Workbench', x: cx * T + 76, y: cy * T - 46, bench: true, verb: 'Craft at' },
  { id: 'pell', name: 'Farmer Pell', x: cx * T + 132, y: cy * T + 56, sheet: 'pell_idle', walk: 'pell_walk', verb: 'Talk to', path: [[cx * T + 132, cy * T + 56], [cx * T + 176, cy * T + 60], [cx * T + 110, cy * T + 66]] },
  { id: 'marla', name: 'Captain Marla', x: cx * T + 60, y: cy * T - 128, sheet: 'marla_idle', walk: 'marla_walk', verb: 'Talk to', path: [[cx * T + 60, cy * T - 128], [cx * T + 60, cy * T - 172], [cx * T + 64, cy * T - 104]] },
  { id: 'hob', name: 'Brother Hob', x: cx * T - 150, y: cy * T + 52, sheet: 'hob_idle', walk: 'hob_walk', verb: 'Talk to', path: [[cx * T - 150, cy * T + 52], [cx * T - 110, cy * T + 60], [cx * T - 170, cy * T + 70]] },
  ...(HAM1 ? [{ id: 'nell', name: 'Nell', x: HAM1.x + 34, y: HAM1.y + 22, sheet: 'nell_idle', walk: 'nell_walk', verb: 'Talk to', path: [[HAM1.x + 34, HAM1.y + 22], [HAM1.x + 90, HAM1.y + 34], [HAM1.x + 20, HAM1.y + 40]] }] : []),
  { id: 'ysolde', name: 'Ysolde', x: (FROST_D.x0 + 18) * T, y: 13 * T + 20, sheet: 'ysolde_idle', walk: 'ysolde_walk', verb: 'Trade with', path: [[(FROST_D.x0 + 18) * T, 13 * T + 20], [(FROST_D.x0 + 22) * T, 13 * T + 26]] },
  { id: 'bjorn', name: 'Old Bjorn', x: (FROST_D.x0 + 24) * T, y: 14 * T + 4, sheet: 'bjorn_idle', walk: 'bjorn_walk', verb: 'Talk to', path: [[(FROST_D.x0 + 24) * T, 14 * T + 4], [(FROST_D.x0 + 26) * T, 15 * T]] },
  { id: 'zahir', name: 'Zahir', x: SUN_D.mirra.x - 70, y: SUN_D.mirra.y + 36, sheet: 'zahir_idle', walk: 'zahir_walk', verb: 'Trade with', path: [[SUN_D.mirra.x - 70, SUN_D.mirra.y + 36], [SUN_D.mirra.x - 110, SUN_D.mirra.y + 40]] },
  { id: 'amara', name: 'Amara', x: SUN_D.mirra.x + 80, y: SUN_D.mirra.y + 40, sheet: 'amara_idle', walk: 'amara_walk', verb: 'Talk to', path: [[SUN_D.mirra.x + 80, SUN_D.mirra.y + 40], [SUN_D.mirra.x + 120, SUN_D.mirra.y + 50]] },
  { id: 'rosa', name: 'Captain Rosa', x: SUN_D.cove.x - 40, y: SUN_D.cove.y - 10, sheet: 'rosa_idle', walk: 'rosa_walk', verb: 'Talk to', path: [[SUN_D.cove.x - 40, SUN_D.cove.y - 10], [SUN_D.cove.x + 10, SUN_D.cove.y + 20]] },
  { id: 'lio', name: 'Astronomer Lio', x: STAR_D.camp.x + 60, y: STAR_D.camp.y + 30, sheet: 'lio_idle', walk: 'lio_walk', verb: 'Talk to', path: [[STAR_D.camp.x + 60, STAR_D.camp.y + 30], [STAR_D.camp.x + 90, STAR_D.camp.y + 50]] },
  { id: 'ada', name: 'Tinker Ada', x: COG_D.camp.x + 60, y: COG_D.camp.y + 30, sheet: 'ada_idle', walk: 'ada_walk', verb: 'Talk to', path: [[COG_D.camp.x + 60, COG_D.camp.y + 30], [COG_D.camp.x + 90, COG_D.camp.y + 50]] },
  { id: 'marlo', name: 'Diver Marlo', x: REEF_D.camp.x + 60, y: REEF_D.camp.y + 30, sheet: 'marlo_idle', walk: 'marlo_walk', verb: 'Talk to', path: [[REEF_D.camp.x + 60, REEF_D.camp.y + 30], [REEF_D.camp.x + 90, REEF_D.camp.y + 50]] },
  { id: 'wren', name: 'Grandmother Wren', x: VALE_D.camp.x + 60, y: VALE_D.camp.y + 30, sheet: 'wren_idle', walk: 'wren_walk', verb: 'Talk to', path: [[VALE_D.camp.x + 60, VALE_D.camp.y + 30], [VALE_D.camp.x + 90, VALE_D.camp.y + 50]] },
  { id: 'tavi', name: 'Ranger Tavi', x: JUNGLE_D.camp.x + 60, y: JUNGLE_D.camp.y + 30, sheet: 'tavi_idle', walk: 'tavi_walk', verb: 'Talk to', path: [[JUNGLE_D.camp.x + 60, JUNGLE_D.camp.y + 30], [JUNGLE_D.camp.x + 100, JUNGLE_D.camp.y + 50]] },
  { id: 'quill', name: 'Prospector Quill', x: CAVE_D.camp.x + 60, y: CAVE_D.camp.y + 30, sheet: 'quill_idle', walk: 'quill_walk', verb: 'Talk to', path: [[CAVE_D.camp.x + 60, CAVE_D.camp.y + 30], [CAVE_D.camp.x + 100, CAVE_D.camp.y + 50]] },
  { id: 'morrow', name: 'Old Morrow', x: DUSK_D.camp.x + 60, y: DUSK_D.camp.y + 30, sheet: 'morrow_idle', walk: 'morrow_walk', verb: 'Talk to', path: [[DUSK_D.camp.x + 60, DUSK_D.camp.y + 30], [DUSK_D.camp.x + 90, DUSK_D.camp.y + 50]] },
  { id: 'aeris', name: 'Aeris the Windkeeper', x: SKY_D.roost.x + 60, y: SKY_D.roost.y + 30, sheet: 'aeris_idle', walk: 'aeris_walk', verb: 'Talk to', path: [[SKY_D.roost.x + 60, SKY_D.roost.y + 30], [SKY_D.roost.x + 100, SKY_D.roost.y + 50]] },
  { id: 'brakka', name: 'Brakka the Smith', x: CINDER_D.camp.x + 70, y: CINDER_D.camp.y + 30, sheet: 'brakka_idle', walk: 'brakka_walk', verb: 'Talk to', path: [[CINDER_D.camp.x + 70, CINDER_D.camp.y + 30], [CINDER_D.camp.x + 40, CINDER_D.camp.y + 50]] },
  { id: 'moss', name: 'Mother Moss', x: MIRE_D.camp.x + 40, y: MIRE_D.camp.y + 40, sheet: 'moss_idle', walk: 'moss_walk', verb: 'Talk to', path: [[MIRE_D.camp.x + 40, MIRE_D.camp.y + 40], [MIRE_D.camp.x + 80, MIRE_D.camp.y + 52]] },
  { id: 'tobin', name: 'Tobin', x: cx * T + 24, y: dockY * T + 6, sheet: 'tobin_idle', walk: 'tobin_walk', verb: 'Talk to', path: [[cx * T + 24, dockY * T + 6], [cx * T + 24, dockY * T - 70], [cx * T - 20, dockY * T - 30]] },
];
for (const n of NPCS) Object.assign(n, { fx: 0, fy: 1, wait: 2 + rng() * 3, target: 0, moving: false, step: 0 });
function updateNPC(n, dt) {
  if (!n.path) return;
  n.moving = false;
  if (Math.hypot(n.x - P.x, n.y - P.y) < 70) return; // stop to chat when you walk up
  if (n.wait > 0) { n.wait -= dt; return; }
  const [tx, ty] = n.path[n.target], dx = tx - n.x, dy = ty - n.y, d = Math.hypot(dx, dy);
  if (d < 2) { n.target = (n.target + 1) % n.path.length; n.wait = 2 + rng() * 4; return; }
  const sp = Math.min(d, 38 * dt); n.x += dx / d * sp; n.y += dy / d * sp; n.fx = dx / d; n.fy = dy / d; n.moving = true; n.step += sp;
}
const RECTS = HOUSES.map(h => ({ x0: h.x - 48, x1: h.x + 48, y0: h.y - 40, y1: h.y - 2 }));
// ---------- furnishing, props and things lying around ----------
function addProp(prop, x, y, solid, extra) { decor.push({ prop, x, y, solid, ...(extra || {}) }); }
function addBed(x, y, col) { const n = { id: 'bed' + NPCS.length, name: 'Bed', bed: true, col, x, y, verb: 'Sleep in' }; Object.assign(n, { fx: 0, fy: 1, wait: 0, target: 0, moving: false, step: 0 }); NPCS.push(n); }
function addSign(name, text, x, y) { const n = { id: 'sign' + NPCS.length, name, sign: true, text, x, y, verb: 'Read' }; Object.assign(n, { fx: 0, fy: 1, wait: 0, target: 0, moving: false, step: 0 }); NPCS.push(n); }
function addFerry(id, name, x, y) { const n = { id, name, boat: true, x, y, verb: 'Sail on' }; Object.assign(n, { fx: 0, fy: 1, wait: 0, target: 0, moving: false, step: 0 }); NPCS.push(n); }
function addPot(tx, ty, type = 'pot') { if (!isLand(tileAt(tx, ty)) || tileAt(tx, ty) === MAT) return; addRes(type, tx, ty); const r = resources[resources.length - 1]; r.x = tx * T + 16; r.y = ty * T + 22; }
const CHEST_LOOT = { moss: ['herb', 6], zahir: ['gold'], amara: ['potion', 2], mirrainn: ['herb', 5], rosa: ['crystal', 4], tavern: ['gold'], oma: ['potion', 2], pell: ['gold'], marla: ['crystal', 3], hob: ['potion', 3], nell: ['gold'], hut: ['goo', 6], ysolde: ['gold'], bjorn: ['crystal', 4], inn: ['potion', 2] };
for (const I of INTERIORS) {
  const at = (lx, ly) => [(I.x0 + lx) * T + 16, (46 + ly) * T + 22], h = hash(I.x0, 46), D = dungeonAt(I.x0 * T + 16);
  const [ix, iy] = at(5.5, 0); addProp('window', ix - 96, iy - 28, 0, { wall: true }); addProp('window', ix + 96, iy - 28, 0, { wall: true });
  const loot = CHEST_LOOT[I.id] || ['gold'];
  if (I.kind === 'chapel') {
    addProp('altar', ...at(5.5, 1.4), 26); addProp('candles', ...at(3.5, 1.2), 0); addProp('candles', ...at(7.5, 1.2), 0);
    for (const [lx, ly] of [[3, 3.6], [8, 3.6], [3, 5.2], [8, 5.2]]) addProp('pew', ...at(lx, ly), 16);
    addProp('rug', ...at(5.5, 4.4), 0, { long: true });
  } else if (I.kind === 'shop') {
    addProp('counter', ...at(5.5, 2.6), 30); addProp('rug', ...at(5.5, 5), 0);
    for (const [lx, ly, k] of [[1.5, 1, 'barrel'], [2.5, 1, 'barrel2'], [9.5, 1, 'shelf'], [8.5, 1, 'drawers']]) decor.push({ key: k, x: at(lx, ly)[0], y: at(lx, ly)[1], s: 2, solid: 11 });
    addPot(I.x0 + 9, 52, 'crate'); addPot(I.x0 + 10, 52, 'crate');
  } else if (I.kind === 'guard') {
    addProp('rack', ...at(2.5, 1.1), 14); addProp('rack', ...at(4, 1.1), 14);
    decor.push({ key: 'table', x: at(7, 3.5)[0], y: at(7, 3.5)[1], s: 2, solid: 12 }, { key: 'stool', x: at(6, 3.5)[0], y: at(6, 3.5)[1], s: 2 }, { key: 'stool', x: at(8, 3.5)[0], y: at(8, 3.5)[1], s: 2 });
    addBed(...at(9.3, 1.6), '#5a6b8a'); decor.push({ key: 'barrel', x: at(1.5, 6)[0], y: at(1.5, 6)[1], s: 2, solid: 10 });
  } else {
    addProp('hearth', ...at(5.5, 0.8), 26); addProp('rug', ...at(5.5, 4), 0);
    addBed(...at(1.8, 1.6), ['#c2477a', '#3d8fd1', '#3d8448', '#d9a23c'][Math.floor(h * 4)]);
    if (I.kind === 'inn') addBed(...at(9.2, 1.6), '#8c7ab8');
    else decor.push({ key: 'drawers', x: at(9.2, 1)[0], y: at(9.2, 1)[1], s: 2, solid: 12 });
    decor.push({ key: 'table', x: at(7.5, 4)[0], y: at(7.5, 4)[1], s: 2, solid: 12 }, { key: 'stool', x: at(6.5, 4)[0], y: at(6.5, 4)[1], s: 2 }, { key: 'stool', x: at(8.5, 4)[0], y: at(8.5, 4)[1], s: 2 });
  }
  addPot(I.x0 + 1, 53); addPot(I.x0 + 10, 53); if (h > 0.5) addPot(I.x0 + 2, 53);
  D.chests.push({ id: 'house_' + I.id, item: loot[0], n: loot[1], x: (I.x0 + (I.kind === 'chapel' ? 10 : 1)) * T + 16, y: (I.kind === 'chapel' ? 48 : 51) * T + 22 });
}
// around every house: pots by the door, a lamp post
for (const h of HOUSES) {
  if (!dungeonAt(h.x)) { addPot(h.tx - 2, h.ty); if (hash(h.tx, h.ty) > 0.4) addPot(h.tx + 2, h.ty, 'crate'); }
  else { addPot(h.tx - 2, h.ty, 'crate'); }
  addProp('lamp', h.x + 64, h.y + 12, 7);
}
// the main village
addProp('well', cx * T + 64, cy * T + 30, 18);
addSign('Signpost', 'Brindle Village. East road: the Old Mine. West road: the Haunted Crypt. Southwest path: the Overgrown Temple. South: Tobin\'s bridge to the mainland. Southeast: Saltmarsh Hamlet.', cx * T - 56, cy * T + 40);
for (const [ox, oy] of [[200, 120], [232, 132]]) addProp('hay', cx * T + ox, cy * T + oy, 12);
addProp('scarecrow', cx * T + 230, cy * T + 200, 8);
for (const [ox, oy] of [[-40, -150], [-140, 100], [100, 120]]) addProp('flowers', cx * T + ox, cy * T + oy, 0);
addProp('logs', cx * T - 230, cy * T + 30, 14);
// Saltmarsh Hamlet
if (HAMLET) {
  addProp('well', HAMLET.x, HAMLET.y + 20, 18); addProp('net', HAMLET.x + 70, HAMLET.y + 56, 12); addFerry('ferry_out', 'Nell\'s Boat', HAMLET.x - 60, HAMLET.y + 70);
  addSign('Saltmarsh Hamlet', 'Saltmarsh Hamlet. Fresh fish, mended nets, and the best crab stew on Brindle Isle.', HAMLET.x - 20, HAMLET.y - 6);
  for (const [ox, oy] of [[90, 40], [110, 52]]) addPot(Math.floor((HAMLET.x + ox) / T), Math.floor((HAMLET.y + oy) / T), 'crate');
}
// Frosthold
// the old raft on the island's west beach and its twin at the Mirewood landing
{
  let bx = 2; for (let x = 0; x < OW; x++) if (isLand(tileAt(x, cy))) { bx = x; break; }
  pathLine(Math.min(CRYPT.tx - 2, cx - 12), cy, bx + 1, cy);
  addFerry('raft_out', 'Old Raft', bx * T - 12, cy * T + 16);
  addFerry('raft_home', 'Raft to Brindle Isle', (MIRE_D.x0 + 21) * T + 6, 3 * T + 16);
  decor.push({ fire: true, x: MIRE_D.camp.x + 100, y: MIRE_D.camp.y + 40, solid: 12 });
  addSign('Bogwater Camp', 'Bogwater Camp. Mind the bogs, never inhale the spores, and if a hooded figure throws purple light at you: run.', MIRE_D.camp.x - 40, MIRE_D.camp.y + 70);
  addSign('Driftwood sign', 'Raft to the Mirewood. Pole hard and keep your hands inside.', bx * T + 70, cy * T + 80);
}
// the sky balloon east of Brindle Village and its twin at Ashfall Outpost
{
  const BS = findSpot(range(cx + 6, cx + 12), range(cy - 8, cy - 3)) || findSpot(range(cx - 6, cx - 12), range(cy - 8, cy - 3)) || { x: (cx + 8) * T, y: (cy - 5) * T + 4 };
  addFerry('balloon_out', 'Sky Balloon', BS.x + 16, BS.y + 8); NPCS[NPCS.length - 1].verb = 'Fly in';
  addFerry('balloon_home', 'Balloon to Brindle Isle', (CINDER_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Fly in';
  addSign('Balloon sign', 'Sky Balloon to Cinder Peak. Smoke on the horizon? That\'s the volcano. Pack something fireproof.', BS.x - 40, BS.y + 40);
  decor.push({ forge: true, x: CINDER_D.camp.x - 30, y: CINDER_D.camp.y + 10, solid: 26 }, { fire: true, x: CINDER_D.camp.x + 10, y: CINDER_D.camp.y + 60, solid: 12 });
  for (const [ox, oy, k] of [[-80, 0, 'barrel'], [-96, 14, 'barrel2'], [110, 0, 'barrel']]) decor.push({ key: k, x: CINDER_D.camp.x + ox, y: CINDER_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Ashfall Outpost', 'Ashfall Outpost. Lava does not forgive. When the ground glows, step away.', CINDER_D.camp.x - 70, CINDER_D.camp.y + 70);
}
// the great updraft on Cinder Peak's east slope, and the down-gust at Zephyr Roost
{
  const TS = findSpot(range(CINDER_D.x0 + 28, CINDER_D.x0 + 35), range(9, 15)) || findSpot(range(CINDER_D.x0 + 4, CINDER_D.x0 + 12), range(9, 16)) || { x: (CINDER_D.x0 + 30) * T, y: 12 * T + 4, tx: CINDER_D.x0 + 30, ty: 12 };
  for (let i = VENTS.length - 1; i >= 0; i--) if (Math.hypot(VENTS[i].tx - TS.tx, VENTS[i].ty - TS.ty) < 4) VENTS.splice(i, 1);
  addFerry('thermal_out', 'Great Updraft', TS.x + 16, TS.y + 8); NPCS[NPCS.length - 1].verb = 'Ride';
  addFerry('thermal_home', 'Down-gust to Cinder Peak', (SKY_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Ride';
  addSign('Scorched sign', 'The Great Updraft. Hot air from the crater rises all the way to the clouds. Hold on to your hat.', TS.x - 50, TS.y + 40);
  decor.push({ windmill: true, x: SKY_D.roost.x - 70, y: SKY_D.roost.y + 10, solid: 18 }, { fire: true, x: SKY_D.roost.x + 10, y: SKY_D.roost.y + 70, solid: 12 });
  for (const [ox, oy, k] of [[-110, 30, 'barrel'], [120, 10, 'barrel2']]) decor.push({ key: k, x: SKY_D.roost.x + ox, y: SKY_D.roost.y + oy, s: 2, solid: 10 });
  addSign('Zephyr Roost', 'Zephyr Roost. Cloud bridges are safe to walk. Jet streams only blow one way: ride them home.', SKY_D.roost.x - 30, SKY_D.roost.y + 80);
}
// the Spirit Gate near the crypt and its twin at Lanternrest
{
  const GS = findSpot(range(CRYPT.tx - 3, CRYPT.tx + 6), range(CRYPT.ty + 4, CRYPT.ty + 9)) || findSpot(range(CRYPT.tx - 8, CRYPT.tx + 8), range(CRYPT.ty - 8, CRYPT.ty + 10)) || { x: CRYPT.x + 4 * T, y: CRYPT.y + 5 * T };
  addFerry('gate_out', 'Spirit Gate', GS.x + 16, GS.y + 8); NPCS[NPCS.length - 1].verb = 'Step through';
  addFerry('gate_home', 'Spirit Gate to Brindle Isle', (DUSK_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Step through';
  addSign('Weathered sign', 'The Spirit Gate. It opens on Duskhollow, where the sun never rises. Bring courage, and a light.', GS.x - 50, GS.y + 40);
  decor.push({ fire: true, x: DUSK_D.camp.x + 10, y: DUSK_D.camp.y + 60, solid: 12 });
  for (const [ox, oy, k] of [[-80, 10, 'barrel'], [-96, 24, 'barrel2'], [110, 10, 'barrel']]) decor.push({ key: k, x: DUSK_D.camp.x + ox, y: DUSK_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Lanternrest', 'Lanternrest. Stay in the light. The dead do not rest easy in Duskhollow.', DUSK_D.camp.x - 60, DUSK_D.camp.y + 80);
}
// the deep lift beside the Old Mine, and the mine carts of Glimmerdeep
{
  const LS = findSpot(range(MINE.tx - 3, MINE.tx + 7), range(MINE.ty + 4, MINE.ty + 8)) || findSpot(range(MINE.tx - 8, MINE.tx + 8), range(MINE.ty - 8, MINE.ty + 10)) || { x: MINE.x + 4 * T, y: MINE.y + 5 * T };
  addFerry('lift_out', 'Deep Lift', LS.x + 16, LS.y + 8); NPCS[NPCS.length - 1].verb = 'Ride down';
  addFerry('lift_home', 'Lift to Brindle Isle', (CAVE_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Ride up';
  addSign('Lift sign', 'Deep Lift to Glimmerdeep. The crystals down there glow brighter than any lamp. Mind the chasms.', LS.x - 50, LS.y + 40);
  RAILS.forEach((R, i) => { const a = R.pts[0], b = R.pts[R.pts.length - 1]; addFerry(`cart_${i}_a`, 'Mine Cart', a[0], a[1]); NPCS[NPCS.length - 1].verb = 'Ride'; addFerry(`cart_${i}_b`, 'Mine Cart', b[0], b[1]); NPCS[NPCS.length - 1].verb = 'Ride'; });
  decor.push({ fire: true, x: CAVE_D.camp.x + 10, y: CAVE_D.camp.y + 60, solid: 12 });
  for (const [ox, oy, k] of [[-80, 10, 'crate'], [-96, 26, 'barrel'], [110, 10, 'crate']]) decor.push({ key: k, x: CAVE_D.camp.x + ox, y: CAVE_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Glimmer Camp', 'Glimmer Camp. Carts cross the chasms. Crystals light the way. Stay out of the dark corners.', CAVE_D.camp.x - 60, CAVE_D.camp.y + 80);
}
// Old Shelly the sea turtle: the Sunward Isles' south shore to the Verdant Wilds
{
  let ty = 43; while (ty > 20 && !isLand(tileAt(SUN_D.x0 + 20, ty))) ty--;
  addFerry('turtle_out', 'Old Shelly the Sea Turtle', (SUN_D.x0 + 20) * T + 16, (ty + 1) * T + 4); NPCS[NPCS.length - 1].verb = 'Ride';
  addFerry('turtle_home', 'Shelly to the Sunward Isles', (JUNGLE_D.x0 + 21) * T + 6, 3 * T + 16); NPCS[NPCS.length - 1].verb = 'Ride';
  addSign('Shell sign', 'Old Shelly swims to the Verdant Wilds, a jungle island to the south. Be polite: she bites.', (SUN_D.x0 + 18) * T, (ty - 1) * T);
  decor.push({ fire: true, x: JUNGLE_D.camp.x + 10, y: JUNGLE_D.camp.y + 60, solid: 12 });
  for (const [ox, oy, k] of [[-80, 10, 'crate'], [-96, 26, 'barrel'], [110, 10, 'crate']]) decor.push({ key: k, x: JUNGLE_D.camp.x + ox, y: JUNGLE_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Canopy Camp', 'Canopy Camp. Tall grass hides all sorts of things. Hold on to your coin purse.', JUNGLE_D.camp.x - 60, JUNGLE_D.camp.y + 80);
}
// the mountain pass from the Frostmoor down to Petalfall Vale
{
  const MP = findSpot(range(FROST_D.x0 + 30, FROST_D.x0 + 36), range(8, 18)) || findSpot(range(FROST_D.x0 + 4, FROST_D.x0 + 14), range(6, 20)) || { x: (FROST_D.x0 + 33) * T, y: 12 * T + 4 };
  addFerry('pass_out', 'Mountain Pass', MP.x + 16, MP.y + 8); NPCS[NPCS.length - 1].verb = 'Go through';
  addFerry('pass_home', 'Pass to the Frostmoor', (VALE_D.x0 + 24) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Go through';
  addSign('Frosty sign', 'Mountain Pass. Legends say a warm valley full of blossoms lies beyond.', MP.x - 50, MP.y + 40);
  decor.push({ fire: true, x: VALE_D.camp.x + 10, y: VALE_D.camp.y + 60, solid: 12 }, { arch: true, x: VALE_D.x0 * T + 20 * T, y: 15 * T, solid: 0 });
  for (const ox of [-46, 46]) decor.push({ stonelantern: true, x: VALE_D.x0 * T + 20 * T + ox, y: 15 * T + 10, solid: 10 });
  for (const [ox, oy, k] of [[-80, 10, 'barrel'], [110, 10, 'barrel2']]) decor.push({ key: k, x: VALE_D.camp.x + ox, y: VALE_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Petalfall', 'Petalfall. Blossoms fall here all year round. Be kind to the koi, and never trust a pot that blinks.', VALE_D.camp.x - 60, VALE_D.camp.y + 80);
}
// the diving bell at Saltmarsh, and its twin on the seabed
{
  const FO = NPCS.find(n => n.id === 'ferry_out') || NPCS.find(n => n.id === 'raft_out');
  addFerry('bell_out', 'Diving Bell', FO.x + 90, FO.y); NPCS[NPCS.length - 1].verb = 'Dive in';
  addFerry('bell_home', 'Diving Bell to the surface', (REEF_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Rise up';
  addSign('Dock sign', 'Diving Bell to the Sunken Reef. Mind your air down there: breathe at the bubble vents.', FO.x + 160, FO.y - 30);
  for (const [ox, oy, k] of [[-90, 20, 'crate'], [110, 20, 'barrel']]) decor.push({ key: k, x: REEF_D.camp.x + ox, y: REEF_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Bubble Dome', 'The Bubble Dome. Fresh air inside! Jellyfish sting, pufferfish puff, and never poke a hole in the reef: something lives in there.', REEF_D.camp.x - 60, REEF_D.camp.y + 70);
}
// the ancient teleporter west of Brindle Village, linked to the Cogwork Ruins
{
  const AP = findSpot(range(cx - 13, cx - 7), range(cy - 10, cy - 4)) || findSpot(range(cx - 16, cx - 4), range(cy - 14, cy + 6)) || { x: (cx - 9) * T, y: (cy - 6) * T + 4 };
  addFerry('cogpad_out', 'Ancient Teleporter', AP.x + 16, AP.y + 8); NPCS[NPCS.length - 1].verb = 'Step on';
  addFerry('cogpad_home', 'Teleporter to Brindle Isle', (COG_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Step on';
  addSign('Strange stone', 'An ancient teleporter, still humming. Where does it lead?', AP.x - 80, AP.y - 10);
  decor.push({ biggear: true, x: COG_D.camp.x - 80, y: COG_D.camp.y + 10, solid: 14, v: 1 });
  for (const [ox, oy, k] of [[110, 10, 'crate'], [124, 26, 'barrel']]) decor.push({ key: k, x: COG_D.camp.x + ox, y: COG_D.camp.y + oy, s: 2, solid: 10 });
  addSign('North Gate', 'Cogwork Ruins, North Gate. The pads link the sealed sections. Bombs tick before they boom: run!', COG_D.camp.x - 50, COG_D.camp.y + 70);
}
// the moonbeam on the Cloudspire Isles, and its twin on Starfall Plateau
{
  const MB = findSpot(range(SKY_D.x0 + 23, SKY_D.x0 + 28), range(5, 11)) || findSpot(range(SKY_D.x0 + 12, SKY_D.x0 + 18), range(5, 11)) || { x: (SKY_D.x0 + 25) * T, y: 8 * T + 4 };
  addFerry('beam_out', 'Moonbeam', MB.x + 16, MB.y + 8); NPCS[NPCS.length - 1].verb = 'Step into';
  addFerry('beam_home', 'Moonbeam to the Cloudspire Isles', (STAR_D.x0 + 23) * T + 16, 4 * T + 8); NPCS[NPCS.length - 1].verb = 'Step into';
  addSign('Cloud sign', 'A moonbeam reaches down from the stars. Aeris says it leads to Starfall Plateau.', MB.x + 60, MB.y + 30);
  decor.push({ telescope: true, x: STAR_D.camp.x - 70, y: STAR_D.camp.y + 10, solid: 14 }, { fire: true, x: STAR_D.camp.x + 10, y: STAR_D.camp.y + 60, solid: 12 });
  for (const [ox, oy, k] of [[110, 10, 'crate'], [124, 26, 'barrel']]) decor.push({ key: k, x: STAR_D.camp.x + ox, y: STAR_D.camp.y + oy, s: 2, solid: 10 });
  addSign('Observatory', 'The Observatory. Meteor showers fall often: mind the red rings, and pick up the star shards.', STAR_D.camp.x - 60, STAR_D.camp.y + 80);
}
addFerry('ferry_home', 'Boat to Saltmarsh', (SUN_D.x0 + 21) * T + 6, 3 * T + 16);
addSign('Mirra Oasis', 'Mirra Oasis. Shade, cool water and Zahir\'s bazaar. Corsair\'s Cove lies down the east path, the Sunken Ruins to the southwest.', SUN_D.mirra.x + 40, SUN_D.mirra.y - 20);
addSign('Corsair\'s Cove', 'Corsair\'s Cove. No questions asked, no gold returned.', SUN_D.cove.x - 90, SUN_D.cove.y - 40);
addSign('Crumbling sign', 'The Sunken Ruins. The sand here moves on its own.', SUN_D.ruins.x + 120, SUN_D.ruins.y - 110);
addProp('stall', SUN_D.mirra.x - 120, SUN_D.mirra.y + 100, 26, { col: '#c2477a' }); addProp('stall', SUN_D.mirra.x + 120, SUN_D.mirra.y + 100, 26, { col: '#3d8fd1', goods: 'crystal' });
addProp('well', SUN_D.mirra.x + 150, SUN_D.mirra.y + 160, 18);
for (const [ox, oy] of [[50, 40], [-60, 60], [70, -60]]) addPot(Math.floor((SUN_D.cove.x + ox) / T), Math.floor((SUN_D.cove.y + oy) / T), 'crate');
addProp('boat', SUN_D.cove.x + 120, SUN_D.cove.y + 70, 22); addProp('net', SUN_D.cove.x + 60, SUN_D.cove.y + 110, 12);
for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.2, x = SUN_D.ruins.x + Math.cos(a) * 5.8 * T, y = SUN_D.ruins.y + Math.sin(a) * 5.2 * T; if (walkable(x, y)) addProp('ruin', x, y, 12, { h: 26 + Math.floor(hash(i, 5) * 34) }); }
addSign('Frosthold', 'Frosthold. Warm hearths, cold winds. Raiders not welcome.', FROSTHOLD.x + 44, FROSTHOLD.y - 30);
addProp('logs', FROSTHOLD.x - 70, FROSTHOLD.y - 40, 14); addProp('well', FROSTHOLD.x + 4, FROSTHOLD.y + 48, 18);
// danger signs by the dungeons
addSign('Warning sign', 'THE OLD MINE. Closed after the collapse. Something moves in the dark down there.', MINE.x - 70, MINE.y + 30);
addSign('Mossy sign', 'The Overgrown Temple. Strike the crystals to wake the old doors.', TEMPLE.x + 72, TEMPLE.y + 30);
addSign('Weathered sign', 'The Haunted Crypt. Turn back, traveler.', CRYPT.x + 72, CRYPT.y + 30);
// dungeon clutter
for (const [D, list] of [[MINE_D, [[16, 41], [23, 41], [3, 31]]], [TEMPLE_D, [[25, 31], [33, 28]]], [CRYPT_D, [[16, 12], [31, 17], [37, 25]]]]) for (const [x, y] of list) addPot(D.x0 + x, y, x % 2 ? 'crate' : 'pot');
for (const [ox, oy] of [[-130, 60], [130, 70], [0, 150]]) addPot(Math.floor((FROST_D.camp.x + ox) / T), Math.floor((FROST_D.camp.y + oy) / T), 'crate');
// loose items scattered across the island and the moor
{
  const kinds = ['gold', 'gold', 'herb', 'goo', 'crystal', 'stone', 'wood'];
  let placed = 0;
  for (let i = 0; i < 3000 && placed < 22; i++) {
    const frost = placed >= 15, x = frost ? FROST_D.x0 + 2 + Math.floor(hash(i, 91) * (DW - 4)) : 2 + Math.floor(hash(i, 91) * (OW - 4)), y = 2 + Math.floor(hash(91, i) * (H - 6));
    if (tiles[y * W + x] !== LAND || nearVillage(x, y, 7)) continue;
    pickups.push({ x: x * T + 16, y: y * T + 16, vx: 0, vy: 0, item: kinds[Math.floor(hash(i, 3) * kinds.length)], t: 1, v: 1, keep: true, loose: true });
    placed++;
  }
}

for (const E of ENTRANCES) RECTS.push({ x0: E.x - 52, x1: E.x - 18, y0: E.y - 56, y1: E.y - 4 }, { x0: E.x + 18, x1: E.x + 52, y0: E.y - 56, y1: E.y - 4 }, { x0: E.x - 18, x1: E.x + 18, y0: E.y - 56, y1: E.y - 20 });
decor.push({ key: 'barrel', x: HOUSE.x - 64, y: HOUSE.y + 4, s: 2, solid: 10 }, { key: 'crate', x: HOUSE.x + 64, y: HOUSE.y + 2, s: 2, solid: 11 },
  { key: 'hive', x: cx * T + 128, y: cy * T - 50, s: 2, solid: 10 }, { key: 'sign', x: cx * T - 52, y: dockY * T + 2, s: 2, solid: 8 },
  { key: 'fence_l', x: cx * T + 96, y: cy * T + 88, s: 2 }, { key: 'fence_h', x: cx * T + 128, y: cy * T + 88, s: 2 }, { key: 'fence_r', x: cx * T + 160, y: cy * T + 88, s: 2 });
// Frostmoor set pieces: campfire, Jarl's war camp, the frozen shrine
decor.push({ fire: true, x: FROST_D.fire.x, y: FROST_D.fire.y, solid: 12 });
for (const [ox, oy] of [[-90, -70], [70, -86], [96, 40]]) decor.push({ tent: true, x: FROST_D.camp.x + ox, y: FROST_D.camp.y + oy, solid: 22 });
for (const [ox, oy] of [[-120, 10], [-100, 70], [120, -20], [-40, 120], [40, 124]]) decor.push({ key: 'barrel', x: FROST_D.camp.x + ox, y: FROST_D.camp.y + oy, s: 2, solid: 10 });
for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5; decor.push({ key: 'crystal_ice', x: FROST_D.shrine.x + Math.cos(a) * 5.4 * T, y: FROST_D.shrine.y + Math.sin(a) * 4.8 * T, s: 3, solid: 12, glow: true, ice: true }); }
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2 + 0.39, x = ARENA.x + Math.cos(a) * 5.7 * T, y = ARENA.y + Math.sin(a) * 5.2 * T;
  if (walkable(x, y)) decor.push({ key: 'crystal', x, y, s: 3, solid: 12, glow: true });
}
for (const [key, n] of [['chicken', 3], ['sheep', 1], ['cow', 1]]) for (let i = 0; i < n; i++) {
  const a = rng() * Math.PI * 2, d = 70 + rng() * 80;
  animals.push({ key, x: cx * T + Math.cos(a) * d + 60, y: cy * T + 60 + Math.sin(a) * 40, vx: 0, vy: 0, t: rng() * 3, flip: false, hop: rng() * 6 });
}

// ---------- icons ----------
const ICON_DRAW = {
  wood: c => { c.fillStyle = '#2a1a10'; c.fillRect(4, 10, 24, 13); c.fillStyle = '#7a4b27'; c.fillRect(5, 11, 22, 11); c.fillStyle = '#9a6234'; c.fillRect(5, 11, 22, 3); c.fillStyle = '#d8a96b'; ellipse(c, 25, 16.5, 4, 5.5); c.strokeStyle = '#7a4b27'; c.lineWidth = 1; c.beginPath(); c.arc(25, 16.5, 2, 0, 7); c.stroke(); },
  goo: c => { c.fillStyle = '#5fd06a'; c.beginPath(); c.moveTo(16, 5); c.quadraticCurveTo(26, 18, 22, 24); c.quadraticCurveTo(16, 30, 10, 24); c.quadraticCurveTo(6, 18, 16, 5); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; circle(c, 13, 19, 2.5); },
  planks: c => { for (let i = 0; i < 3; i++) { c.fillStyle = '#2a1a10'; c.fillRect(3, 7 + i * 6, 26, 6); c.fillStyle = i % 2 ? '#a8713f' : '#8a5a32'; c.fillRect(4, 8 + i * 6, 24, 4); } c.fillStyle = '#d8c48a'; c.fillRect(14, 6, 4, 20); },
  pearl: c => { c.fillStyle = '#f2b6c6'; ellipse(c, 16, 22, 11, 6); c.fillStyle = '#e88aa5'; ellipse(c, 16, 22, 9, 4); c.fillStyle = '#f7f4ff'; circle(c, 16, 15, 7); c.fillStyle = '#ffffff'; circle(c, 13, 12, 2.5); },
  relic: c => { c.fillStyle = '#7a5a14'; c.beginPath(); c.moveTo(6, 5); c.lineTo(26, 5); c.lineTo(26, 16); c.quadraticCurveTo(16, 30, 16, 30); c.quadraticCurveTo(6, 22, 6, 16); c.closePath(); c.fill(); c.fillStyle = '#f4b740'; c.beginPath(); c.moveTo(8, 7); c.lineTo(24, 7); c.lineTo(24, 16); c.quadraticCurveTo(16, 27, 16, 27); c.quadraticCurveTo(8, 21, 8, 16); c.closePath(); c.fill(); c.fillStyle = '#c8d0e0'; c.fillRect(15, 9, 3, 14); c.fillRect(11, 13, 11, 3); },
  horn: c => { c.strokeStyle = '#5a4a30'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(6, 24); c.quadraticCurveTo(10, 6, 26, 6); c.stroke(); c.strokeStyle = '#efe6d0'; c.lineWidth = 5; c.beginPath(); c.moveTo(6, 24); c.quadraticCurveTo(10, 6, 26, 6); c.stroke(); c.strokeStyle = '#c0392b'; c.lineWidth = 3; c.beginPath(); c.moveTo(8, 17); c.lineTo(13, 20); c.stroke(); c.lineCap = 'butt'; },
  frostheart: c => { c.fillStyle = '#2a6f8f'; c.beginPath(); c.moveTo(16, 28); c.bezierCurveTo(2, 18, 4, 4, 16, 10); c.bezierCurveTo(28, 4, 30, 18, 16, 28); c.fill(); c.fillStyle = '#9fe8ff'; c.beginPath(); c.moveTo(16, 25); c.bezierCurveTo(5, 17, 7, 7, 16, 12); c.bezierCurveTo(25, 7, 27, 17, 16, 25); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(10, 11, 3, 3); },
  sunstone: c => { c.fillStyle = '#b8862a'; diamond(c, 16, 18, 11, 14); c.fillStyle = '#f4b740'; diamond(c, 16, 18, 9, 11); c.fillStyle = '#ffe9a8'; diamond(c, 14, 15, 3, 5); c.strokeStyle = 'rgba(255,214,90,.8)'; c.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12); c.lineTo(16 + Math.cos(a) * 15, 16 + Math.sin(a) * 15); c.stroke(); } },
  idol: c => { c.fillStyle = '#7a5a14'; c.fillRect(9, 6, 14, 22); c.fillStyle = '#f4b740'; c.fillRect(10, 7, 12, 20); c.fillStyle = '#7a5a14'; c.fillRect(12, 11, 3, 3); c.fillRect(17, 11, 3, 3); c.fillRect(13, 18, 6, 2); c.fillStyle = '#ec5257'; c.fillRect(15, 3, 2, 4); c.fillStyle = '#ffe9a8'; c.fillRect(11, 8, 2, 6); },
  obsidian: c => { c.fillStyle = '#16121c'; c.beginPath(); c.moveTo(6, 28); c.lineTo(10, 10); c.lineTo(16, 3); c.lineTo(21, 12); c.lineTo(26, 28); c.closePath(); c.fill(); c.fillStyle = '#4a3a62'; c.beginPath(); c.moveTo(11, 26); c.lineTo(13, 12); c.lineTo(16, 7); c.lineTo(17, 22); c.closePath(); c.fill(); c.fillStyle = '#c8b8ff'; c.fillRect(14, 9, 2, 6); },
  starshard: c => { c.fillStyle = 'rgba(159,212,255,.35)'; circle(c, 16, 16, 13); c.fillStyle = '#5a7ab0'; diamond(c, 16, 16, 7, 12); c.fillStyle = '#9fd4ff'; diamond(c, 16, 16, 5, 9); c.fillStyle = '#ffffff'; diamond(c, 14, 13, 1.5, 4); c.fillStyle = '#ffe9a8'; c.fillRect(24, 6, 2, 2); c.fillRect(6, 24, 2, 2); },
  lens: c => { c.fillStyle = '#8a6a34'; circle(c, 16, 16, 11); c.fillStyle = 'rgba(159,212,255,.8)'; circle(c, 16, 16, 8); c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(13, 13, 3, 2, -0.6, 0, Math.PI * 2); c.fill(); },
  gear: c => { c.save(); c.translate(16, 16); c.fillStyle = '#8a6a34'; for (let i = 0; i < 8; i++) { c.save(); c.rotate(i / 8 * Math.PI * 2); c.fillRect(-2.5, -13, 5, 5); c.restore(); } c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d0aa5c'; c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill(); c.fillStyle = '#8a6a34'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill(); c.restore(); },
  mainspring: c => { c.strokeStyle = '#d0aa5c'; c.lineWidth = 2.5; c.beginPath(); for (let a = 0; a < Math.PI * 6; a += 0.2) { const r = 2 + a * 0.6; const x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r; if (a === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); c.fillStyle = '#7fe0f0'; circle(c, 16, 16, 2); },
  coral: c => { c.fillStyle = 'rgba(232,112,58,.25)'; circle(c, 16, 16, 12); c.fillStyle = '#e8703a'; c.fillRect(14, 10, 4, 18); c.fillRect(8, 8, 3, 12); c.fillRect(21, 6, 3, 14); c.fillRect(8, 18, 8, 3); c.fillRect(17, 16, 7, 3); c.fillStyle = '#ffb08a'; c.fillRect(15, 10, 1.5, 10); circle(c, 9.5, 8, 2); circle(c, 22.5, 6, 2); circle(c, 16, 9, 2); },
  compass: c => { c.fillStyle = '#8a6a34'; circle(c, 16, 16, 11); c.fillStyle = '#f2e6d6'; circle(c, 16, 16, 8); c.fillStyle = '#e0503a'; c.beginPath(); c.moveTo(16, 9); c.lineTo(18, 16); c.lineTo(14, 16); c.fill(); c.fillStyle = '#3a4a6a'; c.beginPath(); c.moveTo(16, 23); c.lineTo(18, 16); c.lineTo(14, 16); c.fill(); c.fillStyle = '#d9a23c'; c.fillRect(15, 3, 2, 3); },
  petal: c => { c.fillStyle = 'rgba(242,160,200,.3)'; circle(c, 16, 16, 12); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; c.fillStyle = i % 2 ? '#f2a0c8' : '#ffc4dc'; c.beginPath(); c.ellipse(16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, 5, 3.5, a, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#ffe08a'; circle(c, 16, 16, 2.5); },
  comb: c => { c.fillStyle = '#e6e2f0'; c.beginPath(); c.ellipse(16, 12, 11, 6, 0, Math.PI, 0); c.fill(); c.fillStyle = '#c8c0d8'; for (let i = 0; i < 8; i++) c.fillRect(7 + i * 2.4, 12, 1.4, 12); c.fillStyle = '#f2a0c8'; circle(c, 12, 9, 2.5); circle(c, 20, 9, 2.5); c.fillStyle = '#ffffff'; circle(c, 16, 8, 2); },
  jade: c => { c.fillStyle = 'rgba(90,200,120,.3)'; circle(c, 16, 16, 12); c.fillStyle = '#2f6b3a'; c.beginPath(); c.ellipse(16, 17, 10, 8, 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#5ab87a'; c.beginPath(); c.ellipse(15, 16, 7, 5, 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d6ffe0'; c.fillRect(11, 13, 3, 2); },
  jadeidol: c => { c.fillStyle = '#2f6b3a'; c.fillRect(9, 6, 14, 22); c.fillStyle = '#5ab87a'; c.fillRect(10, 7, 12, 20); c.fillStyle = '#2f6b3a'; c.fillRect(12, 11, 3, 3); c.fillRect(17, 11, 3, 3); c.fillRect(13, 18, 6, 2); c.fillStyle = '#d6ffe0'; c.fillRect(11, 8, 2, 6); c.fillStyle = '#ffd65a'; c.fillRect(14, 3, 4, 3); },
  glimmer: c => { c.fillStyle = 'rgba(159,232,255,.3)'; circle(c, 16, 16, 12); c.fillStyle = '#5a7ab0'; c.beginPath(); c.moveTo(16, 4); c.lineTo(26, 14); c.lineTo(20, 28); c.lineTo(12, 28); c.lineTo(6, 14); c.closePath(); c.fill(); c.fillStyle = '#9fe8ff'; c.beginPath(); c.moveTo(16, 6); c.lineTo(23, 14); c.lineTo(16, 26); c.lineTo(9, 14); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.fillRect(13, 10, 2, 6); },
  goldpick: c => { c.save(); c.translate(16, 16); c.rotate(-0.7); c.fillStyle = '#6a4a2a'; c.fillRect(-1.5, -4, 3, 18); c.fillStyle = '#d9a23c'; c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(0, -12, 12, -6); c.lineTo(10, -3); c.quadraticCurveTo(0, -8, -10, -3); c.closePath(); c.fill(); c.fillStyle = '#ffe9a8'; c.fillRect(-4, -9, 6, 2); c.restore(); },
  ectoplasm: c => { c.fillStyle = 'rgba(184,168,255,.35)'; circle(c, 16, 18, 12); c.fillStyle = '#9a88e0'; c.beginPath(); c.moveTo(8, 26); c.quadraticCurveTo(6, 10, 16, 6); c.quadraticCurveTo(26, 10, 24, 26); c.lineTo(20, 22); c.lineTo(16, 27); c.lineTo(12, 22); c.closePath(); c.fill(); c.fillStyle = '#e6deff'; c.fillRect(12, 13, 3, 3); c.fillRect(18, 13, 3, 3); },
  feather: c => { c.save(); c.translate(16, 16); c.rotate(-0.6); c.fillStyle = '#c8b89a'; c.beginPath(); c.ellipse(0, -2, 5, 12, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#efe6d8'; c.beginPath(); c.ellipse(-1, -3, 3, 10, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6a4a2a'; c.fillRect(-0.5, -12, 1.5, 26); c.restore(); },
  chime: c => { c.fillStyle = '#8a6a44'; c.fillRect(6, 4, 20, 3); c.strokeStyle = '#c8c0b0'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(9 + i * 5, 7); c.lineTo(9 + i * 5, 12); c.stroke(); } for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#7fe0f0' : '#bfefff'; c.fillRect(8 + i * 5, 12, 3, 10 + (i % 2) * 6); } c.fillStyle = '#ffffff'; c.fillRect(8, 13, 1, 6); },
  bloom: c => { c.fillStyle = '#3d6a44'; c.fillRect(15, 18, 2, 12); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.fillStyle = i % 2 ? '#ff7a2a' : '#ffb347'; c.beginPath(); c.ellipse(16 + Math.cos(a) * 6, 13 + Math.sin(a) * 6, 5, 3, a, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#ffe08a'; circle(c, 16, 13, 3.5); },
  clockheart: c => { c.fillStyle = 'rgba(208,170,92,.35)'; circle(c, 16, 16, 13); c.fillStyle = '#8a6a34'; circle(c, 16, 16, 10); c.fillStyle = '#f2e6d0'; circle(c, 16, 16, 7); c.strokeStyle = '#2a2a30'; c.lineWidth = 2; c.beginPath(); c.moveTo(16, 16); c.lineTo(16, 10); c.moveTo(16, 16); c.lineTo(20, 18); c.stroke(); c.fillStyle = '#e0503a'; circle(c, 16, 16, 1.5); },
  krakenbeak: c => { c.fillStyle = 'rgba(154,90,184,.3)'; circle(c, 16, 16, 13); c.fillStyle = '#2a1a1a'; c.beginPath(); c.moveTo(8, 10); c.quadraticCurveTo(26, 6, 26, 16); c.quadraticCurveTo(20, 14, 12, 18); c.closePath(); c.fill(); c.beginPath(); c.moveTo(8, 20); c.quadraticCurveTo(22, 26, 24, 18); c.quadraticCurveTo(18, 20, 12, 18); c.closePath(); c.fill(); c.fillStyle = '#8a7aa8'; c.fillRect(12, 11, 6, 2); },
  dragonpearl: c => { c.fillStyle = 'rgba(255,233,242,.4)'; circle(c, 16, 16, 13); c.fillStyle = '#e8d6e6'; circle(c, 16, 16, 9); c.fillStyle = '#ffffff'; circle(c, 13, 13, 4); c.strokeStyle = '#e8703a'; c.lineWidth = 2; c.beginPath(); c.arc(16, 16, 11, 0.5, 2.6); c.stroke(); },
  serpenteye: c => { c.fillStyle = 'rgba(255,214,90,.35)'; circle(c, 16, 16, 13); c.fillStyle = '#2f6b3a'; c.beginPath(); c.ellipse(16, 16, 12, 8, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffd65a'; c.beginPath(); c.ellipse(16, 16, 9, 6, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1a1210'; c.fillRect(15, 10, 2, 12); c.fillStyle = '#ffffff'; c.fillRect(11, 13, 2, 2); },
  prismheart: c => { c.fillStyle = 'rgba(165,147,255,.35)'; circle(c, 16, 16, 13); c.fillStyle = '#4a3a7a'; c.beginPath(); c.moveTo(16, 27); c.bezierCurveTo(2, 18, 6, 4, 16, 11); c.bezierCurveTo(26, 4, 30, 18, 16, 27); c.fill(); c.fillStyle = '#a593ff'; c.beginPath(); c.moveTo(16, 24); c.bezierCurveTo(6, 17, 9, 7, 16, 13); c.bezierCurveTo(23, 7, 26, 17, 16, 24); c.fill(); c.fillStyle = '#9fe8ff'; c.fillRect(11, 12, 3, 4); },
  soulgem: c => { c.fillStyle = 'rgba(127,224,122,.3)'; circle(c, 16, 16, 13); c.fillStyle = '#2a4a2a'; diamond(c, 16, 16, 9, 12); c.fillStyle = '#7fe07a'; diamond(c, 16, 16, 7, 9); c.fillStyle = '#e6ffe0'; c.fillRect(12, 13, 3, 3); c.fillRect(17, 13, 3, 3); c.fillStyle = '#2a4a2a'; c.fillRect(14, 19, 4, 1); },
  stormcore: c => { c.fillStyle = 'rgba(127,224,240,.35)'; circle(c, 16, 16, 13); c.fillStyle = '#3a4a6a'; circle(c, 16, 16, 9); c.fillStyle = '#7fe0f0'; circle(c, 16, 16, 6); c.strokeStyle = '#fff6a8'; c.lineWidth = 2; c.beginPath(); c.moveTo(18, 6); c.lineTo(13, 16); c.lineTo(19, 16); c.lineTo(14, 26); c.stroke(); },
  dragonscale: c => { c.fillStyle = '#5a1a14'; c.beginPath(); c.moveTo(16, 3); c.quadraticCurveTo(29, 12, 16, 29); c.quadraticCurveTo(3, 12, 16, 3); c.fill(); c.fillStyle = '#c8402a'; c.beginPath(); c.moveTo(16, 6); c.quadraticCurveTo(25, 13, 16, 25); c.quadraticCurveTo(7, 13, 16, 6); c.fill(); c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(16, 9); c.quadraticCurveTo(21, 14, 16, 20); c.quadraticCurveTo(11, 14, 16, 9); c.fill(); c.fillStyle = '#fff2c4'; c.fillRect(14, 11, 2, 4); },
  heartwood: c => { c.fillStyle = '#3d2a1a'; c.fillRect(8, 6, 16, 22); c.fillStyle = '#7a5232'; c.fillRect(10, 8, 12, 18); c.strokeStyle = '#5a3a22'; c.lineWidth = 1.5; for (const r of [3, 6]) { c.beginPath(); c.ellipse(16, 17, r, r * 1.4, 0, 0, Math.PI * 2); c.stroke(); } c.fillStyle = '#7fe07a'; circle(c, 16, 17, 2.5); c.fillStyle = '#4f8a3a'; c.beginPath(); c.ellipse(22, 6, 5, 3, -0.6, 0, Math.PI * 2); c.fill(); },
  fang: c => { c.fillStyle = '#7a5a2a'; c.beginPath(); c.moveTo(10, 4); c.quadraticCurveTo(26, 10, 18, 29); c.quadraticCurveTo(14, 18, 10, 4); c.fill(); c.fillStyle = '#f2ead6'; c.beginPath(); c.moveTo(11, 6); c.quadraticCurveTo(24, 11, 18, 26); c.quadraticCurveTo(15, 17, 11, 6); c.fill(); },
  ring: c => { c.strokeStyle = '#7a5a14'; c.lineWidth = 5; c.beginPath(); c.arc(16, 19, 8, 0, 7); c.stroke(); c.strokeStyle = '#f4b740'; c.lineWidth = 3; c.beginPath(); c.arc(16, 19, 8, 0, 7); c.stroke(); c.fillStyle = '#ec5257'; diamond(c, 16, 10, 4, 6); c.fillStyle = '#ffffff'; c.fillRect(14, 7, 2, 2); },
  charm: c => { c.strokeStyle = '#f4b740'; c.lineWidth = 2.5; c.beginPath(); c.arc(16, 17, 10, 0, 7); c.stroke(); c.fillStyle = '#a593ff'; diamond(c, 16, 17, 5, 8); c.fillStyle = '#f4b740'; c.fillRect(14, 3, 4, 5); },
};
const ICON_ATLAS = { gem: 'gem', key: 'key', bosskey: 'bosskey', crown: 'crown', stone: 'rock_g', herb: 'herb_a', crystal: 'crystal', potion: 'potion', pickaxe: 'pickaxe', gold: 'coin' };
function swordIcon(col, big) { return c => { c.strokeStyle = '#2a1a10'; c.lineWidth = big ? 7 : 6; c.beginPath(); c.moveTo(9, 24); c.lineTo(26, 6); c.stroke(); c.strokeStyle = col; c.lineWidth = big ? 5 : 3.5; c.beginPath(); c.moveTo(10, 23); c.lineTo(26, 6); c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath(); c.moveTo(13, 19); c.lineTo(24, 8); c.stroke(); c.strokeStyle = '#f4b740'; c.lineWidth = 3; c.beginPath(); c.moveTo(5, 18); c.lineTo(13, 27); c.stroke(); c.strokeStyle = '#7a4b27'; c.beginPath(); c.moveTo(8, 25); c.lineTo(4, 29); c.stroke(); }; }
function armorIcon(t) { return c => { c.fillStyle = '#1b1a2e'; c.beginPath(); c.moveTo(5, 8); c.lineTo(11, 4); c.lineTo(21, 4); c.lineTo(27, 8); c.lineTo(25, 15); c.lineTo(23, 14); c.lineTo(23, 28); c.lineTo(9, 28); c.lineTo(9, 14); c.lineTo(7, 15); c.closePath(); c.fill(); c.fillStyle = t[1]; c.beginPath(); c.moveTo(7, 9); c.lineTo(12, 6); c.lineTo(20, 6); c.lineTo(25, 9); c.lineTo(24, 13); c.lineTo(21, 12); c.lineTo(21, 26); c.lineTo(11, 26); c.lineTo(11, 12); c.lineTo(8, 13); c.closePath(); c.fill(); c.fillStyle = t[2]; c.fillRect(13, 8, 3, 16); c.fillStyle = t[0]; c.fillRect(11, 18, 10, 2); }; }
for (const [k, w] of Object.entries(WEAPONS)) ICON_DRAW['w_' + k] = swordIcon(w.col, w.heavy);
for (const [k, a] of Object.entries(ARMORS)) ICON_DRAW['a_' + k] = armorIcon(a.tint || ['#3a2c25', '#2f7dd1', '#7fb6ee']);
const ICON_CANVAS = {}, ICONS = {};
function buildIcons() {
  for (const k of [...Object.keys(ICON_DRAW), ...Object.keys(ICON_ATLAS)]) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    if (ICON_DRAW[k]) ICON_DRAW[k](g); else spr(g, ICON_ATLAS[k], 0, 0, 2);
    ICON_CANVAS[k] = c; ICONS[k] = c.toDataURL();
  }
  $('coinIcon').src = ICONS.gold;
}

// ---------- HUD ----------
const toastEl = $('toast'); let toastTimer = 0;
function toast(msg, ms = 2600) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms); }
const INV_ORDER = ['wood', 'stone', 'herb', 'goo', 'crystal', 'obsidian', 'feather', 'ectoplasm', 'glimmer', 'jade', 'petal', 'coral', 'gear', 'starshard', 'planks', 'potion', 'charm', 'crown', 'gem', 'pearl', 'relic', 'horn', 'frostheart', 'fang', 'sunstone', 'heartwood', 'dragonscale', 'stormcore', 'soulgem', 'prismheart', 'serpenteye', 'dragonpearl', 'krakenbeak', 'clockheart'];
const TROPHIES = ['crown', 'gem', 'pearl', 'relic', 'horn', 'frostheart', 'fang', 'sunstone', 'heartwood', 'dragonscale', 'stormcore', 'soulgem', 'prismheart', 'serpenteye', 'dragonpearl', 'krakenbeak', 'clockheart'];
function objectiveText() {
  const DH = interiorAt(P.x, P.y) ? null : dungeonAt(P.x);
  if (DH) return DH.objective(dgs(DH));
  if (S.bridge) return 'The bridge is open. Keep exploring, or cross it to the mainland.';
  if (S.gold >= GOAL) return 'You have enough! Bring 400g to Tobin at the south dock.';
  if (!S.tools.pickaxe) {
    if (S.inv.wood < 5 || S.inv.stone < 4) return `Chop trees and break rocks (wood ${Math.min(S.inv.wood, 5)}/5, stone ${Math.min(S.inv.stone, 4)}/4), then craft a pickaxe at the village workbench.`;
    return 'Craft a Stone Pickaxe at the workbench in the village.';
  }
  return `Mine crystals in the purple grove up north, craft Crystal Charms, and sell them to Oma Fen${S.defeated.slime ? '' : ', or challenge the Slime King at the north tip'}. ${S.gold} / ${GOAL}g`;
}
function updateHUD() {
  let h = '';
  for (let i = 0; i < maxHp(); i++) h += `<span class="${i < S.hp ? 'on' : 'off'}">♥</span>`;
  $('hearts').innerHTML = h;
  $('gold').textContent = S.gold;
  $('objective').textContent = objectiveText();
  const act = QUESTS.filter(q => qState(q.id) && qState(q.id).state === 'active');
  $('qtrack').innerHTML = act.slice(0, 3).map(q => `<div class="${questDone(q) ? 'qdone' : ''}"><b>${q.name}</b> · ${questDone(q) ? 'Return to ' + NPCS.find(n => n.id === q.giver).name : questProgress(q)}</div>`).join('');
  const DI = interiorAt(P.x, P.y), DL = DI ? null : dungeonAt(P.x);
  document.querySelector('.objective .label').textContent = DI ? DI.name : DL ? DL.name : 'Goal · Rebuild the south bridge';
  $('fund').style.width = Math.min(100, S.gold / GOAL * 100) + '%';
  let inv = '';
  for (const k of INV_ORDER) if (!TROPHIES.includes(k) || S.inv[k]) inv += `<button class="slot ${S.inv[k] ? '' : 'zero'}" data-item="${k}" title="${ITEMS[k].name}" aria-label="${ITEMS[k].name}: ${S.inv[k]}"><img src="${ICONS[k]}" alt=""><b>${S.inv[k]}</b></button>`;
  if (S.tools.pickaxe) inv += `<div class="slot tool" title="Stone Pickaxe"><img src="${ICONS.pickaxe}" alt="Stone Pickaxe"></div>`;
  inv += `<button class="slot tool" data-gear="1" title="${gearW().name}"><img src="${ICONS['w_' + S.gear.weapon]}" alt="${gearW().name}"></button>`;
  inv += `<button class="slot tool" data-gear="1" title="${gearA().name}"><img src="${ICONS['a_' + S.gear.armor]}" alt="${gearA().name}"></button>`;
  const g = DL ? dgs(DL) : null;
  if (g && g.keys) inv += `<div class="slot tool" title="Small Key"><img src="${ICONS.key}" alt="Small Key"><b>${g.keys}</b></div>`;
  if (g && g.bossKey) inv += `<div class="slot tool" title="Boss Key"><img src="${ICONS.bosskey}" alt="Boss Key"></div>`;
  $('inventory').innerHTML = inv;
}
$('inventory').addEventListener('click', e => { const gb = e.target.closest('[data-gear]'); if (gb) { toast(`${gearW().name} · ${gearA().name}. Craft and equip gear at the village workbench.`); return; } const b = e.target.closest('[data-item]'); if (!b) return; if (b.dataset.item === 'potion') drinkTonic(); else toast(`${ITEMS[b.dataset.item].name} · sells for ${ITEMS[b.dataset.item].price}g`); });

// ---------- dialogue ----------
let dlg = null;
function say(who, lines, done) { dlg = { who, lines, i: 0, done }; $('dialogue').hidden = false; $('dlgWho').textContent = who; $('dlgText').textContent = lines[0]; }
function advanceDialogue() {
  if (!dlg) return; dlg.i++;
  if (dlg.i >= dlg.lines.length) { const d = dlg.done; dlg = null; $('dialogue').hidden = true; if (d) d(); return; }
  $('dlgText').textContent = dlg.lines[dlg.i];
}
$('dialogue').addEventListener('click', advanceDialogue);

// ---------- panels ----------
let panel = null;
const panelEl = $('panel'), body = $('panelBody');
function openPanel(kind) { panel = kind; panelEl.hidden = false; renderPanel(); panelEl.querySelector('.sheet').focus(); }
function closePanel() {
  if (!panel) return; panel = null; panelEl.hidden = true; save();
  if (P.pendingCheer) { const t = P.pendingCheer; P.pendingCheer = null; P.fx = 0; P.fy = 1; startAct('cheer', () => { banner(t, '#ffe08a'); burst(P.x, P.y - 50, '#ffe08a', 16); }); }
}
$('panelClose').addEventListener('click', closePanel);
panelEl.addEventListener('click', e => { if (e.target === panelEl) closePanel(); });
const canAfford = cost => Object.entries(cost).every(([k, n]) => S.inv[k] >= n);
const sellAllValue = () => INV_ORDER.filter(k => k !== 'potion').reduce((s, k) => s + S.inv[k] * ITEMS[k].price, 0);
let resetArmed = false;
const CREDITS = `<div class="credits"><b>Art credits.</b> Characters: Universal LPC Spritesheet Character Generator (Liberated Pixel Cup) by __LPC_AUTHORS__. Licensed CC-BY-SA 3.0, GPL 3.0 and OGA-BY 3.0; colors adjusted for this game. Tiles, trees, animals, monsters, dungeon tiles and items: Kenney's Tiny Town, Tiny Battle, Tiny Farm and Tiny Dungeon packs (kenney.nl, CC0).</div>`;
function renderPanel() {
  let html = '';
  if (panel === 'shop') {
    $('panelTitle').textContent = shopName;
    const v = sellAllValue();
    html = `<p class="sub">Oma buys anything you bring. Crafted goods are worth far more than raw materials.</p>
      <button class="primary" data-act="sellall" ${v ? '' : 'disabled'}>Sell everything except tonics (+${v}g)</button><div class="rows">` +
      INV_ORDER.map(k => `<div class="row ${S.inv[k] ? '' : 'empty'}"><img src="${ICONS[k]}" alt=""><div class="meta"><b>${ITEMS[k].name}</b><span>${ITEMS[k].price}g each · you have ${S.inv[k]}</span></div>
        <button data-act="sell1" data-k="${k}" ${S.inv[k] ? '' : 'disabled'}>Sell 1</button><button data-act="sellk" data-k="${k}" ${S.inv[k] ? '' : 'disabled'}>All</button></div>`).join('') + '</div>';
  } else if (panel === 'craft') {
    $('panelTitle').textContent = 'Workbench';
    const tabs = [['items', 'Tools & goods'], ['weapons', 'Weapons'], ['armor', 'Armor']].map(([k, l]) => `<button class="tab ${craftTab === k ? 'on' : ''}" data-act="tab" data-k="${k}">${l}</button>`).join('');
    const costHtml = cost => Object.entries(cost).map(([k, n]) => `<span class="cost ${S.inv[k] >= n ? 'ok' : 'no'}"><img src="${ICONS[k]}" alt="${ITEMS[k].name}">${S.inv[k]}/${n}</span>`).join('');
    const gearRows = (list, owned, eq, prefix, kind) => Object.entries(list).map(([id, g]) => {
      const have = owned.includes(id), equipped = eq === id, stat = kind === 'w' ? `Damage ${g.dmg}` : `+${g.hearts} hearts`;
      const btn = equipped ? '<button disabled>Equipped</button>' : have ? `<button data-act="equip" data-k="${kind}:${id}">Equip</button>` : `<button data-act="craftgear" data-k="${kind}:${id}" ${canAfford(g.cost) ? '' : 'disabled'}>Craft</button>`;
      return `<div class="row ${equipped ? 'eq' : ''}"><img src="${ICONS[prefix + id]}" alt=""><div class="meta"><b>${g.name} <small>${stat}</small></b><span>${g.desc}</span>${have || !g.cost ? '' : `<div class="costs">${costHtml(g.cost)}</div>`}</div>${btn}</div>`;
    }).join('');
    if (craftTab === 'weapons') { body.innerHTML = `<div class="tabs">${tabs}</div><p class="sub">The best blades need boss treasures. Equipped gear shows in the corner of your inventory.</p><div class="rows">${gearRows(WEAPONS, S.gear.weapons, S.gear.weapon, 'w_', 'w')}</div>`; return; }
    if (craftTab === 'armor') { body.innerHTML = `<div class="tabs">${tabs}</div><p class="sub">Armor adds hearts. You'll see it on your hero.</p><div class="rows">${gearRows(ARMORS, S.gear.armors, S.gear.armor, 'a_', 'a')}</div>`; return; }
    html = `<div class="tabs">${tabs}</div><p class="sub">Turn what you gather into tools and goods worth selling.</p><div class="rows">` + RECIPES.map(r => {
      const owned = r.tool && S.tools[r.id], can = !owned && canAfford(r.cost);
      const costs = Object.entries(r.cost).map(([k, n]) => `<span class="cost ${S.inv[k] >= n ? 'ok' : 'no'}"><img src="${ICONS[k]}" alt="${ITEMS[k].name}">${S.inv[k]}/${n}</span>`).join('');
      return `<div class="row"><img src="${ICONS[r.id]}" alt=""><div class="meta"><b>${r.name}</b><span>${r.desc}</span><div class="costs">${costs}</div></div>
        <button data-act="craft" data-k="${r.id}" ${can ? '' : 'disabled'}>${owned ? 'Owned' : 'Craft'}</button></div>`;
    }).join('') + '</div>';
  } else if (panel === 'bridge') {
    $('panelTitle').textContent = 'The South Bridge';
    html = S.bridge ? `<p class="sub">The bridge stands again. The mainland is waiting on the other side.</p>` :
      `<p class="sub">Tobin has the timber and the know-how. He needs 400g to pay the crew.</p>
       <div class="fund"><div class="bar"><i style="width:${Math.min(100, S.gold / GOAL * 100)}%"></i></div><span>${Math.min(S.gold, GOAL)} / ${GOAL}g</span></div>
       <button class="primary" data-act="fund" ${S.gold >= GOAL ? '' : 'disabled'}>Pay 400g to rebuild the bridge</button>`;
  } else if (panel === 'quests') {
    $('panelTitle').textContent = 'Quest Log';
    const row = (q, st) => `<div class="row ${st === 'done' ? 'empty' : ''}"><div class="meta"><b>${q.name} <small>${NPCS.find(n => n.id === q.giver).name}</small></b><span>${st === 'done' ? 'Completed' : st === 'ready' ? 'Done! Return to ' + NPCS.find(n => n.id === q.giver).name + '.' : questProgress(q)}</span>
      <span>Reward: ${[q.reward.gold ? q.reward.gold + 'g' : '', ...Object.entries(q.reward.items || {}).map(([k, n]) => `${n} ${ITEMS[k].name}`)].filter(Boolean).join(', ')}</span></div></div>`;
    const active = QUESTS.filter(q => qState(q.id) && qState(q.id).state === 'active'), done = QUESTS.filter(q => qState(q.id) && qState(q.id).state === 'done');
    const avail = [...new Set(QUESTS.filter(questAvailable).map(q => q.giver))].map(id => NPCS.find(n => n.id === id).name);
    html = `<p class="sub">${avail.length ? `Look for the yellow ! over ${avail.join(', ')}.` : 'No new quests right now.'} Completed ${done.length} of ${QUESTS.length}.</p>
      <div class="label">Active</div><div class="rows">${active.length ? active.map(q => row(q, questReady(q) ? 'ready' : 'active')).join('') : '<p class="sub">No active quests.</p>'}</div>
      ${done.length ? `<div class="label" style="margin-top:12px">Completed</div><div class="rows">${done.map(q => row(q, 'done')).join('')}</div>` : ''}`;
  } else if (panel === 'help') {
    $('panelTitle').textContent = 'Controls';
    html = `<dl class="controls">
      <dt>WASD / Arrows</dt><dd>Move (joystick on touch screens)</dd>
      <dt>Space / J / E</dt><dd>Use the right tool on whatever is in front of you: sword for slimes, axe for trees, pickaxe for rocks, hands for herbs. Also talks and opens the workbench (A button).</dd>
      <dt>Shift / K</dt><dd>Leap through danger. Keep holding to sprint (hold the Dash button on touch).</dd>
      <dt>M</dt><dd>Sound on or off</dd>
      <dt>Q</dt><dd>Drink a Meadow Tonic</dd>
      <dt>Esc</dt><dd>Close menus</dd></dl>
      <div class="label">Villages and homes</div>
      <dl class="controls">
      <dt>Homes</dt><dd>Walk into any house door to go inside. Sleep in a bed to restore every heart. Each home hides one chest.</dd>
      <dt>Villages</dt><dd>Brindle Village, Saltmarsh Hamlet on the southeast coast, and Frosthold across the bridge. Read the signposts for directions.</dd>
      <dt>Pots and crates</dt><dd>Smash them for coins, herbs, goo or the odd tonic. Loose items lie around the wilds, too.</dd></dl>
      <div class="label">The Mirewood</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Take the Old Raft from the island's west beach, at the end of the west road. The raft at the landing brings you back.</dd>
      <dt>Hazards</dt><dd>Bog patches slow you. Spore clouds sting and slow while you stand in them.</dd>
      <dt>Creatures</dt><dd>Bog slimes split in two, shroomlings puff spores, toads leap and lash their tongues, wisps circle then explode, and hexers' purple curses reverse your controls for a moment.</dd>
      <dt>Elsewhere</dt><dd>Toads now hop around the meadow, shroomlings sprout in the forest, and wisps drift through the crystal grove.</dd></dl>
      <div class="label">Starfall Plateau</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Step into the Moonbeam on the north isle of the Cloudspire Isles. The beam at the Observatory takes you back.</dd>
      <dt>Meteor showers</dt><dd>Every so often meteors rain down. Step out of the red rings before they hit. Some leave glowing star shards behind: grab them.</dd>
      <dt>Creatures</dt><dd>Star sprites circle and burst into a fan of stars. Void orbs pull you toward them: walk or dash away. Meteor golems slam the ground and explode when defeated. Lunar hoppers leap high, out of reach, and crash down with a shockwave.</dd>
      <dt>Star shards</dt><dd>Meteors, sprites and golems leave star shards. They craft the Comet Edge and the healing Stargazer Robe.</dd>
      <dt>Elsewhere</dt><dd>Star sprites now twinkle in Duskhollow, and void orbs float through Glimmerdeep.</dd></dl>
      <div class="label">The Clock Tower</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>The ticking clock tower in the southwest section of the Cogwork Ruins.</dd>
      <dt>Inside</dt><dd>Pull three levers in the gear gallery: conveyor belts push you sideways, so dash across. The key alcove is sealed: a teleport pad in the turret hall leads inside.</dd>
      <dt>Clockwork Knight</dt><dd>His armor shrugs off most of your damage. Lure him into the great swinging pendulum: it smashes him and leaves him stunned. Don't get hit by it yourself!</dd>
      <dt>Great Clock</dt><dd>Its giant hands sweep the whole room: dash through or move around them. The three escapement gears glow one at a time: strike each while it glows to jam the clock, then hit its face.</dd></dl>
      <div class="label">The Cogwork Ruins</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Step on the Ancient Teleporter west of Brindle Village. The pad at the North Gate brings you back.</dd>
      <dt>Teleport pads</dt><dd>Machine walls split the ruins into sealed sections. Step on a glowing pad to jump to its twin: matching colors are linked.</dd>
      <dt>Creatures</dt><dd>Clockwork soldiers march in straight lines and thrust when you line up with them; after three thrusts they wind down. Sparkbots fire sparks in a cross. Bomb beetles drop ticking bombs: get out of the red ring. Gear turrets turn slowly and fire bursts.</dd>
      <dt>Brass gears</dt><dd>Machines drop brass gears. They craft the Clockwork Blade, whose sparks leap to nearby foes, and Brass Plate.</dd>
      <dt>Elsewhere</dt><dd>Sparkbots now roll through the rocky hills, and bomb beetles scuttle across the Sunward Isles.</dd></dl>
      <div class="label">The Drowned Palace</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>Sunken ruins with broken columns at the south end of the reef. It is flooded: your air keeps running out, so use the bubble vents inside.</dd>
      <dt>Inside</dt><dd>Strike the three giant clams in the gallery. Moray eels lurk in the hall beyond.</dd>
      <dt>Siren</dt><dd>Her song drags you toward her and shields her. Walk against the pull, then strike once the song ends. Dodge her bubbles.</dd>
      <dt>Kraken</dt><dd>Tentacles burst up from the edges and slam down: dodge the red rings, then hack at a tentacle while it rests on the floor. Sever three and the Kraken's head surfaces. Ink clouds slow you.</dd></dl>
      <div class="label">The Sunken Reef</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Climb into the Diving Bell at the Saltmarsh dock. The bell on the seabed takes you back up.</dd>
      <dt>Air</dt><dd>Underwater your air runs out: bubbles appear over your head. Refill at the bubble vents or inside the Bubble Dome. With no air left you lose hearts. You also move a little slower in the water.</dd>
      <dt>Creatures</dt><dd>Jellyfish glow, then zap everything around them. Pufferfish puff up full of spines: wait for them to deflate. Reef sharks circle, then dash. Moray eels lunge out of holes in the reef: strike right after they lunge.</dd>
      <dt>Sea coral</dt><dd>Pufferfish, sharks and eels drop coral. It crafts the long Coral Saber and Diver's Coral Mail, which doubles your air.</dd>
      <dt>Elsewhere</dt><dd>Jellyfish now drift along the Sunward Isles and the meadow.</dd></dl>
      <div class="label">The Shrine of Falling Petals</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>A small shrine with a curved roof on the east side of Petalfall Vale.</dd>
      <dt>Inside</dt><dd>Ring the three bells in the gallery. Cross the lily pond on sinking pads to reach the key.</dd>
      <dt>Elder Fox</dt><dd>She conjures copies of herself. Pop them one by one, guess the real fox, or strike the great bell in her courtyard to shatter every illusion at once.</dd>
      <dt>Koi Dragon</dt><dd>It swims under the sacred pool, surfacing to spit bubbles or send out waves. When it aims at the island, get off: it leaps out and strands itself. Strike it then.</dd></dl>
      <div class="label">Petalfall Vale</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Go through the Mountain Pass in the northeast of the Frostmoor. The pass at Petalfall brings you back.</dd>
      <dt>Lily pads</dt><dd>Hop across the ponds on lily pads, but keep moving: a pad sinks if you stand on it too long, and you splash back to shore.</dd>
      <dt>Creatures</dt><dd>Spirit foxes throw foxfire and conjure copies of themselves: strike the copies to pop them. Blossom moths drop sleepy pollen that slows you. Koi leap out of the ponds at you: hit them while they flop on the shore. Trickster tanuki disguise themselves as pots until you come close.</dd>
      <dt>Spirit petals</dt><dd>Moths and foxes drop spirit petals. They craft the Blossom Blade, whose hits sometimes heal you, and the Petalweave Robe.</dd>
      <dt>Elsewhere</dt><dd>Blossom moths flutter over the meadow, tanuki hide as pots in the forest, and spirit foxes haunt Duskhollow.</dd></dl>
      <div class="label">The Serpent Temple</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>The stepped temple at the ruins in the southeast of the Verdant Wilds.</dd>
      <dt>Inside</dt><dd>Strike three jade switches in the gallery. Stone snake heads in the dart hall shoot poison darts on a rhythm: time your steps.</dd>
      <dt>Giant Chameleon</dt><dd>It turns invisible. Watch for the tall grass shaking: swing there to find it. It is also visible after its tongue lashes out.</dd>
      <dt>Serpent Queen</dt><dd>Her scales block every hit except on the glowing gem at the tip of her tail. Stay clear of her body, dash out of her coils, and strike the tail. Three hits make her recoil.</dd></dl>
      <div class="label">The Verdant Wilds</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Ride Old Shelly the sea turtle from the south shore of the Sunward Isles. She swims you back, too.</dd>
      <dt>The jungle</dt><dd>Cut tall grass with your sword: herbs and coins hide underneath. Cross the river on the rope bridges. Ancient temple ruins stand to the southeast.</dd>
      <dt>Creatures</dt><dd>Snapjaws are rooted plants that bite up close and spit seeds from afar. Raptors hunt in pairs and dash at you. Dart frogs spit poison that ticks away your hearts. Thief monkeys steal your gold: catch them to get it back.</dd>
      <dt>Jade</dt><dd>Snapjaws and raptors drop jade. It crafts the poisonous Jade Fang and the speedy Ranger's Garb.</dd>
      <dt>Elsewhere</dt><dd>Snapjaws grow in the forest, raptors hunt the meadow, and dart frogs hop through the Mirewood.</dd></dl>
      <div class="label">The Prism Vault</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>A crystal-crusted door in Glimmerdeep's south cavern.</dd>
      <dt>Inside</dt><dd>Strike three crystal switches in the dark gallery. A chasm splits the next hall: ride the mine cart across.</dd>
      <dt>Mole King</dt><dd>He tunnels toward you and bursts up where you stand. Wait beside a crystal pillar: he crashes into it and is stunned. His new pillars rise each phase.</dd>
      <dt>Crystal Hydra</dt><dd>Three heads strike from above: one bites, one spits shards, one fires a beam. Dodge the red ring of a bite, then strike the head while it is stuck in the ground. Shatter all three.</dd></dl>
      <div class="label">Glimmerdeep</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Ride the Deep Lift beside the Old Mine entrance. The lift at Glimmer Camp takes you back up.</dd>
      <dt>Getting around</dt><dd>Chasms split the caverns. Hop in a mine cart to ride the rails across. Glowing crystals and mushrooms light the dark.</dd>
      <dt>Creatures</dt><dd>Shardbacks fire crystal splinters when you hit them: strike, then step back. Glimmerbats swarm and dive in groups. Burrowers tunnel under you, pop up to throw rocks, then dig back down. Geode golems raise their fists and slam the ground.</dd>
      <dt>Glimmerstone</dt><dd>Shardbacks and geodes drop glimmerstone. It crafts the Prism Blade, which sometimes strikes twice as hard, and the light Glimmer Mail.</dd>
      <dt>Elsewhere</dt><dd>Shardbacks now creep through the crystal grove, and burrowers dig under the meadow.</dd></dl>
      <div class="label">The Moonveil Ossuary</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>A bone-decked crypt door in the ruined chapel, southwest in Duskhollow.</dd>
      <dt>Braziers</dt><dd>The ossuary is pitch dark. Strike the four braziers to light them: they open the bone gate, and shades turn solid in their glow.</dd>
      <dt>Your Shadow</dt><dd>It mirrors your every move across the hall. It is only solid inside the one lit circle: walk so you meet it there, then strike. Later it mirrors you from both sides.</dd>
      <dt>Lich King</dt><dd>Three soul jars shield him. Smash all three to break the shield and stun him. He raises new jars as the fight goes on. Step out of his bone spikes and his death ring.</dd></dl>
      <div class="label">Duskhollow</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Step through the Spirit Gate, a glowing stone arch near the crypt on Brindle Isle. Its twin at Lanternrest brings you back.</dd>
      <dt>Darkness</dt><dd>You can only see a little way around you. Strike the eight spirit lanterns to light them for good: they push back the dark.</dd>
      <dt>Creatures</dt><dd>Skeletons climb out of the ground and throw bones; when one collapses, smash the bones before it gets back up. Shades are only solid in lantern light. Banshees wail in a growing ring: step out of it. Gloom hounds crouch, then pounce. Watch for glowing eyes in the dark.</dd>
      <dt>Ectoplasm</dt><dd>Shades and banshees drop ectoplasm. It crafts the Moonblade, which lights the dark and hits shades anywhere, and the Gravewarden Coat.</dd>
      <dt>Elsewhere</dt><dd>Skeletons now rise in the rocky hills, gloom hounds prowl the forest, and a banshee haunts the Frostmoor.</dd></dl>
      <div class="label">The Storm Spire</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>A white tower on the south isle of the Cloudspire Isles.</dd>
      <dt>Gust Gallery</dt><dd>Two wind lanes blow hard across the gallery. Dash (Shift) to cut through them and strike the three storm crystals.</dd>
      <dt>Colossus Sentinel</dt><dd>Its great shield blocks every hit from the front, and it turns to face you. Circle behind it, or strike when its laser overheats.</dd>
      <dt>Stormlord</dt><dd>It floats out of reach. Step out of the yellow lightning rings, lean into its gales, and swing at its storm orb to knock it back: the orb brings the Stormlord crashing down.</dd></dl>
      <div class="label">The Cloudspire Isles</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Ride the Great Updraft on Cinder Peak's east slope. The down-gust at Zephyr Roost takes you back.</dd>
      <dt>Getting around</dt><dd>Cloud bridges link the floating isles. Jet streams push you hard in one direction: ride them back north, you can't walk against them.</dd>
      <dt>Creatures</dt><dd>Storm puffs mark the ground under you, then strike with lightning: keep moving. Gale hawks hover and screech before they swoop. Windlings blow you away on contact. Cloud sentinels block every hit from the front: get behind them.</dd>
      <dt>Feathers</dt><dd>Gale hawks drop feathers. They craft the long-reaching Gale Blade and the speedy Windweave Cloak.</dd>
      <dt>Elsewhere</dt><dd>Gale hawks now hunt over the Frostmoor and the rocky hills, and windlings whirl across the Sunward Isles.</dd></dl>
      <div class="label">The Molten Forge</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>An iron gate in the rock at the south foot of Cinder Peak.</dd>
      <dt>Lava river</dt><dd>Strike the three cooling crystals to harden a bridge across the lava. Flame vents erupt here too.</dd>
      <dt>Forgemaster</dt><dd>He is too hot to hurt. Smash a water barrel right next to him to quench him, then strike while he steams. Barrels refill after a few seconds.</dd>
      <dt>Magma Drake</dt><dd>It flies out of reach. Its meteors leave obsidian boulders: stand behind one when it dives, and it crashes into the rock. Strike while it is down.</dd></dl>
      <div class="label">Cinder Peak</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Board the Sky Balloon just east of Brindle Village. The balloon at Ashfall Outpost brings you home.</dd>
      <dt>Hazards</dt><dd>Lava blocks the way: cross on the dark obsidian causeways. Vents glow and smoke, then erupt in a column of flame.</dd>
      <dt>Creatures</dt><dd>Magmites hop and leave burning puddles. Ember imps circle, throw fireballs and blink around you. Boulderbacks curl up and roll at you: they can't be hurt while rolling, but crash into a rock and they flip over for double damage. Salamanders dart sideways and spit three flames.</dd>
      <dt>Obsidian</dt><dd>Mine black glass rocks for obsidian. It crafts the Obsidian Edge and the fireproof Ashguard Plate.</dd>
      <dt>Elsewhere</dt><dd>Salamanders now skitter across the Sunward Isles, and boulderbacks and imps roam the rocky hills.</dd></dl>
      <div class="label">The Rotting Hollow</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>A giant hollow tree at the south end of the Mirewood.</dd>
      <dt>Root maze</dt><dd>Strike the four glowstones to open the gate. Thorny vines block shortcuts: cut them with your sword.</dd>
      <dt>Bog Hag</dt><dd>Her flasks leave poison clouds. When she hides, one cauldron bubbles harder than the rest: smash it to drag her out.</dd>
      <dt>Rotroot</dt><dd>Its bark halves your damage. Step out of the root lines, back away from the red sweep, and strike its glowing heart after it slams.</dd></dl>
      <div class="label">The Sunken Tomb</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>A pyramid on the west side of the Sunward Isles. Sand seals it until the Sand Wyrm is defeated.</dd>
      <dt>Spike floors</dt><dd>Spikes rise on a rhythm. Watch them poke up, then cross while they are down, or leap over.</dd>
      <dt>Mummy King</dt><dd>Step aside from his bandage lash, then strike while he is unraveled. When he sinks, keep moving.</dd>
      <dt>Golden Scarab</dt><dd>Dodge the bouncing sun-balls, leap over the sweeping sunbeam, and strike while it is overheated or stunned.</dd></dl>
      <div class="label">The Sunward Isles</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Sail Nell's boat from Saltmarsh Hamlet. The boat at the isles' north dock brings you back.</dd>
      <dt>Villages</dt><dd>Mirra Oasis (Zahir's bazaar, Amara, the Palm Inn) and Corsair's Cove (Captain Rosa, the Salty Anchor).</dd>
      <dt>Creatures</dt><dd>Sand scorpions pounce, sand raiders steal gold, dust spirits fade and cast wisps.</dd>
      <dt>Sand Wyrm</dt><dd>Keep moving while it burrows toward you. When it bursts out it's stuck in the open: strike then. Avoid its body as it slithers.</dd></dl>
      <div class="label">The Frostmoor</div>
      <dl class="controls">
      <dt>Getting there</dt><dd>Fund Tobin's bridge, then walk south across it. Walk north up the dock to come home. The campfire by the dock heals you.</dd>
      <dt>Creatures</dt><dd>Frost slimes chill you, raiders charge with axes, ice mages throw slowing ice bolts.</dd>
      <dt>Jarl Frostbeard</dt><dd>Swing at his thrown axe to knock it away and disarm him. Step off the blue circles before the ice spikes erupt.</dd>
      <dt>Hailwraith</dt><dd>Dodge the hail and frost breath. When she splits, hit the one with a shadow; the reflections have none.</dd></dl>
      <div class="label">Quests</div>
      <dl class="controls">
      <dt>L / Quests</dt><dd>Open the quest log. A yellow ! marks a villager with work for you, a green ? means a quest is ready to hand in.</dd>
      <dt>New faces</dt><dd>Farmer Pell by the animal pen, Captain Marla on the north road and Brother Hob west of the square.</dd></dl>
      <div class="label">Gear</div>
      <dl class="controls">
      <dt>Workbench</dt><dd>Craft weapons and armor under the Weapons and Armor tabs, and switch what you have equipped.</dd>
      <dt>Boss treasures</dt><dd>The Slime Crown, Hollow Gem, Sea Pearl and Knight's Relic sell for a lot, or forge the best gear in the game.</dd></dl>
      <div class="label">Special moves</div>
      <dl class="controls">
      <dt>3 moves in a row</dt><dd>Finisher: Power Slash (sword), Mighty Chop (axe), Rock Smash (pickaxe), Green Thumb (herbs, triple harvest). Double damage.</dd>
      <dt>Hold, then release</dt><dd>Whirlwind: spin and hit every slime, tree and rock around you.</dd>
      <dt>Attack after a dash</dt><dd>Dash Strike: a lunging double-damage slash.</dd>
      <dt>Lucky!</dt><dd>Sometimes a finished tree, rock or herb drops a bonus item.</dd></dl>
      <div class="label">Creatures</div>
      <dl class="controls">
      <dt>Bats</dt><dd>Forest. They circle you and swoop. Swing as they dive.</dd>
      <dt>Crabs</dt><dd>Meadow. Tough. Sidestep the charge and they get dizzy if they crash.</dd>
      <dt>Spiders</dt><dd>Quarry. Creep closer, then pounce.</dd>
      <dt>Cyclopes</dt><dd>Quarry. Throw rocks at the red circle. Move, or swing to knock rocks away.</dd>
      <dt>Ghosts</dt><dd>Grove. Can't be hit while faded. Their wisps follow you; swing to break them.</dd>
      <dt>Bandits</dt><dd>Forest and quarry roads. They steal gold and flee. Catch them to get it back.</dd>
      <dt>Snails</dt><dd>Meadow. They hide in their shells when hit; wait, then strike again.</dd>
      <dt>Rats</dt><dd>Quarry and mine. Fast and twitchy, but one hit does it.</dd>
      <dt>Cultists</dt><dd>Grove and crypt. They blink away when you get close and hurl fireballs.</dd>
      <dt>Slime King</dt><dd>Boss at the north tip. Leap over his shockwave, then hit him while he's dazed for double damage.</dd></dl>
      <div class="label">The Old Mine</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>East of the village, at the end of the road. Needs a pickaxe to clear the rubble.</dd>
      <dt>Gates and keys</dt><dd>Clear the cavern to open its gate. Find the small key in a chest to open the locked door.</dd>
      <dt>Rockjaw</dt><dd>Dodge his charge so he crashes into a wall, then hit him while he's stunned. Watch for red circles: rocks are falling.</dd>
      <dt>Hollow Wizard</dt><dd>His shield blocks swords. Swing at his orb to send it back and break the shield.</dd></dl>
      <div class="label">The Overgrown Temple</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>Southwest of the village, in the meadow. Follow the path from the plaza.</dd>
      <dt>Switches</dt><dd>Strike all three crystal switches in the entry hall to open the gate.</dd>
      <dt>Spider Queen</dt><dd>Webs slow you down; swing to cut them. After she pounces she's tangled, so hit her then.</dd>
      <dt>King Clawdius</dt><dd>His shell halves your damage. When he dives, keep moving; he flips over when he bursts out.</dd></dl>
      <div class="label">The Haunted Crypt</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>West of the village, at the end of the west road in the forest.</dd>
      <dt>Nightwing</dt><dd>Hit it when it swoops low. Leap over its screech. It lands to rest after a few swoops.</dd>
      <dt>Bone Knight</dt><dd>His shield blocks you. Strike right after his slash, or while he's dizzy after spinning.</dd></dl>
      <p class="sub">Bosses defeated: ${Object.keys(BOSS_INFO).filter(k => S.defeated[k]).length} / ${BOSSES.length}</p>
      <p class="sub">Standing in the village slowly restores your hearts. Progress saves in this browser automatically.</p>
      <button class="btn" data-act="mute">${SFX.muted ? 'Turn sound on' : 'Turn sound off'}</button>
      <button class="btn" data-act="reset">${resetArmed ? 'Tap again to erase your save' : 'Start a new game'}</button>${CREDITS}`;
  }
  body.innerHTML = html;
}
body.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const k = b.dataset.k, act = b.dataset.act;
  if (act === 'sell1' || act === 'sellk') {
    const n = act === 'sell1' ? 1 : S.inv[k]; if (!n) return;
    S.inv[k] -= n; addGold(n * ITEMS[k].price); toast(`Sold ${n} ${ITEMS[k].name} for ${n * ITEMS[k].price}g`); SFX.play('coin');
    if (n * ITEMS[k].price >= 60) P.pendingCheer = 'Big sale!';
  } else if (act === 'sellall') {
    const v = sellAllValue(); for (const kk of INV_ORDER) if (kk !== 'potion') S.inv[kk] = 0; addGold(v); toast(`Sold everything for ${v}g`); SFX.play('coin');
    if (v >= 60) P.pendingCheer = 'Big sale!';
  } else if (act === 'craft') {
    const r = RECIPES.find(r => r.id === k); if (!r || !canAfford(r.cost)) return;
    for (const [kk, n] of Object.entries(r.cost)) S.inv[kk] -= n;
    if (r.tool) { S.tools[r.id] = true; P.pendingCheer = `${r.name}!`; } else S.inv[r.id]++;
    toast(`Crafted ${r.name}!`); SFX.play('craft');
  } else if (act === 'tab') { craftTab = k;
  } else if (act === 'craftgear' || act === 'equip') {
    const [kind, id] = k.split(':'), list = kind === 'w' ? WEAPONS : ARMORS, g = list[id], owned = kind === 'w' ? S.gear.weapons : S.gear.armors;
    if (act === 'craftgear') {
      if (!canAfford(g.cost) || owned.includes(id)) return;
      for (const [kk, n] of Object.entries(g.cost)) S.inv[kk] -= n;
      owned.push(id); toast(`Crafted ${g.name}!`); SFX.play('craft'); P.pendingCheer = `${g.name}!`;
    } else SFX.play('collect');
    if (kind === 'w') S.gear.weapon = id;
    else { const before = maxHp(); S.gear.armor = id; S.hp = Math.min(maxHp(), S.hp + Math.max(0, maxHp() - before)); }
  } else if (act === 'fund') {
    if (S.gold < GOAL) return; S.gold -= GOAL; S.bridge = true;
    for (const [x, y] of bridgeTiles) tiles[y * W + x] = PLANK;
    buildCache(); closePanel(); showVictory();
  } else if (act === 'mute') { SFX.toggle();
  } else if (act === 'reset') {
    if (!resetArmed) { resetArmed = true; } else { resetArmed = false; try { localStorage.removeItem(SAVE_KEY); } catch (_) {} location.reload(); return; }
  }
  updateHUD(); if (panel) renderPanel(); save();
});
function addGold(n) { S.gold += n; S.earned += n; }
$('helpBtn').addEventListener('click', () => { resetArmed = false; openPanel('help'); });
$('questBtn').addEventListener('click', () => openPanel('quests'));
function showVictory() {
  const m = Math.floor(S.time / 60);
  $('victoryStats').textContent = `You earned ${S.earned}g in ${m} minute${m === 1 ? '' : 's'} and funded the crossing. Across the bridge lies the Frostmoor. Walk south when you are ready!`;
  $('victory').hidden = false;
}
$('victoryBtn').addEventListener('click', () => { $('victory').hidden = true; updateHUD(); P.fx = 0; P.fy = 1; startAct('cheer', () => { banner('Bridge open!', '#ffe08a'); burst(P.x, P.y - 50, '#ffe08a', 24); SFX.play('craft'); }); });

// ---------- input ----------
const keys = {};
const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const paused = () => !!panel || !!dlg || !$('victory').hidden;
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (panel) { if (k === 'escape') closePanel(); return; }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  keys[k] = true;
  if (e.repeat) return;
  if (k === ' ' || k === 'j' || k === 'e' || k === 'enter') pressAction();
  if (k === 'q') drinkTonic();
  if (k === 'l') openPanel('quests');
  if (k === 'shift' || k === 'k' || k === 'l') dash();
  if (k === 'm') { SFX.toggle(); toast(SFX.muted ? 'Sound off' : 'Sound on', 1200); }
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase(); keys[k] = false;
  if (k === ' ' || k === 'j' || k === 'e' || k === 'enter') releaseAction();
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const stick = $('stick'), nub = $('nub');
stick.addEventListener('pointerdown', e => { joy.id = e.pointerId; const r = stick.getBoundingClientRect(); joy.ox = r.left + r.width / 2; joy.oy = r.top + r.height / 2; stick.setPointerCapture(e.pointerId); moveJoy(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.dx = joy.dy = 0; nub.style.transform = ''; };
stick.addEventListener('pointerup', endJoy); stick.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const d = Math.hypot(dx, dy), max = 44;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  joy.dx = dx / max; joy.dy = dy / max; nub.style.transform = `translate(${dx}px, ${dy}px)`;
}
$('btnA').addEventListener('pointerdown', e => { e.preventDefault(); pressAction(); });
$('btnA').addEventListener('pointerup', releaseAction); $('btnA').addEventListener('pointercancel', releaseAction);
$('btnB').addEventListener('pointerdown', e => { e.preventDefault(); dash(); touchRun = true; });
const endRun = () => { touchRun = false; };
$('btnB').addEventListener('pointerup', endRun); $('btnB').addEventListener('pointercancel', endRun);
$('btnTonic').addEventListener('pointerdown', e => { e.preventDefault(); drinkTonic(); });

// ---------- hero animation ----------
// Each action plays real LPC frames; the effect lands on a specific frame (hitAt) so impacts match the motion.
const ACTS = {
  sword:  { sheet: 'hero_sword', size: 128, frames: [0, 1, 2, 3, 4, 5], dur: 0.36, hitAt: 0.2, move: 0.4 },
  backslash: { sheet: 'hero_backslash', size: 128, frames: [7, 8, 9, 10, 11, 12], dur: 0.36, hitAt: 0.17, move: 0.4 },
  cheer:  { sheet: 'hero_emote', size: 64, frames: [0, 2, 2, 2, 2, 2, 1], dur: 1.0, hitAt: 0.15, move: 0 },
  power:  { sheet: 'hero_sword', size: 128, frames: [0, 1, 2, 3, 4, 5, 5], dur: 0.44, hitAt: 0.22, move: 0, lunge: 220 },
  spin:   { sheet: 'hero_sword', size: 128, frames: [3, 4, 5, 4, 5, 4, 5, 5], rows: [0, 3, 2, 1, 0, 3, 2, 1], dur: 0.5, hitAt: 0.2, move: 0.25 },
  axe:    { sheet: 'hero_axe', size: 128, frames: [5, 5, 4, 3, 1, 0, 0], dur: 0.5, hitAt: 0.33, move: 0 },
  pick:   { sheet: 'hero_pick', size: 128, frames: [5, 5, 4, 3, 1, 0, 0], dur: 0.5, hitAt: 0.33, move: 0 },
  gather: { sheet: 'hero_thrust', size: 64, frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 0.45, hitAt: 0.28, move: 0 },
  drink:  { sheet: 'hero_spellcast', size: 64, frames: [0, 1, 2, 3, 4, 5, 6, 6, 6], dur: 0.8, hitAt: 0.5, move: 0 },
  faint:  { sheet: 'hero_hurt', size: 64, frames: [0, 1, 2, 3, 4, 5, 5, 5, 5], dur: 1.3, hitAt: 1.25, move: 0, oneRow: true },
};
function startAct(kind, onHit, special) {
  P.act = { kind, ...ACTS[kind], t: 0, hit: false, onHit, special }; P.idleT = 0;
  if (['sword', 'backslash', 'power'].includes(kind)) {
    if (gearW().heavy) { P.act.dur *= 1.35; P.act.hitAt *= 1.35; }
    if (gearW().beam && (gearW().beamAlways || S.hp >= maxHp())) projectiles.push({ kind: 'beam', friendly: true, x: P.x + P.fx * 20, y: P.y - 20 + P.fy * 20, vx: P.fx * 380, vy: P.fy * 380, ang: Math.atan2(P.fy, P.fx), t: -P.act.hitAt * 0.6, life: 0.7 });
  }
  if (['sword', 'backslash', 'power', 'spin'].includes(kind)) SFX.play('swing');
  if (special) { SFX.play('special'); banner(special, special === 'Whirlwind' ? '#ffe08a' : '#f4b740'); if (special === 'Dash Strike') P.act.lunge = 260; }
}
// Special moves: the 3rd hit in a quick chain becomes a finisher; attacking right after a dash is a Dash Strike.
const FINISHERS = { sword: 'Power Slash', axe: 'Mighty Chop', pick: 'Rock Smash', gather: 'Green Thumb' };
function doAct(kind, onHit) {
  let special = null;
  if (time - P.dashEnd < 0.35 && kind === 'sword') special = 'Dash Strike';
  else {
    P.combo = (time - P.lastActEnd < 0.6) ? P.combo + 1 : 1;
    if (P.combo >= 3) { special = FINISHERS[kind]; P.combo = 0; }
    else if (P.combo === 2) floatText(P.x + 22, P.y - 50, 'x2', '#ffe08a');
  }
  P.lastKind = kind;
  startAct(special && kind === 'sword' ? 'power' : (kind === 'sword' && P.combo === 2 ? 'backslash' : kind), onHit, special);
}
function pressAction() { P.held = onAction(); P.charge = 0; }
function releaseAction() {
  const charged = P.held && P.charge >= 0.6;
  P.held = false; P.charge = 0;
  if (charged && !P.act && !paused()) { startAct('spin', spinHit, 'Whirlwind'); P.combo = 0; }
}
function dash() {
  if (paused() || P.dash || P.dashCd > 0 || (P.act && P.act.kind !== 'sword')) return;
  let mx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joy.dx;
  let my = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0) + joy.dy;
  const l = Math.hypot(mx, my);
  if (l > 0.15) { mx /= l; my /= l; P.fx = mx; P.fy = my; } else { mx = P.fx; my = P.fy; }
  P.act = null; P.charge = 0; P.held = false; SFX.play('dash');
  P.dash = { t: 0, dur: 0.26, dx: mx, dy: my }; P.dashCd = 0.6; P.idleT = 0;
  burst(P.x, P.y - 2, '#d9cfb0', 8); SFX.play('leap');
}
function banner(text, color) { floats.push({ x: P.x, y: P.y - 70, text, color, life: 1.3, big: true }); }
function impact(power) { if (!REDUCED_MOTION) shake = Math.max(shake, power); hitStop = 0.06; }
const dirRow = (fx, fy) => Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 3 : 1) : (fy < 0 ? 0 : 2);
function face(o) { const dx = o.x - P.x, dy = (o.y - 4) - (P.y - 4), d = Math.hypot(dx, dy) || 1; P.fx = dx / d; P.fy = dy / d; }

// ---------- actions ----------
function nearestNPC() {
  let best = null, bd = 50;
  for (const n of NPCS) { const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } }
  return best;
}
function findTarget() {
  let enemy = null, ed = 46, res = null, rd = 44;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d = Math.hypot(e.x - P.x, e.y - P.y) - ((e.x - P.x) * P.fx + (e.y - P.y) * P.fy) * 0.25;
    if (d < ed) { ed = d; enemy = e; }
  }
  for (const r of resources) {
    if (!r.alive) continue;
    const dx = r.x - P.x, dy = r.y - P.y; if (Math.abs(dx) > 60 || Math.abs(dy) > 60) continue;
    const d = Math.hypot(dx, dy) - (dx * P.fx + dy * P.fy) * 0.3;
    if (d < rd) { rd = d; res = r; }
  }
  return { enemy, res };
}
function onAction() {
  if (P.ride) return false;
  if (dlg) { advanceDialogue(); return false; }
  if (!$('victory').hidden || panel || P.dash) return false;
  if (P.act) { if (!['faint', 'drink', 'spin'].includes(P.act.kind)) P.queued = true; return true; }
  const n = nearestNPC();
  if (n) { face(n); interact(n); return false; }
  const ch = nearestChest(); if (ch) { face(ch); openChest(ch); return false; }
  const dr = doorAhead(); if (dr) { doorMsgCd = 0; tryDoor(dr); return false; }
  const { enemy, res } = findTarget();
  const orb = projectiles.find(o => ((o.kind === 'orb' && !o.returned) || o.kind === 'axe') && Math.hypot(o.x - P.x, o.y - P.y + 14) < 90);
  if (orb) { face({ x: orb.x, y: orb.y + 14 }); doAct('sword', hitEnemies); return true; }
  if (enemy) { face(enemy); doAct('sword', hitEnemies); return true; }
  const AB = activeBoss();
  const brl = AB && AB.type === 'forge' && !(AB.cool > 0) && forgeBarrels(AB).find(r => r.cd <= 0 && Math.hypot(r.x - P.x, r.y - P.y) < 70);
  if (brl) { face({ x: brl.x, y: brl.y }); doAct('sword', hitEnemies); return true; }
  const jar = AB && AB.type === 'lich' && AB.jars && AB.state !== 'dazed' && AB.jars.find(j => j.hp > 0 && Math.hypot(j.x - P.x, j.y - P.y) < 70);
  if (jar) { face({ x: jar.x, y: jar.y }); doAct('sword', hitEnemies); return true; }
  const gong = AB && AB.type === 'elderfox' && AB.gong && AB.gong.cd <= 0 && Math.hypot(AB.gong.x - P.x, AB.gong.y - P.y) < 60 && AB.decoys && AB.decoys.some(q => !q.popped) ? AB.gong : null;
  if (gong) { face({ x: gong.x, y: gong.y }); doAct('sword', hitEnemies); return true; }
  const cg = AB && AB.type === 'clock' && AB.state !== 'dazed' && AB.gears && AB.gears.find(g => g.i === AB.glow && Math.hypot(g.x - P.x, g.y - P.y) < 70);
  if (cg) { face({ x: cg.x, y: cg.y }); doAct('sword', hitEnemies); return true; }
  const hh = AB && AB.type === 'hydra' && AB.heads && AB.heads.find(h => !h.dead && h.state === 'stuck' && Math.hypot(h.x - P.x, h.y - P.y) < 110);
  if (hh) { face({ x: hh.x, y: hh.y }); doAct('sword', hitEnemies); return true; }
  if (AB && AB.type === 'serpent' && AB.active && AB.trail && AB.trail.length) { const tl = AB.trail[AB.trail.length - 1]; if (Math.hypot(tl.x - P.x, tl.y - P.y) < 100) { face({ x: tl.x, y: tl.y }); doAct('sword', hitEnemies); return true; } }
  if (AB && AB.type === 'chameleon' && AB.state === 'stalk') { doAct('sword', hitEnemies); return true; }
  if (AB && AB.type === 'kraken' && AB.tents) { const tt = AB.state === 'dazed' && Math.hypot(AB.x - P.x, AB.y - P.y) < 120 ? AB : AB.tents.find(t => t.state === 'down' && Math.hypot(t.tx - P.x, t.ty - P.y) < 110); if (tt) { face(tt === AB ? AB : { x: tt.tx, y: tt.ty }); doAct('sword', hitEnemies); return true; } }
  if (AB && bossHittable(AB) && Math.hypot(AB.x - P.x, AB.y - P.y) < 110) { face(AB); doAct('sword', hitEnemies); return true; }
  if (res) {
    face(res);
    if (res.type === 'tree') doAct('axe', a => hitResource(res, a));
    else if (res.type === 'herb') doAct('gather', a => hitResource(res, a));
    else if (res.type === 'pot' || res.type === 'crate' || res.type === 'vine' || res.type === 'tallgrass') doAct('sword', a => hitResource(res, a));
    else doAct(S.tools.pickaxe ? 'pick' : 'sword', a => hitResource(res, a));
    return true;
  }
  doAct('sword', hitEnemies);
  return true;
}
function interact(n) {
  if (n.id === 'bench') { openPanel('craft'); return; }
  if (n.bed) {
    if (S.hp >= maxHp()) { toast('You are not tired right now.'); return; }
    fade = 1; S.hp = maxHp(); updateHUD(); save(); SFX.play('drink');
    setTimeout(() => { toast('You nap for a while and wake up refreshed.'); floatText(P.x, P.y - 60, 'Fully rested', '#7fe07a'); }, 400);
    return;
  }
  if (n.sign) { say(n.name, [n.text]); return; }
  if (n.id === 'ysolde') { shopName = 'Ysolde\'s Trading Post'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'beam_out') { const first = !S.found.star; S.found.star = true; travel(STAR_D.start.x, STAR_D.start.y, 0, 1, 'Starfall Plateau'); if (first) setTimeout(() => toast('A plateau beneath a sky full of stars. The Observatory is just south of the moonbeam.', 4500), 1200); return; }
  if (n.boat && n.id === 'beam_home') { const M = NPCS.find(m => m.id === 'beam_out'); travel(M.x, M.y + 50, 0, 1, 'The Cloudspire Isles'); return; }
  if (n.id === 'lio') { shopName = 'Lio\'s Star Charts'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'cogpad_out') { const first = !S.found.cog; S.found.cog = true; travel(COG_D.start.x, COG_D.start.y, 0, 1, 'The Cogwork Ruins'); if (first) setTimeout(() => toast('An ancient city of brass and gears! Tinker Ada works just south of the teleporter.', 4500), 1200); return; }
  if (n.boat && n.id === 'cogpad_home') { const A = NPCS.find(m => m.id === 'cogpad_out'); travel(A.x, A.y + 50, 0, 1, 'Brindle Isle'); return; }
  if (n.id === 'ada') { shopName = 'Ada\'s Workshop'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'bell_out') { const first = !S.found.reef; S.found.reef = true; P.air = MAX_AIR(); travel(REEF_D.start.x, REEF_D.start.y, 0, 1, 'The Sunken Reef'); if (first) setTimeout(() => toast('Down on the seabed! Watch your air bubbles. Breathe inside the Bubble Dome or at the bubble vents.', 5000), 1200); return; }
  if (n.boat && n.id === 'bell_home') { const B = NPCS.find(m => m.id === 'bell_out'); travel(B.x, B.y - 50, 0, -1, 'Brindle Isle'); return; }
  if (n.id === 'marlo') { shopName = 'Marlo\'s Dive Shop'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'pass_out') { const first = !S.found.vale; S.found.vale = true; travel(VALE_D.start.x, VALE_D.start.y, 0, 1, 'Petalfall Vale'); if (first) setTimeout(() => toast('A warm, hidden valley full of falling blossoms. Petalfall village is just south of the pass.', 4500), 1200); return; }
  if (n.boat && n.id === 'pass_home') { const MP = NPCS.find(m => m.id === 'pass_out'); travel(MP.x, MP.y + 50, 0, 1, 'The Frostmoor'); return; }
  if (n.id === 'wren') { shopName = 'Wren\'s Tea House'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'turtle_out') { const first = !S.found.jungle; S.found.jungle = true; travel(JUNGLE_D.start.x, JUNGLE_D.start.y, 0, 1, 'The Verdant Wilds'); if (first) setTimeout(() => toast('Steamy jungle as far as the eye can see. Canopy Camp is just south of the landing.', 4500), 1200); return; }
  if (n.boat && n.id === 'turtle_home') { const TT = NPCS.find(m => m.id === 'turtle_out'); travel(TT.x, TT.y - 50, 0, -1, 'The Sunward Isles'); return; }
  if (n.id === 'tavi') { shopName = 'Tavi\'s Ranger Post'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id.startsWith('cart_')) { const [, ri, end] = n.id.split('_'); startRide(RAILS[+ri], end === 'a'); return; }
  if (n.boat && n.id === 'lift_out') { const first = !S.found.cave; S.found.cave = true; travel(CAVE_D.start.x, CAVE_D.start.y, 0, 1, 'Glimmerdeep'); if (first) setTimeout(() => toast('Far below the island, crystals glow in the dark. Glimmer Camp is just south of the lift.', 4500), 1200); return; }
  if (n.boat && n.id === 'lift_home') { const L = NPCS.find(m => m.id === 'lift_out'); travel(L.x, L.y + 50, 0, 1, 'Brindle Isle'); return; }
  if (n.id === 'quill') { shopName = 'Quill\'s Prospecting Supplies'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'gate_out') { const first = !S.found.dusk; S.found.dusk = true; travel(DUSK_D.start.x, DUSK_D.start.y, 0, 1, 'Duskhollow'); if (first) setTimeout(() => toast('Eternal night. Lanternrest glows just south of the gate. Light the spirit lanterns to push back the dark.', 4500), 1200); return; }
  if (n.boat && n.id === 'gate_home') { const G = NPCS.find(m => m.id === 'gate_out'); travel(G.x, G.y + 50, 0, 1, 'Brindle Isle'); return; }
  if (n.id === 'morrow') { shopName = 'Morrow\'s Lantern Shop'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'thermal_out') { const first = !S.found.sky; S.found.sky = true; travel(SKY_D.start.x, SKY_D.start.y, 0, 1, 'The Cloudspire Isles'); if (first) setTimeout(() => toast('Islands float on a sea of clouds. Zephyr Roost lies just south of here.', 4000), 1200); return; }
  if (n.boat && n.id === 'thermal_home') { const TO = NPCS.find(m => m.id === 'thermal_out'); travel(TO.x, TO.y + 50, 0, 1, 'Cinder Peak'); return; }
  if (n.id === 'aeris') { shopName = 'Aeris\'s Wind Post'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'balloon_out') { const first = !S.found.cinder; S.found.cinder = true; travel(CINDER_D.start.x, CINDER_D.start.y, 0, 1, 'Cinder Peak'); if (first) setTimeout(() => toast('Heat rolls off the black rock. Ashfall Outpost lies just south of the landing.', 4000), 1200); return; }
  if (n.boat && n.id === 'balloon_home') { const B = NPCS.find(m => m.id === 'balloon_out'); travel(B.x, B.y + 50, 0, 1, 'Brindle Isle'); return; }
  if (n.id === 'brakka') { shopName = 'Brakka\'s Forge'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat && n.id === 'raft_out') { const first = !S.found.mire; S.found.mire = true; travel(MIRE_D.start.x, MIRE_D.start.y, 0, 1, 'The Mirewood'); if (first) setTimeout(() => toast('Mist clings to the water. Bogwater Camp lies just south of the landing.', 4000), 1200); return; }
  if (n.boat && n.id === 'raft_home') { const R = NPCS.find(m => m.id === 'raft_out'); travel(R.x + 50, R.y, 1, 0, 'Brindle Isle'); return; }
  if (n.id === 'moss') { shopName = 'Mother Moss\'s Remedies'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.boat) {
    if (n.id === 'ferry_out') { const first = !S.found.sun; S.found.sun = true; travel(SUN_D.start.x, SUN_D.start.y, 0, 1, 'The Sunward Isles'); questTick(); if (first) setTimeout(() => toast('Warm sand and palm trees. Mirra Oasis lies just south of the dock.', 4000), 1200); }
    else travel(HAMLET.x - 20, HAMLET.y + 40, 0, 1, 'Saltmarsh Hamlet');
    return;
  }
  if (n.id === 'zahir') { shopName = 'Zahir\'s Bazaar'; if (!questInteract(n, () => openPanel('shop'))) openPanel('shop'); return; }
  if (n.id === 'amara' || n.id === 'rosa') { if (!questInteract(n)) { const lines = IDLE_TALK[n.id]; say(n.name, [lines[Math.floor(time) % lines.length]]); } return; }
  if (n.id === 'nell' || n.id === 'bjorn') { if (!questInteract(n)) { const lines = IDLE_TALK[n.id]; say(n.name, [lines[Math.floor(time) % lines.length]]); } return; }
  if (n.id === 'oma') shopName = 'Oma Fen\'s Shop';
  if (n.id === 'pell' || n.id === 'marla' || n.id === 'hob') {
    if (!questInteract(n)) { const lines = IDLE_TALK[n.id]; say(n.name, [lines[Math.floor(time) % lines.length]]); }
    return;
  }
  if ((n.id === 'oma' && S.met.oma) || (n.id === 'tobin' && S.met.tobin)) { if (questInteract(n, () => openPanel(n.id === 'oma' ? 'shop' : 'bridge'))) return; }
  if (n.id === 'oma') {
    if (!S.met.oma) { S.met.oma = true; say('Oma Fen', [
      'A new face! Washed up with the last storm, did you? Welcome to Brindle Isle.',
      'Bring me anything you find. Wood, stone, herbs, slime goo. I pay fair, and I pay more for crafted goods.',
      'Want real money? The purple grove up north is full of crystals. You will need a pickaxe from the workbench across the square.',
      'And past the grove, at the very north tip, the Slime King sleeps on a pile of gold. Only fools and heroes wake him.',
      'East of the village is the Old Mine. Rubble sealed it after something awful moved in. Bring a pickaxe, and courage.',
    ], () => openPanel('shop')); return; }
    openPanel('shop'); return;
  }
  if (n.id === 'tobin') {
    if (!S.met.tobin && !S.bridge) { S.met.tobin = true; say('Tobin', [
      'Storm took the bridge clean off. Only road to the mainland, too.',
      'I have the timber. What I lack is coin for the crew. Four hundred gold should do it.',
      'Earn it however you like. Come back when your purse is heavy.',
    ], () => openPanel('bridge')); return; }
    openPanel('bridge');
  }
}
function drinkTonic() {
  if (paused() || P.act) return;
  if (!S.inv.potion) { toast('No tonics left. Craft one from 2 herbs and 1 slime goo.'); return; }
  if (S.hp >= maxHp()) { toast('Your hearts are already full.'); return; }
  S.inv.potion--; updateHUD(); SFX.play('drink');
  startAct('drink', () => { S.hp = Math.min(maxHp(), S.hp + 3); burst(P.x, P.y - 30, '#e45a8f', 12); updateHUD(); floatText(P.x, P.y - 52, '+3 ♥', '#ec5257'); });
}
let skelHint = false, shadeHint = false, chainLock = false;
function damageEnemy(e, dmg, kx, ky) {
  const D = ENEMY[e.kind];
  if (D.ghostly && e.faded) { floatText(e.x, e.y - 44, 'Miss', '#c8d0e0'); burst(e.x, e.y - 20, '#c8d0e0', 4); return false; }
  if (e.kind === 'soldier' && e.state === 'wound') dmg *= 2;
  if (e.kind === 'hopper' && e.state === 'jump') { floatText(e.x, e.y - 60 - (e.lift || 0), 'Too high!', '#e6e6f2'); return false; }
  if (e.kind === 'puffer' && e.puff > 0) { floatText(e.x, e.y - 40, 'Spikes! Wait for it to deflate', '#e8c060'); damagePlayer(1, e); return false; }
  if (e.kind === 'eel' && e.state !== 'lunge' && e.state !== 'out') { floatText(e.x, e.y - 30, 'It hid in its hole!', '#bfe8ff'); return false; }
  if (e.kind === 'koi' && e.mode === 'swim') { floatText(e.x, e.y - 20, 'It\'s underwater!', '#bfe8ff'); return false; }
  if (e.kind === 'tanuki' && e.mode === 'disguise') { e.mode = 'chase'; e.cd = 0.6; burst(e.x, e.y - 14, '#e6e2d6', 16); floatText(e.x, e.y - 60, 'It\'s a tanuki!', '#ffe08a'); }
  if (gearW().chain && !chainLock && rng() < 0.5) { const o = enemies.filter(q => q !== e && q.alive && Math.hypot(q.x - e.x, q.y - e.y) < 100).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0]; if (o) { chainLock = true; for (let i = 0; i < 6; i++) particles.push({ x: e.x + (o.x - e.x) * i / 6, y: e.y - 14 + (o.y - e.y) * i / 6, vx: 0, vy: 0, life: 0.25, color: '#fff6a8', size: 3 }); damageEnemy(o, 1, 0, 0); chainLock = false; } }
  if (gearW().bloom && rng() < 0.15 && S.hp > 0 && S.hp < maxHp()) { S.hp++; updateHUD(); floatText(P.x, P.y - 60, '+♥', '#f2a0c8'); }
  if (e.kind === 'burrower' && e.state === 'under') { floatText(e.x, e.y - 20, 'It\'s underground!', '#c8b89a'); return false; }
  if (e.kind === 'shardback' && !(e.shardT > time)) { e.shardT = time + 0.9; shardBurst(e); }
  if (e.kind === 'skeleton') {
    if (e.state === 'buried') return false;
    if (e.state === 'pile') { e.hp = 0; burst(e.x, e.y - 6, '#e6dcc8', 14); floatText(e.x, e.y - 40, 'Smashed for good!', '#ffe08a'); killEnemy(e); return true; }
    if (e.hp - dmg <= 0) { e.hp = 0; e.hurt = 0.2; e.state = 'pile'; e.st = 3; burst(e.x, e.y - 14, D.col, 10); SFX.play('crumble'); floatText(e.x, e.y - 46, String(dmg), '#ffffff'); if (!skelHint) { skelHint = true; toast('It collapsed into a pile of bones. Strike the bones before it pulls itself together!', 4000); } return true; }
  }
  if (e.kind === 'shade' && !inLanternLight(e.x, e.y) && !gearW().glow) { floatText(e.x, e.y - 50, 'Your blade passes through!', '#b8a8ff'); if (!shadeHint) { shadeHint = true; toast('Shades are only solid in lantern light. Lure them near a lit spirit lantern!', 4500); } return false; }
  if (e.kind === 'sentinel') { let da = Math.atan2(P.y - e.y, P.x - e.x) - (e.dir || 0); while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; if (Math.abs(da) < 1.05) { floatText(e.x, e.y - 50, 'Blocked! Hit it from behind', '#c8d0ff'); SFX.play('mine'); burst(e.x, e.y - 30, '#7fe0f0', 6); return false; } }
  if (e.kind === 'boulderback' && (e.state === 'roll' || e.state === 'windup')) { floatText(e.x, e.y - 40, 'Clang', '#c8d0ff'); SFX.play('mine'); return false; }
  if (e.kind === 'boulderback' && e.state === 'flipped') { dmg *= 2; e.hp -= dmg; e.hurt = 0.2; burst(e.x, e.y - 14, D.col, 8); floatText(e.x, e.y - 46, dmg + '!', '#ffe08a'); if (e.hp <= 0) killEnemy(e); return true; }
  if (e.kind === 'snail' && e.shell > 0) { floatText(e.x, e.y - 40, 'Clink', '#e0c08a'); SFX.play('mine'); return false; }
  e.hp -= dmg; e.hurt = 0.2; e.kx = kx * (D.heavy ? 0.4 : 1); e.ky = ky * (D.heavy ? 0.4 : 1); if (D.rooted) e.kx = e.ky = 0;
  if (gearW().poison) { e.poison = 3; e.poisonT = 1; }
  if (gearW().freeze) e.frozen = 2.5;
  if (e.kind === 'snail' && e.hp > 0 && rng() < 0.45) e.shell = 1.6;
  if (e.state !== 'move') { e.state = 'move'; e.cd = Math.max(e.cd, 0.8); } // a hit interrupts wind-ups
  burst(e.x, e.y - 14, D.col, 8); floatText(e.x + (rng() - 0.5) * 12, e.y - 46, String(dmg), '#ffffff');
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function deflect(hx, hy, rad) {
  let n = 0;
  for (const p of projectiles) if (p.kind === 'axe' && !p.dead && Math.hypot(p.x - hx, p.y - hy) < rad + 12) {
    p.dead = true; const o = p.owner; burst(p.x, p.y, '#cfd8e0', 14); SFX.play('special'); impact(6);
    floatText(p.x, p.y - 20, 'Disarmed!', '#ffe08a'); o.state = 'dazed'; o.st = 2.6;
  }
  for (const p of projectiles) if (p.kind === 'orb' && !p.returned && !p.dead && Math.hypot(p.x - hx, p.y - hy) < rad + 8) {
    p.returned = true; p.sp = 270; floatText(p.x, p.y - 20, 'Return!', '#ffe08a'); SFX.play('special'); impact(4); burst(p.x, p.y, '#ffe08a', 10);
  }
  for (const p of projectiles) if (!p.dead && !p.friendly && p.kind !== 'orb' && p.kind !== 'axe' && p.kind !== 'spike' && p.kind !== 'bolt' && p.kind !== 'shard' && p.kind !== 'bomb' && p.kind !== 'sunball' && (p.kind !== 'rock' || p.z < 50) && Math.hypot(p.x - hx, p.y - (p.z || 0) - hy) < rad) { p.dead = true; n++; burst(p.x, p.y - (p.z || 0), '#ffffff', 8); }
  if (n) { floatText(hx, hy - 20, 'Deflect!', '#ffffff'); SFX.play('hit'); }
}
function hitEnemies(a) {
  const sp = a && a.special, reach = sp ? 30 : 24, rad = (sp ? 46 : 34) + (gearW().heavy ? 14 : 0);
  const Wp = gearW(), wr = (Wp.reach || 0) + (Wp.heavy ? 6 : 0), wrad = Wp.heavy ? 14 : 0;
  const hx = P.x + P.fx * (reach + wr), hy = P.y - 10 + P.fy * (reach + wr), dmg = weaponDmg() * (sp ? 2 : 1);
  let hit = false;
  for (const e of enemies) {
    if (!e.alive || Math.hypot(e.x - hx, e.y - 10 - hy) > rad + (ENEMY[e.kind].flyer ? 10 : 0)) continue;
    if (damageEnemy(e, dmg, P.fx * (sp ? 520 : 260), P.fy * (sp ? 520 : 260))) hit = true;
  }
  const AB = activeBoss();
  if (AB && AB.decoys) for (const dc of AB.decoys) if (!dc.popped && Math.hypot(dc.x - hx, dc.y - 26 - AB.z - hy) < rad + 26) { dc.popped = true; burst(dc.x, dc.y - 40, '#dff6ff', 16); floatText(dc.x, dc.y - 80, 'Just a reflection!', '#c8e8ff'); SFX.play('mine'); hit = true; }
  hitCauldrons(AB || {}, hx, hy, rad); hitBarrels(AB || {}, hx, hy, rad); hitJars(AB || {}, hx, hy, rad); hitGong(AB || {}, hx, hy, rad); hitClockGears(AB || {}, hx, hy, rad); hitLanterns(hx, hy, rad);
  for (const e of enemies) if (e.alive && e.decoys && e.decoys.length) for (let i = e.decoys.length - 1; i >= 0; i--) { const q = e.decoys[i]; if (Math.hypot(q.x - hx, q.y - 10 - hy) < rad + 6) { e.decoys.splice(i, 1); burst(q.x, q.y - 16, '#ffb347', 12); floatText(q.x, q.y - 40, 'Just an illusion!', '#ffd6a0'); hit = true; } }
  if (AB && AB.type === 'hydra' && hitHydra(AB, hx, hy, rad, dmg)) hit = true;
  if (AB && AB.type === 'serpent' && hitSerpent(AB, hx, hy, rad, dmg)) hit = true;
  if (AB && AB.type === 'kraken' && hitKraken(AB, hx, hy, rad, dmg)) hit = true;
  if (AB && bossHittable(AB) && Math.hypot(AB.x - hx, AB.y - (AB.type === 'treant' || AB.type === 'forge' || AB.type === 'aegis' || AB.type === 'clock' || AB.type === 'knight2' ? 50 : 26) - AB.z - hy) < rad + (AB.type === 'treant' || AB.type === 'forge' || AB.type === 'aegis' || AB.type === 'clock' ? 40 : 30)) { if (AB.decoys && AB.decoys.some(dc => !dc.popped)) { AB.decoys = []; wizardDazeQuiet(AB, 'Found her! Strike now!'); } damageBoss(AB, dmg); hit = true; }
  deflect(hx, hy, rad + 6);
  hitSwitches(hx, hy, rad);
  if (sp) { impact(7); burst(hx, hy, '#ffe08a', 14); } else if (hit) impact(2);
  if (hit) SFX.play('hit');
}
function spinHit(a) {
  const dmg = weaponDmg() * 2;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    if (d > 72) continue;
    damageEnemy(e, dmg, dx / d * 460, dy / d * 460);
  }
  const AB = activeBoss();
  if (AB && bossHittable(AB) && Math.hypot(AB.x - P.x, AB.y - P.y) < 100) damageBoss(AB, dmg);
  deflect(P.x, P.y - 14, 80);
  hitSwitches(P.x, P.y - 14, 70);
  for (const r of resources) if (r.alive && Math.hypot(r.x - P.x, r.y - P.y) < 62) hitResource(r, a);
  for (let i = 0; i < 24; i++) { const ang = i / 24 * Math.PI * 2; particles.push({ x: P.x + Math.cos(ang) * 40, y: P.y - 14 + Math.sin(ang) * 26, vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 80 - 30, life: 0.5, color: '#ffe08a' }); }
  impact(8);
}
function hitResource(r, a) {
  if (!r.alive || Math.hypot(r.x - P.x, r.y - P.y) > 72) return;
  const sp = a && a.special;
  r.shake = 0.2;
  if (r.type === 'crystal' && !S.tools.pickaxe) { toast('Too hard for a sword. Craft a Stone Pickaxe at the village workbench.'); burst(r.x, r.y - 14, '#cfc6ff', 4); return; }
  const power = (r.type === 'rock' || r.type === 'crystal' || r.type === 'obsidian') ? (S.tools.pickaxe ? 2 : 1) : (weaponDmg() >= 2 && r.type === 'tree' ? 2 : 1);
  r.hp -= power * (sp && sp !== 'Whirlwind' ? 2 : 1);
  if (sp && sp !== 'Whirlwind') { impact(6); burst(r.x, r.y - 18, '#ffe08a', 12); }
  const col = { tree: '#7a4b27', rock: '#9a978f', herb: '#5bbf55', crystal: '#a593ff', pot: '#b5652f', crate: '#a8713f', vine: '#4f8a3a', obsidian: '#3a2e4a', tallgrass: '#5aa65c' }[r.type];
  if (r.hp > 0) SFX.play(r.type === 'tree' ? 'chop' : r.type === 'herb' || r.type === 'crate' ? 'pick' : 'mine');
  if (r.type === 'tree') for (let i = 0; i < 4; i++) particles.push({ x: r.x + (rng() - 0.5) * 30, y: r.y - 40 - rng() * 20, vx: (rng() - 0.5) * 40, vy: -20, life: 0.9, color: i % 2 ? '#5aa65c' : '#3d8448', leaf: true });
  burst(r.x, r.y - 16, col, 6);
  if (r.hp > 0) return;
  r.alive = false; r.respawn = 35 + rng() * 20; r.fall = 0; r.fallDir = P.x <= r.x ? 1 : -1;
  SFX.play(r.type === 'tree' ? 'fall' : r.type === 'herb' ? 'pick' : 'crumble');
  if (r.type === 'pot' || r.type === 'crate') r.fall = 9;
  if (r.type === 'tallgrass') { r.respawn = 40; r.fall = 9; const roll = rng(); if (roll < 0.2) drop(r.x, r.y - 6, 'herb', 1); else if (roll < 0.34) drop(r.x, r.y - 6, 'gold', 1 + Math.floor(rng() * 2)); else if (roll < 0.4) drop(r.x, r.y - 6, 'goo', 1); for (let i = 0; i < 6; i++) particles.push({ x: r.x + (rng() - 0.5) * 20, y: r.y - 10, vx: (rng() - 0.5) * 80, vy: -60 - rng() * 40, life: 0.5, color: i % 2 ? '#5aa65c' : '#3d8448', leaf: true }); }
  if (r.type === 'vine') { r.respawn = 1e9; r.fall = 9; floatText(r.x, r.y - 50, 'Cut through!', '#c8e8b0'); }
  if (r.type === 'rock' || r.type === 'crystal') for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2, v = 60 + rng() * 120; particles.push({ x: r.x, y: r.y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: 0.7, color: r.type === 'rock' ? (i % 2 ? '#9c9690' : '#6c6764') : (i % 2 ? '#a593ff' : '#e6e0ff'), size: 5 }); }
  // Lucky hit: a random bonus drop with a gold sparkle
  const lucky = rng() < 0.15 ? 1 : 0;
  if (lucky) { SFX.play('lucky'); floatText(r.x, r.y - 44, 'Lucky!', '#ffe08a'); burst(r.x, r.y - 20, '#ffe08a', 16); }
  if (r.type === 'tree') drop(r.x, r.y - 10, 'wood', 2 + lucky);
  if (r.type === 'rock') drop(r.x, r.y - 6, 'stone', (S.tools.pickaxe ? 2 : 1) + lucky);
  if (r.type === 'herb') drop(r.x, r.y - 4, 'herb', (sp === 'Green Thumb' ? 3 : 1) + lucky);
  if (r.type === 'crystal') drop(r.x, r.y - 8, 'crystal', 1 + lucky);
  if (r.type === 'obsidian') drop(r.x, r.y - 8, 'obsidian', (S.tools.pickaxe ? 2 : 1) + lucky);
  if (r.type === 'pot' || r.type === 'crate') {
    r.respawn = 120; const roll = rng();
    if (r.type === 'crate' && roll < 0.5) drop(r.x, r.y - 8, roll < 0.25 ? 'planks' : 'wood', 1 + lucky);
    else if (roll < 0.45) drop(r.x, r.y - 8, 'gold', 1 + Math.floor(rng() * 3) + lucky);
    else if (roll < 0.62) drop(r.x, r.y - 8, 'herb', 1);
    else if (roll < 0.76) drop(r.x, r.y - 8, 'goo', 1);
    else if (roll < 0.84) drop(r.x, r.y - 8, 'potion', 1);
    for (let i = 0; i < 8; i++) { const a = rng() * Math.PI * 2; particles.push({ x: r.x, y: r.y - 10, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60 - 80, life: 0.6, color: r.type === 'pot' ? '#b5652f' : '#8a5a32', size: 4 }); }
  }
  burst(r.x, r.y - 16, col, 12);
}
function killEnemy(e) {
  const D = ENEMY[e.kind];
  e.alive = false; e.respawn = 25; e.dieT = 0.4; e.state = 'move'; e.faded = false; e.mode = undefined; e.decoys = []; SFX.play('slime');
  burst(e.x, e.y - 10, D.col, 16);
  for (const [item, n] of D.drops) drop(e.x, e.y - 6, item, n);
  if (e.kind === 'mgolem') { projectiles.push({ kind: 'bomb', x: e.x, y: e.y, vx: 0, vy: 0, t: 0.6, life: 1.6 }); floatText(e.x, e.y - 50, 'It\'s going to blow!', '#ffb347'); }
  if (e.kind === 'bogslime') for (let i = 0; i < 2; i++) { const m = makeEnemy('bogling', e.x + (i ? 16 : -16), e.y + 4); m.minion = true; m.noRespawn = true; m.spawnT = 0.3; enemies.push(m); }
  if (e.loot) { drop(e.x, e.y - 6, 'gold', Math.min(12, e.loot), Math.ceil(e.loot / Math.min(12, e.loot))); floatText(e.x, e.y - 50, 'Your gold!', '#f4b740'); e.loot = 0; }
  S.kills[e.kind] = (S.kills[e.kind] || 0) + 1; questTick();
  if (gearW().lifesteal && S.hp < maxHp() && S.hp > 0) { S.hp++; floatText(P.x, P.y - 60, '+♥', '#ec5257'); updateHUD(); }
}
function tickPoison(o, dt, onHurt) {
  if (!(o.poison > 0)) return;
  o.poison -= dt; o.poisonT -= dt;
  if (Math.random() < dt * 10) particles.push({ x: o.x + (Math.random() - 0.5) * 24, y: o.y - 20 - (o.z || 0), vx: 0, vy: -25, life: 0.4, color: '#7fd17a', size: 3 });
  if (o.poisonT <= 0) { o.poisonT = 1; onHurt(); }
}
function drop(x, y, item, n, v = 1) { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, s = 60 + rng() * 60 + (n > 6 ? rng() * 80 : 0); pickups.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, item, t: 0, v }); } }
function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, s = 40 + rng() * 90; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + rng() * 0.3, color }); } }
function floatText(x, y, text, color) { floats.push({ x, y, text, color, life: 1.1 }); }
function damagePlayer(n, from) {
  if (P.inv > 0 || P.dash || (P.act && P.act.kind === 'faint')) return;
  S.hp -= n; P.inv = 1.0; P.idleT = 0; SFX.play('hurt');
  const hearts = $('hearts'); hearts.classList.remove('hit'); void hearts.offsetWidth; hearts.classList.add('hit');
  const a = Math.atan2(P.y - from.y, P.x - from.x), kb = gearA().sturdy ? 110 : 320; P.kx = Math.cos(a) * kb; P.ky = Math.sin(a) * kb;
  burst(P.x, P.y - 24, '#ec5257', 8);
  if (S.hp <= 0) {
    S.hp = 0; P.kx = P.ky = 0; P.inv = 3;
    startAct('faint', () => {
      const lost = Math.floor(S.gold * 0.1); S.gold -= lost;
      S.hp = maxHp(); P.x = cx * T; P.y = (cy + 2) * T; P.fx = 0; P.fy = 1;
      toast(lost ? `You passed out and woke in the village. You dropped ${lost}g.` : 'You passed out and woke in the village.', 3500);
      updateHUD();
    });
  }
  updateHUD();
}

// ---------- physics ----------
function moveBody(b, dx, dy, r) {
  if (dx) { const nx = b.x + dx, ex = nx + Math.sign(dx) * r; if (walkable(ex, b.y - r * 0.5) && walkable(ex, b.y + r * 0.5)) b.x = nx; }
  if (dy) { const ny = b.y + dy, ey = ny + Math.sign(dy) * r; if (walkable(b.x - r * 0.6, ey) && walkable(b.x + r * 0.6, ey)) b.y = ny; }
}
function pushCircle(b, ox, oy, m) {
  const dx = b.x - ox, dy = b.y - oy; if (Math.abs(dx) > m || Math.abs(dy) > m) return;
  const d = Math.hypot(dx, dy); if (d < m && d > 0.01) { b.x += dx / d * (m - d); b.y += dy / d * (m - d); }
}
function pushOut(b, r) {
  const px = b.x, py = b.y;
  for (const o of resources) if (o.alive && SOLID[o.type]) pushCircle(b, o.x, o.y, r + SOLID[o.type]);
  for (const n of NPCS) pushCircle(b, n.x, n.y, r + (n.bench ? 18 : 10));
  for (const d of decor) if (d.solid) pushCircle(b, d.x, d.y, r + d.solid);
  for (const B of BOSSES) if (B.rocks && B.active) for (const k of B.rocks) pushCircle(b, k.x, k.y, r + 15);
  for (const B of BOSSES) if (B.pillars && B.active) for (const k of B.pillars) if (k.hp > 0) pushCircle(b, k.x, k.y, r + 14);
  for (const D of DUNGEONS) { for (const c of D.chests) pushCircle(b, c.x, c.y, r + 11); for (const sw of D.switches) pushCircle(b, sw.x, sw.y, r + 10); }
  for (const q of RECTS) {
    if (b.x > q.x0 - r && b.x < q.x1 + r && b.y > q.y0 - r && b.y < q.y1 + r) {
      const o = [b.x - (q.x0 - r), (q.x1 + r) - b.x, b.y - (q.y0 - r), (q.y1 + r) - b.y], m = Math.min(...o);
      if (m === o[0]) b.x = q.x0 - r; else if (m === o[1]) b.x = q.x1 + r; else if (m === o[2]) b.y = q.y0 - r; else b.y = q.y1 + r;
    }
  }
  if (!walkable(b.x, b.y)) { b.x = px; b.y = py; }
}

// ---------- update ----------
let time = 0, saveT = 0, edgeToast = false;
function update(dt) {
  time += dt;
  if (fade > 0) fade = Math.max(0, fade - dt * 1.6);
  for (const a of animals) updateAnimal(a, dt);
  for (const n of NPCS) updateNPC(n, dt);
  if (paused()) return;
  shake *= Math.pow(0.0005, dt); if (shake < 0.3) shake = 0;
  for (let i = P.trail.length - 1; i >= 0; i--) { P.trail[i].life -= dt; if (P.trail[i].life <= 0) P.trail.splice(i, 1); }
  if (hitStop > 0) { hitStop -= dt; return; }
  S.time += dt;
  // hero action
  let moveMul = P.ride ? 0 : 1;
  if (P.ride) updateRide(dt);
  P.dashCd = Math.max(0, P.dashCd - dt);
  if (P.dash) {
    const D = P.dash; D.t += dt; moveMul = 0;
    moveBody(P, D.dx * 360 * dt, D.dy * 360 * dt, 9); pushOut(P, 9);
    P.trail.push({ x: P.x, y: P.y - Math.sin(Math.PI * Math.min(1, D.t / D.dur)) * 14, row: dirRow(P.fx, P.fy), frame: Math.min(4, Math.floor(D.t / D.dur * 5)), life: 0.22 });
    if (D.t >= D.dur) { P.dash = null; P.dashEnd = time; burst(P.x, P.y, '#d9cfb0', 6); }
  }
  if (P.act) {
    const A = P.act; A.t += dt; moveMul = A.move;
    if (A.lunge && A.t < 0.16) moveBody(P, P.fx * A.lunge * dt, P.fy * A.lunge * dt, 9);
    if (!A.hit && A.t >= A.hitAt) { A.hit = true; A.onHit && A.onHit(A); }
    if (A.t >= A.dur) {
      P.act = null; P.lastActEnd = time;
      if (P.queued) { P.queued = false; onAction(); }
    }
  } else if (P.held) {
    P.charge += dt; if (P.charge > 0.15) moveMul = 0.5;
    if (P.charge >= 0.6 && Math.random() < dt * 14) particles.push({ x: P.x + (Math.random() - 0.5) * 36, y: P.y - Math.random() * 40, vx: 0, vy: -50, life: 0.5, color: '#ffe08a' });
  }
  let mx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joy.dx;
  let my = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0) + joy.dy;
  if (P.hex > 0) { mx = -mx; my = -my; }
  const ml = Math.hypot(mx, my);
  P.moving = false;
  P.running = (keys['shift'] || touchRun) && !P.act && !P.held;
  if (ml > 0.15 && moveMul > 0) {
    const n = Math.min(1, ml); mx /= ml; my /= ml;
    if (!P.act) { P.fx = mx; P.fy = my; }
    const ox = P.x, oy = P.y, sp = 130 * n * moveMul * (P.running ? 1.65 : 1) * (P.slow > 0 && !gearA().warm ? 0.45 : 1) * (gearA().speed || 1) * (inReef() ? 0.85 : 1) * (tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === BOG && !gearA().warm ? 0.55 : 1);
    P.idleT = 0;
    if (P.running && Math.random() < dt * 10) particles.push({ x: P.x - mx * 8, y: P.y, vx: -mx * 30, vy: -30, life: 0.35, color: '#d9cfb0' });
    moveBody(P, mx * sp * dt, my * sp * dt, 9);
    const moved = Math.hypot(P.x - ox, P.y - oy);
    if (moved > 0.01) { P.moving = true; P.walkDist += moved; }
  }
  if (P.kx || P.ky) { moveBody(P, P.kx * dt, P.ky * dt, 9); P.kx *= Math.pow(0.002, dt); P.ky *= Math.pow(0.002, dt); if (Math.hypot(P.kx, P.ky) < 5) P.kx = P.ky = 0; }
  pushOut(P, 9);
  if (!P.moving && !P.act && !P.dash && !P.held) P.idleT += dt; else P.idleT = 0;
  if (P.idleT > 7 && P.idleT - dt <= 7) floatText(P.x + 16, P.y - 60, 'z', '#eef3e6');
  P.inv = Math.max(0, P.inv - dt); P.slow = Math.max(0, (P.slow || 0) - dt); P.hex = Math.max(0, (P.hex || 0) - dt);
  if (!P.dash && dungeonAt(P.x) === TOMB_D) for (const tr of TRAPS) if (trapState(tr) === 2 && P.x > tr.x + 2 && P.x < tr.x + 30 && P.y > tr.y + 4 && P.y < tr.y + 34) { damagePlayer(1, { x: tr.x + 16, y: tr.y + 40 }); break; }
  if (gearA().regen && S.hp > 0 && S.hp < maxHp()) { P.regenT = (P.regenT || 0) + dt; if (P.regenT > 8) { P.regenT = 0; S.hp++; updateHUD(); floatText(P.x, P.y - 56, '+♥', '#7fe0f0'); } }
  if ((Math.hypot(P.x - cx * T, P.y - cy * T) < 6 * T || Math.hypot(P.x - MIRE_D.camp.x - 100, P.y - MIRE_D.camp.y - 40) < 3 * T || Math.hypot(P.x - CINDER_D.camp.x, P.y - CINDER_D.camp.y - 40) < 3 * T || Math.hypot(P.x - SKY_D.roost.x - 10, P.y - SKY_D.roost.y - 70) < 3 * T || Math.hypot(P.x - DUSK_D.camp.x - 10, P.y - DUSK_D.camp.y - 60) < 3 * T || Math.hypot(P.x - CAVE_D.camp.x - 10, P.y - CAVE_D.camp.y - 60) < 3 * T || Math.hypot(P.x - JUNGLE_D.camp.x - 10, P.y - JUNGLE_D.camp.y - 60) < 3 * T || Math.hypot(P.x - VALE_D.camp.x - 10, P.y - VALE_D.camp.y - 60) < 3 * T || Math.hypot(P.x - REEF_D.camp.x, P.y - REEF_D.camp.y - 30) < 3 * T || Math.hypot(P.x - COG_D.camp.x, P.y - COG_D.camp.y - 30) < 3 * T || Math.hypot(P.x - STAR_D.camp.x - 10, P.y - STAR_D.camp.y - 60) < 3 * T || Math.hypot(P.x - FROST_D.fire.x, P.y - FROST_D.fire.y) < 3 * T) && S.hp < maxHp() && S.hp > 0) { P.healT += dt; if (P.healT > 3) { P.healT = 0; S.hp++; updateHUD(); floatText(P.x, P.y - 56, '+♥', '#ec5257'); } } else P.healT = 0;
  if (S.bridge && !edgeToast && P.y > (H - 6) * T && !inDungeon(P.x)) { edgeToast = true; toast('The mainland lies at the end of the bridge. Keep walking south.', 3500); }
  for (const r of resources) {
    r.shake = Math.max(0, r.shake - dt);
    if (!r.alive) { const pf = r.fall; r.fall += dt; if (r.type === 'tree' && pf < 0.5 && r.fall >= 0.5) { burst(r.x + r.fallDir * 44, r.y - 4, '#5aa65c', 12); impact(3); } r.respawn -= dt; if (r.respawn <= 0 && Math.hypot(r.x - P.x, r.y - P.y) > 60) { r.alive = true; r.hp = r.max; r.grow = 0; } }
    else if (r.grow !== undefined && r.grow < 1) r.grow = Math.min(1, r.grow + dt * 2.5);
  }
  const fainted = P.act && P.act.kind === 'faint';
  for (const e of enemies) updateEnemy(e, dt, fainted);
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].remove) enemies.splice(i, 1);
  updateProjectiles(dt, fainted);
  updateHazards(dt, fainted); updateVents(fainted); updateDartTraps(); updateLilies(dt, fainted); updateAir(dt, fainted); updateTelepads(fainted); updateMeteors(dt); if (dungeonAt(P.x) === SKY_D || dungeonAt(P.x) === SPIRE_D || dungeonAt(P.x) === TOWER_D) updateJets(dt);
  updateBosses(dt, fainted);
  updateWorldLinks(dt);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.01, dt); p.vy *= Math.pow(0.01, dt);
    const d = Math.hypot(P.x - p.x, P.y - 14 - p.y);
    if (p.t > 0.35 && d < 72 && !fainted) { const s = 260 * dt; p.x += (P.x - p.x) / d * s; p.y += (P.y - 14 - p.y) / d * s; if (Math.random() < dt * 20) particles.push({ x: p.x, y: p.y, vx: 0, vy: -10, life: 0.3, color: '#fff6c8', size: 2 }); }
    if (p.t > 0.35 && d < 14 && !fainted) {
      pickups.splice(i, 1);
      if (p.item === 'gold') { addGold(p.v || 1); floatText(P.x, P.y - 56, `+${p.v || 1}g`, '#f4b740'); SFX.play('coin'); }
      else if (p.item === 'idol') { S.found.idol = true; banner('Found the golden idol!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'lens') { S.found.lens = true; banner('Found the telescope lens!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'mainspring') { S.found.mainspring = true; banner('Found the great mainspring!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'compass') { S.found.compass = true; banner('Found the brass compass!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'comb') { S.found.comb = true; banner('Found the pearl comb!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'jadeidol') { S.found.jadeidol = true; banner('Found the jade idol!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'goldpick') { S.found.goldpick = true; banner('Found the golden pickaxe!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'chime') { S.found.chime = true; banner('Found the wind chime!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'bloom') { S.found.bloom = true; banner('Found the Ember Bloom!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'ring') { S.found.ring = true; banner('Found the lost ring!', '#ffe08a'); SFX.play('lucky'); questTick(); }
      else if (p.item === 'key') { const DK = dungeonAt(p.x); if (DK) dgs(DK).keys++; banner('Small Key!', '#ffe08a'); SFX.play('lucky'); }
      else if (p.item === 'bosskey') { const DK = dungeonAt(p.x); if (DK) dgs(DK).bossKey = true; banner('Boss Key!', '#ff9a9a'); SFX.play('craft'); }
      else { S.inv[p.item]++; floatText(P.x, P.y - 56, `+1 ${ITEMS[p.item].name}`, '#eef3e6'); SFX.play('collect'); }
      updateHUD();
      const slot = p.item === 'gold' ? document.querySelector('.gold') : document.querySelector(`.slot[data-item="${p.item}"]`);
      if (slot) { slot.classList.remove('bump'); void slot.offsetWidth; slot.classList.add('bump'); }
    } else if (p.t > 60 && !p.keep) pickups.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.leaf) { p.vy = 30; p.x += Math.sin(time * 6 + i) * 0.6; } else p.vy += 260 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  updateAmbient(dt);
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.life -= dt; f.y -= 28 * dt; if (f.life <= 0) floats.splice(i, 1); }
  const n = nearestNPC(), pr = $('prompt');
  const key = matchMedia('(pointer: coarse)').matches ? 'A' : 'Space', ch = nearestChest(), dr = inDungeon(P.x) ? doorAhead() : null;
  if (n && !P.act) { pr.hidden = false; pr.innerHTML = `<kbd>${key}</kbd> ${n.verb} ${n.name}`; }
  else if (ch && !P.act) { pr.hidden = false; pr.innerHTML = `<kbd>${key}</kbd> Open the chest`; }
  else if (dr && dr.kind !== 'gate' && dr.kind !== 'switch') { const g = dgs(dr.D); pr.hidden = false; pr.innerHTML = dr.kind === 'lock' ? (g.keys ? `<kbd>${key}</kbd> Unlock the door` : 'Locked door (needs a small key)') : (g.bossKey ? `<kbd>${key}</kbd> Open the skull door` : 'Skull door (needs the Boss Key)'); }
  else if ((!inDungeon(P.x) || dungeonAt(P.x).outdoor) && DUNGEONS.some(D => D.entrance && Math.hypot(P.x - D.entrance.x, P.y - D.entrance.y) < 70)) {
    const D = DUNGEONS.find(D => D.entrance && Math.hypot(P.x - D.entrance.x, P.y - D.entrance.y) < 70), done = D.objective(dgs(D)).includes('stairs back up');
    pr.hidden = false; pr.innerHTML = D.locked && D.locked() ? `${D.name} (${D.id === 'mine' ? 'rubble: needs a pickaxe' : 'sealed by drifting sand'})` : `Walk in to enter ${D.name}${done ? ' (cleared)' : ''}`;
  }
  else if (!interiorAt(P.x, P.y) && HOUSES.some(h => h.interior && Math.hypot(P.x - h.x, P.y - (h.y + 8)) < 44)) { const h = HOUSES.find(h => h.interior && Math.hypot(P.x - h.x, P.y - (h.y + 8)) < 44); pr.hidden = false; pr.innerHTML = `Walk in to enter ${h.name}`; }
  else if (interiorAt(P.x, P.y) && tileAt(Math.floor(P.x / T), Math.floor((P.y + 34) / T)) === MAT) { pr.hidden = false; pr.innerHTML = 'Walk out the door to leave'; }
  else if (tileAt(Math.floor(P.x / T), Math.floor((P.y + 20) / T)) === STAIRS) { pr.hidden = false; pr.innerHTML = 'Walk down the stairs to leave the mine'; }
  else pr.hidden = true;
  saveT += dt; if (saveT > 8) { saveT = 0; save(); questTick(); }
}
function updateAnimal(a, dt) {
  a.t -= dt; a.hop += dt * 8;
  if (a.t <= 0) { a.t = 1.5 + rng() * 3; const go = rng() < 0.55, ang = rng() * Math.PI * 2, sp = a.key === 'chicken' ? 34 : 18; a.vx = go ? Math.cos(ang) * sp : 0; a.vy = go ? Math.sin(ang) * sp * 0.6 : 0; }
  const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
  if (Math.hypot(nx - (cx * T + 60), ny - (cy * T + 60)) < 170 && walkable(nx, ny)) { a.x = nx; a.y = ny; } else { a.vx = -a.vx; a.vy = -a.vy; }
  if (a.vx) a.flip = a.vx > 0;
}

// ---------- dungeons: travel, chests, doors, switches and gates ----------
let fade = 0, linkCd = 0, doorMsgCd = 0, gateCheck = 0;
function travel(x, y, fx, fy, msg) {
  P.x = x; P.y = y; P.fx = fx; P.fy = fy; P.act = null; P.dash = null; P.kx = P.ky = 0; camFocus.x = x; camFocus.y = y;
  fade = 1; linkCd = 1; projectiles.length = 0; setTimeout(updateHUD, 0); SFX.play('dash'); if (msg) setTimeout(() => banner(msg, '#ffe08a'), 250);
}
const doorAt = (tx, ty) => { const D = dungeonAt(tx * T + 16); return D && D.doors.find(d => !dgs(D).open[d.id] && d.cells.some(([x, y]) => D.x0 + x === tx && y === ty)); };
function openDoor(d, quiet) {
  const D = d.D; dgs(D).open[d.id] = true;
  for (const [x, y] of d.cells) dset(D, x, y, FLOOR);
  const xs = d.cells.map(c => c[0]), ys = d.cells.map(c => c[1]);
  redrawArea(D.x0 + Math.min(...xs) - 1, Math.min(...ys) - 1, D.x0 + Math.max(...xs) + 1, Math.max(...ys) + 1);
  if (quiet) return;
  SFX.play('crumble'); SFX.play('craft'); impact(5); burst((D.x0 + d.cells[0][0]) * T + 32, d.cells[0][1] * T + 16, '#ffe08a', 16);
  updateHUD();
  banner(d.kind === 'gate' || d.kind === 'switch' ? 'The gate opens!' : d.kind === 'boss' ? 'The great door groans open...' : 'Unlocked!', '#ffe08a');
  save();
}
function tryDoor(d) {
  if (doorMsgCd > 0) return; doorMsgCd = 1.5;
  const D = d.D, g = dgs(D);
  if (d.kind === 'gate' || d.kind === 'switch') toast(D.gateMsg);
  else if (d.kind === 'lock') { if (g.keys > 0) { g.keys--; openDoor(d); updateHUD(); } else toast('Locked. There must be a small key somewhere in here.'); }
  else if (g.bossKey) openDoor(d); else toast(D.bossDoorMsg);
}
function doorAhead() { const tx = Math.floor((P.x + P.fx * 20) / T), ty = Math.floor((P.y - 4 + P.fy * 20) / T); return doorAt(tx, ty); }
const nearestChest = () => { const D = dungeonAt(P.x); return D && D.chests.find(c => !dgs(D).chests[c.id] && Math.hypot(c.x - P.x, c.y - P.y) < 44); };
function openChest(c) {
  const D = dungeonAt(c.x); dgs(D).chests[c.id] = true; SFX.play('lucky'); burst(c.x, c.y - 16, '#ffe08a', 14);
  if (c.item === 'key') drop(c.x, c.y - 10, 'key', 1); else if (c.item === 'gold') drop(c.x, c.y - 10, 'gold', 10, 4); else drop(c.x, c.y - 10, c.item, c.n || 1);
  save();
}
function hitSwitches(hx, hy, rad) {
  const D = dungeonAt(P.x); if (!D) return;
  for (const sw of D.switches) {
    if (dgs(D).switches[sw.id] || Math.hypot(sw.x - hx, sw.y - 20 - hy) > rad + 10) continue;
    dgs(D).switches[sw.id] = true; SFX.play('lucky'); burst(sw.x, sw.y - 26, '#ffe08a', 14);
    const lit = D.switches.filter(s => dgs(D).switches[s.id]).length;
    floatText(sw.x, sw.y - 50, `${lit} / ${D.switches.length}`, '#ffe08a'); save();
  }
}
function updateWorldLinks(dt) {
  linkCd = Math.max(0, linkCd - dt); doorMsgCd = Math.max(0, doorMsgCd - dt);
  const IN = interiorAt(P.x, P.y), here = IN ? null : dungeonAt(P.x);
  if (!IN && linkCd <= 0 && P.fy < -0.3) for (const h of HOUSES) if (h.interior && Math.hypot(P.x - h.x, P.y - (h.y + 8)) < 16) { travel(h.interior.start.x, h.interior.start.y, 0, -1, h.name); SFX.play('collect'); break; }
  if (IN && linkCd <= 0 && P.fy > 0.3 && tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === MAT) travel(IN.house.x, IN.house.y + 28, 0, 1, null);
  if (!here && linkCd <= 0 && S.bridge && P.y > (H - 1.6) * T && P.fy > 0.3 && Math.abs(P.x - cx * T) < 48) {
    const first = !S.found.frost; S.found.frost = true; travel(FROST_D.start.x, FROST_D.start.y, 0, 1, 'The Frostmoor'); questTick();
    if (first) setTimeout(() => toast('Snow crunches underfoot. A campfire burns by the dock: rest beside it to recover.', 4500), 1200);
  }
  if (here === FROST_D && linkCd <= 0 && P.y < 1.6 * T && P.fy < -0.3) travel(cx * T - 16, (H - 3) * T, 0, -1, 'Brindle Isle');
  if ((!here || here.outdoor) && linkCd <= 0 && P.fy < -0.3) for (const D of DUNGEONS) {
    if (!D.entrance) continue;
    if (Math.hypot(P.x - D.entrance.x, P.y - D.entrance.y) >= 18) continue;
    if (D.locked && D.locked()) { if (doorMsgCd <= 0) { doorMsgCd = 1.5; toast(D.lockMsg); } P.y = D.entrance.y + 22; }
    else { if (D.unlock) D.unlock(); travel(D.start.x, D.start.y, 0, -1, D.name); }
  }
  if (here && linkCd <= 0 && tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === STAIRS && P.fy > 0.3) travel(here.entrance.x, here.entrance.y + 34, 0, 1, null);
  // bumping into a locked door tries to open it
  if (P.moving && here) { const d = doorAhead(); if (d) tryDoor(d); }
  gateCheck -= dt;
  if (gateCheck <= 0 && here) {
    gateCheck = 0.4; const g = dgs(here);
    for (const d of here.doors) {
      if (g.open[d.id]) continue;
      if (d.kind === 'gate' && !enemies.some(e => e.alive && e.dreg === d.reg)) openDoor(d);
      if (d.kind === 'switch' && here.switches.every(s => g.switches[s.id])) openDoor(d);
    }
  }
}

// ---------- enemy AI ----------
function moveEnemy(e, dx, dy) {
  if (e.frozen > 0) { dx *= 0.3; dy *= 0.3; }
  if (ENEMY[e.kind].flyer && !inDungeon(e.x)) { e.x = Math.max(16, Math.min(OW * T - 16, e.x + dx)); e.y = Math.max(16, Math.min(H * T - 16, e.y + dy)); }
  else { moveBody(e, dx, dy, 9); pushOut(e, 9); }
}
const AI = k => ENEMY[k].ai || k;
function updateEnemy(e, dt, fainted) {
  const D = ENEMY[e.kind];
  if (!e.alive) {
    if (e.dieT > 0) e.dieT -= dt;
    if (e.minion) { if (e.dieT <= 0) e.remove = true; return; }
    if (e.noRespawn) return;
    e.respawn -= dt;
    if (e.respawn <= 0 && Math.hypot(e.hx - P.x, e.hy - P.y) > 320) Object.assign(e, { alive: true, hp: e.max, x: e.hx, y: e.hy, spawnT: 0.45, state: 'move', cd: 1 });
    return;
  }
  e.hurt = Math.max(0, e.hurt - dt); if (e.spawnT > 0) e.spawnT -= dt; if (e.frozen > 0) e.frozen -= dt;
  tickPoison(e, dt, () => { e.hp -= 1; floatText(e.x, e.y - 46, '1', '#7fd17a'); if (e.hp <= 0) killEnemy(e); });
  if (!e.alive) return;
  e.cd = Math.max(0, e.cd - dt); e.anim += dt;
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  const homeD = Math.hypot(e.hx - e.x, e.hy - e.y);
  const chase = !fainted && d < D.aggro && (homeD < 320 || e.minion) && Math.hypot(P.x - cx * T, P.y - cy * T) > 7 * T;
  const touch = (n, r = 20) => { if (d < r && !fainted && !e.faded) { if (D.chill && P.inv <= 0 && !gearA().warm) { P.slow = 1.5; } damagePlayer(n, e); } };
  // knockback overrides everything
  if (Math.abs(e.kx) + Math.abs(e.ky) > 5) {
    moveEnemy(e, e.kx * dt, e.ky * dt); e.kx *= Math.pow(0.001, dt); e.ky *= Math.pow(0.001, dt); return;
  }
  e.kx = e.ky = 0;
  const wander = sp => {
    if (homeD > 220) { moveEnemy(e, (e.hx - e.x) / homeD * sp * dt, (e.hy - e.y) / homeD * sp * dt); return; }
    e.wt -= dt; if (e.wt <= 0) { e.wt = 1 + rng() * 2; const a = rng() * Math.PI * 2, go = rng() < 0.6; e.wx = go ? Math.cos(a) * sp * 0.5 : 0; e.wy = go ? Math.sin(a) * sp * 0.5 : 0; }
    moveEnemy(e, e.wx * dt, e.wy * dt);
  };
  const lockOn = sp => { e.lx = dx / d * sp; e.ly = dy / d * sp; };
  if (D.proc && updateMireFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander)) return;

  if (D.hopper) {
    if (e.state === 'windup') { e.st -= dt; e.hop = 0; if (e.st <= 0) { e.state = 'leap'; e.st = 0.38; lockOn(260); } return; }
    if (e.state === 'leap') {
      e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); touch(D.dmg, 22);
      if (e.st <= 0) { e.state = 'move'; e.cd = 2 + rng(); burst(e.x, e.y, D.col, 6); }
      return;
    }
    e.hop += dt * (chase ? 9 : 4);
    const hopF = Math.max(0, Math.sin(e.hop)) * 1.8;
    if (chase && e.kind === 'purple' && d < 120 && e.cd <= 0) { e.state = 'windup'; e.st = 0.5; return; }
    if (chase) moveEnemy(e, dx / d * D.sp * hopF * dt, dy / d * D.sp * hopF * dt);
    else { e.wx *= 1; wander(D.sp * hopF); }
    touch(D.dmg, D.small ? 16 : 20);
    return;
  }
  if (AI(e.kind) === 'bandit') { // dashes in, snatches gold, then runs for it
    if (e.state === 'flee') {
      e.st -= dt; moveEnemy(e, -dx / d * 115 * dt, -dy / d * 115 * dt);
      if (Math.random() < dt * 8) particles.push({ x: e.x, y: e.y - 30, vx: 0, vy: -20, life: 0.4, color: '#f4b740', size: 3 });
      if (e.st <= 0) { e.state = 'move'; e.cd = 2; }
      return;
    }
    if (chase) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); else wander(D.sp * 0.6);
    if (d < 20 && !fainted && P.inv <= 0 && !P.dash) {
      const amt = Math.min(S.gold, 5 + Math.floor(S.gold * 0.1), 30);
      damagePlayer(1, e);
      if (amt > 0) { S.gold -= amt; e.loot = (e.loot || 0) + amt; floatText(P.x, P.y - 60, `-${amt}g`, '#f4b740'); toast('A bandit snatched your gold! Catch them to get it back.'); updateHUD(); }
      e.state = 'flee'; e.st = 3.5;
    }
    return;
  }
  if (AI(e.kind) === 'snail') { // slow, and hides in its shell when struck
    e.shell = Math.max(0, (e.shell || 0) - dt);
    if (e.shell > 0) return;
    if (chase) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); else wander(D.sp);
    touch(D.dmg);
    return;
  }
  if (AI(e.kind) === 'rat') { // darts around in quick zig-zags
    const zig = Math.sin(e.anim * 9) * 0.8, go = Math.sin(e.anim * 4) > -0.3 ? 1 : 0.1;
    if (chase) moveEnemy(e, (dx / d - dy / d * zig) * D.sp * go * dt, (dy / d + dx / d * zig) * D.sp * go * dt); else wander(D.sp * 0.5);
    touch(D.dmg, 16);
    return;
  }
  if (AI(e.kind) === 'mage' || e.kind === 'icemage') { // blinks away when you close in and hurls fireballs
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 2.2 + rng(); const a = Math.atan2(P.y - 14 - (e.y - 24), P.x - e.x); projectiles.push({ kind: e.kind === 'icemage' ? 'ice' : e.kind === 'hexer' ? 'hex' : 'fire', x: e.x, y: e.y - 24, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, ang: a, t: 0, life: 2.4 }); SFX.play('swing'); } return; }
    if (chase && d < 80 && (e.blink || 0) <= 0) {
      for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2, nx = e.x + Math.cos(a) * 130, ny = e.y + Math.sin(a) * 130; if (walkable(nx, ny) && Math.hypot(nx - P.x, ny - P.y) > 110) { burst(e.x, e.y - 20, '#e08a3c', 10); e.x = nx; e.y = ny; burst(e.x, e.y - 20, '#e08a3c', 10); SFX.play('wisp'); break; } }
      e.blink = 2.5;
    }
    e.blink = Math.max(0, (e.blink || 0) - dt);
    if (chase) { const want = d < 120 ? -0.6 : d > 190 ? 1 : 0; moveEnemy(e, dx / d * want * D.sp * dt, dy / d * want * D.sp * dt); if (d < 260 && e.cd <= 0) { e.state = 'windup'; e.st = 0.55; } }
    else wander(D.sp);
    touch(D.dmg);
    return;
  }
  if (AI(e.kind) === 'bat') { // flutters around you, then swoops
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'attack'; e.st = 0.42; lockOn(250); } return; }
    if (e.state === 'attack') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); touch(D.dmg, 22); if (e.st <= 0) { e.state = 'recover'; e.st = 0.7; } return; }
    if (e.state === 'recover') { e.st -= dt; moveEnemy(e, -dx / d * D.sp * dt, -dy / d * D.sp * dt); if (e.st <= 0) { e.state = 'move'; e.cd = 1.2 + rng(); } return; }
    if (chase) {
      const side = Math.sin(e.anim * 1.7) * 60, tx = P.x - dy / d * side - dx / d * 70, ty = P.y + dx / d * side - dy / d * 70;
      const ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1;
      moveEnemy(e, ex / el * Math.min(el, D.sp * dt), ey / el * Math.min(el, D.sp * dt));
      if (d < 110 && e.cd <= 0) { e.state = 'windup'; e.st = 0.28; }
    } else moveEnemy(e, Math.cos(e.anim * 0.9) * 40 * dt + (e.hx - e.x) * 0.3 * dt, Math.sin(e.anim * 1.3) * 30 * dt + (e.hy - e.y) * 0.3 * dt);
    return;
  }
  if (AI(e.kind) === 'spider') { // creeps in bursts, then pounces
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'attack'; e.st = 0.28; lockOn(340); SFX.play('leap'); } return; }
    if (e.state === 'attack') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); touch(D.dmg, 22); if (e.st <= 0) { e.state = 'move'; e.cd = 1.6 + rng(); } return; }
    const burstF = Math.sin(e.anim * 7) > 0 ? 1.7 : 0.15;
    if (chase) { moveEnemy(e, dx / d * D.sp * burstF * dt, dy / d * D.sp * burstF * dt); if (d < 115 && e.cd <= 0) { e.state = 'windup'; e.st = 0.35; } }
    else wander(D.sp * burstF);
    touch(D.dmg);
    return;
  }
  if (AI(e.kind) === 'crab' || e.kind === 'raider') { // winds up, then charges in a straight line; dizzy if it hits something
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'attack'; e.st = 0.7; lockOn(240); } return; }
    if (e.state === 'attack') {
      e.st -= dt; const ox = e.x, oy = e.y; moveEnemy(e, e.lx * dt, e.ly * dt); touch(D.dmg, 24);
      const stuck = Math.hypot(e.x - ox, e.y - oy) < 240 * dt * 0.3;
      if (stuck) { e.state = 'recover'; e.st = 1.2; burst(e.x, e.y - 10, '#ffffff', 6); impact(2); floatText(e.x, e.y - 46, 'Dizzy', '#ffe08a'); }
      else if (e.st <= 0) { e.state = 'move'; e.cd = 2 + rng(); }
      return;
    }
    if (e.state === 'recover') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 1.5; } return; }
    if (chase) { moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 150 && e.cd <= 0) { e.state = 'windup'; e.st = 0.6; } }
    else wander(D.sp);
    touch(D.dmg, 22);
    return;
  }
  if (AI(e.kind) === 'cyclops') { // keeps its distance and lobs rocks at where you stand
    if (e.state === 'windup') {
      e.st -= dt;
      if (e.st <= 0) {
        e.state = 'move'; e.cd = 2.4 + rng();
        const lead = 0.4; projectiles.push({ kind: 'rock', sx: e.x, sy: e.y - 30, x: e.x, y: e.y - 30, tx: P.x + (P.moving ? P.fx * 130 * lead : 0), ty: P.y + (P.moving ? P.fy * 130 * lead : 0), t: 0, dur: 0.9, z: 0 });
        SFX.play('swing');
      }
      return;
    }
    if (chase) {
      const want = d < 110 ? -1 : d > 180 ? 1 : 0, side = Math.sin(e.anim * 0.8);
      moveEnemy(e, (dx / d * want - dy / d * side * 0.6) * D.sp * dt, (dy / d * want + dx / d * side * 0.6) * D.sp * dt);
      if (d < 250 && e.cd <= 0) { e.state = 'windup'; e.st = 0.6; }
    } else wander(D.sp);
    touch(D.dmg);
    return;
  }
  if (AI(e.kind) === 'ghost') { // fades out (can't be hit) and casts homing wisps
    e.phaseT += dt;
    const cycle = e.phaseT % 4.6; e.faded = cycle > 3.0;
    if (e.state === 'windup') { e.st -= dt; e.faded = false; if (e.st <= 0) { e.state = 'move'; e.cd = 2.6 + rng(); projectiles.push({ kind: 'wisp', x: e.x, y: e.y - 26, ang: Math.atan2(P.y - 14 - (e.y - 26), P.x - e.x), t: 0, life: 3.6 }); SFX.play('wisp'); } return; }
    if (chase) {
      const want = d < 100 ? -1 : d > 160 ? 1 : 0;
      moveEnemy(e, (dx / d * want + Math.cos(e.anim) * 0.5) * D.sp * dt, (dy / d * want + Math.sin(e.anim * 1.3) * 0.5) * D.sp * dt);
      if (!e.faded && d < 240 && e.cd <= 0 && cycle < 2.4) { e.state = 'windup'; e.st = 0.5; }
    } else moveEnemy(e, Math.cos(e.anim * 0.6) * 20 * dt + (e.hx - e.x) * 0.2 * dt, Math.sin(e.anim * 0.8) * 20 * dt + (e.hy - e.y) * 0.2 * dt);
    touch(D.dmg);
  }
}
function updateProjectiles(dt, fainted) {
  for (const p of projectiles) {
    p.t += dt;
    if (p.friendly) {
      if (p.t < 0) { p.x = P.x + P.fx * 20; p.y = P.y - 20 + P.fy * 20; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (Math.random() < dt * 40) particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, color: gearW().col, size: 3 });
      for (const e of enemies) if (e.alive && !p.dead && Math.hypot(e.x - p.x, e.y - 14 - p.y) < 24) { damageEnemy(e, weaponDmg(), p.vx * 0.6, p.vy * 0.6); p.dead = true; }
      const AB = activeBoss();
      if (!p.dead && AB && bossHittable(AB) && Math.hypot(AB.x - p.x, AB.y - 30 - AB.z - p.y) < 44) { damageBoss(AB, weaponDmg()); p.dead = true; }
      if (!p.dead && inDungeon(p.x) && !walkable(p.x, p.y + 20)) { p.dead = true; burst(p.x, p.y, gearW().col, 6); }
      if (p.t > p.life) p.dead = true;
      continue;
    }
    if (p.kind === 'sunball') {
      p.x += p.vx * dt; p.y += p.vy * dt; const A = p.owner.arena;
      if (p.x < A.x0 + 26 || p.x > A.x1 - 26) { p.vx *= -1; p.bounces++; p.x = Math.max(A.x0 + 26, Math.min(A.x1 - 26, p.x)); impact(2); }
      if (p.y < A.y0 + 40 || p.y > A.y1 - 10) { p.vy *= -1; p.bounces++; p.y = Math.max(A.y0 + 40, Math.min(A.y1 - 10, p.y)); impact(2); }
      if (Math.random() < dt * 25) particles.push({ x: p.x + (rng() - 0.5) * 30, y: p.y + (rng() - 0.5) * 30, vx: 0, vy: -20, life: 0.4, color: '#ffd65a', size: 3 });
      if (!fainted && !P.dash && Math.hypot(P.x - p.x, P.y - 14 - p.y) < 28) damagePlayer(2, p);
      if (p.bounces > 4 || p.t > p.life) { p.dead = true; burst(p.x, p.y, '#ffd65a', 14); }
      continue;
    }
    if (p.kind === 'orb') {
      const o = p.owner, tx = p.returned ? o.x : P.x, ty = p.returned ? o.y - 30 - o.z : P.y - 14;
      const want = Math.atan2(ty - p.y, tx - p.x); let da = want - p.ang;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const turn = p.returned ? 8 : 1.3; p.ang += Math.max(-turn * dt, Math.min(turn * dt, da));
      p.x += Math.cos(p.ang) * p.sp * dt; p.y += Math.sin(p.ang) * p.sp * dt;
      if (Math.random() < dt * 40) particles.push({ x: p.x, y: p.y, vx: 0, vy: -10, life: 0.35, color: p.returned ? '#ffe08a' : '#c9b8ff', size: 3 });
      if (!p.returned && !fainted && Math.hypot(P.x - p.x, P.y - 14 - p.y) < 16) { damagePlayer(2, p); p.dead = true; burst(p.x, p.y, '#c9b8ff', 12); }
      if (p.returned && Math.hypot(tx - p.x, ty - p.y) < 30) {
        if (o.phase === 3 && !p.batted && rng() < 0.4) { p.returned = false; p.batted = true; p.sp = 150; p.ang += Math.PI; floatText(o.x, o.y - 90, 'He swats it back!', '#ff9a9a'); SFX.play('hit'); }
        else { p.dead = true; burst(p.x, p.y, '#ffe08a', 20); if (o.type === 'storm') stormDaze(o); else wizardDaze(o); }
      }
      if (p.t > p.life) p.dead = true;
      continue;
    }
    if (p.kind === 'rock') {
      const k = Math.max(0, Math.min(1, p.t / p.dur));
      if (p.fall) { p.x = p.tx; p.y = p.ty; p.z = (1 - k) * 320; }
      else { p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.z = Math.sin(Math.PI * k) * 80 + (1 - k) * 30; }
      if (k >= 1 && !p.dead) {
        p.dead = true; SFX.play('crumble'); impact(2);
        for (let i = 0; i < 8; i++) { const a = rng() * Math.PI * 2; particles.push({ x: p.tx, y: p.ty, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60 - 80, life: 0.5, color: i % 2 ? '#9c9690' : '#6c6764', size: 4 }); }
        if (!fainted && Math.hypot(P.x - p.tx, P.y - p.ty) < 26) damagePlayer(1, { x: p.tx, y: p.ty });
        if (p.meteor) meteorLand(p);
        if (p.drake) { const DB = BOSSES.find(b => b.type === 'drake'); if (DB && DB.active) { DB.rocks = DB.rocks || []; if (DB.rocks.length >= 4) DB.rocks.shift(); DB.rocks.push({ x: p.tx, y: p.ty }); } }
        if (p.flask) { HAZARDS.push({ x: p.tx, y: p.ty, r: 44, t: 0, life: 3, tick: 0.4 }); burst(p.tx, p.ty - 10, '#7fd17a', 12); }
      }
    } else {
      if (p.kind === 'wisp') {
        const want = Math.atan2(P.y - 14 - p.y, P.x - p.x); let da = want - p.ang;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        p.ang += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
        p.x += Math.cos(p.ang) * 95 * dt; p.y += Math.sin(p.ang) * 95 * dt;
        if (Math.random() < dt * 30) particles.push({ x: p.x, y: p.y, vx: 0, vy: -10, life: 0.3, color: '#c9b8ff', size: 3 });
      } else if (p.kind === 'bubble') { p.x += p.vx * dt + Math.sin(p.t * 4 + p.ph) * 0.8; p.y += p.vy * dt + Math.cos(p.t * 3 + p.ph) * 0.6; }
      else { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.kind === 'fire' && Math.random() < dt * 40) particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 20, vy: -20, life: 0.3, color: Math.random() < 0.5 ? '#ffb347' : '#ec5257', size: 3 });
      if (p.kind === 'fire' && inDungeon(p.x) && !dungeonAt(p.x).outdoor && !walkable(p.x, p.y + 14)) { p.dead = true; burst(p.x, p.y, '#ffb347', 8); }
      if (p.kind === 'bomb') { if (p.t >= p.life && !p.dead) { p.dead = true; impact(6); SFX.play('slam'); for (let i = 0; i < 18; i++) { const a = rng() * Math.PI * 2, v = 60 + rng() * 140; particles.push({ x: p.x, y: p.y - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5, color: i % 2 ? '#ffb347' : '#e0503a', size: 4 }); } if (!fainted && !P.dash && Math.hypot(P.x - p.x, (P.y - p.y) / 0.8) < 54) damagePlayer(2, p); } continue; }
      if (p.kind === 'bolt') { if (p.t >= 0.7 && !p.hit) { p.hit = true; impact(3); SFX.play('slam'); burst(p.x, p.y, '#fff6a8', 10); if (!fainted && !P.dash && Math.hypot(P.x - p.x, (P.y - p.y) / 0.7) < 24) damagePlayer(2, { x: p.x, y: p.y + 30 }); } if (p.t > p.life) p.dead = true; continue; }
      if (p.kind === 'spike') { if (p.t >= 0.5 && p.t < 0.85 && !p.hit && !fainted && Math.hypot(P.x - p.x, P.y - p.y) < 20) { p.hit = true; damagePlayer(2, p); } if (p.t > p.life) p.dead = true; continue; }
      if (p.kind === 'axe') {
        const o = p.owner, tx = p.back ? o.x : p.tx, ty = p.back ? o.y - 40 : p.ty, dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy) || 1;
        p.x += dx / dd * Math.min(dd, 330 * dt); p.y += dy / dd * Math.min(dd, 330 * dt);
        if (!p.back && dd < 12) p.back = true;
        if (p.back && dd < 24) { p.dead = true; if (o.state === 'axeOut') bossRest(o, 0.4); }
        if (!fainted && Math.hypot(P.x - p.x, P.y - 14 - p.y) < 20) damagePlayer(2, p);
        if (p.t > 6) { p.dead = true; if (o.state === 'axeOut') bossRest(o, 0.4); }
        continue;
      }
      if (!fainted && Math.hypot(P.x - p.x, P.y - 14 - p.y) < (p.kind === 'bubble' ? 16 : 14)) {
        damagePlayer(p.kind === 'fire' ? fireDmg(p.weak ? 1 : 2) : 1, p); p.dead = true; burst(p.x, p.y, p.kind === 'web' ? '#ffffff' : p.kind === 'bubble' ? '#bfe8ff' : p.kind === 'fire' ? '#ffb347' : '#c9b8ff', 6);
        if (p.kind === 'dart') { P.poison = 2.2; P.poisonT = 1; floatText(P.x, P.y - 60, 'Poison dart!', '#7fd17a'); }
        if (p.kind === 'venom') { P.poison = 3.2; P.poisonT = 1; floatText(P.x, P.y - 60, 'Poisoned!', '#7fd17a'); }
        if (p.kind === 'hex') { P.hex = 1.6; floatText(P.x, P.y - 60, 'Hexed! Controls reversed', '#d6b8ff'); }
        if ((p.kind === 'web' || p.kind === 'ice') && !gearA().warm) { P.slow = 2.2; floatText(P.x, P.y - 60, p.kind === 'ice' ? 'Chilled!' : 'Webbed!', '#ffffff'); }
      }
      if (p.t > p.life) p.dead = true;
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
}

// ---------- bosses ----------
const activeBoss = () => BOSSES.find(B => B.active);
const bossHittable = B => B && B.active && B.type !== 'hydra' && B.type !== 'serpent' && B.type !== 'kraken' && (B.type !== 'clock' || B.state === 'dazed') && B.z < 30 && !['dying', 'wake', 'vanish', 'appear', 'dead', 'sink', 'lurk', 'burrow', 'under', 'hidden', 'diving', 'rumble', 'swim', 'sink', 'slide'].includes(B.state);
let blizzard = 0;
function bossBar() {
  const B = activeBoss(), el = $('bossbar'); el.hidden = !B; if (!B) return;
  el.querySelector('.label').textContent = B.name; $('bossfill').style.width = Math.max(0, B.hp / B.max * 100) + '%';
}
function clampBoss(B, m = 40) {
  const A = B.arena;
  if (A.rect) { B.x = Math.max(A.x0 + 30, Math.min(A.x1 - 30, B.x)); B.y = Math.max(A.y0 + 44, Math.min(A.y1 - 12, B.y)); }
  else { const ax = B.x - A.cx, ay = B.y - A.cy, ad = Math.hypot(ax, ay), lim = A.r - m; if (ad > lim) { B.x = A.cx + ax / ad * lim; B.y = A.cy + ay / ad * lim; } }
}
function playerOutside(B) {
  const A = B.arena;
  if (A.rect) return P.x < A.x0 - T || P.x > A.x1 + T || P.y < A.y0 - T || P.y > A.y1 + T * 1.5;
  return Math.hypot(P.x - A.cx, P.y - A.cy) > 11 * T;
}
let shieldHint = false, knightHint = false;
function damageBoss(B, n) {
  if (B.type === 'wizard' && B.state !== 'dazed') {
    B.shield = 0.35; floatText(B.x, B.y - 90 - B.z, 'Blocked!', '#c8d0ff'); SFX.play('mine');
    if (!shieldHint) { shieldHint = true; toast('His magic shield blocks your sword. Swing at his orb to send it back at him!', 4500); }
    return;
  }
  if (B.type === 'knight' && B.state !== 'dazed' && B.state !== 'recover') {
    B.shield = 0.35; floatText(B.x, B.y - 90, 'Clang!', '#c8d0ff'); SFX.play('mine');
    if (!knightHint) { knightHint = true; toast('His shield blocks you. Strike right after he swings, or while he\'s dizzy!', 4500); }
    return;
  }
  const dazed = B.state === 'dazed';
  let dmg = n * (dazed ? 2 : 1);
  if (B.type === 'knight2' && B.state !== 'dazed') { n = Math.max(1, Math.ceil(n / 3)); if (rng() < 0.4) floatText(B.x + 30, B.y - 90, 'Armor!', '#c8c0b0'); }
  if (B.type === 'siren' && B.state === 'sing') { B.shield = 0.3; floatText(B.x, B.y - 80, 'Her song shields her!', '#ffd6ea'); SFX.play('mine'); return; }
  if (B.type === 'chameleon' && B.state === 'stalk') { B.state = 'dazed'; B.st = 1.8; floatText(B.x, B.y - 80, 'Found it!', '#ffe08a'); SFX.play('hit'); return; }
  if (B.type === 'shadow' && B.state !== 'dazed' && !shadowInLight(B)) { B.shield = 0.3; floatText(B.x, B.y - 80, 'It passes through!', '#b8a8ff'); if (!shadowHint) { shadowHint = true; toast('Your Shadow mirrors your moves. Meet it inside the lit circle, where it turns solid!', 4500); } return; }
  if (B.type === 'lich' && B.state !== 'dazed' && B.jars && B.jars.some(j => j.hp > 0)) { B.shield = 0.35; floatText(B.x, B.y - 110, 'Shielded!', '#bfffb0'); SFX.play('mine'); if (!lichHint) { lichHint = true; toast('His soul jars shield him. Smash all three jars to break the shield!', 4500); } return; }
  if (B.type === 'aegis' && B.state !== 'dazed') {
    let da = Math.atan2(P.y - B.y, P.x - B.x) - (B.dir || 0); while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) < 1.1) { B.shield = 0.35; floatText(B.x, B.y - 120, 'Blocked!', '#c8d0ff'); SFX.play('mine'); if (!aegisHint) { aegisHint = true; toast('Its shield blocks you from the front. Get behind it, or strike when its laser overheats!', 4500); } return; }
  }
  if (B.type === 'forge' && !(B.cool > 0)) {
    B.shield = 0.35; floatText(B.x, B.y - 120, 'Too hot!', '#ffb347'); SFX.play('mine');
    if (!quenchHint) { quenchHint = true; toast('He is red-hot! Smash a water barrel right next to him to quench him.', 4500); }
    return;
  }
  if (B.type === 'treant' && !dazed) { dmg = Math.max(1, Math.ceil(n / 2)); if (rng() < 0.3) floatText(B.x + 30, B.y - 120, 'Thunk', '#c8b89a'); }
  if (B.type === 'crab' && !dazed) { dmg = Math.max(1, Math.ceil(n / 2)); if (rng() < 0.3) floatText(B.x + 30, B.y - 70, 'Clang', '#c8d0ff'); }
  B.hp -= dmg; B.hurt = 0.15;
  if (gearW().poison) { B.poison = 3; B.poisonT = 1; }
  if (gearW().lifesteal && B.hp <= 0 && S.hp > 0) { S.hp = maxHp(); updateHUD(); }
  floatText(B.x + (rng() - 0.5) * 30, B.y - 90 - B.z, dazed ? `${dmg}!` : String(dmg), dazed ? '#ffe08a' : '#ffffff');
  burst(B.x, B.y - 30 - B.z, BOSS_INFO[B.type].col, 10); SFX.play('hit');
  const phase = B.hp / B.max > 0.66 ? 1 : B.hp / B.max > 0.33 ? 2 : 3;
  if (phase > B.phase && B.hp > 0) { B.phase = phase; B.seq = 0; banner(BOSS_INFO[B.type].lines[phase], '#ff9a9a'); }
  if (B.hp <= 0) {
    B.hp = 0; B.state = 'dying'; B.st = 1.8; B.ring = null; B.alpha = 1;
    for (const e of enemies) if (e.minion && e.alive) killEnemy(e);
    projectiles.length = 0;
  }
  bossBar();
}
function wizardDazeQuiet(B, msg) { B.state = 'dazed'; B.st = 2.4; impact(6); SFX.play('slam'); floatText(B.x, B.y - 110, msg, '#ffe08a'); }
function wizardDaze(B) { B.state = 'dazed'; B.st = 2.8; B.hurt = 0.2; impact(8); SFX.play('slam'); floatText(B.x, B.y - 100, 'Shield broken! Hit him now!', '#ffe08a'); }
function bossRest(B, t) { B.state = 'rest'; B.st = t; }
function bossNext(B) { const seq = BOSS_INFO[B.type].seq[B.phase]; bossStart(B, seq[B.seq++ % seq.length]); }
function summonMinions(B, kinds, cap) {
  const alive = enemies.filter(e => e.minion && e.alive).length;
  for (let i = 0; i < Math.min(kinds.length, cap - alive); i++) {
    const a = rng() * Math.PI * 2, m = makeEnemy(kinds[i], B.x + Math.cos(a) * 60, B.y + Math.sin(a) * 40);
    m.minion = true; m.spawnT = 0.45; m.hx = B.arena.cx; m.hy = B.arena.cy; enemies.push(m);
  }
}
function bossStart(B, action) {
  B.st = 0;
  if (B.type === 'slime') {
    if (action === 'hop') {
      const dx = P.x - B.x, dy = P.y - B.y, d = Math.hypot(dx, dy) || 1, step = Math.min(d, 110);
      B.sx = B.x; B.sy = B.y; B.x += dx / d * step; B.y += dy / d * step; clampBoss(B); B.tx = B.x; B.ty = B.y; B.x = B.sx; B.y = B.sy;
      B.state = 'hop';
    } else if (action === 'slam') { B.state = 'rise'; SFX.play('leap'); }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
    else if (action === 'shards') { B.state = 'shards'; B.st = 0.7; B.volleys = B.phase === 3 ? 2 : 1; }
  } else if (B.type === 'golem') {
    if (action === 'stomp') { B.state = 'stomp'; B.timer = 0; }
    else if (action === 'boulders') { B.state = 'boulders'; B.st = 0.65; }
    else if (action === 'charge') { B.state = 'chargeWind'; B.st = 0.75; }
    else if (action === 'quake') { B.state = 'quake'; B.st = 0.55; }
  } else if (B.type === 'wizard') {
    if (action === 'orb') { if (projectiles.some(p => p.kind === 'orb')) { bossRest(B, 0.4); return; } B.state = 'orb'; B.st = 0.9; }
    else if (action === 'teleport') { B.state = 'vanish'; B.st = 0.4; SFX.play('wisp'); }
    else if (action === 'spiral') { B.state = 'spiral'; B.st = 1.8; B.timer = 0; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
  } else if (B.type === 'queen') {
    if (action === 'skitter') B.state = 'skitter';
    else if (action === 'web') { B.state = 'web'; B.st = 0.55; }
    else if (action === 'eggs') { B.state = 'eggs'; B.st = 0.8; }
    else if (action === 'pounce') { B.state = 'pounceWind'; B.st = 0.65; }
  } else if (B.type === 'crab') {
    if (action === 'scuttle') B.state = 'scuttle';
    else if (action === 'bubbles') { B.state = 'bubbles'; B.st = 0.6; }
    else if (action === 'dive') { B.state = 'sink'; B.st = 0.5; SFX.play('wisp'); }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.7; }
  } else if (B.type === 'bat') {
    if (action === 'circle') B.state = 'circle';
    else if (action === 'swoop') { B.state = 'swoopWind'; B.st = 0.45; }
    else if (action === 'screech') { B.state = 'screech'; B.st = 0.7; B.volleys = B.phase === 3 ? 2 : 1; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
    else if (action === 'perch') { B.state = 'perch'; B.st = 0.5; }
  } else if (B.type === 'jarl') {
    if (action === 'stride') { B.state = 'stride'; B.timer = 0; }
    else if (action === 'axe') { B.state = 'axeWind'; B.st = B.phase === 3 ? 0.55 : 0.7; }
    else if (action === 'spikes') { B.state = 'spikesWind'; B.st = 0.6; }
    else if (action === 'warcry') { B.state = 'warcry'; B.st = 0.8; SFX.play('boss'); }
  } else if (B.type === 'mummy') {
    if (action === 'shamble') B.state = 'shamble';
    else if (action === 'lash') { B.state = 'lashWind'; B.st = B.phase === 3 ? 0.45 : 0.6; }
    else if (action === 'curse') { B.state = 'curse'; B.st = 0.8; }
    else if (action === 'sarcophagus') { B.state = 'sink'; B.st = 0.5; SFX.play('wisp'); }
  } else if (B.type === 'knight2') {
    if (action === 'march') { B.state = 'march'; B.st = 0; }
    else if (action === 'thrust') { B.state = 'thrustWind'; B.st = 0.45; }
    else if (action === 'bots') { B.state = 'bots'; B.st = 0.7; }
  } else if (B.type === 'clock') {
    if (action === 'tick') { B.state = 'tick'; B.st = 0; }
    else if (action === 'cuckoo') { B.state = 'cuckoo'; B.st = 0.6; }
    else if (action === 'chime') { B.state = 'chime'; B.st = 0.8; }
    else if (action === 'gears') { B.state = 'gears'; B.st = 0.7; }
  } else if (B.type === 'siren') {
    if (action === 'swim') B.state = 'swim';
    else if (action === 'sing') { B.state = 'sing'; B.st = B.phase === 3 ? 3 : 2.4; SFX.play('wisp'); }
    else if (action === 'bubbles') { B.state = 'bubbles'; B.st = 0.6; }
    else if (action === 'dive') { B.state = 'dive'; B.st = 0.4; }
    else if (action === 'jellies') { B.state = 'jellies'; B.st = 0.7; }
  } else if (B.type === 'kraken') {
    B.state = 'fight';
  } else if (B.type === 'elderfox') {
    if (action === 'prowl') B.state = 'prowl';
    else if (action === 'fire') { B.state = 'fire'; B.st = 0.6; }
    else if (action === 'illusion') { B.state = 'illusion'; B.st = 0.5; }
    else if (action === 'dash') { B.state = 'dashWind'; B.st = 0.45; }
  } else if (B.type === 'koidragon') {
    if (action === 'swim') { B.state = 'swim'; B.st = 1.2; B.tgt = null; }
    else if (action === 'spit') { B.state = 'rise'; B.st = 0.7; B.atk = 'spit'; SFX.play('slime'); }
    else if (action === 'wave') { B.state = 'rise'; B.st = 0.7; B.atk = 'wave'; SFX.play('slime'); }
    else if (action === 'lunge') { B.state = 'lungeWind'; B.st = 0.7; SFX.play('boss'); }
  } else if (B.type === 'chameleon') {
    if (action === 'stalk') { B.state = 'stalk'; B.st = 0; }
    else if (action === 'spit') { B.state = 'spit'; B.st = 0.5; }
    else if (action === 'frogs') { B.state = 'frogs'; B.st = 0.7; }
  } else if (B.type === 'serpent') {
    if (action === 'chase') B.state = 'chase';
    else if (action === 'spit') { B.state = 'spitWind'; B.st = 0.5; }
    else if (action === 'coil') { B.state = 'coil'; B.st = 0; SFX.play('boss'); }
    else if (action === 'raptors') { B.state = 'raptors'; B.st = 0.7; }
  } else if (B.type === 'mole') {
    if (action === 'burrow') { B.state = 'burrow'; B.st = 0.4; SFX.play('crumble'); }
    else if (action === 'rocks') { B.state = 'rocks'; B.st = 0.6; }
    else if (action === 'quake') { B.state = 'quake'; B.st = 0.7; }
    else if (action === 'pups') { B.state = 'pups'; B.st = 0.8; }
  } else if (B.type === 'hydra') {
    B.state = 'fight';
  } else if (B.type === 'shadow') {
    if (action === 'mirror') B.state = 'mirror';
    else if (action === 'daggers') { B.state = 'daggers'; B.st = 0.6; }
    else if (action === 'lunge') { B.state = 'lunge'; B.st = 0.7; }
  } else if (B.type === 'lich') {
    if (action === 'float') B.state = 'float';
    else if (action === 'bones') { B.state = 'bones'; B.st = 0.7; }
    else if (action === 'skulls') { B.state = 'skulls'; B.st = 0.6; }
    else if (action === 'raise') { B.state = 'raise'; B.st = 0.8; }
    else if (action === 'blink') { B.state = 'blink'; B.st = 0.4; }
    else if (action === 'deathring') { B.state = 'deathring'; B.st = 0.8; }
  } else if (B.type === 'aegis') {
    if (action === 'hover') B.state = 'hover';
    else if (action === 'laser') { B.state = 'laserWind'; B.st = 0.8; }
    else if (action === 'slam') { B.state = 'slamWind'; B.st = 0.7; }
    else if (action === 'orbs') { B.state = 'orbs'; B.st = 0.6; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
  } else if (B.type === 'storm') {
    if (action === 'drift') B.state = 'drift';
    else if (action === 'bolts') { B.state = 'bolts'; B.st = 0.5; }
    else if (action === 'orb') { B.state = 'orb'; B.st = 0.6; }
    else if (action === 'gust') { B.state = 'gust'; B.st = 0.5; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
  } else if (B.type === 'forge') {
    if (action === 'stomp') B.state = 'stomp';
    else if (action === 'slam') { B.state = 'slamWind'; B.st = B.phase === 3 ? 0.6 : 0.8; }
    else if (action === 'charge') { B.state = 'chargeWind'; B.st = 0.6; }
    else if (action === 'sparks') { B.state = 'sparks'; B.st = 0.6; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
  } else if (B.type === 'drake') {
    if (action === 'fly') B.state = 'fly';
    else if (action === 'meteors') { B.state = 'meteors'; B.st = 0.7; }
    else if (action === 'breath') { B.state = 'breathWind'; B.st = 0.6; }
    else if (action === 'dive') { B.state = 'diveWind'; B.st = B.phase === 3 ? 0.8 : 1; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
  } else if (B.type === 'hag') {
    if (action === 'float') B.state = 'float';
    else if (action === 'brew') { B.state = 'brew'; B.st = 0.6; }
    else if (action === 'hide') { B.state = 'diving'; B.st = 0.4; SFX.play('wisp'); }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
    else if (action === 'hexring') { B.state = 'hexring'; B.st = 0.7; }
  } else if (B.type === 'treant') {
    if (action === 'roots') { B.state = 'rootsWind'; B.st = 0.6; }
    else if (action === 'sweep') { B.state = 'sweepWind'; B.st = 0.7; }
    else if (action === 'spores') { B.state = 'spores'; B.st = 0.8; }
    else if (action === 'slam') { B.state = 'slamWind'; B.st = 0.8; }
  } else if (B.type === 'scarab') {
    if (action === 'scuttle') B.state = 'scuttle';
    else if (action === 'roll') { B.state = 'rollWind'; B.st = 0.6; }
    else if (action === 'beam') { B.state = 'beamWind'; B.st = 0.8; }
    else if (action === 'dive') { B.state = 'rise'; SFX.play('leap'); }
  } else if (B.type === 'wyrm') {
    if (action === 'slither') B.state = 'slither';
    else if (action === 'spit') { B.state = 'spitWind'; B.st = 0.6; }
    else if (action === 'burrow') { B.state = 'burrow'; B.st = 0; }
    else if (action === 'summon') { B.state = 'summon'; B.st = 0.8; }
  } else if (B.type === 'wraith') {
    if (action === 'drift') B.state = 'drift';
    else if (action === 'hail') { B.state = 'hail'; B.st = 1.6; B.timer = 0; }
    else if (action === 'breath') { B.state = 'breathWind'; B.st = 0.6; }
    else if (action === 'mirror') { B.state = 'mirrorWind'; B.st = 0.5; }
    else if (action === 'blizzard') { B.state = 'blizzard'; B.st = 3; B.timer = 0; }
  } else if (B.type === 'knight') {
    if (action === 'guard') B.state = 'guard';
    else if (action === 'slash') { B.state = 'slashWind'; B.st = B.phase === 3 ? 0.4 : 0.55; }
    else if (action === 'spin') { B.state = 'spin'; SFX.play('swing'); }
    else if (action === 'ghosts') { B.state = 'ghosts'; B.st = 0.8; }
    else if (action === 'plunge') { B.state = 'plunge'; B.st = 0.7; }
  }
}
function finishBoss(B) {
  B.state = 'dead'; B.active = false; S.defeated[B.type] = true; bossBar();
  for (let i = 0; i < 40; i++) { const a = rng() * Math.PI * 2, v = 80 + rng() * 200; particles.push({ x: B.x, y: B.y - 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.9, color: i % 3 ? BOSS_INFO[B.type].col : '#ffe08a', size: 6 }); }
  if (B.type === 'slime') { drop(B.x, B.y - 10, 'gold', 20, 5); drop(B.x, B.y - 10, 'crystal', 3); drop(B.x, B.y - 10, 'crown', 1); banner('Slime King defeated!', '#ffe08a'); }
  if (B.type === 'golem') { drop(B.x, B.y - 10, 'gold', 12, 5); drop(B.x, B.y - 10, 'stone', 4); drop(B.x, B.y - 10, 'bosskey', 1); banner('Rockjaw defeated!', '#ffe08a'); }
  if (B.type === 'wizard') { drop(B.x, B.y - 10, 'gold', 20, 10); drop(B.x, B.y - 10, 'gem', 1); banner('The Old Mine is free!', '#ffe08a'); }
  if (B.type === 'queen') { drop(B.x, B.y - 10, 'gold', 10, 5); drop(B.x, B.y - 10, 'goo', 4); drop(B.x, B.y - 10, 'bosskey', 1); banner('Spider Queen defeated!', '#ffe08a'); }
  if (B.type === 'crab') { drop(B.x, B.y - 10, 'gold', 16, 10); drop(B.x, B.y - 10, 'pearl', 1); banner('The temple is at peace!', '#ffe08a'); }
  if (B.type === 'bat') { drop(B.x, B.y - 10, 'gold', 10, 5); drop(B.x, B.y - 10, 'bosskey', 1); banner('Nightwing defeated!', '#ffe08a'); }
  if (B.type === 'knight') { drop(B.x, B.y - 10, 'gold', 20, 10); drop(B.x, B.y - 10, 'relic', 1); banner('The crypt is silent!', '#ffe08a'); }
  if (B.type === 'jarl') { drop(B.x, B.y - 10, 'gold', 20, 10); drop(B.x, B.y - 10, 'horn', 1); banner('Jarl Frostbeard defeated!', '#ffe08a'); }
  if (B.type === 'mummy') { drop(B.x, B.y - 10, 'gold', 16, 5); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Mummy King crumbles!', '#ffe08a'); }
  if (B.type === 'scarab') { drop(B.x, B.y - 10, 'gold', 30, 10); drop(B.x, B.y - 10, 'sunstone', 1); banner('The Golden Scarab falls!', '#ffe08a'); }
  if (B.type === 'knight2') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'gear', 3); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Clockwork Knight winds down for good!', '#ffe08a'); }
  if (B.type === 'clock') { B.gears = null; drop(B.x, B.y + 20, 'gold', 45, 10); drop(B.x, B.y + 20, 'clockheart', 1); banner('The Great Clock falls silent!', '#ffe08a'); }
  if (B.type === 'siren') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'coral', 3); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Siren\'s song falls silent!', '#ffe08a'); }
  if (B.type === 'kraken') { B.tents = null; drop(B.x, B.y + 20, 'gold', 45, 10); drop(B.x, B.y + 20, 'krakenbeak', 1); banner('The Kraken sinks into the deep!', '#ffe08a'); }
  if (B.type === 'elderfox') { B.decoys = []; drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'petal', 3); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Elder Fox bows and vanishes!', '#ffe08a'); }
  if (B.type === 'koidragon') { B.beached = false; drop(B.x, B.y - 10, 'gold', 45, 10); drop(B.x, B.y - 10, 'dragonpearl', 1); banner('The Koi Dragon is calmed! The shrine is at peace.', '#ffe08a'); }
  if (B.type === 'chameleon') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'jade', 3); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Giant Chameleon is defeated!', '#ffe08a'); }
  if (B.type === 'serpent') { B.trail = []; drop(B.x, B.y - 10, 'gold', 45, 10); drop(B.x, B.y - 10, 'serpenteye', 1); banner('The Serpent Queen falls! The temple is free.', '#ffe08a'); }
  if (B.type === 'mole') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'glimmer', 3); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Mole King is dethroned!', '#ffe08a'); }
  if (B.type === 'hydra') { drop(B.x, B.y - 10, 'gold', 45, 10); drop(B.x, B.y - 10, 'prismheart', 1); banner('The Crystal Hydra shatters!', '#ffe08a'); }
  if (B.type === 'shadow') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'ectoplasm', 3); drop(B.x, B.y - 10, 'bosskey', 1); banner('Your Shadow fades into the light!', '#ffe08a'); }
  if (B.type === 'lich') { B.jars = []; drop(B.x, B.y - 10, 'gold', 45, 10); drop(B.x, B.y - 10, 'soulgem', 1); banner('The Lich King is destroyed! The dead rest at last.', '#ffe08a'); }
  if (B.type === 'aegis') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'crystal', 4); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Colossus Sentinel crumbles!', '#ffe08a'); }
  if (B.type === 'storm') { B.gust = null; drop(B.x, B.y - 10, 'gold', 40, 10); drop(B.x, B.y - 10, 'stormcore', 1); banner('The Stormlord is defeated! The skies clear.', '#ffe08a'); }
  if (B.type === 'forge') { drop(B.x, B.y - 10, 'gold', 18, 5); drop(B.x, B.y - 10, 'obsidian', 4); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Forgemaster cools for good!', '#ffe08a'); }
  if (B.type === 'drake') { B.rocks = []; drop(B.x, B.y - 10, 'gold', 40, 10); drop(B.x, B.y - 10, 'dragonscale', 1); banner('The Magma Drake is slain!', '#ffe08a'); }
  if (B.type === 'hag') { drop(B.x, B.y - 10, 'gold', 16, 5); drop(B.x, B.y - 10, 'bosskey', 1); banner('The Bog Hag is vanquished!', '#ffe08a'); }
  if (B.type === 'treant') { drop(B.x, B.y - 10, 'gold', 35, 10); drop(B.x, B.y - 10, 'heartwood', 1); banner('The Rotroot withers away!', '#ffe08a'); }
  if (B.type === 'wyrm') { drop(B.x, B.y - 10, 'gold', 25, 10); drop(B.x, B.y - 10, 'fang', 1); banner('The Sand Wyrm is slain!', '#ffe08a'); }
  if (B.type === 'wraith') { B.decoys = []; blizzard = 0; drop(B.x, B.y - 10, 'gold', 20, 10); drop(B.x, B.y - 10, 'frostheart', 1); banner('The Hailwraith fades!', '#ffe08a'); }
  const beaten = Object.keys(BOSS_INFO).filter(k => S.defeated[k]).length;
  setTimeout(() => toast(beaten === BOSSES.length ? `Every boss on Brindle Isle is defeated. You are a true hero!` : `Bosses defeated: ${beaten} / ${BOSSES.length}`, 3500), 1800);
  impact(12); SFX.play('craft'); save(); updateHUD();
  P.pendingCheer = null; setTimeout(() => { if (!P.act) { P.fx = 0; P.fy = 1; startAct('cheer', () => burst(P.x, P.y - 50, '#ffe08a', 20)); } }, 900);
}
function updateBosses(dt, fainted) {
  for (const B of BOSSES) {
    if ((S.defeated[B.type] || B.state === 'dead') && B.state !== 'dying') continue;
    B.anim += dt; B.hurt = Math.max(0, B.hurt - dt); B.shield = Math.max(0, B.shield - dt);
    if (B.active && B.state !== 'dying') tickPoison(B, dt, () => { B.hp = Math.max(1, B.hp - 1); floatText(B.x, B.y - 90 - B.z, '1', '#7fd17a'); bossBar(); });
    const d = Math.hypot(P.x - B.x, P.y - B.y), I = BOSS_INFO[B.type];
    if (B.ring) {
      const R = B.ring; R.r += 250 * dt;
      if (!R.hit && !fainted && !P.dash && Math.abs(Math.hypot((P.x - R.x), (P.y - R.y) / 0.6) - R.r) < 16) { R.hit = true; damagePlayer(2, R); }
      if (R.r > R.max) B.ring = null;
    }
    // leave the arena (or faint) and the boss resets, fully healed
    if (B.active && B.state !== 'dying' && (playerOutside(B) || fainted)) {
      Object.assign(B, { active: false, state: 'sleep', hp: B.max, phase: 1, seq: 0, x: B.hx, y: B.hy, z: 0, ring: null, alpha: 1 });
      for (const e of enemies) if (e.minion) e.remove = true;
      projectiles.length = 0; bossBar();
      B.decoys = []; B.under = false; B.trail = []; B.lash = null; B.hidden = -1; B.rocks = []; B.cool = 0; B.gust = null; B.jars = null; B.jarPhase = 0; B.heads = null; B.cd = 0; B.pillars = null; B.pillarPhase = 0; B.tailHits = 0; B.dir = undefined; B.beached = false; B.tgt = null; B.gong = null; B.tents = null; B.cut = 0; B.gears = null; B.glow = -1; if (B.type === 'wraith') blizzard = 0;
    if (!fainted) toast(`${B.name} waits for your return.`);
      continue;
    }
    if (B.state === 'sleep') {
      if (!fainted && !activeBoss() && Math.hypot(P.x - B.arena.cx, P.y - B.arena.cy) < I.wake) {
        B.state = 'wake'; B.st = 1.5; B.active = true; bossBar(); banner(`${B.name} awakens!`, '#ff9a9a'); SFX.play('boss'); impact(6);
      }
      continue;
    }
    if (B.state === 'dying') {
      B.st -= dt; if (!REDUCED_MOTION) shake = Math.max(shake, 4);
      if (Math.random() < dt * 14) burst(B.x + (rng() - 0.5) * 60, B.y - 30 + (rng() - 0.5) * 40, rng() < 0.5 ? I.col : '#ffe08a', 10);
      if (B.st <= 0) finishBoss(B);
      continue;
    }
    if (B.state === 'wake' || B.state === 'rest') { B.st -= dt; if (B.type === 'wraith') B.z += (20 + Math.sin(B.anim * 2) * 6 - B.z) * Math.min(1, dt * 4); if (B.type === 'wizard') B.z += (16 + Math.sin(B.anim * 2) * 6 - B.z) * 0.1; if (B.type === 'bat') B.z += (46 - B.z) * Math.min(1, dt * 4); if (B.st <= 0) bossNext(B); }
    else ({ knight2: updateKnight2, clock: updateClock, siren: updateSiren, kraken: updateKraken, elderfox: updateElderFox, koidragon: updateKoiDragon, chameleon: updateChameleon, serpent: updateSerpent, mole: updateMole, hydra: updateHydra, shadow: updateShadow, lich: updateLich, aegis: updateAegis, storm: updateStorm, forge: updateForge, drake: updateDrake, hag: updateHag, treant: updateTreant, mummy: updateMummy, scarab: updateScarab, wyrm: updateWyrm, jarl: updateJarl, wraith: updateWraith, slime: updateSlimeKing, golem: updateGolem, wizard: updateWizard, queen: updateQueen, crab: updateCrab, bat: updateBat, knight: updateKnight })[B.type](B, dt, fainted, d);
    const harmless = ['dazed', 'vanish', 'appear', 'dying', 'wake', 'dead', 'sink', 'lurk', 'recover', 'perch', 'burrow', 'under', 'hidden', 'diving', 'rumble', 'fight', 'stalk', 'swim', 'sink', 'slide', 'rise'].includes(B.state);
    if (B.active && !harmless && B.z < 14 && d < I.contact && !fainted) damagePlayer(2, B);
  }
}
function updateSlimeKing(B, dt, fainted, d) {
  switch (B.state) {
    case 'hop': {
      B.st += dt; const k = Math.min(1, B.st / 0.72);
      B.x = B.sx + (B.tx - B.sx) * k; B.y = B.sy + (B.ty - B.sy) * k; B.z = Math.sin(Math.PI * k) * 40;
      if (k >= 1) { B.z = 0; impact(4); SFX.play('thud'); burst(B.x, B.y, '#7ccf86', 10); if (d < 54 && !fainted) damagePlayer(1, B); bossRest(B, 0.3); }
      break;
    }
    case 'rise': B.st += dt; B.z = Math.min(1, B.st / 0.45) * 300; if (B.st >= 0.45) { B.state = 'hover'; B.st = 0; } break;
    case 'hover': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(dd, 160 * dt);
      B.x += dx / dd * sp; B.y += dy / dd * sp; clampBoss(B);
      if (B.st >= 1.25) { B.state = 'fall'; B.st = 0; }
      break;
    }
    case 'fall':
      B.st += dt; B.z = 300 * Math.max(0, 1 - B.st / 0.22);
      if (B.st >= 0.22) {
        B.z = 0; impact(12); hitStop = 0.09; SFX.play('slam');
        if (d < 58 && !fainted) damagePlayer(2, B);
        B.ring = { x: B.x, y: B.y, r: 30, max: 190, hit: false };
        for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; particles.push({ x: B.x + Math.cos(a) * 40, y: B.y + Math.sin(a) * 22, vx: Math.cos(a) * 140, vy: Math.sin(a) * 70 - 40, life: 0.6, color: '#d9cfb0', size: 5 }); }
        B.state = 'dazed'; B.st = 1.8; floatText(B.x, B.y - 100, 'Dazed! Hit him now!', '#ffe08a');
      }
      break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['minion', 'minion', 'minion'], 5); SFX.play('slime'); burst(B.x, B.y - 30, '#5fd0b0', 16); bossRest(B, 0.6); } break;
    case 'shards':
      B.st -= dt;
      if (B.st <= 0) {
        const off = B.volleys % 2 ? 0 : Math.PI / 12;
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + off; projectiles.push({ kind: 'shard', x: B.x, y: B.y - 30, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, ang: a, t: 0, life: 2.2 }); }
        SFX.play('crumble'); impact(3);
        B.volleys--; if (B.volleys > 0) B.st = 0.55; else bossRest(B, 0.6);
      }
      break;
  }
}
function fallingRocks(B, n, spread) {
  const A = B.arena;
  for (let i = 0; i < n; i++) projectiles.push({ kind: 'rock', fall: true, tx: A.x0 + 60 + rng() * (A.x1 - A.x0 - 120), ty: A.y0 + 80 + rng() * (A.y1 - A.y0 - 110), x: 0, y: 0, t: -rng() * spread, dur: 0.9, z: 320 });
}
function golemWallAhead(B, nx, ny) {
  const A = B.arena;
  return nx < A.x0 + 30 || nx > A.x1 - 30 || ny < A.y0 + 44 || ny > A.y1 - 12 || !walkable(nx + Math.sign(B.vx) * 26, ny) || !walkable(nx, ny + Math.sign(B.vy) * 10);
}
function updateGolem(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.25 : 1;
  switch (B.state) {
    case 'stomp': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 30) { B.x += dx / dd * 70 * fast * dt; B.y += dy / dd * 70 * fast * dt; clampBoss(B); }
      B.timer += dt; if (B.timer > 0.45) { B.timer = 0; impact(2); SFX.play('thud'); burst(B.x, B.y, '#b9ae98', 4); }
      if (B.st > 1.7) bossRest(B, 0.3);
      break;
    }
    case 'boulders':
      B.st -= dt;
      if (B.st <= 0) {
        const n = 2 + B.phase;
        for (let i = 0; i < n; i++) {
          const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 30 + rng() * 60;
          projectiles.push({ kind: 'rock', sx: B.x, sy: B.y - 60, x: B.x, y: B.y - 60, tx: P.x + Math.cos(a) * r, ty: P.y + Math.sin(a) * r, t: -i * 0.12, dur: 0.95, z: 0 });
        }
        SFX.play('swing'); bossRest(B, 0.6);
      }
      break;
    case 'chargeWind':
      B.st -= dt;
      if (B.st <= 0) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd * 330 * fast; B.vy = dy / dd * 330 * fast; B.state = 'charge'; B.st = 0; SFX.play('dash'); }
      break;
    case 'charge': {
      B.st += dt; const nx = B.x + B.vx * dt, ny = B.y + B.vy * dt;
      if (Math.random() < dt * 20) burst(B.x, B.y, '#b9ae98', 2);
      if (golemWallAhead(B, nx, ny)) {
        clampBoss(B); impact(12); hitStop = 0.1; SFX.play('slam'); fallingRocks(B, 3, 0.3);
        B.state = 'dazed'; B.st = 2.3; floatText(B.x, B.y - 100, 'Stunned! Hit him now!', '#ffe08a');
      } else { B.x = nx; B.y = ny; if (B.st > 1.3) bossRest(B, 0.5); }
      break;
    }
    case 'quake':
      B.st -= dt; B.z = Math.max(0, Math.sin(Math.PI * Math.min(1, 1 - B.st / 0.55)) * 26);
      if (B.st <= 0) {
        B.z = 0; impact(10); hitStop = 0.07; SFX.play('slam');
        B.ring = { x: B.x, y: B.y, r: 30, max: 230, hit: false };
        fallingRocks(B, 4 + B.phase * 2, 0.6);
        bossRest(B, 0.7);
      }
      break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function updateWizard(B, dt, fainted, d) {
  if (B.state !== 'dazed') B.z += (16 + Math.sin(B.anim * 2) * 6 - B.z) * Math.min(1, dt * 6); else B.z = Math.max(0, B.z - 60 * dt);
  switch (B.state) {
    case 'orb':
      B.st -= dt;
      if (B.st <= 0) { projectiles.push({ kind: 'orb', owner: B, x: B.x, y: B.y - 44 - B.z, ang: Math.atan2(P.y - B.y, P.x - B.x), sp: 105, t: 0, life: 9 }); SFX.play('wisp'); bossRest(B, 1.4); }
      break;
    case 'vanish':
      B.st -= dt; B.alpha = Math.max(0, B.st / 0.4);
      if (B.st <= 0) {
        const A = B.arena;
        for (let i = 0; i < 12; i++) { const x = A.x0 + 60 + rng() * (A.x1 - A.x0 - 120), y = A.y0 + 80 + rng() * (A.y1 - A.y0 - 110); if (Math.hypot(x - P.x, y - P.y) > 160 && walkable(x, y)) { B.x = x; B.y = y; break; } }
        B.state = 'appear'; B.st = 0.4; burst(B.x, B.y - 30, '#b58cff', 14);
      }
      break;
    case 'appear': B.st -= dt; B.alpha = 1 - Math.max(0, B.st / 0.4); if (B.st <= 0) { B.alpha = 1; bossRest(B, 0.3); } break;
    case 'spiral': {
      B.st -= dt; B.timer -= dt;
      if (B.timer <= 0) {
        B.timer = 0.11; const arms = B.phase === 3 ? 3 : 2;
        for (let i = 0; i < arms; i++) { const a = B.spin + i / arms * Math.PI * 2; projectiles.push({ kind: 'shard', x: B.x, y: B.y - 30 - B.z, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, ang: a, t: 0, life: 2.4 }); }
        B.spin += 0.42;
      }
      if (B.st <= 0) bossRest(B, 0.6);
      break;
    }
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['bat', 'ghost'], 4); SFX.play('wisp'); burst(B.x, B.y - 30, '#b58cff', 16); bossRest(B, 0.6); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.4); break;
  }
}

// ---------- Spider Queen ----------
function updateQueen(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.3 : 1;
  switch (B.state) {
    case 'skitter': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, side = Math.sin(B.anim * 6) * 0.9;
      if (dd > 40) { B.x += (dx / dd - dy / dd * side) * 150 * fast * dt; B.y += (dy / dd + dx / dd * side) * 150 * fast * dt; clampBoss(B); }
      if (B.st > 1.4) bossRest(B, 0.3);
      break;
    }
    case 'web':
      B.st -= dt;
      if (B.st <= 0) {
        const n = B.phase === 1 ? 3 : 5, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.28; projectiles.push({ kind: 'web', x: B.x, y: B.y - 30, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, t: 0, life: 2 }); }
        SFX.play('swing'); bossRest(B, 0.5);
      }
      break;
    case 'eggs': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['spider', 'spider'], 4); SFX.play('slime'); burst(B.x, B.y - 20, '#e6e0d0', 14); bossRest(B, 0.6); } break;
    case 'pounceWind':
      B.st -= dt;
      if (B.st <= 0) { B.sx = B.x; B.sy = B.y; B.x = P.x; B.y = P.y; clampBoss(B); B.tx = B.x; B.ty = B.y; B.x = B.sx; B.y = B.sy; B.state = 'pounce'; B.st = 0; SFX.play('leap'); }
      break;
    case 'pounce': {
      B.st += dt; const k = Math.min(1, B.st / 0.6);
      B.x = B.sx + (B.tx - B.sx) * k; B.y = B.sy + (B.ty - B.sy) * k; B.z = Math.sin(Math.PI * k) * 70;
      if (k >= 1) { B.z = 0; impact(9); SFX.play('slam'); if (d < 56 && !fainted) damagePlayer(2, B); burst(B.x, B.y, '#e6e0d0', 12); B.state = 'dazed'; B.st = 1.7; floatText(B.x, B.y - 100, 'Tangled! Hit her now!', '#ffe08a'); }
      break;
    }
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
// ---------- King Clawdius ----------
function updateCrab(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.3 : 1;
  switch (B.state) {
    case 'scuttle': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - 70 - B.y;
      B.x += Math.sign(dx) * Math.min(Math.abs(dx), 135 * fast * dt); B.y += Math.sign(dy) * Math.min(Math.abs(dy), 40 * dt); clampBoss(B);
      if (Math.random() < dt * 8) burst(B.x + (rng() - 0.5) * 50, B.y, '#d9cfb0', 2);
      if (B.st > 1.8) bossRest(B, 0.3);
      break;
    }
    case 'bubbles':
      B.st -= dt;
      if (B.st <= 0) {
        const ring = B.phase === 3, n = ring ? 12 : B.phase === 2 ? 7 : 5, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (let i = 0; i < n; i++) { const a = ring ? i / n * Math.PI * 2 : base + (i - (n - 1) / 2) * 0.3; projectiles.push({ kind: 'bubble', x: B.x, y: B.y - 30, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, t: 0, life: 4.5, ph: rng() * 6 }); }
        SFX.play('wisp'); bossRest(B, 0.6);
      }
      break;
    case 'sink': B.st -= dt; B.alpha = Math.max(0.12, B.st / 0.5); if (B.st <= 0) { B.state = 'lurk'; B.st = 0; } break;
    case 'lurk': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(dd, 150 * fast * dt);
      B.x += dx / dd * sp; B.y += dy / dd * sp; clampBoss(B);
      if (Math.random() < dt * 12) particles.push({ x: B.x + (rng() - 0.5) * 40, y: B.y - 4, vx: 0, vy: -30, life: 0.4, color: '#bfe8ff', size: 3 });
      if (B.st >= 1.3) {
        B.alpha = 1; impact(10); hitStop = 0.08; SFX.play('slam');
        if (d < 56 && !fainted) damagePlayer(2, B);
        B.ring = { x: B.x, y: B.y, r: 30, max: 180, hit: false };
        if (B.phase >= 2) for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; projectiles.push({ kind: 'bubble', x: B.x, y: B.y - 20, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80, t: 0, life: 3.5, ph: rng() * 6 }); }
        B.state = 'dazed'; B.st = 2.3; floatText(B.x, B.y - 100, 'Flipped over! Hit him now!', '#ffe08a');
      }
      break;
    }
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['crab', 'crab'], 3); SFX.play('slime'); bossRest(B, 0.6); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
// ---------- Nightwing ----------
function updateBat(B, dt, fainted, d) {
  const fly = 46, A = B.arena;
  switch (B.state) {
    case 'circle': {
      B.st += dt; const a = B.anim * 1.6, tx = A.cx + Math.cos(a) * 130, ty = A.cy + Math.sin(a) * 80;
      const dx = tx - B.x, dy = ty - B.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(dd, 220 * dt);
      B.x += dx / dd * sp; B.y += dy / dd * sp; B.z += (fly - B.z) * Math.min(1, dt * 5);
      if (B.st > 2) bossRest(B, 0.2);
      break;
    }
    case 'swoopWind':
      B.st -= dt; B.z += (fly - B.z) * Math.min(1, dt * 5);
      if (B.st <= 0) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd * 330; B.vy = dy / dd * 330; B.state = 'swoop'; B.st = 0; SFX.play('dash'); }
      break;
    case 'swoop':
      B.st += dt; B.x += B.vx * dt; B.y += B.vy * dt; clampBoss(B);
      B.z = fly - Math.sin(Math.PI * Math.min(1, B.st / 0.75)) * (fly - 4);
      if (B.st >= 0.75) bossRest(B, 0.35);
      break;
    case 'screech':
      B.st -= dt; B.z += (fly - B.z) * Math.min(1, dt * 5);
      if (B.st <= 0) {
        B.ring = { x: B.x, y: B.y, r: 30, max: 230, hit: false }; SFX.play('boss'); impact(5);
        B.volleys--; if (B.volleys > 0) B.st = 0.55; else bossRest(B, 0.5);
      }
      break;
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['bat', 'bat', 'bat'], 5); SFX.play('wisp'); bossRest(B, 0.5); } break;
    case 'perch': B.st -= dt; B.z = Math.max(0, B.z - 140 * dt); if (B.st <= 0) { B.z = 0; B.state = 'dazed'; B.st = 2.4; floatText(B.x, B.y - 90, 'Exhausted! Hit it now!', '#ffe08a'); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.4); break;
  }
}
// ---------- the Bone Knight ----------
function updateKnight(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.25 : 1;
  switch (B.state) {
    case 'guard': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 64) { B.x += dx / dd * 58 * fast * dt; B.y += dy / dd * 58 * fast * dt; clampBoss(B); }
      if (B.st > 1.4) bossNext(B);
      break;
    }
    case 'slashWind':
      B.st -= dt;
      if (B.st <= 0) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd; B.vy = dy / dd; B.state = 'slash'; B.st = 0; B.hitDone = false; SFX.play('swing'); }
      break;
    case 'slash':
      B.st += dt;
      if (B.st < 0.25) { B.x += B.vx * 280 * fast * dt; B.y += B.vy * 280 * fast * dt; clampBoss(B); }
      if (!B.hitDone && B.st > 0.12) {
        B.hitDone = true; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
        if (dd < 78 && (dx * B.vx + dy * B.vy) / dd > 0.1 && !fainted) damagePlayer(2, B);
      }
      if (B.st >= 0.35) { B.state = 'recover'; B.st = B.phase === 3 ? 0.8 : 1.0; }
      break;
    case 'recover': B.st -= dt; if (B.st <= 0) bossRest(B, 0.2); break;
    case 'spin': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      B.x += dx / dd * 125 * fast * dt; B.y += dy / dd * 125 * fast * dt; clampBoss(B);
      if (dd < 62 && !fainted) damagePlayer(2, B);
      if (Math.random() < dt * 20) burst(B.x + (rng() - 0.5) * 80, B.y - 20, '#c8d0e0', 2);
      if (B.st > 1.6) { B.state = 'dazed'; B.st = 2.0; floatText(B.x, B.y - 100, 'Dizzy! Hit him now!', '#ffe08a'); }
      break;
    }
    case 'ghosts': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['ghost', 'ghost'], 4); SFX.play('wisp'); bossRest(B, 0.5); } break;
    case 'plunge':
      B.st -= dt;
      if (B.st <= 0) {
        impact(10); hitStop = 0.07; SFX.play('slam'); B.ring = { x: B.x, y: B.y, r: 30, max: 220, hit: false };
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; projectiles.push({ kind: 'shard', x: B.x, y: B.y - 30, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, ang: a, t: 0, life: 2.2 }); }
        B.state = 'recover'; B.st = 1.2;
      }
      break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}

// ---------- Jarl Frostbeard ----------
function updateJarl(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.25 : 1;
  switch (B.state) {
    case 'stride': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 50) { B.x += dx / dd * 72 * fast * dt; B.y += dy / dd * 72 * fast * dt; clampBoss(B); }
      B.timer += dt; if (B.timer > 0.5) { B.timer = 0; SFX.play('thud'); burst(B.x, B.y, '#eef6ff', 4); }
      if (B.st > 1.5) bossRest(B, 0.2);
      break;
    }
    case 'axeWind': {
      B.st -= dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < 170) { B.x -= dx / dd * 170 * dt; B.y -= dy / dd * 170 * dt; clampBoss(B); } // step back to make room for the throw
      if (B.st <= 0) { projectiles.push({ kind: 'axe', vx: 0, vy: 0, owner: B, x: B.x + 20, y: B.y - 50, tx: P.x + dx / dd * 80, ty: P.y - 14 + dy / dd * 80, t: 0 }); B.state = 'axeOut'; B.st = 0; SFX.play('swing'); }
      break;
    }
    case 'axeOut': B.st += dt; if (B.st > 7) bossRest(B, 0.3); break;
    case 'spikesWind':
      B.st -= dt;
      if (B.st <= 0) {
        const lines = B.phase === 3 ? 5 : 3, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (let l = 0; l < lines; l++) { const a = base + (l - (lines - 1) / 2) * 0.42; for (let i = 1; i <= 8; i++) projectiles.push({ kind: 'spike', vx: 0, vy: 0, x: B.x + Math.cos(a) * i * 36, y: B.y + Math.sin(a) * i * 30, t: -i * 0.07, life: 0.95 }); }
        impact(7); SFX.play('slam'); bossRest(B, 0.9);
      }
      break;
    case 'warcry': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['raider', 'raider'], 3); burst(B.x, B.y - 40, '#ec5257', 14); bossRest(B, 0.6); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
// ---------- the Hailwraith ----------
function updateWraith(B, dt, fainted, d) {
  const A = B.arena;
  if (B.state !== 'dazed') B.z += (20 + Math.sin(B.anim * 2) * 6 - B.z) * Math.min(1, dt * 4); else B.z = Math.max(0, B.z - 60 * dt);
  if (B.state !== 'blizzard') blizzard = Math.max(0, blizzard - dt);
  const drift = (o, sp, ph) => {
    const a = B.anim * 0.9 + ph, tx = A.cx + Math.cos(a) * 110, ty = A.cy + Math.sin(a * 1.3) * 70, dx = tx - o.x, dy = ty - o.y, dd = Math.hypot(dx, dy) || 1;
    o.x += dx / dd * Math.min(dd, sp * dt); o.y += dy / dd * Math.min(dd, sp * dt);
  };
  const bolt = (o, spread) => { const a = Math.atan2(P.y - 14 - (o.y - 40), P.x - o.x) + spread; projectiles.push({ kind: 'ice', x: o.x, y: o.y - 40 - B.z, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, ang: a, t: 0, life: 2.2 }); };
  switch (B.state) {
    case 'drift': B.st += dt; drift(B, 90, 0); if (B.st > 1.8) bossRest(B, 0.2); break;
    case 'hail':
      B.st -= dt; B.timer -= dt; drift(B, 40, 0);
      if (B.timer <= 0) {
        B.timer = B.phase === 3 ? 0.12 : 0.18;
        const near = rng() < 0.45, tx = near ? P.x + (rng() - 0.5) * 70 : A.cx + (rng() - 0.5) * A.r * 1.6, ty = near ? P.y + (rng() - 0.5) * 50 : A.cy + (rng() - 0.5) * A.r * 1.3;
        projectiles.push({ kind: 'rock', ice: true, fall: true, tx, ty, x: tx, y: ty, t: 0, dur: 0.8, z: 320 });
      }
      if (B.st <= 0) bossRest(B, 0.4);
      break;
    case 'breathWind':
      B.st -= dt;
      if (B.st <= 0) { const n = B.phase === 3 ? 11 : 7; for (let i = 0; i < n; i++) bolt(B, (i - (n - 1) / 2) * 0.13); SFX.play('wisp'); bossRest(B, 0.6); }
      break;
    case 'mirrorWind':
      B.st -= dt;
      if (B.st <= 0) {
        const pts = [];
        for (let i = 0; i < 30 && pts.length < 3; i++) { const a = rng() * Math.PI * 2, r = rng() * A.r * 0.75, x = A.cx + Math.cos(a) * r, y = A.cy + Math.sin(a) * r * 0.8; if (Math.hypot(x - P.x, y - P.y) > 110) pts.push([x, y]); }
        while (pts.length < 3) pts.push([A.cx + (pts.length - 1) * 90, A.cy]);
        burst(B.x, B.y - 40, '#dff6ff', 16); [B.x, B.y] = pts[0];
        B.decoys = [{ x: pts[1][0], y: pts[1][1], ph: 2.1 }, { x: pts[2][0], y: pts[2][1], ph: 4.2 }];
        for (const p of pts) burst(p[0], p[1] - 40, '#dff6ff', 12);
        B.state = 'mirror'; B.st = 0; B.timer = 1.2; SFX.play('wisp');
      }
      break;
    case 'mirror':
      B.st += dt; B.timer -= dt; drift(B, 50, 0);
      for (const dc of B.decoys || []) if (!dc.popped) drift(dc, 50, dc.ph);
      if (B.timer <= 0) { B.timer = 1.6; bolt(B, 0); for (const dc of B.decoys || []) if (!dc.popped) bolt(dc, 0); }
      if (B.st > 7) { B.decoys = []; bossRest(B, 0.3); }
      break;
    case 'blizzard':
      B.st -= dt; B.timer -= dt; blizzard = Math.min(1, blizzard + dt * 1.5); drift(B, 60, 0);
      if (B.timer <= 0) { B.timer = 0.9; projectiles.push({ kind: 'wisp', x: B.x, y: B.y - 40 - B.z, ang: Math.atan2(P.y - B.y, P.x - B.x), t: 0, life: 3.6 }); }
      if (B.st <= 0) bossRest(B, 0.5);
      break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.4); break;
  }
}

// ---------- the Sand Wyrm ----------
function wyrmSegments(B) {
  const segs = [];
  for (let i = 1; i <= 10; i++) { const p = B.trail[i * 6]; segs.push(p ? { x: p[0], y: p[1] } : { x: B.hx + Math.cos(i * 0.7) * i * 5, y: B.hy + 10 + Math.sin(i * 0.7) * i * 3.5 }); }
  return segs;
}
function updateWyrm(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.25 : 1;
  B.trail = B.trail || [];
  const push = () => { B.trail.unshift([B.x, B.y]); if (B.trail.length > 66) B.trail.length = 66; };
  if (B.state !== 'burrow' && !fainted && P.inv <= 0) for (const sg of wyrmSegments(B).slice(1)) if (Math.hypot(P.x - sg.x, P.y - sg.y) < 18) { damagePlayer(1, sg); break; }
  switch (B.state) {
    case 'slither': {
      B.st += dt; const a = Math.atan2(P.y - B.y, P.x - B.x) + Math.sin(B.anim * 3) * 0.9;
      B.x += Math.cos(a) * 125 * fast * dt; B.y += Math.sin(a) * 125 * fast * dt; clampBoss(B); push();
      if (Math.random() < dt * 10) burst(B.x, B.y, '#e8c88a', 2);
      if (B.st > 2.4) bossRest(B, 0.3);
      break;
    }
    case 'spitWind':
      B.st -= dt; B.z = (1 - B.st / 0.6) * 22;
      if (B.st <= 0) {
        const n = B.phase === 1 ? 3 : 5, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.25; projectiles.push({ kind: 'sand', x: B.x, y: B.y - 40, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, ang: a, t: 0, life: 2.2 }); }
        B.z = 0; SFX.play('swing'); bossRest(B, 0.5);
      }
      break;
    case 'burrow': {
      if (!B.under) { B.under = true; B.trail.length = 0; burst(B.x, B.y, '#e8c88a', 16); SFX.play('crumble'); }
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(dd, 165 * fast * dt);
      B.x += dx / dd * sp; B.y += dy / dd * sp; clampBoss(B);
      if (Math.random() < dt * 25) particles.push({ x: B.x + (rng() - 0.5) * 30, y: B.y, vx: (rng() - 0.5) * 40, vy: -50, life: 0.5, color: '#e8c88a', size: 4 });
      if (B.st > 1.5) {
        B.under = false; impact(10); hitStop = 0.08; SFX.play('slam');
        if (d < 56 && !fainted) damagePlayer(2, B);
        B.ring = { x: B.x, y: B.y, r: 30, max: 170, hit: false };
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; projectiles.push({ kind: 'sand', x: B.x, y: B.y - 30, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, ang: a, t: 0, life: 1.8 }); }
        B.state = 'dazed'; B.st = 1.9; floatText(B.x, B.y - 100, 'Stuck in the open! Hit it now!', '#ffe08a');
      }
      break;
    }
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['scorpion', 'scorpion', 'scorpion'], 4); burst(B.x, B.y, '#e8c88a', 14); bossRest(B, 0.6); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawWyrm(c, B) {
  if (B.state === 'burrow') {
    const pulse = 0.45 + Math.sin(time * 18) * 0.3;
    c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y, 46, 22, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#c99a5a'; ellipse(c, B.x, B.y - 4, 30, 12); c.fillStyle = '#e8c88a'; ellipse(c, B.x, B.y - 8, 22, 8);
    c.strokeStyle = '#7a4b27'; c.lineWidth = 2; c.beginPath(); c.moveTo(B.x - 14, B.y - 6); c.lineTo(B.x - 4, B.y - 10); c.lineTo(B.x + 8, B.y - 5); c.stroke();
    return;
  }
  const segs = wyrmSegments(B);
  for (let i = segs.length - 1; i >= 0; i--) {
    const sg = segs[i], r = 17 - i * 0.7;
    c.fillStyle = 'rgba(0,0,0,.22)'; ellipse(c, sg.x, sg.y + 3, r, r * 0.4);
    c.fillStyle = '#7a4b27'; circle(c, sg.x, sg.y - r, r + 1.5); c.fillStyle = i % 2 ? '#b07a3c' : '#c98a46'; circle(c, sg.x, sg.y - r, r);
    c.fillStyle = 'rgba(255,233,180,.35)'; ellipse(c, sg.x - r * 0.3, sg.y - r * 1.4, r * 0.4, r * 0.25);
  }
  const hx = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), hy = B.y - 22 - B.z;
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 26, 9);
  c.globalAlpha = 1; bossFlash(c, B);
  if (B.state === 'sleep') { c.fillStyle = '#c99a5a'; ellipse(c, B.x, B.y - 2, 34, 12); }
  c.fillStyle = '#5a3418'; circle(c, hx, hy, 26); c.fillStyle = '#d29a52'; circle(c, hx, hy, 24);
  c.fillStyle = '#b07a3c'; c.fillRect(hx - 20, hy - 6, 40, 4); c.fillRect(hx - 18, hy + 6, 36, 4);
  const open = B.state === 'spitWind' ? 8 : 3;
  c.strokeStyle = '#2a1608'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(hx - 12, hy + 16); c.quadraticCurveTo(hx - 20 - open, hy + 28, hx - 6, hy + 30 + open); c.stroke();
  c.beginPath(); c.moveTo(hx + 12, hy + 16); c.quadraticCurveTo(hx + 20 + open, hy + 28, hx + 6, hy + 30 + open); c.stroke(); c.lineCap = 'butt';
  if (B.state !== 'sleep') { c.fillStyle = '#ec5257'; circle(c, hx - 9, hy - 10, 4); circle(c, hx + 9, hy - 10, 4); c.fillStyle = '#ffe08a'; c.fillRect(hx - 10, hy - 12, 2, 2); c.fillRect(hx + 8, hy - 12, 2, 2); }
  c.globalAlpha = 1;
  if (B.state === 'spitWind') bossWarn(c, B, hy - 40);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, hx, hy - 34, 24);
}

// ---------- the Mummy King ----------
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); };
function updateMummy(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.3 : 1;
  switch (B.state) {
    case 'shamble': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 50) { B.x += dx / dd * 50 * fast * dt; B.y += dy / dd * 50 * fast * dt; clampBoss(B); }
      if (B.st > 1.6) bossRest(B, 0.2);
      break;
    }
    case 'lashWind':
      B.st -= dt;
      if (B.st <= 0) { const a = Math.atan2(P.y - 14 - (B.y - 40), P.x - B.x); B.lash = { a, t: 0, hit: false }; B.state = 'lash'; B.st = 0; SFX.play('swing'); }
      break;
    case 'lash': {
      B.st += dt; const L = B.lash, len = Math.min(1, B.st / 0.12) * 190, ax = B.x, ay = B.y - 40, bx = ax + Math.cos(L.a) * len, by = ay + Math.sin(L.a) * len;
      if (!L.hit && !fainted && !P.dash && segDist(P.x, P.y - 14, ax, ay, bx, by) < 18) { L.hit = true; damagePlayer(2, B); }
      if (B.st > 0.4) { B.lash = null; B.state = 'dazed'; B.st = B.phase === 3 ? 1.0 : 1.3; floatText(B.x, B.y - 100, 'Unraveled! Strike now!', '#ffe08a'); }
      break;
    }
    case 'curse': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['scarab', 'scarab', 'scarab'], 5); SFX.play('wisp'); burst(B.x, B.y - 30, '#9fd36a', 14); bossRest(B, 0.6); } break;
    case 'sink': B.st -= dt; B.alpha = Math.max(0, B.st / 0.5); if (B.st <= 0) { B.state = 'under'; B.st = 0.8; } break;
    case 'under': {
      B.st -= dt; B.x += (P.x - B.x) * Math.min(1, dt * 4); B.y += (P.y - B.y) * Math.min(1, dt * 4); clampBoss(B);
      if (B.st <= 0) { B.alpha = 1; B.state = 'rise'; B.st = 0.35; }
      break;
    }
    case 'rise': B.st -= dt; if (B.st <= 0) { impact(8); SFX.play('slam'); if (d < 54 && !fainted) damagePlayer(2, B); burst(B.x, B.y, '#e8c88a', 18); B.ring = { x: B.x, y: B.y, r: 30, max: 130, hit: false }; bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawMummy(c, B) {
  if (B.state === 'under' || B.state === 'rise') {
    const pulse = 0.45 + Math.sin(time * 18) * 0.3;
    c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y, 44, 20, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#c99a5a'; ellipse(c, B.x, B.y - 2, 26, 10);
    if (B.state === 'under') return;
  }
  let sx = 1, sy = 1, ox = 0;
  if (B.state === 'shamble') { ox = Math.sin(B.anim * 4) * 3; sy = 1 - Math.abs(Math.sin(B.anim * 4)) * 0.04; }
  else if (B.state === 'lashWind' || B.state === 'curse') ox = Math.sin(time * 60) * 2;
  else if (B.state === 'dazed') { sy = 0.9; sx = 1.06; }
  else if (B.state === 'rise') { const k = 1 - B.st / 0.35; sy = k; sx = 1; }
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.7; ox = Math.sin(time * 70) * 4; }
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 32, 11);
  c.globalAlpha = B.alpha; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 10, sx, sy, 0, () => sprB(c, 'mummy', 0, 0, 5.5));
  c.globalAlpha = 1;
  if (B.state !== 'dying' && B.alpha > 0.5) { const C = ATLAS.crown; c.drawImage(IMG.kenney_atlas, C[0], C[1] + 8, 16, 8, Math.round(B.x + ox - 22), Math.round(B.y - 104 * sy), 44, 22); }
  if (B.lash) {
    const L = B.lash, len = Math.min(1, B.st / 0.12) * 190, ax = B.x, ay = B.y - 40;
    c.strokeStyle = '#efe6cf'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(ax, ay);
    for (let i = 1; i <= 8; i++) { const k = i / 8, w = Math.sin(k * 9 + time * 30) * 5 * (1 - k); c.lineTo(ax + Math.cos(L.a) * len * k - Math.sin(L.a) * w, ay + Math.sin(L.a) * len * k + Math.cos(L.a) * w); }
    c.stroke(); c.strokeStyle = 'rgba(150,130,100,.6)'; c.lineWidth = 2; c.stroke(); c.lineCap = 'butt';
  }
  if (B.state === 'lashWind') { const a = Math.atan2(P.y - 14 - (B.y - 40), P.x - B.x); c.strokeStyle = 'rgba(236,82,87,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(B.x, B.y - 40); c.lineTo(B.x + Math.cos(a) * 190, B.y - 40 + Math.sin(a) * 190); c.stroke(); bossWarn(c, B, B.y - 112); }
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 96, 24);
}
// ---------- the Golden Scarab ----------
function updateScarab(B, dt, fainted, d) {
  const fast = B.phase === 3 ? 1.25 : 1, A = B.arena;
  switch (B.state) {
    case 'scuttle': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1;
      if (dd > 40) { B.x += dx / dd * 110 * fast * dt; B.y += dy / dd * 110 * fast * dt; clampBoss(B); }
      if (B.st > 1.4) bossRest(B, 0.2);
      break;
    }
    case 'rollWind':
      B.st -= dt;
      if (B.st <= 0) {
        const n = B.phase === 3 ? 2 : 1, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (let i = 0; i < n; i++) { const a = base + (i ? 0.6 : 0); projectiles.push({ kind: 'sunball', owner: B, x: B.x + Math.cos(a) * 40, y: B.y - 20, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, t: 0, life: 6, bounces: 0 }); }
        SFX.play('dash'); bossRest(B, 0.8);
      }
      break;
    case 'beamWind': B.st -= dt; B.z = Math.min(30, B.z + 60 * dt); if (B.st <= 0) { B.state = 'beam'; B.st = 0; B.beamA = Math.atan2(P.y - B.y, P.x - B.x) - 1.3; SFX.play('boss'); } break;
    case 'beam': {
      B.st += dt; B.beamA += (B.phase === 3 ? 2.0 : 1.5) * dt;
      const n = B.phase === 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const a = B.beamA + i * Math.PI, ax = B.x, ay = B.y - 30 - B.z, bx = ax + Math.cos(a) * 420, by = ay + Math.sin(a) * 420;
        if (!fainted && !P.dash && P.inv <= 0 && segDist(P.x, P.y - 14, ax, ay, bx, by) < 14) damagePlayer(2, { x: ax, y: ay });
      }
      if (Math.random() < dt * 20) particles.push({ x: B.x + (rng() - 0.5) * 30, y: B.y - 40 - B.z, vx: 0, vy: -30, life: 0.4, color: '#ffe08a', size: 3 });
      if (B.st > 2.6) { B.state = 'dazed'; B.st = 2.0; floatText(B.x, B.y - 100, 'Overheated! Hit it now!', '#ffe08a'); }
      break;
    }
    case 'rise': B.st += dt; B.z = Math.min(1, B.st / 0.45) * 280; if (B.st >= 0.45) { B.state = 'hover'; B.st = 0; } break;
    case 'hover': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, sp = Math.min(dd, 170 * dt);
      B.x += dx / dd * sp; B.y += dy / dd * sp; clampBoss(B);
      if (B.st >= 1.1) { B.state = 'fall'; B.st = 0; }
      break;
    }
    case 'fall':
      B.st += dt; B.z = 280 * Math.max(0, 1 - B.st / 0.22);
      if (B.st >= 0.22) { B.z = 0; impact(12); hitStop = 0.09; SFX.play('slam'); if (d < 58 && !fainted) damagePlayer(2, B); B.ring = { x: B.x, y: B.y, r: 30, max: 200, hit: false }; B.state = 'dazed'; B.st = 1.6; floatText(B.x, B.y - 100, 'Stunned! Hit it now!', '#ffe08a'); }
      break;
    case 'dazed': B.st -= dt; B.z = Math.max(0, B.z - 80 * dt); if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawScarab(c, B) {
  if (B.state === 'hover' || B.state === 'fall' || B.state === 'rise') {
    const pulse = 0.45 + Math.sin(time * 18) * 0.3;
    c.fillStyle = `rgba(236,82,87,${pulse * 0.3})`; ellipse(c, B.x, B.y, 58, 26); c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y, 58, 26, 0, 0, Math.PI * 2); c.stroke();
  }
  if (B.state === 'beam') {
    const n = B.phase === 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const a = B.beamA + i * Math.PI, ax = B.x, ay = B.y - 30 - B.z, bx = ax + Math.cos(a) * 420, by = ay + Math.sin(a) * 420;
      c.lineCap = 'round'; c.strokeStyle = 'rgba(255,214,90,.35)'; c.lineWidth = 26; c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      c.strokeStyle = 'rgba(255,240,180,.85)'; c.lineWidth = 10; c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.stroke(); c.lineCap = 'butt';
    }
  }
  if (B.state === 'beamWind') { const a = Math.atan2(P.y - B.y, P.x - B.x) - 1.3; c.strokeStyle = `rgba(255,214,90,${0.3 + Math.sin(time * 30) * 0.2})`; c.lineWidth = 2; c.beginPath(); c.moveTo(B.x, B.y - 30 - B.z); c.lineTo(B.x + Math.cos(a) * 420, B.y - 30 - B.z + Math.sin(a) * 420); c.stroke(); }
  let sx = 1, sy = 1, ox = 0;
  if (B.state === 'scuttle') { ox = Math.sin(B.anim * 20) * 2; }
  else if (B.state === 'rollWind' || B.state === 'beamWind') ox = Math.sin(time * 60) * 2;
  else if (B.state === 'dazed') { sy = 0.88; sx = 1.08; }
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.6; ox = Math.sin(time * 70) * 4; }
  const shr = Math.max(0.3, 1 - B.z / 300);
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 50 * shr, 16 * shr);
  c.fillStyle = `rgba(255,214,90,${0.18 + Math.sin(time * 3) * 0.06})`; circle(c, B.x, B.y - 40 - B.z, 60);
  c.globalAlpha = 1; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 10 - B.z, sx, sy, 0, () => sprB(c, 'scarab_gold', 0, 0, 6.5));
  c.globalAlpha = 1;
  if (B.state === 'rollWind' || B.state === 'beamWind') bossWarn(c, B, B.y - 120 - B.z);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 100, 28);
}
function drawTraps(c, inView) {
  for (const tr of TRAPS) {
    if (!inView(tr.x + 16, tr.y + 16, 40)) continue;
    const st = trapState(tr), x = tr.x, y = tr.y;
    c.fillStyle = 'rgba(60,40,20,.35)'; c.fillRect(x + 3, y + 3, 26, 26);
    for (const [ox, oy] of [[9, 9], [23, 9], [9, 23], [23, 23]]) {
      if (st === 0) { c.fillStyle = '#2a1a10'; circle(c, x + ox, y + oy, 3); }
      else { const hgt = st === 1 ? 5 : 13; c.fillStyle = '#cfd8e0'; c.beginPath(); c.moveTo(x + ox - 4, y + oy + 3); c.lineTo(x + ox, y + oy + 3 - hgt); c.lineTo(x + ox + 4, y + oy + 3); c.closePath(); c.fill(); c.fillStyle = '#7a8088'; c.fillRect(x + ox - 4, y + oy + 2, 8, 2); }
    }
  }
}
function drawPyramid(c) {
  const x = TOMB.x, y = TOMB.y;
  c.fillStyle = 'rgba(0,0,0,.25)'; ellipse(c, x, y - 2, 70, 14);
  c.fillStyle = '#b8955a'; c.beginPath(); c.moveTo(x - 66, y - 2); c.lineTo(x, y - 92); c.lineTo(x + 66, y - 2); c.closePath(); c.fill();
  c.fillStyle = '#d6b678'; c.beginPath(); c.moveTo(x - 66, y - 2); c.lineTo(x, y - 92); c.lineTo(x - 6, y - 2); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(110,80,40,.5)'; c.lineWidth = 1; for (let i = 1; i < 7; i++) { const yy = y - 2 - i * 13, half = 66 * (1 - i * 13 / 90); c.beginPath(); c.moveTo(x - half, yy); c.lineTo(x + half, yy); c.stroke(); }
  c.fillStyle = '#1a120a'; c.fillRect(x - 14, y - 34, 28, 32); c.fillStyle = '#8a6a34'; c.fillRect(x - 18, y - 38, 36, 5);
  c.fillStyle = '#f4b740'; circle(c, x, y - 56, 5); c.fillStyle = '#1a120a'; c.fillRect(x - 1, y - 60, 2, 8);
  if (!S.defeated.wyrm) { c.fillStyle = '#d9b47a'; ellipse(c, x, y - 6, 22, 14); c.fillStyle = '#e8c88a'; ellipse(c, x, y - 12, 14, 9); }
  else { const g = 0.18 + Math.sin(time * 3) * 0.06; c.fillStyle = `rgba(255,214,90,${g})`; circle(c, x, y - 18, 12); }
}

// ---------- Mirewood creatures: spore clouds, toads, wisps ----------
const HAZARDS = [];
function updateHazards(dt, fainted) {
  if (!fainted) tickPoison(P, dt, () => { if (S.hp > 1) { S.hp--; updateHUD(); floatText(P.x, P.y - 56, '-1', '#7fd17a'); } });
  for (let i = HAZARDS.length - 1; i >= 0; i--) {
    const h = HAZARDS[i]; h.t += dt; h.tick -= dt;
    if (!fainted && Math.hypot(P.x - h.x, (P.y - h.y) / 0.7) < h.r) {
      if (h.pollen) { if (!gearA().warm) P.slow = Math.max(P.slow || 0, 1); if (Math.random() < 0.05) floatText(P.x, P.y - 60, 'Sleepy pollen...', '#ffd6ea'); }
      else if (!gearA().warm && !h.fire) P.slow = Math.max(P.slow || 0, 0.4);
      if (h.tick <= 0) { h.tick = 1; damagePlayer(1, { x: h.x, y: h.y - 40 }); }
    }
    if (h.t > h.life) HAZARDS.splice(i, 1);
  }
}
function drawHazards(c) {
  for (const h of HAZARDS) {
    const k = Math.min(1, h.t * 3, (h.life - h.t) * 1.5);
    if (h.fire) {
      c.fillStyle = `rgba(40,20,16,${0.5 * k})`; ellipse(c, h.x, h.y, h.r, h.r * 0.5);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, fx = h.x + Math.cos(a) * h.r * 0.5, fy = h.y + Math.sin(a) * h.r * 0.25, fh = (8 + Math.sin(time * 18 + i * 2) * 4) * k; c.fillStyle = `rgba(255,140,40,${0.7 * k})`; ellipse(c, fx, fy - fh * 0.6, 4, fh); c.fillStyle = `rgba(255,230,140,${0.7 * k})`; ellipse(c, fx, fy - fh * 0.4, 2, fh * 0.5); }
      continue;
    }
    if (h.ink) { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + h.t * 0.5, rr = h.r * 0.5; c.fillStyle = `rgba(20,14,30,${0.45 * k})`; circle(c, h.x + Math.cos(a) * rr, h.y - 10 + Math.sin(a) * rr * 0.6, h.r * 0.55); } continue; }
    if (h.pollen) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + h.t * 0.8, rr = h.r * 0.55; c.fillStyle = `rgba(255,190,220,${0.25 * k})`; circle(c, h.x + Math.cos(a) * rr, h.y - 10 + Math.sin(a) * rr * 0.6, h.r * 0.45); } continue; }
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + h.t * 0.6, rr = h.r * 0.55;
      c.fillStyle = `rgba(150,200,90,${0.22 * k})`; circle(c, h.x + Math.cos(a) * rr, h.y - 10 + Math.sin(a) * rr * 0.6, h.r * 0.5);
    }
    c.fillStyle = `rgba(190,230,120,${0.25 * k})`; circle(c, h.x, h.y - 12, h.r * 0.45);
  }
}
function updateMireFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'shroom') {
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 4 + rng() * 2; HAZARDS.push({ x: e.x, y: e.y, r: 52, t: 0, life: 3.2, tick: 0.3 }); SFX.play('wisp'); } return true; }
    if (chase) { moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 95 && e.cd <= 0) { e.state = 'windup'; e.st = 0.6; } } else wander(D.sp);
    touch(D.dmg); return true;
  }
  if (ai === 'toad') {
    if (e.state === 'leap') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); e.lift = Math.sin(Math.PI * Math.max(0, 1 - e.st / 0.45)) * 22; if (e.st <= 0) { e.state = 'move'; e.lift = 0; e.wt = 0.9 + rng() * 0.6; burst(e.x, e.y, '#6a8a3a', 4); } return true; }
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'tongue'; e.st = 0.3; e.tongue = Math.atan2(P.y - 14 - (e.y - 18), P.x - e.x); e.thit = false; } return true; }
    if (e.state === 'tongue') {
      e.st -= dt; const len = Math.min(1, (0.3 - e.st) / 0.1) * 95, ax = e.x, ay = e.y - 18, bx = ax + Math.cos(e.tongue) * len, by = ay + Math.sin(e.tongue) * len;
      if (!e.thit && !fainted && !P.dash && segDist(P.x, P.y - 14, ax, ay, bx, by) < 14) { e.thit = true; damagePlayer(1, e); }
      if (e.st <= 0) { e.state = 'move'; e.cd = 1.6; e.tongue = null; } return true;
    }
    e.wt -= dt;
    if (chase && d < 80 && e.cd <= 0) { e.state = 'windup'; e.st = 0.35; return true; }
    if (e.wt <= 0) { e.wt = 1; const a = chase ? Math.atan2(dy, dx) : rng() * Math.PI * 2, dist = chase ? Math.min(d - 30, 130) : 60; e.state = 'leap'; e.st = 0.45; e.lx = Math.cos(a) * Math.max(40, dist) / 0.45; e.ly = Math.sin(a) * Math.max(40, dist) / 0.45; }
    touch(D.dmg); return true;
  }
  if (ai === 'wisp') {
    if (e.state === 'attack') {
      e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt);
      if (d < 22 && !fainted) { damagePlayer(1, e); burst(e.x, e.y - 20, '#bfffd0', 16); e.hp = 0; killEnemy(e); return true; }
      if (e.st <= 0) { e.state = 'move'; e.cd = 2 + rng() * 2; } return true;
    }
    if (chase) {
      const a = e.anim * 2.2 + e.hx, tx = P.x + Math.cos(a) * 80, ty = P.y + Math.sin(a) * 55, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1;
      moveEnemy(e, ex / el * Math.min(el, 150 * dt), ey / el * Math.min(el, 150 * dt));
      if (e.cd <= 0) { e.state = 'attack'; e.st = 0.6; e.lx = dx / d * 270; e.ly = dy / d * 270; }
    } else moveEnemy(e, Math.cos(e.anim * 1.3) * 30 * dt + (e.hx - e.x) * 0.3 * dt, Math.sin(e.anim) * 30 * dt + (e.hy - e.y) * 0.3 * dt);
    return true;
  }
  return updateEmberFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
const PROC_DRAW = {
  shroom(c, e, k) {
    const puff = e.state === 'windup' ? 1 + (1 - e.st / 0.6) * 0.3 : 1, bob = Math.abs(Math.sin(e.anim * 5)) * 2;
    shadow(c, e.x, e.y + 2, 12 * k, 4 * k);
    c.fillStyle = '#e6dcc8'; c.fillRect(e.x - 5 * k, e.y - 14 * k - bob, 10 * k, 14 * k);
    c.fillStyle = '#2a1a10'; c.fillRect(e.x - 3 * k, e.y - 10 * k - bob, 2, 2); c.fillRect(e.x + 2 * k, e.y - 10 * k - bob, 2, 2);
    c.fillStyle = '#7a2e5a'; ellipse(c, e.x, e.y - 18 * k - bob, 15 * k * puff, 9 * k * puff); c.fillStyle = '#b5468a'; ellipse(c, e.x, e.y - 20 * k - bob, 13 * k * puff, 6 * k * puff);
    c.fillStyle = '#f2e6d6'; for (const [ox, oy] of [[-6, -21], [4, -23], [7, -18]]) circle(c, e.x + ox * k * puff, e.y + oy * k - bob, 2 * k);
  },
  toad(c, e, k) {
    const lift = e.lift || 0, sq = e.state === 'windup' ? 0.85 : 1;
    shadow(c, e.x, e.y + 2, 13 * k, 4 * k);
    c.fillStyle = '#3d5a24'; ellipse(c, e.x, e.y - 9 * k - lift, 15 * k / sq, 10 * k * sq); c.fillStyle = '#6a8a3a'; ellipse(c, e.x, e.y - 10 * k - lift, 13 * k / sq, 8 * k * sq);
    c.fillStyle = '#c9d68a'; ellipse(c, e.x, e.y - 6 * k - lift, 8 * k, 4 * k);
    for (const ox of [-6, 6]) { c.fillStyle = '#6a8a3a'; circle(c, e.x + ox * k, e.y - 18 * k - lift, 4 * k); c.fillStyle = '#ffe08a'; circle(c, e.x + ox * k, e.y - 18 * k - lift, 2.5 * k); c.fillStyle = '#1a1210'; c.fillRect(e.x + ox * k - 1, e.y - 19 * k - lift, 2, 2); }
    if (e.tongue !== null && e.tongue !== undefined && e.state === 'tongue') { const len = Math.min(1, (0.3 - e.st) / 0.1) * 95; c.strokeStyle = '#e45a8f'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.x, e.y - 18); c.lineTo(e.x + Math.cos(e.tongue) * len, e.y - 18 + Math.sin(e.tongue) * len); c.stroke(); c.lineCap = 'butt'; }
  },
  wisp(c, e, k) {
    const fl = 0.7 + Math.sin(time * 14 + e.hx) * 0.3, y = e.y - 26 + Math.sin(e.anim * 3) * 4;
    c.fillStyle = `rgba(160,255,190,${0.18 * fl})`; circle(c, e.x, y, 20 * k); c.fillStyle = `rgba(190,255,210,${0.4 * fl})`; circle(c, e.x, y, 11 * k);
    c.fillStyle = '#f0fff4'; circle(c, e.x, y, 5 * k);
    if (Math.random() < 0.3) particles.push({ x: e.x + (Math.random() - 0.5) * 8, y: y + 6, vx: 0, vy: 15, life: 0.35, color: '#bfffd0', size: 2 });
  },
};
function drawBigShroom(c, o) {
  const g = 0.15 + Math.sin(time * 2 + o.x) * 0.06, hue = o.v ? ['#4a7ad1', '#d1a24a', '#b5468a'][o.v % 3] : '#b5468a';
  c.fillStyle = `rgba(190,255,200,${g})`; circle(c, o.x, o.y - 50, 40);
  shadow(c, o.x, o.y + 3, 18, 6);
  c.fillStyle = '#d8ccb4'; c.fillRect(o.x - 8, o.y - 44, 16, 46); c.fillStyle = '#b8ac94'; c.fillRect(o.x + 2, o.y - 44, 6, 46);
  c.fillStyle = '#2a1a20'; ellipse(c, o.x, o.y - 50, 36, 20); c.fillStyle = hue; ellipse(c, o.x, o.y - 53, 34, 17);
  c.fillStyle = 'rgba(255,255,255,.75)'; for (const [ox, oy, r] of [[-16, -56, 4], [2, -62, 5], [18, -52, 3.5], [-4, -48, 3]]) circle(c, o.x + ox, o.y + oy, r);
}

// ---------- the Bog Hag ----------
function hagCauldrons(B) { return B.cauldrons || (B.cauldrons = [[3, 15], [8, 15], [5.5, 19.5]].map(([x, y]) => ({ x: (HOLLOW_D.x0 + x) * T + 16, y: y * T + 16 }))); }
function hagReveal(B, ok) {
  const cs = hagCauldrons(B), cd = cs[B.hidden];
  B.x = cd.x; B.y = cd.y + 20; B.alpha = 1; B.hidden = -1; burst(B.x, B.y - 30, '#7fd17a', 18);
  if (ok) { B.state = 'dazed'; B.st = 2.4; impact(8); SFX.play('slam'); floatText(B.x, B.y - 100, 'Found her! Strike now!', '#ffe08a'); }
  else { B.ring = { x: B.x, y: B.y, r: 30, max: 150, hit: false }; SFX.play('wisp'); bossRest(B, 0.4); }
}
function hitCauldrons(B, hx, hy, rad) {
  if (B.type !== 'hag' || B.state !== 'hidden') return;
  hagCauldrons(B).forEach((cd, i) => {
    if (Math.hypot(cd.x - hx, cd.y - 10 - hy) > rad + 18 || cd.cool > 0) return;
    cd.cool = 0.4; burst(cd.x, cd.y - 20, '#5aa65c', 10); SFX.play('mine');
    if (i === B.hidden) hagReveal(B, true);
    else { floatText(cd.x, cd.y - 50, 'Empty! Something hops out...', '#c8e8b0'); summonMinions(B, ['toad'], 6); }
  });
}
function updateHag(B, dt, fainted, d) {
  const A = B.arena, cs = hagCauldrons(B);
  for (const cd of cs) cd.cool = Math.max(0, (cd.cool || 0) - dt);
  switch (B.state) {
    case 'float': {
      B.st += dt; const a = B.anim * 1.4, tx = A.cx + Math.cos(a) * 90, ty = A.cy + Math.sin(a * 1.3) * 60, dx = tx - B.x, dy = ty - B.y, dd = Math.hypot(dx, dy) || 1;
      B.x += dx / dd * Math.min(dd, 90 * dt); B.y += dy / dd * Math.min(dd, 90 * dt);
      if (B.st > 1.3) bossRest(B, 0.2);
      break;
    }
    case 'brew':
      B.st -= dt;
      if (B.st <= 0) {
        const n = B.phase === 1 ? 2 : 3;
        for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, r = i === 0 ? 0 : 50 + rng() * 50; projectiles.push({ kind: 'rock', flask: true, sx: B.x, sy: B.y - 50, x: B.x, y: B.y - 50, tx: P.x + Math.cos(a) * r, ty: P.y + Math.sin(a) * r, t: -i * 0.15, dur: 0.9, z: 0 }); }
        SFX.play('swing'); bossRest(B, 0.6);
      }
      break;
    case 'diving': B.st -= dt; B.alpha = Math.max(0, B.st / 0.4); if (B.st <= 0) { B.hidden = Math.floor(rng() * cs.length); B.state = 'hidden'; B.st = 4.2; } break;
    case 'hidden': B.st -= dt; if (B.st <= 0) hagReveal(B, false); break;
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['toad', 'toad'], 5); SFX.play('wisp'); bossRest(B, 0.5); } break;
    case 'hexring':
      B.st -= dt;
      if (B.st <= 0) { for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; projectiles.push({ kind: 'hex', x: B.x, y: B.y - 40, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, ang: a, t: 0, life: 2.4 }); } SFX.play('wisp'); bossRest(B, 0.6); }
      break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawHag(c, B) {
  const cs = hagCauldrons(B);
  cs.forEach((cd, i) => {
    const real = B.state === 'hidden' && i === B.hidden;
    shadow(c, cd.x, cd.y + 4, 22, 6);
    c.fillStyle = '#1e1a20'; ellipse(c, cd.x, cd.y - 8, 22, 18); c.fillStyle = '#2b2735'; ellipse(c, cd.x, cd.y - 12, 20, 15);
    c.fillStyle = '#1e1a20'; ellipse(c, cd.x, cd.y - 24, 22, 7); c.fillStyle = '#4f9a3a'; ellipse(c, cd.x, cd.y - 24, 18, 5);
    const n = real ? 4 : 2;
    for (let k = 0; k < n; k++) { const ph = (time * (real ? 2.2 : 1.3) + k * 0.37 + i) % 1; c.fillStyle = `rgba(160,230,120,${1 - ph})`; circle(c, cd.x - 10 + k * 7, cd.y - 26 - ph * 20, 2 + ph * 2); }
    c.fillStyle = `rgba(130,220,110,${real ? 0.22 : 0.12})`; circle(c, cd.x, cd.y - 28, 22);
  });
  if (B.state === 'hidden' || B.alpha <= 0.02) return;
  let sx = 1, sy = 1, ox = 0;
  if (B.state === 'brew' || B.state === 'summon' || B.state === 'hexring') ox = Math.sin(time * 60) * 2;
  else if (B.state === 'dazed') { sy = 0.9; sx = 1.06; }
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.6; ox = Math.sin(time * 70) * 4; }
  const bob = B.state === 'dazed' ? 0 : 8 + Math.sin(B.anim * 3) * 4;
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 26, 9);
  c.globalAlpha = B.alpha; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 8 - bob, sx, sy, 0, () => sprB(c, 'mage_hex', 0, 0, 5));
  c.globalAlpha = 1;
  if (B.state === 'brew') bossWarn(c, B, B.y - 100);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 86, 24);
}
// ---------- the Rotroot ----------
function updateTreant(B, dt, fainted, d) {
  const A = B.arena;
  switch (B.state) {
    case 'rootsWind':
      B.st -= dt;
      if (B.st <= 0) {
        const lines = B.phase === 3 ? 5 : 3, base = Math.atan2(P.y - B.y, P.x - B.x);
        for (let l = 0; l < lines; l++) { const a = base + (l - (lines - 1) / 2) * 0.4; for (let i = 1; i <= 9; i++) projectiles.push({ kind: 'spike', root: true, vx: 0, vy: 0, x: B.x + Math.cos(a) * i * 34, y: B.y + Math.sin(a) * i * 26, t: -i * 0.07, life: 0.95 }); }
        impact(6); SFX.play('crumble'); bossRest(B, 0.8);
      }
      break;
    case 'sweepWind': B.st -= dt; if (B.st <= 0) { B.state = 'sweep'; B.st = 0; B.sweepA = Math.atan2(P.y - B.y, P.x - B.x); B.sweepHit = false; SFX.play('swing'); } break;
    case 'sweep': {
      B.st += dt; const k = Math.min(1, B.st / 0.35), a0 = B.sweepA - 1.3, cur = a0 + 2.6 * k;
      const pa = Math.atan2(P.y - (B.y - 30), P.x - B.x), pd = Math.hypot(P.x - B.x, P.y - (B.y - 30));
      let diff = pa - a0; while (diff < 0) diff += Math.PI * 2; while (diff > Math.PI * 2) diff -= Math.PI * 2;
      if (!B.sweepHit && !fainted && !P.dash && pd < 175 && pd > 30 && diff <= cur - a0) { B.sweepHit = true; damagePlayer(2, B); }
      if (B.st > 0.45) bossRest(B, 0.5);
      break;
    }
    case 'spores':
      B.st -= dt;
      if (B.st <= 0) {
        for (let i = 0; i < 4; i++) HAZARDS.push({ x: A.x0 + 70 + rng() * (A.x1 - A.x0 - 140), y: A.y0 + 90 + rng() * (A.y1 - A.y0 - 120), r: 50, t: 0, life: 4, tick: 0.5 });
        HAZARDS.push({ x: P.x, y: P.y, r: 46, t: -0.4, life: 3.5, tick: 0.8 });
        if (B.phase >= 2) summonMinions(B, ['shroom', 'shroom'], 4);
        SFX.play('wisp'); bossRest(B, 0.6);
      }
      break;
    case 'slamWind':
      B.st -= dt;
      if (B.st <= 0) { impact(12); hitStop = 0.09; SFX.play('slam'); if (d < 80 && !fainted) damagePlayer(2, B); B.ring = { x: B.x, y: B.y, r: 40, max: 230, hit: false }; B.state = 'dazed'; B.st = 2.4; floatText(B.x, B.y - 140, 'Its heart is exposed! Strike now!', '#ffe08a'); }
      break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.4); break;
  }
  // it shuffles slowly toward you between attacks
  if (B.state === 'rest') { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; if (dd > 120) { B.x += dx / dd * 22 * dt; B.y += dy / dd * 14 * dt; clampBoss(B); } }
}
function drawTreant(c, B) {
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y, sway = Math.sin(B.anim * 1.2) * 3;
  const raise = B.state === 'slamWind' ? (1 - B.st / 0.8) : 0, sink = B.state === 'dying' ? 1 - Math.max(0, B.st) / 1.8 : 0;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y + 4, 62, 18);
  c.globalAlpha = 1; bossFlash(c, B);
  // roots
  c.strokeStyle = '#4a3220'; c.lineWidth = 9; c.lineCap = 'round';
  for (const [dx, dy] of [[-50, 8], [-26, 14], [30, 14], [52, 6]]) { c.beginPath(); c.moveTo(x, y - 10); c.quadraticCurveTo(x + dx * 0.6, y, x + dx, y + dy); c.stroke(); }
  // arms
  const armA = B.state === 'sweep' ? (B.sweepA - 1.3 + 2.6 * Math.min(1, B.st / 0.35)) : null;
  for (const side of [-1, 1]) {
    const lift = raise * 50, ang = armA !== null && side === 1 ? armA : side * (0.9 - raise * 0.7) + Math.PI / 2 - Math.PI / 2;
    c.strokeStyle = '#5a3a22'; c.lineWidth = 12; c.beginPath(); c.moveTo(x + side * 30, y - 80);
    if (armA !== null && side === 1) c.lineTo(x + Math.cos(armA) * 150, y - 30 + Math.sin(armA) * 150);
    else c.quadraticCurveTo(x + side * 70, y - 100 - lift, x + side * 95, y - 60 - lift * 1.6 + sway);
    c.stroke();
  }
  c.lineCap = 'butt';
  // trunk
  const th = 120 * (1 - sink * 0.6);
  c.fillStyle = '#3d2a1a'; c.beginPath(); c.moveTo(x - 42, y); c.lineTo(x - 34, y - th); c.lineTo(x + 34, y - th); c.lineTo(x + 42, y); c.closePath(); c.fill();
  c.fillStyle = '#5a3e26'; c.beginPath(); c.moveTo(x - 36, y); c.lineTo(x - 30, y - th + 4); c.lineTo(x + 10, y - th + 4); c.lineTo(x + 6, y); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(30,20,10,.5)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 20 + i * 12, y - 6); c.lineTo(x - 18 + i * 11, y - th + 20); c.stroke(); }
  // canopy
  for (const [ox, oy, r, col] of [[-40, -th - 10, 34, '#24402a'], [40, -th - 8, 32, '#24402a'], [0, -th - 30, 42, '#2f5236'], [-18, -th - 26, 22, '#3d6a44'], [24, -th - 34, 18, '#3d6a44']]) { c.fillStyle = col; circle(c, x + ox + sway * 0.5, y + oy, r); }
  for (let i = 0; i < 5; i++) { c.fillStyle = '#b5468a'; circle(c, x - 40 + i * 20 + sway * 0.5, y - th - 18 + (i % 2) * 14, 3); }
  // face
  const ey = y - th + 34, glow = B.state === 'dazed' ? '#ffe08a' : '#9fffb0';
  c.fillStyle = '#1a120a'; ellipse(c, x - 14, ey, 8, 6); ellipse(c, x + 14, ey, 8, 6); c.fillStyle = glow; circle(c, x - 14, ey, 3.5); circle(c, x + 14, ey, 3.5);
  c.fillStyle = '#1a120a'; c.beginPath(); c.ellipse(x, ey + 24, 14, B.state === 'slamWind' || B.state === 'rootsWind' ? 9 : 5, 0, 0, Math.PI * 2); c.fill();
  // heart
  if (B.state === 'dazed' || B.state === 'slamWind') { const p = 0.6 + Math.sin(time * 10) * 0.3; c.fillStyle = `rgba(140,255,150,${p * 0.4})`; circle(c, x, y - 48, 20); c.fillStyle = '#7fe07a'; circle(c, x, y - 48, 9); c.fillStyle = '#e6ffe0'; circle(c, x - 3, y - 51, 3); }
  c.globalAlpha = 1;
  if (B.state === 'rootsWind' || B.state === 'sweepWind' || B.state === 'slamWind') bossWarn(c, B, y - th - 80);
  if (B.state === 'sweepWind') { const a = Math.atan2(P.y - B.y, P.x - B.x); c.fillStyle = 'rgba(236,82,87,.18)'; c.beginPath(); c.moveTo(x, y - 30); c.arc(x, y - 30, 175, a - 1.3, a + 1.3); c.closePath(); c.fill(); }
  if (B.state === 'sleep') bossZ(c, { x: x + 20, y: y - th + 40, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - th - 50, 30);
}
function drawHollowTree(c) {
  const x = HOLLOW.x, y = HOLLOW.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 80, 16);
  c.strokeStyle = '#3d2a1a'; c.lineWidth = 12; c.lineCap = 'round';
  for (const [dx, dy] of [[-70, 6], [-40, 12], [44, 12], [72, 4]]) { c.beginPath(); c.moveTo(x + dx * 0.3, y - 14); c.quadraticCurveTo(x + dx * 0.7, y - 4, x + dx, y + dy); c.stroke(); }
  c.lineCap = 'butt';
  c.fillStyle = '#3d2a1a'; c.fillRect(x - 54, y - 110, 108, 110); c.fillStyle = '#5a3e26'; c.fillRect(x - 50, y - 110, 44, 110);
  c.fillStyle = '#120d08'; c.beginPath(); c.moveTo(x - 18, y - 2); c.lineTo(x - 18, y - 36); c.quadraticCurveTo(x, y - 60, x + 18, y - 36); c.lineTo(x + 18, y - 2); c.closePath(); c.fill();
  for (const [ox, oy, r, col] of [[-50, -126, 40, '#24402a'], [50, -122, 38, '#24402a'], [0, -150, 50, '#2f5236'], [-24, -146, 26, '#3d6a44'], [28, -156, 22, '#3d6a44']]) { c.fillStyle = col; circle(c, x + ox, y + oy, r); }
  const g = 0.18 + Math.sin(time * 3) * 0.06; c.fillStyle = `rgba(140,255,150,${g})`; circle(c, x, y - 20, 14);
}
function drawVine(c, r) {
  const s = r.shake ? Math.sin(time * 70) * 2 : 0;
  shadow(c, 0, -2, 16, 5);
  c.strokeStyle = '#2f5a2a'; c.lineWidth = 6; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-14 + i * 14 + s, 0); c.quadraticCurveTo(-20 + i * 18, -22, -8 + i * 10 + s, -40 + i * 4); c.stroke(); }
  c.strokeStyle = '#4f8a3a'; c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-14 + i * 14 + s, 0); c.quadraticCurveTo(-20 + i * 18, -22, -8 + i * 10 + s, -40 + i * 4); c.stroke(); }
  c.lineCap = 'butt'; c.fillStyle = '#e6dcc8'; for (const [ox, oy] of [[-12, -14], [6, -24], [14, -10], [-4, -32]]) { c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + 4, oy - 2); c.lineTo(ox + 1, oy + 3); c.closePath(); c.fill(); }
  c.fillStyle = '#b5468a'; circle(c, 2, -36, 3);
}
// ---------- Cinder Peak creatures: magmites, imps, boulderbacks, salamanders ----------
function updateEmberFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'magmite') {
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { const a = Math.atan2(dy, dx), dist = Math.min(d, 120); e.state = 'leap'; e.st = 0.42; e.lx = Math.cos(a) * dist / 0.42; e.ly = Math.sin(a) * dist / 0.42; } return true; }
    if (e.state === 'leap') {
      e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); e.lift = Math.sin(Math.PI * Math.max(0, 1 - e.st / 0.42)) * 26;
      if (e.st <= 0) { e.state = 'move'; e.lift = 0; e.cd = 1.4 + rng() * 0.6; HAZARDS.push({ x: e.x, y: e.y, r: 28, t: 0, life: 2.4, tick: 0.25, fire: true }); burst(e.x, e.y, '#ffb347', 8); SFX.play('slime'); touch(D.dmg, 26); }
      return true;
    }
    if (chase) { if (e.cd <= 0) { e.state = 'windup'; e.st = 0.4; } else moveEnemy(e, dx / d * D.sp * 0.4 * dt, dy / d * D.sp * 0.4 * dt); } else wander(D.sp);
    touch(D.dmg); return true;
  }
  if (ai === 'imp') {
    if (e.state === 'windup') {
      e.st -= dt;
      if (e.st <= 0) {
        const a = Math.atan2(P.y - 14 - (e.y - 34), P.x - e.x);
        projectiles.push({ kind: 'fire', x: e.x, y: e.y - 34, vx: Math.cos(a) * 175, vy: Math.sin(a) * 175, ang: a, t: 0, life: 2.4 });
        SFX.play('swing'); e.shots = (e.shots || 0) + 1; e.state = 'move'; e.cd = 2 + rng();
        if (e.shots % 3 === 0) { // blink to a new spot near you
          burst(e.x, e.y - 30, '#ff9a3c', 12);
          for (let i = 0; i < 10; i++) { const b = rng() * Math.PI * 2, nx = P.x + Math.cos(b) * 130, ny = P.y + Math.sin(b) * 100; if (walkable(nx, ny)) { e.x = nx; e.y = ny; break; } }
          burst(e.x, e.y - 30, '#ff9a3c', 12); e.spawnT = 0.3;
        }
      }
      return true;
    }
    if (chase) {
      const a = e.anim * 1.6 + e.hx, tx = P.x + Math.cos(a) * 120, ty = P.y + Math.sin(a) * 80, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1;
      moveEnemy(e, ex / el * Math.min(el, D.sp * dt), ey / el * Math.min(el, D.sp * dt));
      if (e.cd <= 0) { e.state = 'windup'; e.st = 0.5; }
    } else moveEnemy(e, Math.cos(e.anim * 1.3) * 30 * dt + (e.hx - e.x) * 0.3 * dt, Math.sin(e.anim) * 30 * dt + (e.hy - e.y) * 0.3 * dt);
    return true;
  }
  if (ai === 'boulder') {
    if (e.state === 'flipped') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 1.5; } return true; }
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'roll'; e.st = 1.5; e.lx = dx / d * 300; e.ly = dy / d * 300; e.roll = 0; SFX.play('leap'); } return true; }
    if (e.state === 'roll') {
      e.st -= dt; const ox = e.x, oy = e.y; moveEnemy(e, e.lx * dt, e.ly * dt); e.roll += dt * 14;
      const moved = Math.hypot(e.x - ox, e.y - oy);
      if (!e.rhit && d < 26 && !fainted) { e.rhit = true; damagePlayer(2, e); }
      if (moved < 300 * dt * 0.35 && e.st < 1.4) { e.state = 'flipped'; e.st = 2.4; e.rhit = false; impact(6); SFX.play('crumble'); burst(e.x, e.y - 12, '#9c9690', 12); floatText(e.x, e.y - 50, 'Flipped!', '#ffe08a'); return true; }
      if (Math.random() < dt * 20) particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.4, color: '#6c6764', size: 3 });
      if (e.st <= 0) { e.state = 'move'; e.cd = 2.2; e.rhit = false; }
      return true;
    }
    if (chase) { moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 230 && d > 60 && e.cd <= 0) { e.state = 'windup'; e.st = 0.7; } } else wander(D.sp);
    touch(D.dmg, 22); return true;
  }
  if (ai === 'sala') {
    if (e.state === 'windup') {
      e.st -= dt;
      if (e.st <= 0) { const a = Math.atan2(P.y - 14 - (e.y - 12), P.x - e.x); for (const off of [-0.32, 0, 0.32]) projectiles.push({ kind: 'fire', weak: true, x: e.x, y: e.y - 12, vx: Math.cos(a + off) * 150, vy: Math.sin(a + off) * 150, ang: a + off, t: 0, life: 1.3 }); SFX.play('swing'); e.state = 'move'; e.cd = 2.4 + rng(); }
      return true;
    }
    if (e.state === 'dart') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (e.st <= 0) { e.state = 'move'; e.wt = 0.4 + rng() * 0.4; } touch(D.dmg); return true; }
    e.wt -= dt;
    if (chase && d < 180 && e.cd <= 0) { e.state = 'windup'; e.st = 0.5; return true; }
    if (chase && e.wt <= 0) { const side = rng() < 0.5 ? 1 : -1, a = Math.atan2(dy, dx) + side * (d < 110 ? 1.6 : 0.6); e.state = 'dart'; e.st = 0.35; e.lx = Math.cos(a) * D.sp * 2.4; e.ly = Math.sin(a) * D.sp * 2.4; e.face = Math.cos(a) < 0 ? -1 : 1; return true; }
    if (!chase) wander(D.sp);
    touch(D.dmg); return true;
  }
  return updateSkyFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
Object.assign(PROC_DRAW, {
  magmite(c, e, k) {
    const lift = e.lift || 0, sq = e.state === 'windup' ? 0.8 : 1, gl = 0.6 + Math.sin(time * 6 + e.hx) * 0.3;
    shadow(c, e.x, e.y + 2, 13 * k, 4 * k);
    c.fillStyle = `rgba(255,140,40,${0.22 * gl})`; circle(c, e.x, e.y - 10 * k - lift, 18 * k);
    c.fillStyle = '#2a1a16'; ellipse(c, e.x, e.y - 9 * k - lift, 14 * k / sq, 10 * k * sq);
    c.fillStyle = '#ff7a2a'; ellipse(c, e.x, e.y - 7 * k - lift, 10 * k / sq, 6 * k * sq);
    c.fillStyle = '#3d2620'; for (const [ox, oy, r] of [[-6, -13, 4], [5, -14, 3.5], [0, -17, 3]]) circle(c, e.x + ox * k / sq, e.y + oy * k * sq - lift, r * k);
    c.fillStyle = '#ffe08a'; c.fillRect(e.x - 4 * k, e.y - 10 * k - lift, 2, 2); c.fillRect(e.x + 3 * k, e.y - 10 * k - lift, 2, 2);
    if (Math.random() < 0.15) particles.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y - 16 - lift, vx: 0, vy: -30, life: 0.4, color: '#ffb347', size: 2 });
  },
  imp(c, e, k) {
    const y = e.y - 34 + Math.sin(e.anim * 4) * 4, flap = Math.sin(time * 22) * 0.6, f = P.x < e.x ? -1 : 1;
    shadow(c, e.x, e.y + 2, 8 * k, 3 * k);
    c.fillStyle = '#5a1a1a';
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(e.x + s * 4 * k, y - 2); c.lineTo(e.x + s * 18 * k, y - 10 * k - flap * 8 * s * s); c.lineTo(e.x + s * 14 * k, y + 2); c.closePath(); c.fill(); }
    c.fillStyle = '#c8402a'; ellipse(c, e.x, y, 7 * k, 9 * k); c.fillStyle = '#e8603a'; circle(c, e.x, y - 9 * k, 6 * k);
    c.fillStyle = '#2a1010'; c.beginPath(); c.moveTo(e.x - 5 * k, y - 13 * k); c.lineTo(e.x - 7 * k, y - 20 * k); c.lineTo(e.x - 2 * k, y - 14 * k); c.fill(); c.beginPath(); c.moveTo(e.x + 5 * k, y - 13 * k); c.lineTo(e.x + 7 * k, y - 20 * k); c.lineTo(e.x + 2 * k, y - 14 * k); c.fill();
    c.fillStyle = '#ffe08a'; c.fillRect(e.x - 3 * k + f, y - 10 * k, 2, 2); c.fillRect(e.x + 2 * k + f, y - 10 * k, 2, 2);
    c.strokeStyle = '#c8402a'; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x, y + 8 * k); c.quadraticCurveTo(e.x - f * 10, y + 14, e.x - f * 12, y + 6); c.stroke();
    if (e.state === 'windup') { const r = 4 + (1 - e.st / 0.5) * 5; c.fillStyle = 'rgba(255,180,70,.5)'; circle(c, e.x + f * 10, y - 4, r + 3); c.fillStyle = '#fff2c4'; circle(c, e.x + f * 10, y - 4, r * 0.6); }
  },
  boulder(c, e, k) {
    const st = e.state, gl = 0.5 + Math.sin(time * 5 + e.hx) * 0.3;
    shadow(c, e.x, e.y + 2, 18 * k, 5 * k);
    if (st === 'roll') {
      c.save(); c.translate(e.x, e.y - 14 * k); c.rotate(e.roll);
      c.fillStyle = '#4a3e38'; circle(c, 0, 0, 15 * k); c.fillStyle = '#6a5a52'; circle(c, -2, -2, 12 * k);
      c.strokeStyle = `rgba(255,140,40,${gl})`; c.lineWidth = 2; c.beginPath(); c.moveTo(-10 * k, 0); c.lineTo(10 * k, 0); c.moveTo(0, -10 * k); c.lineTo(0, 10 * k); c.stroke(); c.restore(); return;
    }
    if (st === 'flipped') {
      c.fillStyle = '#4a3e38'; ellipse(c, e.x, e.y - 8 * k, 17 * k, 9 * k); c.fillStyle = '#c9a37a'; ellipse(c, e.x, e.y - 11 * k, 13 * k, 6 * k);
      c.strokeStyle = '#3d2a20'; c.lineWidth = 3; for (let i = 0; i < 4; i++) { const w = Math.sin(time * 18 + i) * 4; c.beginPath(); c.moveTo(e.x - 9 * k + i * 6 * k, e.y - 15 * k); c.lineTo(e.x - 11 * k + i * 7 * k + w, e.y - 22 * k); c.stroke(); }
      drawStars(c, e.x, e.y - 30, 12); return;
    }
    const shake = st === 'windup' ? Math.sin(time * 60) * 2 : 0, walk = Math.sin(e.anim * 8) * 2, f = P.x < e.x ? -1 : 1;
    c.fillStyle = '#3d2a20'; for (const ox of [-9, -3, 4, 10]) c.fillRect(e.x + ox * k - 2, e.y - 6 + (ox % 2 ? walk : -walk), 4, 7);
    if (st !== 'windup') { c.fillStyle = '#7a5a40'; circle(c, e.x + f * 16 * k, e.y - 10 * k, 5 * k); c.fillStyle = '#ffe08a'; c.fillRect(e.x + f * 18 * k - 1, e.y - 12 * k, 2, 2); }
    c.fillStyle = '#4a3e38'; ellipse(c, e.x + shake, e.y - 13 * k, 17 * k, 12 * k); c.fillStyle = '#6a5a52'; ellipse(c, e.x - 3 + shake, e.y - 16 * k, 12 * k, 8 * k);
    c.strokeStyle = `rgba(255,140,40,${gl})`; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x - 10 * k + shake, e.y - 12 * k); c.lineTo(e.x - 2 + shake, e.y - 20 * k); c.lineTo(e.x + 8 * k + shake, e.y - 13 * k); c.stroke();
  },
  sala(c, e, k) {
    const f = e.face || (P.x < e.x ? -1 : 1), sw = Math.sin(e.anim * (e.state === 'dart' ? 30 : 8)) * 4;
    shadow(c, e.x, e.y + 2, 16 * k, 4 * k);
    c.strokeStyle = '#a8302a'; c.lineWidth = 6 * k; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.x, e.y - 6); c.quadraticCurveTo(e.x - f * 12, e.y - 4 + sw, e.x - f * 22 * k, e.y - 8 - sw); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#3d1a14'; for (const [ox, s] of [[-6, 1], [6, -1]]) { c.fillRect(e.x + ox * k - 2, e.y - 4 + s * sw * 0.4, 4, 6); }
    c.fillStyle = '#c8402a'; ellipse(c, e.x, e.y - 7 * k, 11 * k, 6 * k); c.fillStyle = '#ffb347'; for (const ox of [-5, 0, 5]) circle(c, e.x + ox * k, e.y - 9 * k, 1.8 * k);
    c.fillStyle = '#c8402a'; ellipse(c, e.x + f * 11 * k, e.y - 9 * k, 6 * k, 4.5 * k); c.fillStyle = '#ffe08a'; c.fillRect(e.x + f * 13 * k - 1, e.y - 12 * k, 2, 2);
    if (e.state === 'windup') { c.fillStyle = `rgba(255,170,60,${0.4 + (1 - e.st / 0.5) * 0.5})`; circle(c, e.x + f * 18 * k, e.y - 9 * k, 4 + (1 - e.st / 0.5) * 4); }
  },
});
function drawCinderGround(c, camX, camY, vw, vh, inView) {
  const g = 0.5 + Math.sin(time * 2) * 0.5;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let ty = Math.floor(camY / T); ty < (camY + vh) / T; ty++) for (let tx = Math.floor(camX / T); tx < (camX + vw) / T; tx++) {
    if (tileAt(tx, ty) !== LAVA) continue;
    const h = hash(tx, ty), p = 0.5 + Math.sin(time * 2.4 + h * 9) * 0.5;
    c.fillStyle = `rgba(255,120,30,${0.08 + p * 0.12})`; c.fillRect(tx * T, ty * T, T, T);
    if (h > 0.7) { c.fillStyle = `rgba(255,230,140,${p * 0.5})`; ellipse(c, tx * T + 8 + h * 16, ty * T + 10 + (1 - h) * 14, 3 + p * 2, 1.5 + p); }
  }
  c.restore();
  for (const v of VENTS) {
    if (!inView(v.x, v.y, 40)) continue;
    const st = ventState(v);
    c.fillStyle = '#1a1210'; ellipse(c, v.x, v.y, 14, 6); c.fillStyle = st ? '#ff7a2a' : '#5a2a1a'; ellipse(c, v.x, v.y, 8, 3);
    if (st === 1) { const ph = ((time + v.off) % 3.2 - 2.1) / 0.65; c.strokeStyle = `rgba(255,140,40,${0.4 + ph * 0.5})`; c.lineWidth = 2; c.beginPath(); c.ellipse(v.x, v.y, 14 + ph * 6, 6 + ph * 3, 0, 0, Math.PI * 2); c.stroke(); if (Math.random() < 0.3) particles.push({ x: v.x + (Math.random() - 0.5) * 12, y: v.y, vx: 0, vy: -40, life: 0.5, color: '#7a6a64', size: 4 }); }
    else if (st === 0 && Math.random() < 0.02) particles.push({ x: v.x, y: v.y - 2, vx: (Math.random() - 0.5) * 8, vy: -18, life: 0.9, color: '#5a5250', size: 4 });
  }
}
function drawVentFlames(c, inView) {
  for (const v of VENTS) {
    if (ventState(v) !== 2 || !inView(v.x, v.y, 80)) continue;
    const ph = ((time + v.off) % 3.2 - 2.75) / 0.45, hgt = 70 * Math.min(1, ph * 4) * (1 - Math.max(0, ph - 0.7) * 2);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const yy = v.y - i / 6 * hgt, w = 12 - i * 1.4 + Math.sin(time * 30 + i) * 2; c.fillStyle = i < 2 ? 'rgba(255,120,40,.55)' : i < 4 ? 'rgba(255,170,60,.5)' : 'rgba(255,230,140,.45)'; ellipse(c, v.x + Math.sin(time * 20 + i) * 2, yy, w, w * 0.9); }
    c.restore();
  }
}
function updateVents(fainted) {
  if (P.dash || fainted || (dungeonAt(P.x) !== CINDER_D && dungeonAt(P.x) !== FORGE_D)) return;
  for (const v of VENTS) if (ventState(v) === 2 && Math.hypot(P.x - v.x, (P.y - v.y) / 0.7) < 20) { damagePlayer(fireDmg(2), { x: v.x, y: v.y + 20 }); break; }
}
function drawForge(c, o) {
  const x = o.x, y = o.y, f = 0.6 + Math.sin(time * 9) * 0.25;
  shadow(c, x, y + 2, 28, 7);
  c.fillStyle = '#3a3230'; c.fillRect(x - 26, y - 30, 52, 32); c.fillStyle = '#5a504c'; c.fillRect(x - 24, y - 28, 48, 6);
  c.fillStyle = '#1a1210'; c.fillRect(x - 12, y - 20, 24, 16); c.fillStyle = `rgba(255,140,40,${f})`; c.fillRect(x - 10, y - 16, 20, 12); c.fillStyle = '#ffe08a'; c.fillRect(x - 6, y - 10, 12, 4);
  c.fillStyle = '#3a3230'; c.fillRect(x + 10, y - 62, 12, 34);
  if (Math.random() < 0.08) particles.push({ x: x + 16, y: y - 64, vx: 0, vy: -24, life: 1.2, color: '#6a6260', size: 5 });
  // anvil
  c.fillStyle = '#2a2a30'; c.fillRect(x + 34, y - 12, 8, 12); c.fillStyle = '#4a4a54'; c.fillRect(x + 28, y - 18, 22, 7); c.fillRect(x + 24, y - 18, 6, 4);
}
function drawObsidian(c, r) {
  shadow(c, 0, -3, 14, 4);
  c.fillStyle = '#16121c'; c.beginPath(); c.moveTo(-13, 0); c.lineTo(-9, -18); c.lineTo(-2, -26); c.lineTo(4, -15); c.lineTo(10, -22); c.lineTo(14, 0); c.closePath(); c.fill();
  c.fillStyle = '#3a2e4a'; c.beginPath(); c.moveTo(-8, -3); c.lineTo(-6, -16); c.lineTo(-2, -22); c.lineTo(1, -8); c.closePath(); c.fill();
  c.fillStyle = '#8a7aa8'; c.fillRect(-4, -19, 2, 6); c.fillRect(9, -18, 2, 4);
  if (Math.sin(time * 2.1 + r.seed * 20) > 0.96) { c.fillStyle = '#ffffff'; c.fillRect(-4, -22, 2, 5); }
}
function drawBalloon(c, x, y) {
  const bob = Math.sin(time * 1.6) * 3, fl = Math.sin(time * 14) * 2;
  shadow(c, x, y + 4, 24, 6);
  c.fillStyle = '#5a3a22'; c.fillRect(x - 16, y - 18, 32, 18); c.fillStyle = '#8a5a32'; for (let i = 0; i < 3; i++) c.fillRect(x - 16, y - 16 + i * 6, 32, 3);
  const by = y - 96 + bob;
  c.strokeStyle = '#3b2414'; c.lineWidth = 1.5; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 15, y - 18); c.lineTo(x + s * 26, by + 26); c.stroke(); }
  c.fillStyle = 'rgba(255,170,60,.85)'; ellipse(c, x, y - 26 + fl * 0.5, 4, 7 + fl);
  for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#e8b030' : '#c8402a'; c.beginPath(); c.ellipse(x, by, 36 - i * 6, 42, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.25)'; ellipse(c, x - 12, by - 14, 8, 14);
  c.fillStyle = '#8a3024'; c.fillRect(x - 10, by + 38, 20, 6);
}
// ---------- the Forgemaster: a red-hot iron smith, quenched with water barrels ----------
function forgeBarrels(B) { return B.barrels || (B.barrels = [[2.5, 14.5], [8.5, 14.5], [2.5, 22.5], [8.5, 22.5]].map(([x, y]) => ({ x: (FORGE_D.x0 + x) * T, y: y * T + 16, cd: 0 }))); }
let quenchHint = false;
function hitBarrels(B, hx, hy, rad) {
  if (B.type !== 'forge' || !B.active) return;
  for (const br of forgeBarrels(B)) {
    if (br.cd > 0 || Math.hypot(br.x - hx, br.y - 14 - hy) > rad + 16) continue;
    br.cd = 7; SFX.play('slime'); for (let i = 0; i < 16; i++) { const a = rng() * Math.PI * 2, v = 60 + rng() * 120; particles.push({ x: br.x, y: br.y - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.6, color: i % 2 ? '#7fc8ff' : '#d6f2ff', size: 4 }); }
    if (Math.hypot(B.x - br.x, B.y - br.y) < 120 && B.state !== 'dying') {
      B.cool = 5; B.state = 'dazed'; B.st = 2.4; impact(8); SFX.play('slam');
      for (let i = 0; i < 20; i++) particles.push({ x: B.x + (rng() - 0.5) * 50, y: B.y - 40 - rng() * 40, vx: (rng() - 0.5) * 30, vy: -60 - rng() * 40, life: 1, color: '#e6e6ea', size: 6 });
      floatText(B.x, B.y - 120, 'Quenched! Strike now!', '#bfe8ff');
    } else floatText(br.x, br.y - 50, 'Too far from him!', '#bfe8ff');
  }
}
function updateForge(B, dt, fainted, d) {
  for (const br of forgeBarrels(B)) br.cd = Math.max(0, br.cd - dt);
  B.cool = Math.max(0, (B.cool || 0) - dt);
  switch (B.state) {
    case 'stomp': {
      B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, sp = B.phase === 3 ? 70 : 52;
      if (dd > 50) { B.x += dx / dd * sp * dt; B.y += dy / dd * sp * dt; clampBoss(B); }
      if (B.st > 1.4) bossRest(B, 0.2);
      break;
    }
    case 'slamWind':
      B.st -= dt;
      if (B.st <= 0) {
        impact(12); hitStop = 0.08; SFX.play('slam'); B.ring = { x: B.x, y: B.y, r: 30, max: 200, hit: false };
        const dirs = B.phase === 1 ? 4 : 8;
        for (let k = 0; k < dirs; k++) { const a = k / dirs * Math.PI * 2 + (B.phase === 2 ? Math.PI / 4 : 0); for (let i = 1; i <= 7; i++) projectiles.push({ kind: 'spike', flame: true, vx: 0, vy: 0, x: B.x + Math.cos(a) * i * 32, y: B.y + Math.sin(a) * i * 26, t: -i * 0.06, life: 0.95 }); }
        bossRest(B, 0.8);
      }
      break;
    case 'chargeWind': B.st -= dt; if (B.st <= 0) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd * 340; B.vy = dy / dd * 340; B.state = 'charge'; B.st = 0; SFX.play('dash'); } break;
    case 'charge': {
      B.st += dt; const ox = B.x, oy = B.y; B.x += B.vx * dt; B.y += B.vy * dt; clampBoss(B);
      if (Math.random() < dt * 30) particles.push({ x: B.x, y: B.y, vx: 0, vy: -20, life: 0.4, color: '#ffb347', size: 4 });
      if (!fainted && !P.dash && d < 46 && !B.chit) { B.chit = true; damagePlayer(fireDmg(2), B); }
      if (Math.hypot(B.x - ox, B.y - oy) < 340 * dt * 0.5 || B.st > 1.2) { B.chit = false; impact(6); SFX.play('crumble'); bossRest(B, 0.7); }
      break;
    }
    case 'sparks':
      B.st -= dt;
      if (B.st <= 0) { const n = B.phase === 3 ? 12 : 8, off = rng(); for (let i = 0; i < n; i++) { const a = (i + off) / n * Math.PI * 2; projectiles.push({ kind: 'fire', weak: true, x: B.x, y: B.y - 50, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, ang: a, t: 0, life: 2 }); } SFX.play('swing'); bossRest(B, 0.6); }
      break;
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['magmite', 'magmite'], 4); bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.4); break;
  }
}
function drawForgemaster(c, B) {
  const hot = !(B.cool > 0), k = hot ? 0.5 + Math.sin(time * 6) * 0.2 : 0;
  forgeBarrels(B).forEach(br => {
    shadow(c, br.x, br.y + 2, 14, 5);
    if (br.cd > 0) { c.fillStyle = '#4a3020'; c.fillRect(br.x - 12, br.y - 6, 24, 6); c.fillStyle = 'rgba(127,200,255,.5)'; ellipse(c, br.x, br.y + 2, 18, 5); return; }
    c.fillStyle = '#6a4424'; c.fillRect(br.x - 12, br.y - 30, 24, 30); c.fillStyle = '#3a3a44'; c.fillRect(br.x - 12, br.y - 24, 24, 3); c.fillRect(br.x - 12, br.y - 8, 24, 3);
    c.fillStyle = '#3a78b8'; ellipse(c, br.x, br.y - 30, 11, 4); c.fillStyle = '#9fd8ff'; ellipse(c, br.x - 3, br.y - 31, 4, 1.5);
  });
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : B.state === 'slamWind' || B.state === 'chargeWind' ? Math.sin(time * 50) * 2 : 0), y = B.y;
  const walk = B.state === 'stomp' ? Math.sin(B.anim * 9) * 4 : 0, sink = B.state === 'dying' ? 1 - Math.max(0, B.st) / 1.8 : 0;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y + 4, 40, 12);
  c.globalAlpha = 1; bossFlash(c, B);
  const iron = hot ? `rgb(${130 + k * 100},${60 + k * 30},${40})` : '#4a4a54', dark = hot ? '#5a2418' : '#2a2a30';
  c.fillStyle = dark; c.fillRect(x - 22, y - 30 + walk, 14, 30 - walk); c.fillRect(x + 8, y - 30 - walk, 14, 30 + walk);
  const top = y - 100 + sink * 50;
  c.fillStyle = dark; c.fillRect(x - 34, top, 68, 74 - sink * 50); c.fillStyle = iron; c.fillRect(x - 30, top + 4, 60, 66 - sink * 50);
  c.fillStyle = '#1a1210'; c.fillRect(x - 14, top + 22, 28, 22); c.fillStyle = hot ? `rgba(255,${150 + k * 80},60,.95)` : 'rgba(80,60,60,.8)'; c.fillRect(x - 11, top + 25, 22, 16);
  c.fillStyle = dark; c.fillRect(x - 20, top - 26, 40, 28); c.fillStyle = iron; c.fillRect(x - 17, top - 23, 34, 22);
  c.fillStyle = B.state === 'dazed' ? '#ffe08a' : hot ? '#fff2c4' : '#9fd8ff'; c.fillRect(x - 11, top - 15, 7, 4); c.fillRect(x + 4, top - 15, 7, 4);
  // arms and hammer
  const raise = B.state === 'slamWind' ? Math.min(1, 1 - B.st / 0.8) : 0, hx = x + 46, hy = top + 30 - raise * 70;
  c.strokeStyle = dark; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - 30, top + 12); c.lineTo(x - 44, top + 50); c.moveTo(x + 30, top + 12); c.lineTo(hx, hy); c.stroke(); c.lineCap = 'butt';
  c.fillStyle = '#5a3a22'; c.fillRect(hx - 3, hy - 40, 6, 46); c.fillStyle = '#2a2a30'; c.fillRect(hx - 18, hy - 54, 36, 22); c.fillStyle = hot ? '#c8502a' : '#5a5a64'; c.fillRect(hx - 15, hy - 51, 30, 6);
  c.globalAlpha = 1;
  if (hot && Math.random() < 0.3) particles.push({ x: x + (Math.random() - 0.5) * 50, y: top, vx: 0, vy: -40, life: 0.5, color: '#ffb347', size: 3 });
  if (B.state === 'slamWind' || B.state === 'chargeWind' || B.state === 'sparks') bossWarn(c, B, top - 50);
  if (B.state === 'sleep') bossZ(c, { x: x + 10, y: top + 10, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, top - 40, 26);
}
// ---------- the Magma Drake: flies out of reach, crashes into its own boulders ----------
function updateDrake(B, dt, fainted, d) {
  const A = B.arena; B.rocks = B.rocks || [];
  const fly = 70;
  switch (B.state) {
    case 'fly': {
      B.st += dt; const a = B.anim * 1.1, tx = A.cx + Math.cos(a) * 170, ty = A.cy + Math.sin(a * 1.4) * 60, dx = tx - B.x, dy = ty - B.y, dd = Math.hypot(dx, dy) || 1;
      B.x += dx / dd * Math.min(dd, 200 * dt); B.y += dy / dd * Math.min(dd, 200 * dt); B.z += (fly - B.z) * Math.min(1, dt * 3);
      if (B.st > 1.8) bossRest(B, 0.1);
      break;
    }
    case 'breathWind': B.st -= dt; B.z += (fly - B.z) * Math.min(1, dt * 3); if (B.st <= 0) { B.state = 'breath'; B.st = 0; B.timer = 0; B.sweepA = Math.atan2(P.y - B.y, P.x - B.x) - 0.7; SFX.play('boss'); } break;
    case 'breath': {
      B.st += dt; B.timer -= dt; B.z += (fly - B.z) * Math.min(1, dt * 3);
      if (B.timer <= 0) { B.timer = 0.06; const a = B.sweepA + B.st / 1.1 * 1.4; projectiles.push({ kind: 'fire', x: B.x + Math.cos(a) * 30, y: B.y - B.z * 0.4 + Math.sin(a) * 20, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, ang: a, t: 0, life: 1.6 }); }
      if (B.st > 1.1) bossRest(B, 0.5);
      break;
    }
    case 'meteors':
      B.st -= dt; B.z += (fly + 30 - B.z) * Math.min(1, dt * 3);
      if (B.st <= 0) {
        const n = B.phase === 1 ? 3 : 4;
        for (let i = 0; i < n; i++) { const near = i === 0, tx = near ? P.x + (rng() - 0.5) * 40 : A.x0 + 70 + rng() * (A.x1 - A.x0 - 140), ty = near ? P.y + (rng() - 0.5) * 30 : A.y0 + 90 + rng() * (A.y1 - A.y0 - 120); projectiles.push({ kind: 'rock', drake: true, fall: true, tx, ty, x: tx, y: ty, t: -i * 0.25, dur: 0.9, z: 320 }); }
        SFX.play('boss'); impact(4); bossRest(B, 1);
      }
      break;
    case 'diveWind': {
      B.st -= dt; B.z += (110 - B.z) * Math.min(1, dt * 4);
      const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.x -= dx / dd * 30 * dt; B.y -= dy / dd * 20 * dt; clampBoss(B);
      if (B.st <= 0) { B.tx = P.x; B.ty = P.y; const ex = B.tx - B.x, ey = B.ty - B.y, el = Math.hypot(ex, ey) || 1; B.vx = ex / el * 430; B.vy = ey / el * 430; B.state = 'dive'; B.st = 0; SFX.play('dash'); }
      break;
    }
    case 'dive': {
      B.st += dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z = Math.max(8, B.z - 260 * dt);
      const rock = B.rocks.find(r => Math.hypot(r.x - B.x, r.y - B.y) < 34);
      if (rock) {
        B.rocks.splice(B.rocks.indexOf(rock), 1); B.z = 0; B.state = 'dazed'; B.st = 3; impact(14); hitStop = 0.1; SFX.play('slam');
        for (let i = 0; i < 18; i++) { const a = rng() * Math.PI * 2, v = 80 + rng() * 140; particles.push({ x: rock.x, y: rock.y - 14, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: 0.7, color: i % 2 ? '#16121c' : '#ff7a2a', size: 5 }); }
        floatText(B.x, B.y - 110, 'It crashed into the boulder! Strike now!', '#ffe08a'); break;
      }
      if (!fainted && !P.dash && d < 40 && !B.chit) { B.chit = true; damagePlayer(fireDmg(2), B); }
      const out = B.x < A.x0 + 30 || B.x > A.x1 - 30 || B.y < A.y0 + 44 || B.y > A.y1 - 12;
      if (out || B.st > 1.3) { clampBoss(B); B.chit = false; B.z = 0; B.state = 'land'; B.st = 1.1; impact(6); SFX.play('crumble'); }
      break;
    }
    case 'land': B.st -= dt; B.z = 0; if (B.st <= 0) bossRest(B, 0.1); break;
    case 'summon': B.st -= dt; B.z += (fly - B.z) * Math.min(1, dt * 3); if (B.st <= 0) { summonMinions(B, ['imp', 'magmite'], 4); SFX.play('boss'); bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; B.z = 0; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawDrake(c, B) {
  for (const r of B.rocks || []) { shadow(c, r.x, r.y + 2, 18, 6); c.fillStyle = '#16121c'; c.beginPath(); c.moveTo(r.x - 18, r.y); c.lineTo(r.x - 12, r.y - 22); c.lineTo(r.x + 2, r.y - 30); c.lineTo(r.x + 16, r.y - 18); c.lineTo(r.x + 18, r.y); c.closePath(); c.fill(); c.fillStyle = '#3a2e4a'; c.beginPath(); c.moveTo(r.x - 10, r.y - 4); c.lineTo(r.x - 6, r.y - 20); c.lineTo(r.x + 2, r.y - 24); c.lineTo(r.x, r.y - 6); c.closePath(); c.fill(); c.fillStyle = `rgba(255,122,42,${0.5 + Math.sin(time * 5 + r.x) * 0.3})`; c.fillRect(r.x + 4, r.y - 14, 8, 2); }
  const z = B.z || 0, x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y - z, f = P.x < B.x ? -1 : 1;
  const ss = Math.max(0.4, 1 - z / 200); c.fillStyle = 'rgba(0,0,0,.32)'; ellipse(c, B.x, B.y + 4, 56 * ss, 16 * ss);
  if (B.state === 'diveWind') { c.strokeStyle = `rgba(236,82,87,${0.5 + Math.sin(time * 16) * 0.3})`; c.lineWidth = 2; c.beginPath(); c.ellipse(P.x, P.y, 30, 12, 0, 0, Math.PI * 2); c.stroke(); }
  c.globalAlpha = 1; bossFlash(c, B);
  const grounded = z < 6, flap = grounded ? 0.15 : Math.sin(time * (B.state === 'dive' ? 4 : 9)) * 0.8;
  // wings
  for (const s of [-1, 1]) {
    c.fillStyle = '#5a1a14'; c.beginPath(); c.moveTo(x + s * 14, y - 50); c.lineTo(x + s * 90, y - 80 - flap * 40); c.lineTo(x + s * 76, y - 40 - flap * 10); c.lineTo(x + s * 50, y - 46); c.lineTo(x + s * 30, y - 30); c.closePath(); c.fill();
    c.strokeStyle = '#2a0a08'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + s * 14, y - 50); c.lineTo(x + s * 90, y - 80 - flap * 40); c.stroke();
    c.fillStyle = 'rgba(255,122,42,.25)'; c.beginPath(); c.moveTo(x + s * 30, y - 52); c.lineTo(x + s * 76, y - 72 - flap * 34); c.lineTo(x + s * 60, y - 48); c.closePath(); c.fill();
  }
  // tail
  c.strokeStyle = '#8a2a1a'; c.lineWidth = 10; c.lineCap = 'round'; c.beginPath(); c.moveTo(x - f * 20, y - 24); c.quadraticCurveTo(x - f * 60, y - 10 + Math.sin(time * 4) * 6, x - f * 80, y - 30); c.stroke(); c.lineCap = 'butt';
  // legs, body
  c.fillStyle = '#5a1a14'; c.fillRect(x - 18, y - 22, 9, 20); c.fillRect(x + 9, y - 22, 9, 20);
  c.fillStyle = '#8a2a1a'; ellipse(c, x, y - 36, 34, 24); c.fillStyle = '#e8a040'; ellipse(c, x + f * 4, y - 30, 18, 14);
  c.fillStyle = '#c8402a'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(x - 18 + i * 12, y - 58); c.lineTo(x - 14 + i * 12, y - 68); c.lineTo(x - 10 + i * 12, y - 58); c.fill(); }
  // neck and head
  const hx = x + f * 34, hy = y - 74 + (B.state === 'breath' || B.state === 'breathWind' ? 6 : 0);
  c.strokeStyle = '#8a2a1a'; c.lineWidth = 14; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + f * 16, y - 50); c.lineTo(hx, hy); c.stroke(); c.lineCap = 'butt';
  c.fillStyle = '#8a2a1a'; ellipse(c, hx + f * 6, hy, 18, 12); ellipse(c, hx + f * 20, hy + 4, 12, 7);
  c.fillStyle = '#2a0a08'; c.beginPath(); c.moveTo(hx - f * 4, hy - 8); c.lineTo(hx - f * 16, hy - 22); c.lineTo(hx + f * 4, hy - 10); c.fill();
  c.fillStyle = B.state === 'dazed' ? '#ffe08a' : '#fff2c4'; circle(c, hx + f * 10, hy - 3, 3);
  if (B.state === 'breathWind' || B.state === 'breath') { c.fillStyle = `rgba(255,170,60,${0.5 + Math.sin(time * 30) * 0.3})`; circle(c, hx + f * 30, hy + 5, 8); }
  c.globalAlpha = 1;
  if (B.state === 'breathWind' || B.state === 'diveWind' || B.state === 'meteors') bossWarn(c, { x }, y - 110);
  if (B.state === 'sleep') bossZ(c, { x: hx, y: hy + 10, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, hx, hy - 30, 24);
}
function drawForgeGate(c) {
  const x = FORGE.x, y = FORGE.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 74, 14);
  c.fillStyle = '#2a2224'; c.beginPath(); c.moveTo(x - 72, y); c.lineTo(x - 50, y - 70); c.lineTo(x - 16, y - 100); c.lineTo(x + 20, y - 96); c.lineTo(x + 54, y - 66); c.lineTo(x + 72, y); c.closePath(); c.fill();
  c.fillStyle = '#3e3436'; c.beginPath(); c.moveTo(x - 60, y); c.lineTo(x - 42, y - 64); c.lineTo(x - 14, y - 90); c.lineTo(x - 4, y); c.closePath(); c.fill();
  c.fillStyle = '#4a4a54'; c.fillRect(x - 26, y - 58, 52, 58); c.fillStyle = '#120d0c'; c.fillRect(x - 20, y - 52, 40, 52);
  const g = 0.5 + Math.sin(time * 3) * 0.2; c.fillStyle = `rgba(255,122,42,${g})`; c.fillRect(x - 20, y - 14, 40, 14); c.fillStyle = `rgba(255,200,100,${g * 0.6})`; c.fillRect(x - 16, y - 6, 32, 6);
  c.fillStyle = '#2a2a30'; for (let i = 0; i < 5; i++) c.fillRect(x - 18 + i * 9, y - 52, 3, 40);
  c.fillStyle = '#ff7a2a'; c.fillRect(x - 46, y - 40, 4, 36); c.fillRect(x + 40, y - 30, 4, 26);
  if (Math.random() < 0.1) particles.push({ x: x + (Math.random() - 0.5) * 40, y: y - 96, vx: 0, vy: -30, life: 1.2, color: '#6a6260', size: 6 });
}
// ---------- Cloudspire creatures: storm puffs, gale hawks, windlings, sentinels ----------
function updateSkyFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'puff') {
    e.zap = Math.max(0, (e.zap || 0) - dt);
    if (e.state === 'charge') {
      e.st -= dt;
      if (e.st <= 0) { e.state = 'move'; e.cd = 2.4 + rng(); e.zap = 0.25; SFX.play('slam'); impact(3); burst(e.mx, e.my, '#fff6a8', 12); if (!fainted && !P.dash && Math.hypot(P.x - e.mx, (P.y - e.my) / 0.7) < 26) damagePlayer(2, { x: e.mx, y: e.my + 30 }); }
      return true;
    }
    if (chase) {
      const want = d > 120 ? 1 : d < 80 ? -1 : 0; moveEnemy(e, dx / d * D.sp * want * dt + Math.cos(e.anim) * 20 * dt, dy / d * D.sp * want * dt + Math.sin(e.anim * 1.3) * 14 * dt);
      if (e.cd <= 0) { e.state = 'charge'; e.st = 0.9; e.mx = P.x; e.my = P.y; }
    } else wander(D.sp);
    return true;
  }
  if (ai === 'hawk') {
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'swoop'; e.st = 0.55; e.lx = dx / d * 380; e.ly = dy / d * 380; e.hit = false; SFX.play('dash'); } return true; }
    if (e.state === 'swoop') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 22 && !fainted) { e.hit = true; damagePlayer(D.dmg, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 2 + rng(); } return true; }
    if (chase) {
      const a = e.anim * 1.5 + e.hx, tx = P.x + Math.cos(a) * 140, ty = P.y + Math.sin(a) * 90, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1;
      moveEnemy(e, ex / el * Math.min(el, D.sp * dt), ey / el * Math.min(el, D.sp * dt));
      if (e.cd <= 0) { e.state = 'windup'; e.st = 0.5; }
    } else wander(D.sp * 0.6);
    return true;
  }
  if (ai === 'windling') {
    e.spin = (e.spin || 0) + dt * 14;
    if (e.cd > 0 && chase) { moveEnemy(e, -dx / d * D.sp * dt, -dy / d * D.sp * dt); return true; }
    if (chase) { const j = Math.sin(e.anim * 5) * 0.9; moveEnemy(e, (dx / d + Math.cos(e.anim * 3) * j) * D.sp * dt, (dy / d + Math.sin(e.anim * 3) * j) * D.sp * dt); } else wander(D.sp);
    if (d < 22 && !fainted && P.inv <= 0) { damagePlayer(D.dmg, e); P.kx = dx / d * 560; P.ky = dy / d * 560; e.cd = 1.2; floatText(P.x, P.y - 60, 'Whoosh!', '#dff6ff'); }
    return true;
  }
  if (ai === 'sentinel') {
    if (e.dir === undefined) e.dir = rng() * Math.PI * 2;
    const want = Math.atan2(dy, dx); let da = want - e.dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (chase) e.dir += Math.max(-1.1 * dt, Math.min(1.1 * dt, da));
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 3 + rng(); projectiles.push({ kind: 'wisp', x: e.x + Math.cos(e.dir) * 16, y: e.y - 30, ang: e.dir, t: 0, life: 3.2 }); SFX.play('wisp'); } return true; }
    if (chase) { if (d > 90) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (e.cd <= 0 && Math.abs(da) < 0.5) { e.state = 'windup'; e.st = 0.6; } } else wander(D.sp);
    touch(D.dmg, 22); return true;
  }
  return updateDuskFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
Object.assign(PROC_DRAW, {
  puff(c, e, k) {
    const y = e.y - 40 + Math.sin(e.anim * 2) * 4, dark = e.state === 'charge';
    if (dark) { const pr = 1 - e.st / 0.9; c.strokeStyle = `rgba(255,240,120,${0.4 + pr * 0.5})`; c.lineWidth = 2; c.beginPath(); c.ellipse(e.mx, e.my, 26 - pr * 8, 11 - pr * 3, 0, 0, Math.PI * 2); c.stroke(); }
    if (e.zap > 0) { c.strokeStyle = '#fff6a8'; c.lineWidth = 3; c.beginPath(); let bx = e.x, by = y + 10; c.moveTo(bx, by); for (let i = 1; i <= 5; i++) { bx += (e.mx - e.x) / 5 + (Math.random() - 0.5) * 16; by += (e.my - y - 10) / 5; c.lineTo(bx, by); } c.stroke(); }
    shadow(c, e.x, e.y + 2, 12 * k, 4 * k);
    c.fillStyle = dark ? '#6a7080' : '#e8eef6'; for (const [ox, oy, r] of [[-10, 2, 9], [10, 2, 9], [0, -4, 12], [-4, 4, 8], [5, 5, 8]]) circle(c, e.x + ox * k, y + oy * k, r * k);
    c.fillStyle = dark ? '#ffe08a' : '#3a4250'; c.fillRect(e.x - 5 * k, y - 2, 3, 3); c.fillRect(e.x + 3 * k, y - 2, 3, 3);
    if (dark && Math.random() < 0.3) particles.push({ x: e.x + (Math.random() - 0.5) * 20, y: y + 8, vx: 0, vy: 30, life: 0.3, color: '#fff6a8', size: 2 });
  },
  hawk(c, e, k) {
    const y = e.y - (e.state === 'swoop' ? 14 : 38) + Math.sin(e.anim * 4) * 3, f = (e.state === 'swoop' ? e.lx : P.x - e.x) < 0 ? -1 : 1, flap = Math.sin(time * (e.state === 'windup' ? 30 : 14)) * 7;
    shadow(c, e.x, e.y + 2, 10 * k, 3 * k);
    c.fillStyle = '#6a4a2a'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(e.x, y); c.lineTo(e.x + s * 20 * k, y - 4 - flap * s * s); c.lineTo(e.x + s * 14 * k, y + 4); c.closePath(); c.fill(); }
    c.fillStyle = '#8a6a44'; ellipse(c, e.x, y, 8 * k, 5 * k); c.fillStyle = '#efe6d8'; circle(c, e.x + f * 7 * k, y - 3 * k, 4 * k);
    c.fillStyle = '#e8b030'; c.beginPath(); c.moveTo(e.x + f * 10 * k, y - 4 * k); c.lineTo(e.x + f * 15 * k, y - 2 * k); c.lineTo(e.x + f * 10 * k, y - 1 * k); c.fill();
    c.fillStyle = '#1a1210'; c.fillRect(e.x + f * 8 * k - 1, y - 5 * k, 2, 2);
    c.fillStyle = '#5a3a20'; c.fillRect(e.x - f * 12 * k, y - 1, 6 * f * k, 3);
  },
  windling(c, e, k) {
    const s = e.spin || 0;
    shadow(c, e.x, e.y + 2, 11 * k, 3 * k);
    for (let i = 0; i < 4; i++) { const r = (5 + i * 3.5) * k, yy = e.y - 4 - i * 7; c.strokeStyle = `rgba(220,245,255,${0.85 - i * 0.12})`; c.lineWidth = 3; c.beginPath(); c.ellipse(e.x + Math.sin(s + i) * 3, yy, r, r * 0.35, 0, s + i, s + i + 4.5); c.stroke(); }
    c.fillStyle = '#3a5a7a'; c.fillRect(e.x - 4 + Math.sin(s) * 2, e.y - 22, 2, 2); c.fillRect(e.x + 2 + Math.sin(s) * 2, e.y - 22, 2, 2);
    if (Math.random() < 0.2) particles.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y - 10, vx: (Math.random() - 0.5) * 60, vy: -20, life: 0.4, color: '#b8d870', size: 2 });
  },
  sentinel(c, e, k) {
    const dir = e.dir || 0, y = e.y - 30 + Math.sin(e.anim * 2) * 3, fx = Math.cos(dir), fy = Math.sin(dir);
    shadow(c, e.x, e.y + 2, 14 * k, 4 * k);
    c.fillStyle = '#8a8478'; c.beginPath(); c.moveTo(e.x, y - 18 * k); c.lineTo(e.x + 13 * k, y); c.lineTo(e.x, y + 18 * k); c.lineTo(e.x - 13 * k, y); c.closePath(); c.fill();
    c.fillStyle = '#b4ae9f'; c.beginPath(); c.moveTo(e.x, y - 18 * k); c.lineTo(e.x - 13 * k, y); c.lineTo(e.x, y); c.closePath(); c.fill();
    const glow = e.state === 'windup' ? '#ffe08a' : '#7fe0f0'; c.fillStyle = glow; circle(c, e.x + fx * 6 * k, y + fy * 4 * k, 3.5 * k);
    // shield plate on the facing side
    c.save(); c.translate(e.x + fx * 18 * k, y + fy * 10 * k); c.rotate(dir + Math.PI / 2);
    c.fillStyle = '#4a5a6a'; c.fillRect(-13 * k, -3, 26 * k, 7); c.fillStyle = '#7fe0f0'; c.fillRect(-9 * k, -1, 18 * k, 2); c.restore();
  },
});
function drawSkyTile(c, x, y, px, py, t) {
  const h = hash(x, y), solid = (xx, yy) => { const q = tileAt(xx, yy); return isLand(q) && q !== CLOUD && q !== WIND; };
  if (t === LAND || t === PATH) {
    spr(c, h < 0.35 ? 'grass1' : 'grass0', px, py);
    if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    c.fillStyle = 'rgba(255,250,230,.12)'; c.fillRect(px, py, T, T);
    if (t !== PATH && h > 0.86) { c.fillStyle = ['#ffffff', '#f2c4e0', '#c4e0ff'][Math.floor(h * 30) % 3]; c.fillRect(px + h * 22, py + 8 + h * 12, 3, 3); }
    return;
  }
  const g = Math.min(1, y / 44); c.fillStyle = `rgb(${150 + g * 40},${200 + g * 25},${240 + g * 10})`; c.fillRect(px, py, T, T);
  if (t === DEEP && solid(x, y - 1)) { // cliff under an island
    c.fillStyle = '#7a5a3a'; c.fillRect(px, py, T, 18); c.fillStyle = '#5a4028'; c.fillRect(px, py + 10, T, 8);
    c.fillStyle = '#5a4028'; c.beginPath(); c.moveTo(px + 2, py + 18); c.lineTo(px + 8 + h * 8, py + 28 + h * 4); c.lineTo(px + 18, py + 18); c.lineTo(px + 24 - h * 4, py + 24); c.lineTo(px + 30, py + 18); c.closePath(); c.fill();
    c.fillStyle = '#4f8a3a'; c.fillRect(px, py, T, 3);
    return;
  }
  if (t === DEEP) { if (h > 0.8) { c.fillStyle = 'rgba(255,255,255,.55)'; ellipse(c, px + 16, py + 16, 10 + h * 8, 5 + h * 3); } return; }
  if (t === CLOUD) {
    c.fillStyle = '#ffffff'; for (const [ox, oy, r] of [[8, 14, 10], [24, 14, 10], [16, 10, 11], [16, 20, 10], [4, 22, 6], [28, 22, 6]]) circle(c, px + ox, py + oy, r);
    c.fillStyle = 'rgba(160,190,220,.35)'; c.fillRect(px, py + 26, T, 4);
    return;
  }
  if (t === WIND) { c.fillStyle = 'rgba(210,240,255,.65)'; c.fillRect(px + 2, py + 2, T - 4, T - 4); }
}
function drawSkyOverlay(c, camX, camY, vw, vh, clouds) {
  for (let ty = Math.floor(camY / T); ty < (camY + vh) / T; ty++) for (let tx = Math.floor(camX / T); tx < (camX + vw) / T; tx++) {
    const k = ty * W + tx, dir = JET.get(k); if (!dir) continue;
    const ph = (time * 2 + hash(tx, ty)) % 1, ox = dir[0] * (ph - 0.5) * T, oy = dir[1] * (ph - 0.5) * T, cxp = tx * T + 16 + ox, cyp = ty * T + 16 + oy;
    c.strokeStyle = `rgba(255,255,255,${0.8 * Math.sin(ph * Math.PI)})`; c.lineWidth = 2; c.beginPath();
    c.moveTo(cxp - dir[0] * 8 - dir[1] * 6, cyp - dir[1] * 8 - dir[0] * 6); c.lineTo(cxp, cyp); c.lineTo(cxp - dir[0] * 8 + dir[1] * 6, cyp - dir[1] * 8 + dir[0] * 6); c.stroke();
  }
  if (clouds) for (let i = 0; i < 7; i++) {
    const span = DW * T + 400, cxp = SKY_D.x0 * T - 200 + ((hash(i, 9) * span + time * (12 + i * 3)) % span), cyp = (3 + hash(9, i) * 40) * T;
    if (cxp < camX - 200 || cxp > camX + vw + 200 || cyp < camY - 100 || cyp > camY + vh + 100) continue;
    c.fillStyle = 'rgba(255,255,255,.22)'; for (const [ox, oy, r] of [[-40, 0, 30], [0, -12, 40], [40, 0, 30], [10, 10, 34]]) circle(c, cxp + ox, cyp + oy, r);
  }
}
function updateJets(dt) {
  if (P.dash) return;
  const dir = JET.get(Math.floor(P.y / T) * W + Math.floor(P.x / T));
  if (dir) { moveBody(P, dir[0] * 240 * dt, dir[1] * 240 * dt, 9); if (Math.random() < dt * 20) particles.push({ x: P.x + (Math.random() - 0.5) * 20, y: P.y - 10, vx: -dir[0] * 60, vy: -dir[1] * 60, life: 0.3, color: '#ffffff', size: 2 }); }
}
function drawThermal(c, x, y, home) {
  c.fillStyle = home ? 'rgba(200,240,255,.35)' : 'rgba(255,140,40,.3)'; ellipse(c, x, y, 30, 10);
  c.strokeStyle = home ? 'rgba(255,255,255,.8)' : 'rgba(255,190,120,.7)'; c.lineWidth = 2;
  for (let i = 0; i < 5; i++) { const ph = (time * 0.8 + i / 5) % 1, yy = y - ph * 120, r = 22 - ph * 8; c.globalAlpha = Math.sin(ph * Math.PI); c.beginPath(); c.ellipse(x + Math.sin(time * 3 + i) * 4, yy, r, r * 0.35, 0, time * 4 + i, time * 4 + i + 4); c.stroke(); }
  c.globalAlpha = 1;
  if (Math.random() < 0.3) particles.push({ x: x + (Math.random() - 0.5) * 30, y: y - 4, vx: 0, vy: -90, life: 0.9, color: home ? '#ffffff' : '#ffb347', size: 2 });
}
function drawWindmill(c, o) {
  const x = o.x, y = o.y;
  shadow(c, x, y + 2, 22, 6);
  c.fillStyle = '#d8ccb4'; c.beginPath(); c.moveTo(x - 18, y); c.lineTo(x - 12, y - 70); c.lineTo(x + 12, y - 70); c.lineTo(x + 18, y); c.closePath(); c.fill();
  c.fillStyle = '#b8ac94'; c.fillRect(x + 2, y - 70, 10, 70); c.fillStyle = '#5a3a22'; c.fillRect(x - 6, y - 20, 12, 20); c.fillStyle = '#c8402a'; c.beginPath(); c.moveTo(x - 16, y - 70); c.lineTo(x, y - 88); c.lineTo(x + 16, y - 70); c.closePath(); c.fill();
  c.save(); c.translate(x, y - 74); c.rotate(time * 1.2);
  for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.fillStyle = '#6a4a2a'; c.fillRect(-2, 0, 4, 40); c.fillStyle = '#f2ead6'; c.fillRect(2, 10, 10, 28); }
  c.restore(); c.fillStyle = '#3b2414'; circle(c, x, y - 74, 4);
}
// ---------- Aegis, the Colossus Sentinel: shielded in front, overheats after its laser ----------
let aegisHint = false;
function updateAegis(B, dt, fainted, d) {
  if (B.dir === undefined) B.dir = Math.PI / 2;
  const turn = B.state === 'laser' ? 0.75 : B.phase === 3 ? 1.3 : 0.95;
  if (B.state !== 'dazed' && B.state !== 'dying') { const want = Math.atan2(P.y - B.y, P.x - B.x); let da = want - B.dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; B.dir += Math.max(-turn * dt, Math.min(turn * dt, da)); }
  switch (B.state) {
    case 'hover': { B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; if (dd > 110) { B.x += dx / dd * 40 * dt; B.y += dy / dd * 40 * dt; clampBoss(B); } if (B.st > 1.2) bossRest(B, 0.2); break; }
    case 'laserWind': B.st -= dt; if (B.st <= 0) { B.state = 'laser'; B.st = 1.7; SFX.play('boss'); } break;
    case 'laser': {
      B.st -= dt; const ex = B.x + Math.cos(B.dir) * 16, ey = B.y - 50, bx = ex + Math.cos(B.dir) * 380, by = ey + Math.sin(B.dir) * 380;
      if (!fainted && !P.dash && segDist(P.x, P.y - 14, ex, ey, bx, by) < 16) damagePlayer(2, { x: P.x - Math.cos(B.dir) * 20, y: P.y - Math.sin(B.dir) * 20 });
      if (Math.random() < dt * 30) particles.push({ x: ex + Math.cos(B.dir) * rng() * 300, y: ey + Math.sin(B.dir) * rng() * 300, vx: 0, vy: -20, life: 0.3, color: '#bfefff', size: 3 });
      if (B.st <= 0) { B.state = 'dazed'; B.st = 1.8; floatText(B.x, B.y - 120, 'Overheated! Strike now!', '#ffe08a'); SFX.play('crumble'); }
      break;
    }
    case 'slamWind': B.st -= dt; B.z = (1 - B.st / 0.7) * 30; if (B.st <= 0) { B.z = 0; impact(10); hitStop = 0.07; SFX.play('slam'); B.ring = { x: B.x, y: B.y, r: 30, max: 190, hit: false }; if (d < 70 && !fainted) damagePlayer(2, B); bossRest(B, 0.8); } break;
    case 'orbs': B.st -= dt; if (B.st <= 0) { for (const off of B.phase === 1 ? [0] : [-0.5, 0, 0.5]) projectiles.push({ kind: 'wisp', x: B.x + Math.cos(B.dir) * 20, y: B.y - 50, ang: B.dir + off, t: 0, life: 3.4 }); SFX.play('wisp'); bossRest(B, 0.6); } break;
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['windling', 'windling'], 4); bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.4); break;
  }
}
function drawAegis(c, B) {
  const dir = B.dir === undefined ? Math.PI / 2 : B.dir, x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y - 50 - (B.z || 0) + Math.sin(B.anim * 2) * 4, fx = Math.cos(dir), fy = Math.sin(dir);
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 40, 12);
  if (B.state === 'laserWind') { c.strokeStyle = `rgba(127,224,240,${0.3 + (1 - B.st / 0.8) * 0.5})`; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(x + fx * 16, y); c.lineTo(x + fx * 380, y + fy * 380); c.stroke(); c.setLineDash([]); }
  if (B.state === 'laser') { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(127,224,240,.6)'; c.lineWidth = 16; c.beginPath(); c.moveTo(x + fx * 16, y); c.lineTo(x + fx * 380, y + fy * 380); c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 5; c.stroke(); c.restore(); }
  c.globalAlpha = 1; bossFlash(c, B);
  const hot = B.state === 'dazed';
  c.fillStyle = '#6a6458'; c.beginPath(); c.moveTo(x, y - 46); c.lineTo(x + 34, y); c.lineTo(x, y + 44); c.lineTo(x - 34, y); c.closePath(); c.fill();
  c.fillStyle = hot ? '#c88a5a' : '#a49e8f'; c.beginPath(); c.moveTo(x, y - 46); c.lineTo(x - 34, y); c.lineTo(x, y); c.closePath(); c.fill();
  c.strokeStyle = hot ? '#ff9a3c' : '#7fe0f0'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 20, y - 6); c.lineTo(x, y + 20); c.lineTo(x + 20, y - 6); c.stroke();
  c.fillStyle = B.state === 'laserWind' || B.state === 'laser' ? '#ffffff' : hot ? '#ff9a3c' : '#7fe0f0'; circle(c, x + fx * 14, y + fy * 8, 7);
  // the great shield on its facing side
  c.save(); c.translate(x + fx * 42, y + fy * 22); c.rotate(dir + Math.PI / 2);
  c.fillStyle = '#3a4a5a'; c.fillRect(-36, -6, 72, 13); c.fillStyle = '#5a6e82'; c.fillRect(-32, -4, 64, 5); c.fillStyle = '#7fe0f0'; c.fillRect(-24, 2, 48, 2); c.restore();
  c.globalAlpha = 1;
  if (B.state === 'laserWind' || B.state === 'slamWind' || B.state === 'orbs') bossWarn(c, { x }, y - 70);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 20, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 60, 24);
}
// ---------- the Stormlord: out of reach until its own storm orb knocks it down ----------
function stormDaze(B) { B.state = 'dazed'; B.st = 3.2; B.z = 0; impact(12); SFX.play('slam'); floatText(B.x, B.y - 110, 'Knocked out of the sky! Strike now!', '#ffe08a'); }
function updateStorm(B, dt, fainted, d) {
  const A = B.arena, fly = 60;
  if (B.gust) { B.gust.t -= dt; if (!fainted && !P.dash) moveBody(P, B.gust.dx * 150 * dt, B.gust.dy * 150 * dt, 9); if (Math.random() < dt * 40) particles.push({ x: P.x + (rng() - 0.5) * 700, y: P.y + (rng() - 0.5) * 300, vx: B.gust.dx * 400, vy: B.gust.dy * 400, life: 0.4, color: '#ffffff', size: 2 }); if (B.gust.t <= 0) B.gust = null; }
  if (B.state !== 'dazed' && B.state !== 'dying') B.z += (fly - B.z) * Math.min(1, dt * 3);
  switch (B.state) {
    case 'drift': { B.st += dt; const a = B.anim * 0.9, tx = A.cx + Math.cos(a) * 200, ty = A.cy + Math.sin(a * 1.6) * 50, dx = tx - B.x, dy = ty - B.y, dd = Math.hypot(dx, dy) || 1; B.x += dx / dd * Math.min(dd, 150 * dt); B.y += dy / dd * Math.min(dd, 150 * dt); if (B.st > 1.5) bossRest(B, 0.1); break; }
    case 'bolts':
      B.st -= dt;
      if (B.st <= 0) {
        const n = B.phase === 1 ? 4 : B.phase === 2 ? 6 : 8;
        for (let i = 0; i < n; i++) { const tx = i === 0 ? P.x : P.x + (rng() - 0.5) * 300, ty = i === 0 ? P.y : P.y + (rng() - 0.5) * 160; projectiles.push({ kind: 'bolt', vx: 0, vy: 0, x: Math.max(A.x0 + 30, Math.min(A.x1 - 30, tx)), y: Math.max(A.y0 + 40, Math.min(A.y1 - 10, ty)), t: -i * 0.18, life: 0.95 }); }
        bossRest(B, 0.9);
      }
      break;
    case 'orb': B.st -= dt; if (B.st <= 0) { projectiles.push({ kind: 'orb', owner: B, x: B.x, y: B.y - 44 - B.z, ang: Math.atan2(P.y - B.y, P.x - B.x), sp: 110, t: 0, life: 9 }); SFX.play('wisp'); bossRest(B, 1.6); } break;
    case 'gust':
      B.st -= dt;
      if (B.st <= 0) { const a = rng() < 0.5 ? 0 : Math.PI; B.gust = { dx: Math.cos(a), dy: 0, t: 2.2 }; SFX.play('dash'); floatText(P.x, P.y - 70, 'A gale!', '#dff6ff'); if (B.phase >= 2) for (let i = 0; i < 4; i++) projectiles.push({ kind: 'bolt', vx: 0, vy: 0, x: A.x0 + 60 + rng() * (A.x1 - A.x0 - 120), y: A.y0 + 60 + rng() * (A.y1 - A.y0 - 80), t: -0.4 - i * 0.3, life: 0.95 }); bossRest(B, 1); }
      break;
    case 'summon': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['windling', 'puff'], 4); SFX.play('boss'); bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) { bossRest(B, 0.4); } break;
  }
}
function drawStormlord(c, B) {
  const z = B.z || 0, x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y - z - 40 + Math.sin(B.anim * 2) * 4, down = B.state === 'dazed';
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 40 * Math.max(0.5, 1 - z / 150), 12);
  c.globalAlpha = 1; bossFlash(c, B);
  // swirling storm-cloud robe
  for (let i = 0; i < 7; i++) { const a = time * 1.5 + i * 0.9, r = 26 + (i % 3) * 6; c.fillStyle = i % 2 ? '#4a5268' : '#5f6a84'; circle(c, x + Math.cos(a) * r * 0.8, y + 18 + Math.sin(a) * 8, 16 + (i % 2) * 4); }
  c.fillStyle = '#3a4258'; ellipse(c, x, y, 26, 34); c.fillStyle = '#6a7898'; ellipse(c, x - 6, y - 8, 14, 22);
  // crown of lightning
  c.fillStyle = down ? '#9a9a9a' : '#fff6a8'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 9 - 4, y - 30); c.lineTo(x + i * 9, y - 48 - (i === 0 ? 8 : 0)); c.lineTo(x + i * 9 + 4, y - 30); c.closePath(); c.fill(); }
  c.fillStyle = down ? '#ffe08a' : '#bfefff'; c.fillRect(x - 11, y - 16, 7, 4); c.fillRect(x + 4, y - 16, 7, 4);
  // arms crackling
  if (!down) { c.strokeStyle = 'rgba(255,246,168,.8)'; c.lineWidth = 2; for (const s of [-1, 1]) { c.beginPath(); let bx = x + s * 24, by = y; c.moveTo(bx, by); for (let i = 0; i < 4; i++) { bx += s * (6 + Math.random() * 6); by += (Math.random() - 0.5) * 14; c.lineTo(bx, by); } c.stroke(); } }
  c.globalAlpha = 1;
  if (B.state === 'bolts' || B.state === 'orb' || B.state === 'gust') bossWarn(c, { x }, y - 70);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 10, z: 0, anim: B.anim });
  if (down) drawStars(c, x, y - 60, 26);
}
function drawSpireGate(c) {
  const x = SPIRE.x, y = SPIRE.y;
  c.fillStyle = 'rgba(0,0,0,.25)'; ellipse(c, x, y - 2, 60, 12);
  c.fillStyle = '#c8c4b8'; c.fillRect(x - 40, y - 110, 80, 110); c.fillStyle = '#e6e2d6'; c.fillRect(x - 36, y - 110, 30, 110);
  c.fillStyle = '#8a8478'; for (let i = 0; i < 5; i++) c.fillRect(x - 40, y - 100 + i * 22, 80, 2);
  c.fillStyle = '#5a6e82'; c.beginPath(); c.moveTo(x - 46, y - 110); c.lineTo(x, y - 170); c.lineTo(x + 46, y - 110); c.closePath(); c.fill(); c.fillStyle = '#7f98b0'; c.beginPath(); c.moveTo(x - 46, y - 110); c.lineTo(x, y - 170); c.lineTo(x - 6, y - 110); c.closePath(); c.fill();
  c.strokeStyle = '#fff6a8'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 170); c.lineTo(x, y - 190); c.stroke();
  if (Math.sin(time * 1.7) > 0.93) { c.strokeStyle = '#fff6a8'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - 190); c.lineTo(x - 8, y - 220); c.lineTo(x + 4, y - 240); c.lineTo(x - 4, y - 270); c.stroke(); }
  c.fillStyle = '#1a2230'; c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 16, y - 34); c.quadraticCurveTo(x, y - 52, x + 16, y - 34); c.lineTo(x + 16, y); c.closePath(); c.fill();
  const g = 0.35 + Math.sin(time * 3) * 0.15; c.fillStyle = `rgba(127,224,240,${g})`; c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x - 12, y - 30); c.quadraticCurveTo(x, y - 46, x + 12, y - 30); c.lineTo(x + 12, y); c.closePath(); c.fill();
}
// ---------- Duskhollow creatures: skeletons, shades, banshees, gloom hounds ----------
function updateDuskFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'skel') {
    if (e.rise === undefined) { e.rise = 1; e.state = 'buried'; }
    if (e.state === 'buried') { if (!fainted && d < 120) { e.state = 'rising'; e.st = 0.8; SFX.play('crumble'); burst(e.x, e.y, '#6a5a4a', 10); } return true; }
    if (e.state === 'rising') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 1; } return true; }
    if (e.state === 'pile') { e.st -= dt; if (e.st <= 0) { e.hp = e.max; e.state = 'rising'; e.st = 0.6; floatText(e.x, e.y - 50, 'It pulls itself back together!', '#e6dcc8'); SFX.play('crumble'); } return true; }
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { projectiles.push({ kind: 'rock', bone: true, sx: e.x, sy: e.y - 30, x: e.x, y: e.y - 30, tx: P.x, ty: P.y, t: 0, dur: 0.8, z: 0 }); SFX.play('swing'); e.state = 'move'; e.cd = 2.4 + rng(); } return true; }
    if (chase) { if (d > 40) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d > 70 && d < 220 && e.cd <= 0) { e.state = 'windup'; e.st = 0.5; } } else wander(D.sp);
    touch(D.dmg); return true;
  }
  if (ai === 'shade') {
    e.lit = inLanternLight(e.x, e.y) || gearW().glow;
    if (chase) { const a = Math.sin(e.anim * 2) * 0.6, ux = dx / d, uy = dy / d; moveEnemy(e, (ux * Math.cos(a) - uy * Math.sin(a)) * D.sp * dt, (uy * Math.cos(a) + ux * Math.sin(a)) * D.sp * dt); }
    else moveEnemy(e, Math.cos(e.anim * 0.8) * 20 * dt + (e.hx - e.x) * 0.3 * dt, Math.sin(e.anim * 0.6) * 20 * dt + (e.hy - e.y) * 0.3 * dt);
    if (d < 20 && !fainted && P.inv <= 0) { damagePlayer(D.dmg, e); if (e.hp < e.max) e.hp++; floatText(e.x, e.y - 50, 'It drains you!', '#b8a8ff'); }
    return true;
  }
  if (ai === 'banshee') {
    if (e.state === 'wail') {
      e.st -= dt;
      if (e.st <= 0) { e.state = 'move'; e.cd = 3 + rng(); SFX.play('wisp'); impact(4); if (!fainted && !P.dash && d < 170) { damagePlayer(1, e); if (!gearA().warm) P.slow = 1.4; floatText(P.x, P.y - 60, 'Chilled by the wail!', '#d6e8ff'); } }
      return true;
    }
    if (chase) { const want = d > 140 ? 1 : d < 100 ? -1 : 0, a = e.anim * 1.2; moveEnemy(e, (dx / d * want + Math.cos(a) * 0.5) * D.sp * dt, (dy / d * want + Math.sin(a) * 0.5) * D.sp * dt); if (e.cd <= 0 && d < 200) { e.state = 'wail'; e.st = 0.9; } }
    else wander(D.sp * 0.5);
    return true;
  }
  if (ai === 'hound') {
    if (e.state === 'crouch') { e.st -= dt; if (e.st <= 0) { e.state = 'pounce'; e.st = 0.3; e.lx = dx / d * 420; e.ly = dy / d * 420; e.hit = false; SFX.play('leap'); } return true; }
    if (e.state === 'pounce') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 24 && !fainted) { e.hit = true; damagePlayer(D.dmg, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 1.8 + rng() * 0.6; } return true; }
    if (chase) { moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 120 && e.cd <= 0) { e.state = 'crouch'; e.st = 0.35; } } else wander(D.sp * 0.6);
    touch(D.dmg); return true;
  }
  return updateCaveFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
Object.assign(PROC_DRAW, {
  skel(c, e, k) {
    if (e.state === 'buried') { c.fillStyle = '#3a2e24'; ellipse(c, e.x, e.y, 14, 5); c.fillStyle = '#e6dcc8'; c.fillRect(e.x - 2, e.y - 7 + Math.sin(e.anim * 3) * 1.5, 3, 7); c.fillRect(e.x - 4, e.y - 8 + Math.sin(e.anim * 3) * 1.5, 7, 2); return; }
    if (e.state === 'pile') { c.fillStyle = '#e6dcc8'; for (const [ox, oy, w, h] of [[-8, -3, 9, 3], [2, -2, 8, 3], [-3, -6, 7, 5], [6, -5, 4, 2]]) c.fillRect(e.x + ox, e.y + oy, w, h); c.fillStyle = '#1a1210'; c.fillRect(e.x - 1, e.y - 5, 2, 2); return; }
    const rise = e.state === 'rising' ? Math.max(0, e.st) / 0.8 : 0, y = e.y + rise * 24, walk = Math.sin(e.anim * 8) * 2, f = P.x < e.x ? -1 : 1;
    shadow(c, e.x, e.y + 2, 10 * k, 3 * k);
    c.save(); c.beginPath(); c.rect(e.x - 30, e.y - 60, 60, 62); c.clip();
    c.fillStyle = '#e6dcc8'; c.fillRect(e.x - 5, y - 10 + walk, 3, 10); c.fillRect(e.x + 2, y - 10 - walk, 3, 10);
    c.fillRect(e.x - 1, y - 26, 2, 16); for (let i = 0; i < 3; i++) c.fillRect(e.x - 6, y - 24 + i * 4, 12, 2);
    c.fillRect(e.x - 9, y - 24, 2, 11); c.fillRect(e.x + 7, y - 24 + (e.state === 'windup' ? -8 : 0), 2, 11);
    c.fillStyle = '#efe6d8'; circle(c, e.x, y - 32, 7); c.fillStyle = '#1a1210'; c.fillRect(e.x - 4 + f, y - 34, 3, 3); c.fillRect(e.x + 1 + f, y - 34, 3, 3); c.fillRect(e.x - 2, y - 28, 4, 1);
    c.restore();
    if (e.state === 'rising') { c.fillStyle = '#3a2e24'; ellipse(c, e.x, e.y + 1, 14, 5); }
  },
  shade(c, e, k) {
    const y = e.y - 28 + Math.sin(e.anim * 2.5) * 4, a = e.lit ? 0.85 : 0.35;
    c.fillStyle = `rgba(30,24,50,${a})`; c.beginPath(); c.moveTo(e.x - 12 * k, y + 16); c.quadraticCurveTo(e.x - 14 * k, y - 14, e.x, y - 16 * k); c.quadraticCurveTo(e.x + 14 * k, y - 14, e.x + 12 * k, y + 16);
    for (let i = 0; i < 4; i++) c.lineTo(e.x + 12 * k - (i + 0.5) * 6 * k, y + 16 + (i % 2 ? -5 : 4) + Math.sin(time * 6 + i) * 2); c.closePath(); c.fill();
    c.fillStyle = e.lit ? '#ffe08a' : '#b8a8ff'; c.fillRect(e.x - 5 * k, y - 6, 3, 2); c.fillRect(e.x + 2 * k, y - 6, 3, 2);
    if (e.lit && Math.random() < 0.2) particles.push({ x: e.x + (Math.random() - 0.5) * 16, y: y + 10, vx: 0, vy: -20, life: 0.4, color: '#b8a8ff', size: 2 });
  },
  banshee(c, e, k) {
    const y = e.y - 34 + Math.sin(e.anim * 2) * 5, w = e.state === 'wail';
    if (w) { const pr = 1 - e.st / 0.9; c.strokeStyle = `rgba(214,232,255,${0.25 + pr * 0.5})`; c.lineWidth = 3; c.beginPath(); c.ellipse(e.x, e.y, 170 * pr, 170 * pr * 0.7, 0, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = 'rgba(214,226,255,.7)'; c.beginPath(); c.moveTo(e.x - 10 * k, y); c.quadraticCurveTo(e.x - 16 * k, y + 26, e.x - 4, y + 30); c.lineTo(e.x + 4, y + 22); c.lineTo(e.x + 10, y + 30); c.quadraticCurveTo(e.x + 16 * k, y + 26, e.x + 10 * k, y); c.closePath(); c.fill();
    c.fillStyle = '#e6eeff'; circle(c, e.x, y - 4, 8 * k);
    c.strokeStyle = '#c8d0e8'; c.lineWidth = 2; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(e.x + s * 6, y - 10); c.quadraticCurveTo(e.x + s * 16, y - 2 + Math.sin(time * 4) * 3, e.x + s * 14, y + 16); c.stroke(); }
    c.fillStyle = '#1a1a2a'; c.fillRect(e.x - 4, y - 7, 3, 3); c.fillRect(e.x + 1, y - 7, 3, 3); c.beginPath(); c.ellipse(e.x, y + (w ? 0 : -1), 2.5, w ? 4 : 1.5, 0, 0, Math.PI * 2); c.fill();
  },
  hound(c, e, k) {
    const f = (e.state === 'pounce' ? e.lx : P.x - e.x) < 0 ? -1 : 1, low = e.state === 'crouch' ? 4 : 0, lift = e.state === 'pounce' ? Math.sin(Math.PI * Math.max(0, 1 - e.st / 0.3)) * 14 : 0, walk = Math.sin(e.anim * 12) * 2;
    shadow(c, e.x, e.y + 2, 14 * k, 4 * k);
    const y = e.y - lift + low;
    c.fillStyle = '#1e1c2a'; for (const ox of [-8, -3, 4, 9]) c.fillRect(e.x + ox * f - 1.5, y - 8 + (ox % 2 ? walk : -walk), 3, 8);
    c.fillStyle = '#2e2a40'; ellipse(c, e.x, y - 11, 13, 6); ellipse(c, e.x + f * 12, y - 15, 6, 5); c.beginPath(); c.moveTo(e.x + f * 10, y - 19); c.lineTo(e.x + f * 12, y - 25); c.lineTo(e.x + f * 14, y - 19); c.fill();
    c.strokeStyle = '#2e2a40'; c.lineWidth = 3; c.beginPath(); c.moveTo(e.x - f * 12, y - 12); c.quadraticCurveTo(e.x - f * 18, y - 18, e.x - f * 20, y - 14 + walk); c.stroke();
    c.fillStyle = '#ff5050'; c.fillRect(e.x + f * 14 - 1, y - 17, 2, 2);
  },
});
function drawGrave(c, o) {
  const x = o.x, y = o.y, v = o.v || 0, tilt = ((v * 7) % 5 - 2) * 0.04;
  shadow(c, x, y + 2, 12, 4);
  c.save(); c.translate(x, y); c.rotate(tilt);
  c.fillStyle = '#3a3640'; c.fillRect(-10, -4, 20, 6);
  if (v % 3 === 0) { c.fillStyle = '#6a6672'; c.fillRect(-3, -30, 6, 28); c.fillRect(-10, -24, 20, 6); }
  else { c.fillStyle = '#6a6672'; c.beginPath(); c.moveTo(-10, -2); c.lineTo(-10, -18); c.arc(0, -18, 10, Math.PI, 0); c.lineTo(10, -2); c.closePath(); c.fill(); c.fillStyle = '#4a4652'; c.fillRect(-5, -18, 10, 2); c.fillRect(-4, -13, 8, 2); }
  c.restore();
}
function drawLantern(c, L) {
  const lit = lanternLit(L), x = L.x, y = L.y;
  shadow(c, x, y + 2, 10, 4);
  c.fillStyle = '#3a3640'; c.fillRect(x - 3, y - 40, 6, 42); c.fillStyle = '#5a5662'; c.fillRect(x - 8, y - 4, 16, 6);
  c.fillStyle = '#2a2630'; c.fillRect(x - 9, y - 58, 18, 18); c.fillStyle = '#4a4652'; c.beginPath(); c.moveTo(x - 11, y - 58); c.lineTo(x, y - 66); c.lineTo(x + 11, y - 58); c.closePath(); c.fill();
  if (lit) { const f = 0.8 + Math.sin(time * 8 + L.i) * 0.15; c.fillStyle = `rgba(190,210,255,${f})`; c.fillRect(x - 6, y - 55, 12, 12); c.fillStyle = '#ffffff'; c.fillRect(x - 2, y - 52, 4, 6); }
  else { c.fillStyle = '#14121a'; c.fillRect(x - 6, y - 55, 12, 12); if (Math.sin(time * 3 + L.i) > 0.6) { c.fillStyle = 'rgba(184,168,255,.5)'; c.fillRect(x - 1, y - 50, 2, 2); } }
}
function hitLanterns(hx, hy, rad) {
  if (dungeonAt(P.x) !== DUSK_D) return;
  for (const L of LANTERNS) {
    if (lanternLit(L) || Math.hypot(L.x - hx, L.y - 40 - hy) > rad + 16) continue;
    S.found['lan' + L.i] = true; SFX.play('lucky'); burst(L.x, L.y - 50, '#bfd2ff', 18);
    floatText(L.x, L.y - 80, `Lantern lit! ${litLanterns()} / ${LANTERNS.length}`, '#d6e2ff'); questTick(); save();
    if (litLanterns() === LANTERNS.length) setTimeout(() => banner('Every spirit lantern burns!', '#d6e2ff'), 600);
  }
}
function drawSpiritGate(c, x, y, home) {
  shadow(c, x, y + 2, 34, 8);
  c.fillStyle = '#4a4652'; c.fillRect(x - 32, y - 70, 12, 72); c.fillRect(x + 20, y - 70, 12, 72); c.fillStyle = '#5a5662'; c.fillRect(x - 38, y - 84, 76, 16); c.fillStyle = '#6a6672'; c.fillRect(x - 36, y - 82, 72, 5);
  const g = 0.35 + Math.sin(time * 2.5) * 0.15;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) { c.strokeStyle = `rgba(160,140,255,${g * (1 - i * 0.25)})`; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y - 34, 16 - i * 4, 30 - i * 7, 0, time * (1 + i) , time * (1 + i) + 4.5); c.stroke(); }
  c.fillStyle = `rgba(120,100,220,${g * 0.5})`; c.fillRect(x - 20, y - 68, 40, 68); c.restore();
  if (Math.random() < 0.15) particles.push({ x: x + (Math.random() - 0.5) * 36, y: y - 10, vx: 0, vy: -30, life: 0.9, color: '#b8a8ff', size: 2 });
}
let darkCv = null;
function drawDarkness(c, camX, camY, k) {
  if (!darkCv || darkCv.width !== c.canvas.width || darkCv.height !== c.canvas.height) { darkCv = document.createElement('canvas'); darkCv.width = c.canvas.width; darkCv.height = c.canvas.height; }
  const d = darkCv.getContext('2d'), sx = wx => (wx - camX) * k, sy = wy => (wy - camY) * k;
  d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, darkCv.width, darkCv.height); d.fillStyle = 'rgba(6,6,22,.88)'; d.fillRect(0, 0, darkCv.width, darkCv.height);
  d.globalCompositeOperation = 'destination-out';
  const light = (wx, wy, r) => { const x = sx(wx), y = sy(wy), R = r * k; if (x < -R || y < -R || x > darkCv.width + R || y > darkCv.height + R) return; const g = d.createRadialGradient(x, y, R * 0.25, x, y, R); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); d.fillStyle = g; d.fillRect(x - R, y - R, R * 2, R * 2); };
  light(P.x, P.y - 20, gearW().glow ? 230 : 160);
  const HD = dungeonAt(P.x);
  if (HD === VAULT_D) {
    const g = dgs(VAULT_D);
    for (const sw of VAULT_D.switches) light(sw.x, sw.y - 30, g.switches[sw.id] ? 175 : 30);
    for (const t of VAULT_D.torches) light((VAULT_D.x0 + t.x) * T + 16, t.y * T + 24, 70 + Math.sin(time * 9 + t.x) * 4);
    for (const r of resources) if (r.alive && r.type === 'crystal' && r.x > VAULT_D.x0 * T && r.x < (VAULT_D.x0 + DW) * T) light(r.x, r.y - 16, 85);
    for (const n of NPCS) if (n.id.startsWith('cart_2')) light(n.x, n.y - 20, 90);
    light((VAULT_D.x0 + 20) * T, 42 * T, 90);
    for (const B of BOSSES) if (B.active && B.type === 'mole') { for (const pl of B.pillars || []) if (pl.hp > 0) light(pl.x, pl.y - 30, 70); light(B.x, B.y - 20, 60); }
    for (const B of BOSSES) if (B.active && B.type === 'hydra') { light(B.x, B.y - 30, 150); for (const h of B.heads || []) if (!h.dead) light(h.x, h.y - h.z - 10, 70); }
  } else if (HD === CAVE_D) {
    for (const r of resources) if (r.alive && r.type === 'crystal' && r.x > CAVE_D.x0 * T && r.x < (CAVE_D.x0 + DW) * T) light(r.x, r.y - 16, 85 + Math.sin(time * 2 + r.seed * 9) * 6);
    for (const o of decor) if (o.glowcap) light(o.x, o.y - 8, 46);
    light(CAVE_D.camp.x + 10, CAVE_D.camp.y + 60, 210 + Math.sin(time * 9) * 6);
    for (const n of NPCS) if (n.id === 'lift_home' || n.id.startsWith('cart_')) light(n.x, n.y - 20, 80);
  } else if (HD === OSS_D) {
    const g = dgs(OSS_D);
    for (const sw of OSS_D.switches) light(sw.x, sw.y - 30, g.switches[sw.id] ? 185 + Math.sin(time * 6 + sw.x) * 6 : 24);
    for (const t of OSS_D.torches) light((OSS_D.x0 + t.x) * T + 16, t.y * T + 24, 70 + Math.sin(time * 9 + t.x) * 4);
    light((OSS_D.x0 + 20) * T, 42 * T, 90);
    for (const B of BOSSES) if (B.active && (B.type === 'shadow' || B.type === 'lich')) {
      if (B.type === 'shadow') { const i = shadowPoolLit(B); if (i >= 0) { const pl = shadowPools(B)[i]; light(pl.x, pl.y - 10, 110); } }
      else { for (const j of B.jars || []) if (j.hp > 0) light(j.x, j.y - 20, 70); light(B.x, B.y - 50, 80); }
    }
  } else {
    for (const L of LANTERNS) if (lanternLit(L)) light(L.x, L.y - 40, 190 + Math.sin(time * 4 + L.i) * 6); else light(L.x, L.y - 50, 26);
    light(DUSK_D.camp.x + 10, DUSK_D.camp.y + 60, 210 + Math.sin(time * 9) * 6);
    for (const n of NPCS) if (n.id === 'gate_home') light(n.x, n.y - 30, 90);
  }
  for (const p of projectiles) if (p.kind === 'fire' || p.kind === 'wisp') light(p.x, p.y, 40);
  c.drawImage(darkCv, 0, 0);
  // glowing eyes in the dark
  for (const e of enemies) {
    if (!e.alive || e.state === 'buried' || e.state === 'pile' || !HD || e.x < HD.x0 * T || e.x > (HD.x0 + DW) * T) continue;
    const x = sx(e.x), y = sy(e.y - (e.kind === 'banshee' ? 40 : e.kind === 'shade' ? 34 : e.kind === 'hound' ? 16 : 32)); if (x < 0 || y < 0 || x > darkCv.width || y > darkCv.height) continue;
    c.fillStyle = e.kind === 'hound' ? 'rgba(255,80,80,.85)' : 'rgba(200,190,255,.75)'; c.fillRect(x - 4 * k, y, 2 * k, 2 * k); c.fillRect(x + 2 * k, y, 2 * k, 2 * k);
  }
  c.fillStyle = 'rgba(70,90,160,.10)'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
}
// ---------- the Shadow: your mirror image, solid only inside the lit circle ----------
function shadowPools(B) { const A = B.arena; return [[A.cx, A.y0 + 2.2 * T], [A.cx, A.cy], [A.cx, A.y1 - 2 * T]].map(([x, y]) => ({ x, y })); }
function shadowPoolLit(B) {
  if (B.phase === 3) return ((time % 4) < 2.6) ? 1 : -1;
  return Math.floor(time / 4.5) % 3;
}
function shadowInLight(B) { const i = shadowPoolLit(B); if (i < 0) return false; const pl = shadowPools(B)[i]; return Math.hypot(B.x - pl.x, (B.y - pl.y) / 0.8) < 62; }
let shadowHint = false;
function updateShadow(B, dt, fainted, d) {
  const A = B.arena, point = B.phase === 3;
  const tx = Math.max(A.x0 + 30, Math.min(A.x1 - 30, 2 * A.cx - P.x)), ty = Math.max(A.y0 + 44, Math.min(A.y1 - 12, point ? 2 * A.cy - P.y : P.y));
  const follow = sp => { const dx = tx - B.x, dy = ty - B.y, dd = Math.hypot(dx, dy) || 1; B.x += dx / dd * Math.min(dd, sp * dt); B.y += dy / dd * Math.min(dd, sp * dt); };
  switch (B.state) {
    case 'mirror': B.st += dt; follow(230); if (d < 56 && B.st > 0.6) { B.state = 'slashWind'; B.st = 0.45; } else if (B.st > 2.6) bossRest(B, 0.1); break;
    case 'slashWind': B.st -= dt; if (B.st <= 0) { SFX.play('swing'); if (!fainted && !P.dash && d < 60) damagePlayer(2, B); bossRest(B, 0.5); } break;
    case 'daggers':
      B.st -= dt; follow(120);
      if (B.st <= 0) { const a = Math.atan2(P.y - 14 - (B.y - 30), P.x - B.x), n = B.phase === 1 ? 1 : 3; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.35; projectiles.push({ kind: 'hex', x: B.x, y: B.y - 30, vx: Math.cos(a + o) * 170, vy: Math.sin(a + o) * 170, ang: a + o, t: 0, life: 2.2 }); } SFX.play('wisp'); bossRest(B, 0.4); }
      break;
    case 'lunge': B.st -= dt; if (B.st > 0.3) follow(60); else { B.x += B.vx * dt; B.y += B.vy * dt; clampBoss(B); if (!B.lhit && !fainted && !P.dash && d < 30) { B.lhit = true; damagePlayer(2, B); } } if (B.st <= 0) { B.lhit = false; bossRest(B, 0.5); } if (B.st > 0.3 && B.st - dt <= 0.3) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd * 420; B.vy = dy / dd * 420; SFX.play('dash'); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
  if (B.state === 'rest') follow(200);
}
function drawShadowBoss(c, B) {
  const pools = shadowPools(B), lit = shadowPoolLit(B);
  pools.forEach((pl, i) => { const on = i === lit && B.active; c.fillStyle = on ? 'rgba(255,240,190,.28)' : 'rgba(120,110,160,.10)'; ellipse(c, pl.x, pl.y, 62, 50); c.strokeStyle = on ? 'rgba(255,240,190,.6)' : 'rgba(150,140,200,.25)'; c.lineWidth = 2; c.beginPath(); c.ellipse(pl.x, pl.y, 62, 50, 0, 0, Math.PI * 2); c.stroke(); });
  if (B.active) { c.strokeStyle = 'rgba(184,168,255,.18)'; c.lineWidth = 1; c.setLineDash([4, 8]); c.beginPath(); c.moveTo(B.arena.cx, B.arena.y0 + 40); c.lineTo(B.arena.cx, B.arena.y1); c.stroke(); c.setLineDash([]); }
  const solid = shadowInLight(B) || B.state === 'dazed';
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 16, 5);
  c.save(); c.globalAlpha = (solid ? 0.95 : 0.55) * (B.hurt > 0 ? 0.6 : 1);
  const fx = B.state === 'mirror' ? -(P.fx || 0) : P.x < B.x ? -1 : 1, swing = B.state === 'slashWind' ? (1 - B.st / 0.45) : 0;
  c.fillStyle = '#14101e'; ellipse(c, B.x, B.y - 18, 11, 16); circle(c, B.x, B.y - 40, 9); c.fillRect(B.x - 8, B.y - 6, 5, 8); c.fillRect(B.x + 3, B.y - 6, 5, 8);
  c.fillStyle = '#2a2040'; c.beginPath(); c.moveTo(B.x - 9, B.y - 44); c.lineTo(B.x - 13, B.y - 52); c.lineTo(B.x - 3, B.y - 48); c.lineTo(B.x + 4, B.y - 54); c.lineTo(B.x + 10, B.y - 46); c.closePath(); c.fill();
  c.fillStyle = solid ? '#ffe08a' : '#b8a8ff'; c.fillRect(B.x - 5 + fx * 2, B.y - 42, 3, 2); c.fillRect(B.x + 2 + fx * 2, B.y - 42, 3, 2);
  c.save(); c.translate(B.x + fx * 10, B.y - 22); c.rotate(fx * (-1.2 + swing * 2.4)); c.fillStyle = '#3a2e5a'; c.fillRect(-2, -30, 4, 30); c.fillStyle = '#b8a8ff'; c.fillRect(-1, -28, 2, 24); c.restore();
  c.restore();
  if (B.state === 'slashWind' || B.state === 'lunge' && B.st > 0.3) bossWarn(c, B, B.y - 70);
  if (B.state === 'sleep') bossZ(c, { x: B.x, y: B.y - 30, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 60, 16);
}
// ---------- the Lich King: shielded by soul jars ----------
function makeJars(B) { return [[9, 3], [30, 3], [19.5, 9.2]].map(([x, y]) => ({ x: (OSS_D.x0 + x) * T, y: y * T + 16, hp: 3 })); }
let lichHint = false;
function hitJars(B, hx, hy, rad) {
  if (B.type !== 'lich' || !B.jars || !B.active) return;
  for (const j of B.jars) {
    if (j.hp <= 0 || Math.hypot(j.x - hx, j.y - 16 - hy) > rad + 16) continue;
    j.hp--; burst(j.x, j.y - 20, '#7fe07a', 10); SFX.play('mine');
    if (j.hp <= 0) { SFX.play('crumble'); burst(j.x, j.y - 20, '#bfffb0', 24); floatText(j.x, j.y - 50, 'Soul jar shattered!', '#bfffb0');
      if (B.jars.every(q => q.hp <= 0)) { B.state = 'dazed'; B.st = 2.6; B.z = 0; impact(10); floatText(B.x, B.y - 110, 'His shield breaks! Strike now!', '#ffe08a'); } }
  }
}
function updateLich(B, dt, fainted, d) {
  const A = B.arena;
  if (B.jarPhase !== B.phase) { B.jarPhase = B.phase; B.jars = makeJars(B); }
  switch (B.state) {
    case 'float': {
      B.st += dt; const live = B.jars.filter(j => j.hp > 0), tgt = live.length ? live[Math.floor(B.anim / 3) % live.length] : { x: A.cx, y: A.cy };
      const dx = tgt.x - B.x, dy = tgt.y + 40 - B.y, dd = Math.hypot(dx, dy) || 1; if (dd > 40) { B.x += dx / dd * 70 * dt; B.y += dy / dd * 70 * dt; clampBoss(B); }
      if (B.st > 1.6) bossRest(B, 0.1);
      break;
    }
    case 'bones':
      B.st -= dt;
      if (B.st <= 0) { const lines = B.phase === 1 ? 3 : 5, base = Math.atan2(P.y - B.y, P.x - B.x); for (let l = 0; l < lines; l++) { const a = base + (l - (lines - 1) / 2) * 0.35; for (let i = 1; i <= 9; i++) projectiles.push({ kind: 'spike', bonespike: true, vx: 0, vy: 0, x: B.x + Math.cos(a) * i * 32, y: B.y + Math.sin(a) * i * 24, t: -i * 0.06, life: 0.95 }); } SFX.play('crumble'); bossRest(B, 0.7); }
      break;
    case 'skulls': B.st -= dt; if (B.st <= 0) { for (const o of [-0.6, 0, 0.6]) projectiles.push({ kind: 'wisp', x: B.x, y: B.y - 50, ang: Math.atan2(P.y - B.y, P.x - B.x) + o, t: 0, life: 3.4 }); SFX.play('wisp'); bossRest(B, 0.6); } break;
    case 'raise': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['skeleton', 'shade'], 4); for (const e of enemies) if (e.minion && e.kind === 'skeleton' && e.rise === undefined) { e.rise = 1; e.state = 'rising'; e.st = 0.8; } SFX.play('boss'); bossRest(B, 0.5); } break;
    case 'blink': B.st -= dt; if (B.st <= 0) { burst(B.x, B.y - 40, '#7fe07a', 16); B.x = A.x0 + 80 + rng() * (A.x1 - A.x0 - 160); B.y = A.y0 + 90 + rng() * (A.y1 - A.y0 - 120); burst(B.x, B.y - 40, '#7fe07a', 16); SFX.play('wisp'); bossRest(B, 0.3); } break;
    case 'deathring': B.st -= dt; if (B.st <= 0) { B.ring = { x: B.x, y: B.y, r: 30, max: 260, hit: false }; impact(8); SFX.play('slam'); bossRest(B, 0.8); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawLich(c, B) {
  for (const j of B.jars || []) {
    shadow(c, j.x, j.y + 2, 12, 4);
    if (j.hp <= 0) { c.fillStyle = '#3a4a3a'; for (const [ox, oy] of [[-8, -2], [4, -3], [-2, 0], [7, 1]]) c.fillRect(j.x + ox, j.y + oy, 5, 3); continue; }
    const g = 0.5 + Math.sin(time * 4 + j.x) * 0.25; c.fillStyle = `rgba(127,224,122,${g * 0.3})`; circle(c, j.x, j.y - 18, 22);
    c.fillStyle = '#2a3a2a'; c.fillRect(j.x - 9, j.y - 28, 18, 28); c.fillStyle = `rgba(127,224,122,${0.5 + g * 0.4})`; c.fillRect(j.x - 7, j.y - 24, 14, 22); c.fillStyle = '#4a5a4a'; c.fillRect(j.x - 10, j.y - 32, 20, 5);
    c.fillStyle = '#e6ffe0'; c.fillRect(j.x - 3, j.y - 18, 2, 2); c.fillRect(j.x + 2, j.y - 18, 2, 2);
    if (j.hp < 3) { c.strokeStyle = '#1a2a1a'; c.lineWidth = 1; c.beginPath(); c.moveTo(j.x - 5, j.y - 22); c.lineTo(j.x + 2, j.y - 12); c.stroke(); }
  }
  const shielded = B.jars && B.jars.some(j => j.hp > 0) && B.state !== 'dazed', x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y - 8 + Math.sin(B.anim * 2) * 4;
  if (shielded && B.active) { for (const j of B.jars) if (j.hp > 0) { c.strokeStyle = `rgba(127,224,122,${0.25 + Math.sin(time * 6) * 0.1})`; c.lineWidth = 2; c.beginPath(); c.moveTo(j.x, j.y - 26); c.lineTo(x, y - 50); c.stroke(); } c.strokeStyle = 'rgba(127,224,122,.5)'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y - 40, 34, 46, 0, 0, Math.PI * 2); c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 26, 8);
  c.globalAlpha = 1; bossFlash(c, B);
  c.fillStyle = '#1e1a2a'; c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x - 14, y - 60); c.lineTo(x + 14, y - 60); c.lineTo(x + 22, y); for (let i = 0; i < 5; i++) c.lineTo(x + 22 - (i + 0.5) * 9, y + (i % 2 ? -6 : 4)); c.closePath(); c.fill();
  c.fillStyle = '#3a2e5a'; c.fillRect(x - 12, y - 56, 6, 50);
  c.fillStyle = '#efe6d8'; circle(c, x, y - 68, 10); c.fillStyle = '#1a1210'; c.fillRect(x - 6, y - 71, 4, 4); c.fillRect(x + 2, y - 71, 4, 4); c.fillRect(x - 3, y - 62, 6, 2);
  c.fillStyle = B.state === 'dazed' ? '#ffe08a' : '#7fe07a'; c.fillRect(x - 5, y - 70, 2, 2); c.fillRect(x + 3, y - 70, 2, 2);
  c.fillStyle = '#d9a23c'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 5 - 3, y - 76); c.lineTo(x + i * 5, y - 86 - (i === 0 ? 4 : 0)); c.lineTo(x + i * 5 + 3, y - 76); c.fill(); }
  c.strokeStyle = '#5a4a3a'; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 20, y + 2); c.lineTo(x + 24, y - 80); c.stroke(); c.fillStyle = '#7fe07a'; circle(c, x + 24, y - 84, 6);
  c.globalAlpha = 1;
  if (B.state === 'bones' || B.state === 'deathring' || B.state === 'raise') bossWarn(c, { x }, y - 110);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 50, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 100, 22);
}
function drawBrazier(c, sw, lit) {
  shadow(c, sw.x, sw.y + 3, 12, 4);
  c.fillStyle = '#3a3640'; c.fillRect(sw.x - 3, sw.y - 22, 6, 24); c.fillStyle = '#5a5662'; c.fillRect(sw.x - 9, sw.y - 2, 18, 5);
  c.fillStyle = '#2a2630'; c.beginPath(); c.moveTo(sw.x - 13, sw.y - 30); c.lineTo(sw.x + 13, sw.y - 30); c.lineTo(sw.x + 8, sw.y - 20); c.lineTo(sw.x - 8, sw.y - 20); c.closePath(); c.fill();
  if (lit) { for (let i = 0; i < 4; i++) { const fh = 10 + Math.sin(time * 14 + i * 2) * 4; c.fillStyle = i % 2 ? 'rgba(150,200,255,.85)' : 'rgba(220,235,255,.9)'; ellipse(c, sw.x - 6 + i * 4, sw.y - 32 - fh * 0.5, 3, fh * 0.6); } }
  else { c.fillStyle = '#14121a'; ellipse(c, sw.x, sw.y - 30, 11, 3); }
}
function drawOssGate(c) {
  const x = OSS.x, y = OSS.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 54, 12);
  c.fillStyle = '#4a4652'; c.fillRect(x - 44, y - 64, 88, 64); c.fillStyle = '#5a5662'; c.fillRect(x - 40, y - 64, 36, 64);
  c.fillStyle = '#3a3640'; c.beginPath(); c.moveTo(x - 50, y - 64); c.lineTo(x, y - 96); c.lineTo(x + 50, y - 64); c.closePath(); c.fill();
  c.fillStyle = '#6a6672'; c.fillRect(x - 3, y - 118, 6, 26); c.fillRect(x - 11, y - 110, 22, 6);
  c.fillStyle = '#0a0812'; c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 16, y - 34); c.quadraticCurveTo(x, y - 50, x + 16, y - 34); c.lineTo(x + 16, y); c.closePath(); c.fill();
  c.fillStyle = '#efe6d8'; for (const [ox, oy] of [[-30, -40], [26, -46], [-34, -18], [30, -14]]) { circle(c, x + ox, y + oy, 5); c.fillStyle = '#1a1210'; c.fillRect(x + ox - 3, y + oy - 2, 2, 2); c.fillRect(x + ox + 1, y + oy - 2, 2, 2); c.fillStyle = '#efe6d8'; }
  const g = 0.3 + Math.sin(time * 2) * 0.12; c.fillStyle = `rgba(127,224,122,${g})`; c.fillRect(x - 12, y - 10, 24, 10);
}
// ---------- Glimmerdeep creatures: shardbacks, glimmerbats, burrowers, geodes ----------
function updateCaveFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'shardback') {
    if (chase) { if (d > 34) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); } else wander(D.sp);
    touch(D.dmg); return true;
  }
  if (ai === 'glimbat') {
    if (e.state === 'dive') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 20 && !fainted) { e.hit = true; damagePlayer(D.dmg, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 1.4 + rng() * 1.2; } return true; }
    if (chase) {
      const a = e.anim * 3 + e.hx, tx = P.x + Math.cos(a) * 70, ty = P.y - 10 + Math.sin(a * 1.3) * 50, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1;
      moveEnemy(e, ex / el * Math.min(el, D.sp * dt) + (rng() - 0.5) * 60 * dt, ey / el * Math.min(el, D.sp * dt) + (rng() - 0.5) * 60 * dt);
      if (e.cd <= 0) { e.state = 'dive'; e.st = 0.35; e.lx = dx / d * 320; e.ly = dy / d * 320; e.hit = false; }
    } else moveEnemy(e, Math.cos(e.anim * 2) * 40 * dt + (e.hx - e.x) * 0.4 * dt, Math.sin(e.anim * 2.6) * 30 * dt + (e.hy - e.y) * 0.4 * dt);
    return true;
  }
  if (ai === 'burrower') {
    if (e.state === 'move') e.state = 'under';
    if (e.state === 'under') { if (chase) { const tx = P.x + Math.cos(e.anim) * 60, ty = P.y + Math.sin(e.anim) * 40, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1; moveEnemy(e, ex / el * D.sp * dt, ey / el * D.sp * dt); if (e.cd <= 0 && el < 30) { e.state = 'surface'; e.st = 0.4; SFX.play('crumble'); burst(e.x, e.y, '#6a5a4a', 10); } } else wander(D.sp * 0.5); if (Math.random() < dt * 8) particles.push({ x: e.x + (Math.random() - 0.5) * 12, y: e.y, vx: 0, vy: -20, life: 0.3, color: '#6a5a4a', size: 3 }); return true; }
    if (e.state === 'surface') { e.st -= dt; if (e.st <= 0) { e.state = 'throw'; e.st = 1.1; e.shots = 0; } return true; }
    if (e.state === 'throw') {
      e.st -= dt;
      if (e.shots < 2 && e.st < 0.9 - e.shots * 0.4) { e.shots++; projectiles.push({ kind: 'rock', sx: e.x, sy: e.y - 20, x: e.x, y: e.y - 20, tx: P.x + (rng() - 0.5) * 30, ty: P.y + (rng() - 0.5) * 20, t: 0, dur: 0.7, z: 0 }); SFX.play('swing'); }
      if (e.st <= 0) { e.state = 'under'; e.cd = 2.2 + rng(); burst(e.x, e.y, '#6a5a4a', 8); }
      return true;
    }
    return true;
  }
  if (ai === 'geode') {
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 2.6 + rng(); impact(6); SFX.play('slam'); burst(e.x, e.y, '#a593ff', 14); e.ring = 0.35; if (!fainted && !P.dash && d < 70) damagePlayer(2, e); } return true; }
    e.ring = Math.max(0, (e.ring || 0) - dt);
    if (chase) { if (d > 44) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 80 && e.cd <= 0) { e.state = 'windup'; e.st = 0.8; } } else wander(D.sp);
    touch(D.dmg, 24); return true;
  }
  return updateJungleFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
function shardBurst(e) {
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + rng() * 0.3; projectiles.push({ kind: 'shard', x: e.x, y: e.y - 14, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, ang: a, t: 0, life: 0.9 }); }
  SFX.play('mine');
}
Object.assign(PROC_DRAW, {
  shardback(c, e, k) {
    const walk = Math.sin(e.anim * 10) * 2, f = P.x < e.x ? -1 : 1;
    shadow(c, e.x, e.y + 2, 14 * k, 4 * k);
    c.fillStyle = '#5a4a6a'; for (const ox of [-10, -5, 5, 10]) c.fillRect(e.x + ox * k - 1, e.y - 6 + (ox > 0 ? walk : -walk), 3, 7);
    c.fillStyle = '#6a5a8a'; ellipse(c, e.x, e.y - 9 * k, 13 * k, 7 * k);
    for (const [ox, h, col] of [[-8, 14, '#a593ff'], [-2, 20, '#c8bcff'], [5, 16, '#a593ff'], [10, 10, '#8a7ae0']]) { c.fillStyle = col; c.beginPath(); c.moveTo(e.x + ox * k - 3, e.y - 12 * k); c.lineTo(e.x + ox * k, e.y - (12 + h) * k); c.lineTo(e.x + ox * k + 3, e.y - 12 * k); c.closePath(); c.fill(); }
    c.fillStyle = '#ffe08a'; c.fillRect(e.x + f * 11 * k - 1, e.y - 11 * k, 2, 2);
    c.strokeStyle = '#6a5a8a'; c.lineWidth = 3; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(e.x + s * 10 * k, e.y - 8); c.lineTo(e.x + s * 17 * k, e.y - 14); c.stroke(); }
  },
  glimbat(c, e, k) {
    const y = e.y - 26 + Math.sin(e.anim * 6) * 3, flap = Math.sin(time * 28 + e.hx) * 5;
    c.fillStyle = 'rgba(130,200,255,.25)'; circle(c, e.x, y, 10 * k);
    c.fillStyle = '#2a2a4a'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(e.x, y); c.lineTo(e.x + s * 11 * k, y - 4 - flap * s * s); c.lineTo(e.x + s * 8 * k, y + 3); c.closePath(); c.fill(); }
    c.fillStyle = '#3a3a6a'; circle(c, e.x, y, 4 * k); c.fillStyle = '#9fe8ff'; c.fillRect(e.x - 2, y - 1, 1.5, 1.5); c.fillRect(e.x + 1, y - 1, 1.5, 1.5);
  },
  burrower(c, e, k) {
    if (e.state === 'under') { c.fillStyle = '#4a3a2a'; ellipse(c, e.x, e.y, 12, 5); c.fillStyle = '#6a5a4a'; for (let i = 0; i < 3; i++) circle(c, e.x - 6 + i * 6, e.y - 2 + Math.sin(time * 10 + i) * 1.5, 3); return; }
    const up = e.state === 'surface' ? 1 - e.st / 0.4 : 1, y = e.y + (1 - up) * 14;
    c.fillStyle = '#4a3a2a'; ellipse(c, e.x, e.y + 2, 15, 6);
    c.save(); c.beginPath(); c.rect(e.x - 20, e.y - 40, 40, 42); c.clip();
    c.fillStyle = '#7a5a40'; ellipse(c, e.x, y - 10, 11, 12); c.fillStyle = '#c9a37a'; ellipse(c, e.x, y - 6, 7, 6);
    c.fillStyle = '#f2b0a0'; circle(c, e.x, y - 14, 3); c.fillStyle = '#1a1210'; c.fillRect(e.x - 6, y - 18, 3, 2); c.fillRect(e.x + 3, y - 18, 3, 2);
    c.fillStyle = '#efe6d8'; for (const s of [-1, 1]) { c.fillRect(e.x + s * 10 - 2, y - 8, 4, 2); }
    c.restore();
  },
  geode(c, e, k) {
    const raise = e.state === 'windup' ? 1 - e.st / 0.8 : 0, walk = Math.sin(e.anim * 6) * 2;
    if (e.ring > 0) { const r = (1 - e.ring / 0.35) * 70; c.strokeStyle = `rgba(165,147,255,${e.ring * 2})`; c.lineWidth = 3; c.beginPath(); c.ellipse(e.x, e.y, r, r * 0.6, 0, 0, Math.PI * 2); c.stroke(); }
    shadow(c, e.x, e.y + 2, 18 * k, 5 * k);
    c.fillStyle = '#4a4458'; c.fillRect(e.x - 12, e.y - 12 + walk, 8, 12); c.fillRect(e.x + 4, e.y - 12 - walk, 8, 12);
    c.fillStyle = '#5a5468'; ellipse(c, e.x, e.y - 26, 18 * k, 16 * k); c.fillStyle = '#6a6478'; ellipse(c, e.x - 4, e.y - 30, 12 * k, 10 * k);
    c.fillStyle = '#a593ff'; c.beginPath(); c.ellipse(e.x, e.y - 24, 9 * k, 7 * k, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e6e0ff'; for (const [ox, oy] of [[-3, -26], [2, -22], [4, -27]]) c.fillRect(e.x + ox, e.y + oy, 2, 3);
    c.fillStyle = '#4a4458'; for (const s of [-1, 1]) { const ay = e.y - 30 - raise * 22; c.fillRect(e.x + s * 20 - 5, ay, 10, 14); c.fillStyle = '#a593ff'; c.fillRect(e.x + s * 20 - 3, ay + 2, 6, 3); c.fillStyle = '#4a4458'; }
    c.fillStyle = '#ffe08a'; c.fillRect(e.x - 6, e.y - 36, 3, 2); c.fillRect(e.x + 3, e.y - 36, 3, 2);
  },
});
function drawCaveTile(c, x, y, px, py, t) {
  const h = hash(x, y), floor = q => isLand(q);
  if (t === LAND || t === PATH) {
    spr(c, 'p_c', px, py); c.fillStyle = t === PATH ? 'rgba(70,60,60,.55)' : 'rgba(46,44,66,.72)'; c.fillRect(px, py, T, T);
    if (h > 0.82) { c.fillStyle = 'rgba(130,180,255,.35)'; c.fillRect(px + h * 22, py + 6 + h * 14, 3, 2); }
    if (h < 0.08) { c.fillStyle = 'rgba(20,18,30,.5)'; ellipse(c, px + 16, py + 18, 6, 3); }
    return;
  }
  c.fillStyle = '#06060c'; c.fillRect(px, py, T, T);
  if (floor(tileAt(x, y - 1))) { c.fillStyle = '#3a3448'; c.fillRect(px, py, T, 16); c.fillStyle = '#2a2638'; c.fillRect(px, py + 10, T, 6); c.fillStyle = '#2a2638'; c.beginPath(); c.moveTo(px, py + 16); c.lineTo(px + 6 + h * 6, py + 24); c.lineTo(px + 14, py + 16); c.lineTo(px + 22 - h * 4, py + 22); c.lineTo(px + T, py + 16); c.closePath(); c.fill(); }
  else if (floor(tileAt(x, y + 1)) || floor(tileAt(x - 1, y)) || floor(tileAt(x + 1, y))) { c.fillStyle = '#1a1826'; c.fillRect(px, py, T, T); c.fillStyle = '#26223a'; c.fillRect(px + 2, py + 2, T - 4, T - 10); if (h > 0.7) { c.fillStyle = '#a593ff'; c.beginPath(); c.moveTo(px + 10, py + 24); c.lineTo(px + 14, py + 8); c.lineTo(px + 18, py + 24); c.closePath(); c.fill(); } }
}
function drawRails(c, inView) {
  for (const R of RAILS) {
    for (let i = 0; i < R.pts.length - 1; i++) {
      const [ax, ay] = R.pts[i], [bx, by] = R.pts[i + 1], len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len, nx = -uy, ny = ux;
      if (!inView((ax + bx) / 2, (ay + by) / 2, len)) continue;
      c.fillStyle = '#4a3220'; for (let s = 0; s < len; s += 12) { const sx = ax + ux * s, sy = ay + uy * s; c.save(); c.translate(sx, sy); c.rotate(Math.atan2(uy, ux)); c.fillRect(-2, -11, 5, 22); c.restore(); }
      c.strokeStyle = '#9a9aa8'; c.lineWidth = 2; for (const o of [-7, 7]) { c.beginPath(); c.moveTo(ax + nx * o, ay + ny * o); c.lineTo(bx + nx * o, by + ny * o); c.stroke(); }
    }
  }
}
function drawCart(c, x, y) {
  shadow(c, x, y + 4, 18, 5);
  c.fillStyle = '#2a2a30'; circle(c, x - 10, y + 2, 4); circle(c, x + 10, y + 2, 4);
  c.fillStyle = '#5a3a22'; c.beginPath(); c.moveTo(x - 18, y - 18); c.lineTo(x + 18, y - 18); c.lineTo(x + 14, y); c.lineTo(x - 14, y); c.closePath(); c.fill();
  c.fillStyle = '#8a5a32'; c.fillRect(x - 18, y - 18, 36, 4); c.fillStyle = '#4a4a54'; c.fillRect(x - 16, y - 10, 32, 2);
}
function drawCartFront(c, x, y) { c.fillStyle = '#5a3a22'; c.beginPath(); c.moveTo(x - 17, y - 12); c.lineTo(x + 17, y - 12); c.lineTo(x + 14, y); c.lineTo(x - 14, y); c.closePath(); c.fill(); c.fillStyle = '#4a4a54'; c.fillRect(x - 16, y - 8, 32, 2); }
function startRide(R, fromA) {
  const pts = fromA ? R.pts.slice() : R.pts.slice().reverse();
  P.ride = { pts, seg: 0, d: 0 }; P.x = pts[0][0]; P.y = pts[0][1]; SFX.play('dash');
}
function updateRide(dt) {
  const R = P.ride; P.inv = Math.max(P.inv, 0.3);
  let move = 300 * dt;
  while (move > 0 && R.seg < R.pts.length - 1) {
    const [ax, ay] = R.pts[R.seg], [bx, by] = R.pts[R.seg + 1], len = Math.hypot(bx - ax, by - ay), left = len - R.d;
    if (move < left) { R.d += move; move = 0; } else { move -= left; R.seg++; R.d = 0; }
    const [cx0, cy0] = R.pts[R.seg], nxt = R.pts[Math.min(R.seg + 1, R.pts.length - 1)], l2 = Math.hypot(nxt[0] - cx0, nxt[1] - cy0) || 1;
    P.x = cx0 + (nxt[0] - cx0) / l2 * R.d; P.y = cy0 + (nxt[1] - cy0) / l2 * R.d; P.fx = (nxt[0] - cx0) / l2 || P.fx; P.fy = (nxt[1] - cy0) / l2 || P.fy;
  }
  if (Math.random() < dt * 20) particles.push({ x: P.x + (Math.random() - 0.5) * 20, y: P.y + 4, vx: (Math.random() - 0.5) * 40, vy: -30, life: 0.3, color: '#ffe08a', size: 2 });
  if (R.seg >= R.pts.length - 1) { const [ex, ey] = R.pts[R.pts.length - 1]; P.ride = null; P.x = ex; P.y = ey + 34; if (!walkable(P.x, P.y)) P.y = ey - 30; SFX.play('crumble'); }
}
function drawLift(c, x, y) {
  shadow(c, x, y + 2, 26, 7);
  c.fillStyle = '#5a3a22'; c.fillRect(x - 26, y - 90, 6, 92); c.fillRect(x + 20, y - 90, 6, 92); c.fillRect(x - 30, y - 96, 60, 8);
  c.strokeStyle = '#8a8a94'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 12, y - 88); c.lineTo(x - 12, y - 20); c.moveTo(x + 12, y - 88); c.lineTo(x + 12, y - 20); c.stroke();
  c.fillStyle = '#6a4a2a'; c.fillRect(x - 18, y - 20, 36, 20); c.fillStyle = '#8a6440'; c.fillRect(x - 18, y - 20, 36, 3); c.fillRect(x - 18, y - 10, 36, 2);
  c.fillStyle = '#2a2a30'; circle(c, x, y - 92, 6); c.fillStyle = '#ffe08a'; c.fillRect(x - 2, y - 70, 4, 6);
}
function drawGlowcap(c, o) {
  const g = 0.6 + Math.sin(time * 2 + o.x) * 0.3, col = ['#7fe0f0', '#a593ff', '#7fe07a'][o.v % 3];
  c.fillStyle = `rgba(160,220,255,${g * 0.25})`; circle(c, o.x, o.y - 8, 14);
  for (const [ox, h] of [[-5, 8], [2, 12], [7, 6]]) { c.fillStyle = '#d8ccb4'; c.fillRect(o.x + ox - 1, o.y - h, 2, h); c.fillStyle = col; ellipse(c, o.x + ox, o.y - h, 4, 2.5); }
}
// ---------- the Mole King: tunnels under you, crashes into crystal pillars ----------
function molePillars(B) { if (B.pillarPhase !== B.phase || !B.pillars) { B.pillarPhase = B.phase; B.pillars = [[3, 15.5], [8, 15.5], [3, 22], [8, 22]].map(([x, y]) => ({ x: (VAULT_D.x0 + x) * T + 16, y: y * T + 16, hp: 1 })); } return B.pillars; }
function updateMole(B, dt, fainted, d) {
  const A = B.arena, pills = molePillars(B);
  switch (B.state) {
    case 'surfaced': B.st -= dt; if (B.st <= 0) bossRest(B, 0.1); break;
    case 'burrow': B.st -= dt; if (B.st <= 0) { B.state = 'under'; B.st = B.phase === 3 ? 1.4 : 2; SFX.play('crumble'); } break;
    case 'under': {
      B.st -= dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.x += dx / dd * Math.min(dd, 150 * dt); B.y += dy / dd * Math.min(dd, 150 * dt); clampBoss(B);
      if (Math.random() < dt * 14) particles.push({ x: B.x + (rng() - 0.5) * 30, y: B.y, vx: (rng() - 0.5) * 30, vy: -40, life: 0.4, color: '#6a5a4a', size: 4 });
      if (B.st <= 0) { B.state = 'rumble'; B.st = 0.6; impact(3); }
      break;
    }
    case 'rumble': B.st -= dt; if (B.st <= 0) {
      const pl = pills.find(q => q.hp > 0 && Math.hypot(q.x - B.x, q.y - B.y) < 60);
      impact(10); SFX.play('slam'); burst(B.x, B.y, '#6a5a4a', 20);
      if (pl) { pl.hp = 0; for (let i = 0; i < 18; i++) { const a = rng() * Math.PI * 2, v = 80 + rng() * 140; particles.push({ x: pl.x, y: pl.y - 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: 0.7, color: i % 2 ? '#a593ff' : '#e6e0ff', size: 5 }); } B.state = 'dazed'; B.st = 2.8; floatText(B.x, B.y - 100, 'He hit his head on the crystal! Strike now!', '#ffe08a'); }
      else { if (!fainted && !P.dash && d < 44) damagePlayer(2, B); B.state = 'surfaced'; B.st = 1.1; }
    } break;
    case 'rocks': B.st -= dt; if (B.st <= 0) { for (let i = 0; i < 3; i++) projectiles.push({ kind: 'rock', sx: B.x, sy: B.y - 40, x: B.x, y: B.y - 40, tx: P.x + (rng() - 0.5) * 60, ty: P.y + (rng() - 0.5) * 40, t: -i * 0.18, dur: 0.75, z: 0 }); SFX.play('swing'); bossRest(B, 0.8); } break;
    case 'quake': B.st -= dt; if (B.st <= 0) { impact(8); SFX.play('crumble'); for (let i = 0; i < 6; i++) { const tx = i === 0 ? P.x : A.x0 + 50 + rng() * (A.x1 - A.x0 - 100), ty = i === 0 ? P.y : A.y0 + 70 + rng() * (A.y1 - A.y0 - 90); projectiles.push({ kind: 'rock', fall: true, tx, ty, x: tx, y: ty, t: -i * 0.2, dur: 0.9, z: 320 }); } bossRest(B, 0.8); } break;
    case 'pups': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['burrower', 'burrower'], 3); bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawMole(c, B) {
  for (const pl of molePillars(B)) {
    shadow(c, pl.x, pl.y + 2, 16, 5);
    if (pl.hp <= 0) { c.fillStyle = '#5a4a7a'; for (const [ox, oy] of [[-10, -3], [2, -4], [-4, 0], [8, 1]]) c.fillRect(pl.x + ox, pl.y + oy, 6, 4); continue; }
    const g = 0.5 + Math.sin(time * 3 + pl.x) * 0.2; c.fillStyle = `rgba(165,147,255,${g * 0.3})`; circle(c, pl.x, pl.y - 30, 26);
    c.fillStyle = '#6a5a9a'; c.beginPath(); c.moveTo(pl.x - 14, pl.y); c.lineTo(pl.x - 10, pl.y - 44); c.lineTo(pl.x, pl.y - 58); c.lineTo(pl.x + 10, pl.y - 44); c.lineTo(pl.x + 14, pl.y); c.closePath(); c.fill();
    c.fillStyle = '#a593ff'; c.beginPath(); c.moveTo(pl.x - 8, pl.y - 4); c.lineTo(pl.x - 6, pl.y - 42); c.lineTo(pl.x, pl.y - 52); c.lineTo(pl.x + 2, pl.y - 6); c.closePath(); c.fill(); c.fillStyle = '#e6e0ff'; c.fillRect(pl.x - 4, pl.y - 40, 2, 14);
  }
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y;
  if (B.state === 'under' || B.state === 'rumble') {
    c.fillStyle = '#3a2e24'; ellipse(c, x, y, 26, 9); c.fillStyle = '#6a5a4a'; for (let i = 0; i < 5; i++) circle(c, x - 16 + i * 8, y - 3 + Math.sin(time * 12 + i) * 2, 4);
    if (B.state === 'rumble') { const pr = 1 - B.st / 0.6; c.strokeStyle = `rgba(236,82,87,${0.4 + pr * 0.5})`; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 44, 18, 0, 0, Math.PI * 2); c.stroke(); }
    return;
  }
  const up = B.state === 'burrow' ? Math.max(0, B.st) / 0.4 : 1;
  c.fillStyle = '#3a2e24'; ellipse(c, x, y + 2, 34, 11);
  c.save(); c.beginPath(); c.rect(x - 60, y - 110, 120, 112); c.clip();
  const by = y + (1 - up) * 60;
  c.globalAlpha = 1; bossFlash(c, B);
  c.fillStyle = '#5a4030'; ellipse(c, x, by - 32, 32, 34); c.fillStyle = '#7a5a40'; ellipse(c, x - 6, by - 38, 22, 24); c.fillStyle = '#c9a37a'; ellipse(c, x, by - 22, 18, 14);
  c.fillStyle = '#f2b0a0'; circle(c, x, by - 44, 6); c.fillStyle = '#1a1210'; c.fillRect(x - 13, by - 52, 5, 4); c.fillRect(x + 8, by - 52, 5, 4);
  c.fillStyle = '#efe6d8'; for (const s of [-1, 1]) { c.fillRect(x + s * 26 - 4, by - 26, 8, 3); c.fillRect(x + s * 28 - 2, by - 22, 3, 6); }
  c.fillStyle = '#d9a23c'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 6 - 3, by - 62); c.lineTo(x + i * 6, by - 72 - (i === 0 ? 4 : 0)); c.lineTo(x + i * 6 + 3, by - 62); c.fill(); }
  c.fillStyle = '#a593ff'; circle(c, x, by - 66, 3);
  c.restore(); c.globalAlpha = 1;
  if (B.state === 'rocks' || B.state === 'quake') bossWarn(c, { x }, y - 100);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 50, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 90, 24);
}
// ---------- the Crystal Hydra: three heads, each only hurt when stuck after a bite ----------
function hydraHeads(B) {
  if (!B.heads) { const per = Math.round(B.max / 3); B.heads = [-1, 0, 1].map(s => ({ s, hx: B.hx + s * 130, hy: B.hy + (s ? 50 : 70), x: B.hx + s * 130, y: B.hy + 60, z: 40, hp: per, max: per, state: 'idle', st: 1 + Math.abs(s) * 0.8, dead: false })); }
  return B.heads;
}
function hitHydra(B, hx, hy, rad, dmg) {
  if (!B.active || B.state === 'dying') return false;
  let hit = false;
  for (const h of hydraHeads(B)) {
    if (h.dead || Math.hypot(h.x - hx, h.y - 20 - h.z - hy) > rad + 30) continue;
    if (h.state !== 'stuck') { floatText(h.x, h.y - 60, 'Too high!', '#c8bcff'); continue; }
    const n = dmg * 2; h.hp -= n; hit = true; h.hurt = 0.15;
    if (h.hp <= 0) { h.dead = true; h.hp = 0; impact(10); SFX.play('crumble'); for (let i = 0; i < 20; i++) { const a = rng() * Math.PI * 2, v = 80 + rng() * 160; particles.push({ x: h.x, y: h.y - 20, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 100, life: 0.8, color: i % 2 ? '#a593ff' : '#9fe8ff', size: 5 }); } floatText(h.x, h.y - 80, 'Head shattered!', '#ffe08a'); }
    if (B.heads.every(q => q.dead)) damageBoss(B, Math.max(1, B.hp)); else damageBoss(B, n);
    break;
  }
  return hit;
}
function updateHydra(B, dt, fainted, d) {
  const heads = hydraHeads(B), live = heads.filter(h => !h.dead), rate = B.phase === 3 ? 1.1 : B.phase === 2 ? 1.5 : 2;
  B.cd = (B.cd || 1.5) - dt;
  if (B.cd <= 0 && live.length) {
    B.cd = rate; const idle = live.filter(h => h.state === 'idle');
    if (idle.length) { const h = idle[Math.floor(rng() * idle.length)], r = rng(); if (r < 0.55) { h.state = 'biteWind'; h.st = 0.75; } else if (r < 0.8) { h.state = 'shardsWind'; h.st = 0.5; } else { h.state = 'beamWind'; h.st = 0.8; } }
    if (B.phase >= 2 && rng() < 0.3) summonMinions(B, ['glimbat', 'glimbat'], 4);
  }
  for (const h of heads) {
    h.hurt = Math.max(0, (h.hurt || 0) - dt);
    if (h.dead) { h.z = Math.max(0, h.z - 60 * dt); continue; }
    const home = () => { const sway = Math.sin(B.anim * 1.5 + h.s) * 14; h.x += (h.hx + sway - h.x) * Math.min(1, dt * 3); h.y += (h.hy - h.y) * Math.min(1, dt * 3); h.z += (40 - h.z) * Math.min(1, dt * 3); };
    switch (h.state) {
      case 'idle': home(); break;
      case 'biteWind': home(); h.st -= dt; h.tx = P.x; h.ty = P.y; if (h.st <= 0) { h.state = 'bite'; h.st = 0.25; h.sx = h.x; h.sy = h.y; SFX.play('dash'); } break;
      case 'bite': { h.st -= dt; const k = 1 - Math.max(0, h.st) / 0.25; h.x = h.sx + (h.tx - h.sx) * k; h.y = h.sy + (h.ty - h.sy) * k; h.z = 40 * (1 - k); if (!h.bit && !fainted && !P.dash && Math.hypot(P.x - h.x, P.y - h.y) < 30) { h.bit = true; damagePlayer(2, h); } if (h.st <= 0) { h.state = 'stuck'; h.st = 1.7; h.bit = false; h.z = 0; impact(6); SFX.play('slam'); burst(h.x, h.y, '#a593ff', 12); } break; }
      case 'stuck': h.st -= dt; if (h.st <= 0) { h.state = 'idle'; } break;
      case 'shardsWind': home(); h.st -= dt; if (h.st <= 0) { const a = Math.atan2(P.y - (h.y - h.z), P.x - h.x), n = B.phase === 1 ? 3 : 5; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.25; projectiles.push({ kind: 'shard', x: h.x, y: h.y - h.z - 10, vx: Math.cos(a + o) * 190, vy: Math.sin(a + o) * 190, ang: a + o, t: 0, life: 1.8 }); } SFX.play('mine'); h.state = 'idle'; } break;
      case 'beamWind': home(); h.st -= dt; h.dir = Math.atan2(P.y - h.y, P.x - h.x); if (h.st <= 0) { h.state = 'beam'; h.st = 1.4; SFX.play('boss'); } break;
      case 'beam': {
        home(); h.st -= dt; const want = Math.atan2(P.y - h.y, P.x - h.x); let da = want - h.dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; h.dir += Math.max(-0.8 * dt, Math.min(0.8 * dt, da));
        const ex = h.x, ey = h.y - h.z - 10; if (!fainted && !P.dash && segDist(P.x, P.y - 14, ex, ey, ex + Math.cos(h.dir) * 420, ey + Math.sin(h.dir) * 420) < 14) damagePlayer(2, { x: P.x - Math.cos(h.dir) * 20, y: P.y - Math.sin(h.dir) * 20 });
        if (h.st <= 0) h.state = 'idle'; break;
      }
    }
  }
}
function drawHydra(c, B) {
  const heads = hydraHeads(B), x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y, g = 0.6 + Math.sin(time * 3) * 0.25;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y + 6, 70, 18);
  // necks
  for (const h of heads) { const hy = h.y - h.z - 10; c.strokeStyle = h.dead ? '#3a3050' : '#5a4a8a'; c.lineWidth = 16; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + h.s * 30, y - 40); c.quadraticCurveTo(x + h.s * 70, y - 90, h.x, hy); c.stroke(); c.strokeStyle = h.dead ? '#2a2440' : '#7a6ab0'; c.lineWidth = 8; c.stroke(); c.lineCap = 'butt'; }
  // body
  c.globalAlpha = 1; bossFlash(c, B);
  c.fillStyle = '#4a3a7a'; ellipse(c, x, y - 30, 64, 40); c.fillStyle = '#6a5a9a'; ellipse(c, x - 10, y - 40, 44, 26);
  for (const [ox, h2] of [[-40, 30], [-18, 44], [8, 50], [32, 36], [50, 22]]) { c.fillStyle = '#a593ff'; c.beginPath(); c.moveTo(x + ox - 7, y - 50); c.lineTo(x + ox, y - 50 - h2); c.lineTo(x + ox + 7, y - 50); c.closePath(); c.fill(); }
  c.fillStyle = `rgba(159,232,255,${g})`; circle(c, x, y - 28, 12); c.fillStyle = '#ffffff'; circle(c, x - 3, y - 31, 3);
  c.globalAlpha = 1;
  // heads
  for (const h of heads) {
    const hx = h.x, hy = h.y - h.z - 10, f = P.x < hx ? -1 : 1;
    if (h.state === 'bite' || h.state === 'stuck') { c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, h.x, h.y + 4, 22, 7); }
    if (h.state === 'biteWind') { c.strokeStyle = `rgba(236,82,87,${0.5 + Math.sin(time * 16) * 0.3})`; c.lineWidth = 2; c.beginPath(); c.ellipse(P.x, P.y, 28, 11, 0, 0, Math.PI * 2); c.stroke(); }
    if (h.state === 'beamWind') { c.strokeStyle = 'rgba(159,232,255,.4)'; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(h.dir) * 420, hy + Math.sin(h.dir) * 420); c.stroke(); c.setLineDash([]); }
    if (h.state === 'beam') { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(159,232,255,.6)'; c.lineWidth = 14; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + Math.cos(h.dir) * 420, hy + Math.sin(h.dir) * 420); c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 4; c.stroke(); c.restore(); }
    if (h.dead) { c.fillStyle = '#3a3050'; ellipse(c, hx, hy, 12, 8); continue; }
    c.globalAlpha = h.hurt > 0 ? 0.55 : 1;
    c.fillStyle = '#5a4a8a'; ellipse(c, hx, hy, 20, 14); ellipse(c, hx + f * 16, hy + 4, 13, 8);
    c.fillStyle = '#a593ff'; for (const o of [-8, 0, 8]) { c.beginPath(); c.moveTo(hx + o - 4, hy - 10); c.lineTo(hx + o - f * 4, hy - 24); c.lineTo(hx + o + 4, hy - 10); c.fill(); }
    c.fillStyle = h.state === 'stuck' ? '#ffe08a' : '#9fe8ff'; circle(c, hx + f * 8, hy - 4, 3.5);
    c.fillStyle = '#efe6d8'; for (let i = 0; i < 3; i++) c.fillRect(hx + f * (12 + i * 5) - 1, hy + 8, 2, 4);
    c.globalAlpha = 1;
    if (h.state === 'stuck') drawStars(c, hx, hy - 30, 14);
    if (h.max) healthBar(c, hx, hy - 34, h.hp / h.max);
  }
  if (B.state === 'sleep') bossZ(c, { x, y: y - 60, z: 0, anim: B.anim });
}
function drawVaultGate(c) {
  const x = VAULT.x, y = VAULT.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 60, 12);
  c.fillStyle = '#2a2638'; c.beginPath(); c.moveTo(x - 56, y); c.lineTo(x - 40, y - 64); c.lineTo(x - 10, y - 84); c.lineTo(x + 24, y - 78); c.lineTo(x + 50, y - 56); c.lineTo(x + 58, y); c.closePath(); c.fill();
  for (const [ox, oy, h] of [[-40, -40, 34], [-22, -70, 30], [30, -60, 36], [44, -24, 26], [4, -82, 26]]) { c.fillStyle = '#a593ff'; c.beginPath(); c.moveTo(x + ox - 7, y + oy); c.lineTo(x + ox, y + oy - h); c.lineTo(x + ox + 7, y + oy); c.closePath(); c.fill(); c.fillStyle = '#e6e0ff'; c.fillRect(x + ox - 2, y + oy - h * 0.7, 2, h * 0.5); }
  c.fillStyle = '#0a0812'; c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 16, y - 34); c.quadraticCurveTo(x, y - 50, x + 16, y - 34); c.lineTo(x + 16, y); c.closePath(); c.fill();
  const g = 0.35 + Math.sin(time * 2.5) * 0.15; c.fillStyle = `rgba(165,147,255,${g})`; c.fillRect(x - 12, y - 12, 24, 12);
}
// ---------- Verdant Wilds creatures: snapjaws, raptors, dart frogs, thief monkeys ----------
function updateJungleFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'snapjaw') {
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'bite'; e.st = 0.25; e.ba = Math.atan2(dy, dx); SFX.play('swing'); if (!fainted && !P.dash && d < 78) damagePlayer(D.dmg, e); } return true; }
    if (e.state === 'bite') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 1.5; } return true; }
    if (e.state === 'spit') { e.st -= dt; if (e.st <= 0) { projectiles.push({ kind: 'rock', seed: true, sx: e.x, sy: e.y - 30, x: e.x, y: e.y - 30, tx: P.x, ty: P.y, t: 0, dur: 0.75, z: 0 }); SFX.play('swing'); e.state = 'move'; e.cd = 2.4; } return true; }
    if (chase && e.cd <= 0) { if (d < 72) { e.state = 'windup'; e.st = 0.35; } else if (d < 220) { e.state = 'spit'; e.st = 0.4; } }
    return true;
  }
  if (ai === 'raptor') {
    if (e.state === 'dash') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 24 && !fainted) { e.hit = true; damagePlayer(D.dmg, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 1.3 + rng() * 0.6; } return true; }
    if (chase) {
      const side = (e.hx % 2 ? 1 : -1), a = Math.atan2(dy, dx) + side * (d < 110 ? 1.4 : 0.4); moveEnemy(e, Math.cos(a) * D.sp * dt, Math.sin(a) * D.sp * dt);
      if (e.cd <= 0 && d < 150) { e.state = 'dash'; e.st = 0.3; e.lx = dx / d * 420; e.ly = dy / d * 420; e.hit = false; SFX.play('dash'); }
    } else wander(D.sp * 0.5);
    return true;
  }
  if (ai === 'dartfrog') {
    if (e.state === 'leap') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); e.lift = Math.sin(Math.PI * Math.max(0, 1 - e.st / 0.35)) * 14; if (e.st <= 0) { e.state = 'move'; e.lift = 0; e.wt = 0.6 + rng() * 0.6; } return true; }
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { const a = Math.atan2(P.y - 14 - (e.y - 10), P.x - e.x); projectiles.push({ kind: 'venom', x: e.x, y: e.y - 10, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, ang: a, t: 0, life: 1.6 }); SFX.play('swing'); e.state = 'move'; e.cd = 2.2 + rng(); } return true; }
    e.wt = (e.wt || 0) - dt;
    if (chase && d < 180 && e.cd <= 0) { e.state = 'windup'; e.st = 0.4; return true; }
    if (e.wt <= 0) { const a = chase ? Math.atan2(dy, dx) + (rng() - 0.5) * 2 : rng() * Math.PI * 2; e.state = 'leap'; e.st = 0.35; e.lx = Math.cos(a) * 160; e.ly = Math.sin(a) * 160; }
    touch(D.dmg); return true;
  }
  if (ai === 'monkey') {
    if (e.loot) { moveEnemy(e, -dx / d * D.sp * 1.3 * dt, -dy / d * D.sp * 1.3 * dt); return true; }
    if (chase) { const j = Math.sin(e.anim * 6) * 0.5; moveEnemy(e, (dx / d + j * dy / d) * D.sp * dt, (dy / d - j * dx / d) * D.sp * dt); } else wander(D.sp * 0.5);
    if (d < 22 && !fainted && P.inv <= 0) {
      const amt = Math.min(S.gold, 5 + Math.floor(rng() * 11));
      if (amt > 0) { S.gold -= amt; e.loot = amt; floatText(P.x, P.y - 60, `-${amt}g`, '#f4b740'); SFX.play('coin'); if (!monkeyHint) { monkeyHint = true; toast('A monkey snatched your gold! Catch it to get it back.', 3500); } updateHUD(); }
      else { damagePlayer(1, e); e.cd = 1; }
    }
    return true;
  }
  return updateValeFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
let monkeyHint = false;
Object.assign(PROC_DRAW, {
  snapjaw(c, e, k) {
    const open = e.state === 'windup' ? (1 - e.st / 0.35) * 0.6 : e.state === 'bite' ? 0.1 : 0.25 + Math.sin(e.anim * 2) * 0.08, a = e.state === 'bite' ? e.ba : Math.atan2(P.y - e.y, P.x - e.x), reach = e.state === 'bite' ? 46 : 16;
    shadow(c, e.x, e.y + 2, 14 * k, 4 * k);
    c.fillStyle = '#2f6b3a'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(e.x + s * 10, e.y - 3, 10 * k, 4 * k, s * 0.4, 0, Math.PI * 2); c.fill(); }
    const hx = e.x + Math.cos(a) * reach, hy = e.y - 24 + Math.sin(a) * reach * 0.6;
    c.strokeStyle = '#3d8448'; c.lineWidth = 5; c.beginPath(); c.moveTo(e.x, e.y - 4); c.quadraticCurveTo(e.x, e.y - 22, hx, hy); c.stroke();
    c.save(); c.translate(hx, hy); c.rotate(a);
    c.fillStyle = '#c8402a'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 13 * k, -open - 0.9, -open); c.closePath(); c.fill(); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 13 * k, open, open + 0.9); c.closePath(); c.fill();
    c.fillStyle = '#ffe9a8'; for (let i = 0; i < 4; i++) { c.fillRect(4 + i * 2.5, -open * 8 - 2, 1.5, 3); c.fillRect(4 + i * 2.5, open * 8 - 1, 1.5, 3); }
    c.fillStyle = '#f2e6d6'; circle(c, -4, -6, 2); circle(c, -2, 6, 2);
    c.restore();
  },
  raptor(c, e, k) {
    const f = (e.state === 'dash' ? e.lx : P.x - e.x) < 0 ? -1 : 1, run = Math.sin(e.anim * (e.state === 'dash' ? 26 : 14)) * 3;
    shadow(c, e.x, e.y + 2, 14 * k, 4 * k);
    c.fillStyle = '#3d6a24'; c.fillRect(e.x - 4, e.y - 10 + run, 3, 10); c.fillRect(e.x + 2, e.y - 10 - run, 3, 10);
    c.strokeStyle = '#5a8a3a'; c.lineWidth = 5; c.beginPath(); c.moveTo(e.x - f * 4, e.y - 16); c.quadraticCurveTo(e.x - f * 16, e.y - 18, e.x - f * 24, e.y - 12); c.stroke();
    c.fillStyle = '#5a8a3a'; ellipse(c, e.x, e.y - 16, 11 * k, 7 * k); c.fillStyle = '#e8d070'; ellipse(c, e.x + f * 2, e.y - 13, 7 * k, 4 * k);
    c.fillStyle = '#5a8a3a'; ellipse(c, e.x + f * 12, e.y - 26, 7 * k, 5 * k); c.fillRect(e.x + f * 6 - 2, e.y - 26, 5, 10);
    c.fillStyle = '#ffe08a'; c.fillRect(e.x + f * 14 - 1, e.y - 29, 2, 2); c.fillStyle = '#c8402a'; for (let i = 0; i < 3; i++) c.fillRect(e.x - 6 + i * 4, e.y - 24, 2, 3);
  },
  dartfrog(c, e, k) {
    const lift = e.lift || 0, col = ['#3a8ae0', '#e8b030', '#e0503a'][Math.floor(e.hx) % 3];
    shadow(c, e.x, e.y + 2, 9 * k, 3 * k);
    c.fillStyle = col; ellipse(c, e.x, e.y - 6 - lift, 9 * k, 6 * k); c.fillStyle = '#1a1a2a'; for (const [ox, oy] of [[-3, -8], [3, -5], [0, -3]]) circle(c, e.x + ox, e.y + oy - lift, 1.6);
    for (const ox of [-4, 4]) { c.fillStyle = col; circle(c, e.x + ox, e.y - 11 - lift, 2.6); c.fillStyle = '#1a1210'; c.fillRect(e.x + ox - 1, e.y - 12 - lift, 2, 2); }
    if (e.state === 'windup') { c.fillStyle = 'rgba(127,209,122,.6)'; circle(c, e.x, e.y - 8 - lift, 4 + (1 - e.st / 0.4) * 3); }
  },
  monkey(c, e, k) {
    const f = (e.loot ? e.x - P.x : P.x - e.x) < 0 ? -1 : 1, bob = Math.abs(Math.sin(e.anim * 10)) * 4;
    shadow(c, e.x, e.y + 2, 10 * k, 3 * k);
    c.strokeStyle = '#6a4424'; c.lineWidth = 3; c.beginPath(); c.moveTo(e.x - f * 6, e.y - 10 - bob); c.quadraticCurveTo(e.x - f * 18, e.y - 20, e.x - f * 14, e.y - 30); c.stroke();
    c.fillStyle = '#6a4424'; ellipse(c, e.x, e.y - 12 - bob, 8 * k, 9 * k); circle(c, e.x + f * 2, e.y - 24 - bob, 7 * k);
    c.fillStyle = '#d8b088'; ellipse(c, e.x + f * 4, e.y - 23 - bob, 4.5 * k, 4 * k); ellipse(c, e.x, e.y - 10 - bob, 4.5 * k, 5 * k);
    c.fillStyle = '#1a1210'; c.fillRect(e.x + f * 3 - 2, e.y - 26 - bob, 1.5, 1.5); c.fillRect(e.x + f * 6 - 1, e.y - 26 - bob, 1.5, 1.5);
    if (e.loot) { c.fillStyle = '#8a6a34'; circle(c, e.x - f * 8, e.y - 16 - bob, 6); c.fillStyle = '#f4b740'; c.fillRect(e.x - f * 8 - 2, e.y - 22 - bob, 4, 3); }
  },
});
function drawTallGrass(c, r) {
  const s = r.shake ? Math.sin(time * 70) * 2 : 0;
  for (let i = 0; i < 6; i++) { const ox = -12 + i * 5 + (r.seed * 7 % 3), h = 16 + ((i * 7 + r.seed * 13) % 9), sway = Math.sin(time * 2 + r.x * 0.05 + i) * 2 + s; c.strokeStyle = i % 2 ? '#3d8448' : '#5aa65c'; c.lineWidth = 3; c.beginPath(); c.moveTo(ox, 0); c.quadraticCurveTo(ox + sway * 0.5, -h * 0.6, ox + sway, -h); c.stroke(); }
}
function drawTempleIdol(c, o) {
  const x = o.x, y = o.y;
  shadow(c, x, y + 2, 26, 8);
  c.fillStyle = '#6a7a5a'; c.fillRect(x - 24, y - 12, 48, 14); c.fillStyle = '#7a8a6a'; c.fillRect(x - 20, y - 70, 40, 60); c.fillStyle = '#5a6a4a'; c.fillRect(x - 20, y - 70, 8, 60);
  c.fillStyle = '#4a5a3a'; c.fillRect(x - 12, y - 58, 8, 6); c.fillRect(x + 4, y - 58, 8, 6); c.fillRect(x - 10, y - 40, 20, 5);
  c.fillStyle = '#3d8448'; for (const [ox, oy] of [[-18, -66], [14, -30], [-16, -22], [16, -62]]) { c.beginPath(); c.ellipse(x + ox, y + oy, 5, 3, 0.6, 0, Math.PI * 2); c.fill(); }
  const g = 0.5 + Math.sin(time * 2) * 0.3; c.fillStyle = `rgba(127,224,122,${g})`; c.fillRect(x - 11, y - 57, 6, 4); c.fillRect(x + 5, y - 57, 6, 4);
}
function drawTurtle(c, x, y, home) {
  const bob = Math.sin(time * 1.5) * 2;
  c.fillStyle = 'rgba(160,220,240,.35)'; ellipse(c, x, y + 4, 40, 10);
  c.fillStyle = '#5a8a5a'; for (const [ox, oy] of [[-26, 2], [26, 2], [-22, -12], [22, -12]]) ellipse(c, x + ox, y + oy + bob, 9, 5);
  c.fillStyle = '#7aa86a'; ellipse(c, x, y - 32 + bob, 10, 9); c.fillStyle = '#1a1210'; c.fillRect(x - 5, y - 35 + bob, 2, 2); c.fillRect(x + 3, y - 35 + bob, 2, 2);
  c.fillStyle = '#5a4028'; ellipse(c, x, y - 6 + bob, 30, 18); c.fillStyle = '#7a5a3a'; ellipse(c, x, y - 9 + bob, 26, 14);
  c.strokeStyle = '#4a3020'; c.lineWidth = 2; for (const [ox, oy] of [[-10, -12], [10, -12], [0, -4], [-14, -2], [14, -2]]) { c.beginPath(); c.arc(x + ox, y + oy + bob, 5, 0, Math.PI * 2); c.stroke(); }
  c.fillStyle = '#c8402a'; c.fillRect(x - 6, y - 26 + bob, 12, 4);
}
// ---------- dart traps ----------
function updateDartTraps() {
  if (dungeonAt(P.x) !== SERP_D) return;
  for (const t of DART_TRAPS) { const cyc = Math.floor((time + t.off) / 2.4); if (cyc !== t.last) { t.last = cyc; projectiles.push({ kind: 'dart', x: t.x, y: t.y, vx: t.dir * 230, vy: 0, ang: t.dir > 0 ? 0 : Math.PI, t: 0, life: 2.3 }); } }
}
function drawDartTraps(c) {
  for (const t of DART_TRAPS) { const x = t.x - t.dir * 14; c.fillStyle = '#5a6a4a'; c.fillRect(x - 10, t.y - 14, 20, 20); c.fillStyle = '#7a8a6a'; c.fillRect(x - 8, t.y - 12, 16, 6); c.fillStyle = '#1a1210'; circle(c, x + t.dir * 8, t.y - 2, 3); c.fillStyle = '#7fe07a'; c.fillRect(x - 5, t.y - 9, 3, 2); c.fillRect(x + 2, t.y - 9, 3, 2); }
}
// ---------- the Giant Chameleon: invisible until the grass gives it away ----------
function chamGrass(B) { return B.grass || (B.grass = [...Array(12)].map((_, i) => ({ x: (SERP_D.x0 + 2 + (i % 3) * 3.2) * T + 16 + (hash(i, 5) - 0.5) * 20, y: (14.5 + Math.floor(i / 3) * 2.8) * T + (hash(5, i) - 0.5) * 16 }))); }
let chamHint = false;
function updateChameleon(B, dt, fainted, d) {
  chamGrass(B);
  switch (B.state) {
    case 'stalk': { B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1, sp = B.phase === 3 ? 95 : 70; B.x += dx / dd * sp * dt + Math.sin(B.anim * 2) * 30 * dt; B.y += dy / dd * sp * dt; clampBoss(B); if ((dd < 80 && B.st > 1) || B.st > 3.6) { B.state = 'tongueWind'; B.st = 0.5; B.aim = Math.atan2(dy, dx); SFX.play('wisp'); } break; }
    case 'tongueWind': B.st -= dt; B.aim = Math.atan2(P.y - 14 - (B.y - 30), P.x - B.x); if (B.st <= 0) { B.state = 'tongue'; B.st = 0.35; B.thit = false; SFX.play('swing'); } break;
    case 'tongue': {
      B.st -= dt; const len = Math.min(1, (0.35 - B.st) / 0.12) * 175, ax = B.x, ay = B.y - 30, bx = ax + Math.cos(B.aim) * len, by = ay + Math.sin(B.aim) * len;
      if (!B.thit && !fainted && !P.dash && segDist(P.x, P.y - 14, ax, ay, bx, by) < 16) { B.thit = true; damagePlayer(2, B); }
      if (B.st <= 0) { B.state = 'exposed'; B.st = 1.4; }
      break;
    }
    case 'exposed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.1); break;
    case 'spit': B.st -= dt; if (B.st <= 0) { const a = Math.atan2(P.y - 14 - (B.y - 30), P.x - B.x); for (const o of [-0.35, 0, 0.35]) projectiles.push({ kind: 'venom', x: B.x, y: B.y - 30, vx: Math.cos(a + o) * 190, vy: Math.sin(a + o) * 190, ang: a + o, t: 0, life: 1.8 }); SFX.play('swing'); B.state = 'exposed'; B.st = 0.9; } break;
    case 'frogs': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['dartfrog', 'dartfrog'], 4); B.state = 'exposed'; B.st = 0.8; } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawChameleon(c, B) {
  for (const g of chamGrass(B)) { const near = B.state === 'stalk' && Math.hypot(B.x - g.x, B.y - g.y) < 44, sh = near ? Math.sin(time * 40 + g.x) * 5 : 0; c.save(); c.translate(g.x, g.y); for (let i = 0; i < 7; i++) { const ox = -14 + i * 5, h = 18 + ((i * 7) % 9), sway = Math.sin(time * 2 + g.x * 0.05 + i) * 2 + sh; c.strokeStyle = i % 2 ? '#3d8448' : '#5aa65c'; c.lineWidth = 3; c.beginPath(); c.moveTo(ox, 0); c.quadraticCurveTo(ox + sway * 0.5, -h * 0.6, ox + sway, -h); c.stroke(); } c.restore(); if (near && Math.random() < 0.1) particles.push({ x: g.x + (rng() - 0.5) * 20, y: g.y - 14, vx: (rng() - 0.5) * 60, vy: -50, life: 0.4, color: '#5aa65c', leaf: true }); }
  const vis = B.state !== 'stalk' && B.state !== 'sleep' ? 1 : B.state === 'sleep' ? 1 : 0.07, f = P.x < B.x ? -1 : 1, x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y;
  if (vis > 0.5) { c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, x, y + 4, 34, 9); }
  c.save(); c.globalAlpha = vis; bossFlash(c, B);
  const col = B.state === 'tongueWind' ? '#e0503a' : B.state === 'dazed' ? '#e8b030' : '#4aa85a';
  c.strokeStyle = col; c.lineWidth = 8; c.beginPath(); c.moveTo(x - f * 24, y - 22); c.quadraticCurveTo(x - f * 50, y - 20, x - f * 44, y - 40); c.arc(x - f * 38, y - 40, 6, Math.PI, 0); c.stroke();
  c.fillStyle = '#2f6b3a'; for (const ox of [-16, -6, 8, 18]) c.fillRect(x + ox - 2, y - 12, 5, 12);
  c.fillStyle = col; ellipse(c, x, y - 24, 28, 15); c.fillStyle = 'rgba(255,255,255,.18)'; ellipse(c, x - 4, y - 30, 18, 6);
  c.fillStyle = col; c.beginPath(); c.moveTo(x - 10, y - 36); c.lineTo(x, y - 48); c.lineTo(x + 12, y - 36); c.closePath(); c.fill();
  c.fillStyle = col; ellipse(c, x + f * 26, y - 30, 14, 10);
  c.fillStyle = '#ffe08a'; circle(c, x + f * 30, y - 34, 5); c.fillStyle = '#1a1210'; circle(c, x + f * 31 + Math.cos(B.aim || 0) * 2, y - 34, 2);
  c.restore();
  if (B.state === 'tongue') { const len = Math.min(1, (0.35 - B.st) / 0.12) * 175; c.strokeStyle = '#e45a8f'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x + f * 30, y - 30); c.lineTo(x + Math.cos(B.aim) * len, y - 30 + Math.sin(B.aim) * len); c.stroke(); c.lineCap = 'butt'; c.fillStyle = '#e45a8f'; circle(c, x + Math.cos(B.aim) * len, y - 30 + Math.sin(B.aim) * len, 6); }
  if (B.state === 'tongueWind') bossWarn(c, { x }, y - 70);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 30, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 60, 20);
}
// ---------- the Serpent Queen: only the gem on her tail can be hurt ----------
let serpHint = false;
function serpTail(B) { return B.trail && B.trail.length ? B.trail[B.trail.length - 1] : { x: B.x, y: B.y }; }
function hitSerpent(B, hx, hy, rad, dmg) {
  if (!B.active || B.state === 'dying' || B.state === 'wake') return false;
  const tl = serpTail(B);
  if (Math.hypot(tl.x - hx, tl.y - 12 - hy) < rad + 24) {
    damageBoss(B, dmg); B.tailHits = (B.tailHits || 0) + 1; burst(tl.x, tl.y - 10, '#ffd65a', 10);
    if (B.tailHits >= 3 && B.state !== 'dazed' && B.hp > 0) { B.tailHits = 0; B.state = 'dazed'; B.st = 2.4; floatText(B.x, B.y - 90, 'She recoils! Strike the tail!', '#ffe08a'); }
    return true;
  }
  if (Math.hypot(B.x - hx, B.y - 20 - hy) < rad + 30) { floatText(B.x, B.y - 70, 'Clang!', '#c8d0ff'); SFX.play('mine'); if (!serpHint) { serpHint = true; toast('Her scales are too tough. Strike the glowing gem at the tip of her tail!', 4500); } }
  return false;
}
function serpMove(B, sp, turn, dt, tx, ty) {
  const A = B.arena; if (B.dir === undefined) B.dir = Math.PI / 2;
  let want = Math.atan2(ty - B.y, tx - B.x);
  if (B.x < A.x0 + 60 || B.x > A.x1 - 60 || B.y < A.y0 + 60 || B.y > A.y1 - 30) want = Math.atan2(A.cy - B.y, A.cx - B.x);
  let da = want - B.dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  B.dir += Math.max(-turn * dt, Math.min(turn * dt, da));
  B.x += Math.cos(B.dir) * sp * dt; B.y += Math.sin(B.dir) * sp * dt; clampBoss(B, 20);
  const last = B.trail[0]; if (!last || Math.hypot(last.x - B.x, last.y - B.y) > 6) { B.trail.unshift({ x: B.x, y: B.y }); if (B.trail.length > 70) B.trail.pop(); }
}
function updateSerpent(B, dt, fainted, d) {
  B.trail = B.trail || [];
  if (B.state !== 'dazed' && B.state !== 'dying') for (let i = 6; i < B.trail.length; i += 5) { const s = B.trail[i]; if (!fainted && !P.dash && Math.hypot(P.x - s.x, P.y - s.y) < 18) { damagePlayer(1, s); break; } }
  switch (B.state) {
    case 'chase': B.st += dt; serpMove(B, B.phase === 3 ? 185 : 150, 2.2, dt, P.x, P.y); if (B.st > 3) bossRest(B, 0.2); break;
    case 'spitWind': B.st -= dt; serpMove(B, 60, 3, dt, P.x, P.y); if (B.st <= 0) { const a = Math.atan2(P.y - 14 - (B.y - 24), P.x - B.x); for (let i = 0; i < 5; i++) { const o = (i - 2) * 0.28; projectiles.push({ kind: 'venom', x: B.x, y: B.y - 24, vx: Math.cos(a + o) * 200, vy: Math.sin(a + o) * 200, ang: a + o, t: 0, life: 1.8 }); } SFX.play('swing'); bossRest(B, 0.4); } break;
    case 'coil': { B.st += dt; const r = Math.max(55, 170 - B.st * 55), a = (B.coilA = (B.coilA || Math.atan2(B.y - P.y, B.x - P.x)) + dt * 2.6); serpMove(B, 260, 6, dt, P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * 0.7); if (B.st > 2.4) { B.coilA = 0; bossRest(B, 0.3); } break; }
    case 'raptors': B.st -= dt; serpMove(B, 80, 2, dt, P.x, P.y); if (B.st <= 0) { summonMinions(B, ['raptor', 'raptor'], 4); bossRest(B, 0.3); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawSerpent(c, B) {
  const tr = B.trail || [], dz = B.state === 'dazed';
  for (let i = tr.length - 1; i >= 0; i -= 2) { const s = tr[i], r = 13 - i / tr.length * 4 + (i < 8 ? 2 : 0); c.fillStyle = 'rgba(0,0,0,.2)'; ellipse(c, s.x, s.y + 4, r, r * 0.35); }
  for (let i = tr.length - 1; i >= 0; i -= 2) { const s = tr[i], k = i / Math.max(1, tr.length), r = 14 - k * 6; c.fillStyle = (Math.floor(i / 4) % 2) ? '#2f6b3a' : '#4a8a3a'; circle(c, s.x, s.y - 14, r); c.fillStyle = '#e8d070'; ellipse(c, s.x, s.y - 10, r * 0.6, r * 0.35); }
  const tl = serpTail(B), g = 0.6 + Math.sin(time * 8) * 0.3;
  if (B.active) { c.fillStyle = `rgba(255,214,90,${g * 0.4})`; circle(c, tl.x, tl.y - 14, 16); c.fillStyle = '#ffd65a'; diamond(c, tl.x, tl.y - 14, 6, 9); c.fillStyle = '#e0503a'; diamond(c, tl.x, tl.y - 14, 3, 5); }
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y, dir = B.dir === undefined ? Math.PI / 2 : B.dir, fx = Math.cos(dir), fy = Math.sin(dir);
  c.globalAlpha = 1; bossFlash(c, B);
  c.fillStyle = '#2f6b3a'; c.beginPath(); c.ellipse(x - fx * 4, y - 30, 26, 22, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#e8d070'; c.beginPath(); c.ellipse(x - fx * 4, y - 26, 14, 14, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#4a8a3a'; ellipse(c, x + fx * 12, y - 30 + fy * 6, 15, 12);
  c.fillStyle = dz ? '#ffe08a' : '#ffd65a'; circle(c, x + fx * 16 - fy * 6, y - 34 + fy * 4, 3.5); circle(c, x + fx * 16 + fy * 6, y - 34 + fy * 4, 3.5); c.fillStyle = '#1a1210'; c.fillRect(x + fx * 16 - fy * 6 - 0.5, y - 36 + fy * 4, 1.5, 4); c.fillRect(x + fx * 16 + fy * 6 - 0.5, y - 36 + fy * 4, 1.5, 4);
  if (B.state === 'spitWind' || Math.sin(time * 5) > 0.6) { c.strokeStyle = '#e45a8f'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + fx * 24, y - 28 + fy * 6); c.lineTo(x + fx * 34, y - 28 + fy * 10); c.stroke(); }
  c.fillStyle = '#d9a23c'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(x - fx * 4 + i * 9 - 3, y - 50); c.lineTo(x - fx * 4 + i * 9, y - 60 - (i === 0 ? 4 : 0)); c.lineTo(x - fx * 4 + i * 9 + 3, y - 50); c.fill(); }
  c.globalAlpha = 1;
  if (B.state === 'spitWind' || B.state === 'coil') bossWarn(c, { x }, y - 80);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 40, z: 0, anim: B.anim });
  if (dz) drawStars(c, x, y - 70, 22);
}
function drawSerpentTemple(c) {
  const x = SERP.x, y = SERP.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 76, 14);
  for (let i = 0; i < 4; i++) { const w = 72 - i * 14, h = 20; c.fillStyle = i % 2 ? '#6a7a5a' : '#7a8a6a'; c.fillRect(x - w, y - (i + 1) * h, w * 2, h); c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x - w, y - (i + 1) * h + h - 4, w * 2, 4); }
  c.fillStyle = '#3d8448'; for (const [ox, oy] of [[-60, -14], [52, -30], [-40, -52], [30, -70], [-10, -76]]) { c.beginPath(); c.ellipse(x + ox, y + oy, 9, 4, 0.5, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#2f6b3a'; c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x - 22, y - 30); c.quadraticCurveTo(x, y - 54, x + 22, y - 30); c.lineTo(x + 22, y); c.closePath(); c.fill();
  c.fillStyle = '#0a0812'; c.beginPath(); c.moveTo(x - 15, y); c.lineTo(x - 15, y - 28); c.quadraticCurveTo(x, y - 44, x + 15, y - 28); c.lineTo(x + 15, y); c.closePath(); c.fill();
  c.fillStyle = '#efe6d8'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x + s * 12, y - 30); c.lineTo(x + s * 8, y - 16); c.lineTo(x + s * 5, y - 30); c.closePath(); c.fill(); }
  const g = 0.5 + Math.sin(time * 2) * 0.3; c.fillStyle = `rgba(255,214,90,${g})`; c.fillRect(x - 12, y - 46, 6, 4); c.fillRect(x + 6, y - 46, 6, 4);
}
// ---------- sinking lily pads ----------
const LILY_STATE = new Map();
let lilyStand = 0, lilyKey = -1;
function updateLilies(dt, fainted) {
  for (const [k, st] of LILY_STATE) { st.down -= dt; if (st.down <= 0) { tiles[k] = LILY; LILY_STATE.delete(k); const x = k % W, y = Math.floor(k / W); redrawArea(x, y, x, y); } }
  if ((dungeonAt(P.x) !== VALE_D && dungeonAt(P.x) !== SHRINE_D) || P.ride) return;
  const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T), k = ty * W + tx, t = tiles[k];
  if (t === LAND || t === PATH || t === FLOOR) { P.safe = { x: P.x, y: P.y }; lilyStand = 0; lilyKey = -1; return; }
  if (t === LILY) {
    if (k !== lilyKey) { lilyKey = k; lilyStand = 0; }
    lilyStand += dt;
    if (lilyStand > 1.3) {
      tiles[k] = DEEP; LILY_STATE.set(k, { down: 3.5 }); redrawArea(tx, ty, tx, ty); SFX.play('slime');
      for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2; particles.push({ x: tx * T + 16, y: ty * T + 16, vx: Math.cos(a) * 60, vy: Math.sin(a) * 40 - 30, life: 0.5, color: '#bfe8ff', size: 3 }); }
      if (P.safe) { P.x = P.safe.x; P.y = P.safe.y; } floatText(P.x, P.y - 60, 'Splash! The pad sank.', '#bfe8ff');
      if (!fainted) { P.inv = 0; damagePlayer(1, { x: P.x, y: P.y + 20 }); }
      lilyStand = 0; lilyKey = -1;
    }
  }
}
function drawLilyWobble(c) {
  if (lilyKey < 0 || lilyStand < 0.5) return;
  const x = (lilyKey % W) * T + 16, y = Math.floor(lilyKey / W) * T + 16, k = (lilyStand - 0.5) / 0.8;
  c.strokeStyle = `rgba(255,255,255,${0.3 + k * 0.5})`; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 4, 14 + k * 8 + Math.sin(time * 30) * 2, 6 + k * 3, 0, 0, Math.PI * 2); c.stroke();
}
function drawBlossomTile(c, x, y, px, py, t) {
  const h = hash(x, y);
  if (t === DEEP || t === LILY) {
    c.fillStyle = '#7ec8e8'; c.fillRect(px, py, T, T); c.fillStyle = 'rgba(255,255,255,.18)'; if (h > 0.6) c.fillRect(px + h * 20, py + 8, 8, 2);
    const landN = q => isLand(q) && q !== LILY;
    c.fillStyle = '#5aa65c'; if (landN(tileAt(x, y - 1))) c.fillRect(px, py, T, 4); if (landN(tileAt(x, y + 1))) c.fillRect(px, py + T - 3, T, 3); if (landN(tileAt(x - 1, y))) c.fillRect(px, py, 3, T); if (landN(tileAt(x + 1, y))) c.fillRect(px + T - 3, py, 3, T);
    if (t === LILY) { c.fillStyle = '#3d8448'; c.beginPath(); c.arc(px + 16, py + 17, 13, 0.3, Math.PI * 2 - 0.1); c.lineTo(px + 16, py + 17); c.closePath(); c.fill(); c.fillStyle = '#5ab85a'; c.beginPath(); c.arc(px + 15, py + 16, 10, 0.3, Math.PI * 2 - 0.1); c.lineTo(px + 15, py + 16); c.closePath(); c.fill(); if (h > 0.4) { c.fillStyle = '#f2a0c8'; circle(c, px + 11, py + 12, 3); c.fillStyle = '#ffe9f2'; circle(c, px + 11, py + 12, 1.5); } }
    return;
  }
  spr(c, h < 0.35 ? 'grass1' : 'grass0', px, py);
  if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
  c.fillStyle = t === PATH ? 'rgba(255,220,230,.12)' : 'rgba(255,200,220,.12)'; c.fillRect(px, py, T, T);
  if (t !== PATH && h > 0.8) { c.fillStyle = '#f2a0c8'; c.fillRect(px + h * 22, py + 6 + h * 14, 3, 2); c.fillRect(px + 4 + h * 10, py + 22, 2, 2); }
}
function drawBlossomTree(c, r) {
  c.fillStyle = '#5a3a2a'; c.fillRect(-4, -34, 8, 34); c.strokeStyle = '#5a3a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, -24); c.lineTo(-14, -40); c.moveTo(0, -28); c.lineTo(12, -44); c.stroke();
  const sw = Math.sin(time * 1.5 + r.seed * 9) * 1.5;
  for (const [ox, oy, rr, col] of [[-16, -44, 14, '#e888b4'], [14, -48, 14, '#e888b4'], [0, -56, 17, '#f2a0c8'], [-8, -50, 11, '#ffc4dc'], [10, -58, 9, '#ffc4dc']]) { c.fillStyle = col; circle(c, ox + sw, oy, rr); }
  if (Math.random() < 0.02) ambient.push({ kind: 'petal', x: r.x + (Math.random() - 0.5) * 30, y: r.y - 50, life: 4, ph: Math.random() * 6 });
}
function drawStoneLantern(c, o) {
  const x = o.x, y = o.y; shadow(c, x, y + 2, 12, 4);
  c.fillStyle = '#8a8478'; c.fillRect(x - 4, y - 22, 8, 22); c.fillRect(x - 10, y - 2, 20, 4); c.fillStyle = '#6a6458'; c.fillRect(x - 9, y - 34, 18, 12);
  c.fillStyle = `rgba(255,220,150,${0.7 + Math.sin(time * 5 + x) * 0.2})`; c.fillRect(x - 5, y - 31, 10, 6);
  c.fillStyle = '#5a5448'; c.beginPath(); c.moveTo(x - 13, y - 34); c.lineTo(x, y - 44); c.lineTo(x + 13, y - 34); c.closePath(); c.fill();
}
function drawBlossomArch(c, o) {
  const x = o.x, y = o.y; shadow(c, x, y + 2, 40, 6);
  c.fillStyle = '#c8402a'; c.fillRect(x - 36, y - 80, 9, 82); c.fillRect(x + 27, y - 80, 9, 82); c.fillRect(x - 46, y - 88, 92, 9); c.fillRect(x - 38, y - 70, 76, 6);
  c.fillStyle = '#2a1a1a'; c.fillRect(x - 50, y - 92, 100, 5);
}
function drawPass(c, x, y, home) {
  shadow(c, x, y + 2, 40, 9);
  c.fillStyle = home ? '#6a6458' : '#8a8a94'; c.beginPath(); c.moveTo(x - 50, y); c.lineTo(x - 36, y - 60); c.lineTo(x - 6, y - 84); c.lineTo(x + 26, y - 70); c.lineTo(x + 50, y); c.closePath(); c.fill();
  if (!home) { c.fillStyle = '#f2f6ff'; c.beginPath(); c.moveTo(x - 36, y - 60); c.lineTo(x - 6, y - 84); c.lineTo(x + 26, y - 70); c.lineTo(x + 14, y - 62); c.lineTo(x - 4, y - 70); c.lineTo(x - 20, y - 56); c.closePath(); c.fill(); }
  else { c.fillStyle = '#e888b4'; for (const [ox, oy] of [[-30, -50], [20, -60], [-8, -76]]) circle(c, x + ox, y + oy, 9); }
  c.fillStyle = '#0a0812'; c.beginPath(); c.moveTo(x - 18, y); c.lineTo(x - 18, y - 30); c.quadraticCurveTo(x, y - 48, x + 18, y - 30); c.lineTo(x + 18, y); c.closePath(); c.fill();
  c.fillStyle = '#5a3a22'; c.fillRect(x - 20, y - 34, 4, 34); c.fillRect(x + 16, y - 34, 4, 34); c.fillRect(x - 20, y - 36, 40, 4);
}
// ---------- Petalfall creatures: spirit foxes, blossom moths, leaping koi, trickster tanuki ----------
function updateValeFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'fox') {
    e.decoys = (e.decoys || []).filter(q => (q.t -= dt) > 0);
    if (chase) {
      const want = d > 150 ? 1 : d < 100 ? -1 : 0, a = e.anim * 1.4 + e.hx; moveEnemy(e, (dx / d * want + Math.cos(a) * 0.6) * D.sp * dt, (dy / d * want + Math.sin(a) * 0.6) * D.sp * dt);
      if (e.cd <= 0) { e.cd = 2.6 + rng(); projectiles.push({ kind: 'wisp', x: e.x, y: e.y - 20, ang: Math.atan2(P.y - e.y, P.x - e.x), t: 0, life: 3 }); SFX.play('wisp'); }
      e.blink = (e.blink || 3) - dt;
      if (e.blink <= 0) { e.blink = 5; const spots = []; for (let i = 0; i < 3; i++) { const a = rng() * Math.PI * 2, nx = P.x + Math.cos(a) * 120, ny = P.y + Math.sin(a) * 90; if (walkable(nx, ny)) spots.push([nx, ny]); } if (spots.length) { burst(e.x, e.y - 20, '#ffb347', 10); const [rx, ry] = spots.pop(); e.x = rx; e.y = ry; e.decoys = spots.map(([x, y]) => ({ x, y, t: 4 })); SFX.play('wisp'); } }
    } else wander(D.sp * 0.5);
    return true;
  }
  if (ai === 'moth') {
    if (chase) { const a = e.anim * 2 + e.hx, tx = P.x + Math.cos(a) * 90, ty = P.y + Math.sin(a) * 60, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1; moveEnemy(e, ex / el * Math.min(el, D.sp * dt), ey / el * Math.min(el, D.sp * dt)); if (e.cd <= 0) { e.cd = 3.5 + rng(); HAZARDS.push({ x: e.x, y: e.y, r: 46, t: 0, life: 3, tick: 99, pollen: true }); SFX.play('wisp'); } }
    else moveEnemy(e, Math.cos(e.anim * 2) * 30 * dt + (e.hx - e.x) * 0.3 * dt, Math.sin(e.anim * 2.4) * 20 * dt + (e.hy - e.y) * 0.3 * dt);
    touch(D.dmg); return true;
  }
  if (ai === 'koi') {
    const water = (x, y) => tileAt(Math.floor(x / T), Math.floor(y / T)) === DEEP;
    if (e.mode === undefined) e.mode = 'swim';
    if (e.mode === 'swim') {
      e.wt = (e.wt || 0) - dt; if (e.wt <= 0) { e.wt = 1 + rng() * 1.5; e.sa = rng() * Math.PI * 2; }
      const nx = e.x + Math.cos(e.sa) * 40 * dt, ny = e.y + Math.sin(e.sa) * 40 * dt; if (water(nx, ny)) { e.x = nx; e.y = ny; } else e.sa += Math.PI;
      if (chase && d < 180 && d > 40 && e.cd <= 0) { e.mode = 'leap'; e.st = 0.7; e.sx = e.x; e.sy = e.y; e.tx = P.x; e.ty = P.y; SFX.play('leap'); burst(e.x, e.y, '#bfe8ff', 8); }
      return true;
    }
    if (e.mode === 'leap') {
      e.st -= dt; const k = 1 - Math.max(0, e.st) / 0.7; e.x = e.sx + (e.tx - e.sx) * k; e.y = e.sy + (e.ty - e.sy) * k; e.lift = Math.sin(Math.PI * k) * 60;
      if (e.st <= 0) { e.lift = 0; if (!fainted && Math.hypot(P.x - e.x, P.y - e.y) < 28) damagePlayer(1, e); if (water(e.x, e.y)) { e.mode = 'swim'; e.cd = 2; } else { e.mode = 'flop'; e.st = 1.4; } }
      return true;
    }
    if (e.mode === 'flop') { e.st -= dt; if (e.st <= 0) { e.mode = 'leap'; e.st = 0.6; e.sx = e.x; e.sy = e.y; e.tx = e.hx; e.ty = e.hy; e.cd = 2.5; } return true; }
    return true;
  }
  if (ai === 'tanuki') {
    if (e.mode === undefined) e.mode = 'disguise';
    if (e.mode === 'disguise') { if (!fainted && d < 60) { e.mode = 'chase'; e.cd = 0.6; burst(e.x, e.y - 14, '#e6e2d6', 16); floatText(e.x, e.y - 50, 'It\'s a tanuki!', '#ffe08a'); SFX.play('wisp'); } return true; }
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'roll'; e.st = 0.5; e.lx = dx / d * 300; e.ly = dy / d * 300; e.hit = false; } return true; }
    if (e.state === 'roll') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 24 && !fainted) { e.hit = true; damagePlayer(D.dmg, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 2; } return true; }
    if (chase) { moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 130 && e.cd <= 0) { e.state = 'windup'; e.st = 0.4; } } else wander(D.sp * 0.6);
    touch(D.dmg); return true;
  }
  return updateReefFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
Object.assign(PROC_DRAW, {
  fox(c, e, k) {
    const one = (x, y, ghost) => {
      const f = P.x < x ? -1 : 1, bob = Math.sin(e.anim * 6) * 2;
      c.globalAlpha = ghost ? 0.85 : 1;
      shadow(c, x, y + 2, 11 * k, 3 * k);
      c.fillStyle = '#e8a040'; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(x - f * (12 + i * 3), y - 14 - i * 5 + bob, 9, 4, -f * (0.6 + i * 0.3), 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#ffffff'; circle(c, x - f * 22, y - 26 + bob, 3);
      c.fillStyle = '#e8a040'; ellipse(c, x, y - 12 + bob, 10 * k, 7 * k); ellipse(c, x + f * 9, y - 20 + bob, 7 * k, 6 * k);
      c.beginPath(); c.moveTo(x + f * 5, y - 25 + bob); c.lineTo(x + f * 6, y - 33 + bob); c.lineTo(x + f * 10, y - 25 + bob); c.fill(); c.beginPath(); c.moveTo(x + f * 10, y - 25 + bob); c.lineTo(x + f * 13, y - 32 + bob); c.lineTo(x + f * 14, y - 23 + bob); c.fill();
      c.fillStyle = '#ffffff'; ellipse(c, x + f * 12, y - 18 + bob, 3, 2); c.fillStyle = '#1a1210'; c.fillRect(x + f * 10, y - 22 + bob, 2, 2);
      c.fillStyle = `rgba(150,200,255,${0.4 + Math.sin(time * 8 + x) * 0.2})`; circle(c, x - f * 22, y - 30 + bob, 4);
      c.globalAlpha = 1;
    };
    for (const q of e.decoys || []) one(q.x, q.y, true);
    one(e.x, e.y, false);
  },
  moth(c, e, k) {
    const y = e.y - 30 + Math.sin(e.anim * 4) * 4, flap = Math.abs(Math.sin(time * 16 + e.hx));
    shadow(c, e.x, e.y + 2, 8 * k, 3 * k);
    for (const s of [-1, 1]) { c.fillStyle = '#f2a0c8'; c.beginPath(); c.ellipse(e.x + s * 8 * flap, y - 3, 8 * flap + 1, 7, s * 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffe9f2'; circle(c, e.x + s * 8 * flap, y - 4, 2.5 * flap + 0.5); }
    c.fillStyle = '#6a4a5a'; ellipse(c, e.x, y, 3, 7); c.strokeStyle = '#6a4a5a'; c.lineWidth = 1; c.beginPath(); c.moveTo(e.x - 1, y - 6); c.lineTo(e.x - 4, y - 11); c.moveTo(e.x + 1, y - 6); c.lineTo(e.x + 4, y - 11); c.stroke();
    if (Math.random() < 0.2) particles.push({ x: e.x, y: y + 4, vx: (Math.random() - 0.5) * 10, vy: 12, life: 0.6, color: '#ffd6ea', size: 2 });
  },
  koi(c, e, k) {
    const lift = e.lift || 0, a = e.mode === 'swim' ? e.sa || 0 : Math.atan2((e.ty || e.y) - (e.sy || e.y), (e.tx || e.x) - (e.sx || e.x));
    if (e.mode === 'swim') { c.save(); c.globalAlpha = 0.6; c.translate(e.x, e.y); c.rotate(a); c.fillStyle = '#e8703a'; ellipse(c, 0, 0, 14, 6); c.fillStyle = '#ffffff'; ellipse(c, 4, -1, 4, 3); c.beginPath(); c.moveTo(-12, 0); c.lineTo(-20, -5); c.lineTo(-20, 5); c.closePath(); c.fillStyle = '#e8703a'; c.fill(); c.restore(); return; }
    shadow(c, e.x, e.y + 2, 14 * k, 4 * k);
    const flop = e.mode === 'flop' ? Math.sin(time * 30) * 0.5 : 0;
    c.save(); c.translate(e.x, e.y - 12 - lift); c.rotate((Math.cos(a) < 0 ? Math.PI : 0) + flop);
    c.fillStyle = '#e8703a'; ellipse(c, 0, 0, 16, 8); c.fillStyle = '#ffffff'; ellipse(c, 4, -2, 5, 4); ellipse(c, -6, 2, 4, 3);
    c.fillStyle = '#e8703a'; c.beginPath(); c.moveTo(-14, 0); c.lineTo(-24, -7); c.lineTo(-24, 7); c.closePath(); c.fill(); c.fillStyle = '#1a1210'; c.fillRect(10, -3, 2, 2);
    c.restore();
  },
  tanuki(c, e, k) {
    if (e.mode === 'disguise') { drawPot(c, { ...e, x: e.x, y: e.y - 2, shake: 0 }); if (Math.sin(time * 3 + e.hx) > 0.95) { c.fillStyle = '#1a1210'; c.fillRect(e.x - 3, e.y - 16, 2, 2); c.fillRect(e.x + 2, e.y - 16, 2, 2); } return; }
    const roll = e.state === 'roll', f = P.x < e.x ? -1 : 1, bob = Math.abs(Math.sin(e.anim * 8)) * 2;
    shadow(c, e.x, e.y + 2, 12 * k, 4 * k);
    if (roll) { c.save(); c.translate(e.x, e.y - 12); c.rotate(time * 20); c.fillStyle = '#8a6a44'; circle(c, 0, 0, 12); c.fillStyle = '#4a3624'; c.fillRect(-12, -2, 24, 4); c.restore(); return; }
    c.strokeStyle = '#6a4a2a'; c.lineWidth = 7; c.beginPath(); c.moveTo(e.x - f * 8, e.y - 8); c.quadraticCurveTo(e.x - f * 18, e.y - 10, e.x - f * 16, e.y - 20); c.stroke(); c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x - f * 15, e.y - 13); c.lineTo(e.x - f * 18, e.y - 15); c.stroke();
    c.fillStyle = '#8a6a44'; ellipse(c, e.x, e.y - 12 - bob, 11 * k, 10 * k); c.fillStyle = '#e6d2b0'; ellipse(c, e.x, e.y - 9 - bob, 6, 6);
    c.fillStyle = '#8a6a44'; circle(c, e.x + f * 3, e.y - 24 - bob, 8 * k); c.fillStyle = '#3a2a1a'; ellipse(c, e.x + f * 5, e.y - 24 - bob, 6, 3); c.fillStyle = '#ffffff'; c.fillRect(e.x + f * 3 - 2, e.y - 25 - bob, 1.5, 1.5); c.fillRect(e.x + f * 7 - 1, e.y - 25 - bob, 1.5, 1.5);
    c.fillStyle = '#6a4a2a'; circle(c, e.x - 4, e.y - 31 - bob, 3); circle(c, e.x + 6, e.y - 31 - bob, 3);
  },
});
// ---------- the Elder Fox: illusions shield her until the great bell rings ----------
function foxGong(B) { return B.gong || (B.gong = { x: (SHRINE_D.x0 + 5) * T + 16, y: 22 * T + 16, cd: 0 }); }
let elderHint = false;
function hitGong(B, hx, hy, rad) {
  if (B.type !== 'elderfox' || !B.active) return;
  const g = foxGong(B);
  if (g.cd > 0 || Math.hypot(g.x - hx, g.y - 30 - hy) > rad + 20) return;
  g.cd = 6; g.ring = 1; SFX.play('lucky'); impact(6);
  if (B.decoys && B.decoys.some(q => !q.popped)) { for (const q of B.decoys) if (!q.popped) burst(q.x, q.y - 20, '#ffb347', 12); B.decoys = []; B.state = 'dazed'; B.st = 2.6; floatText(B.x, B.y - 90, 'The bell shatters her illusions!', '#ffe08a'); }
  else floatText(g.x, g.y - 70, 'Bong!', '#ffe9a8');
}
function updateElderFox(B, dt, fainted, d) {
  const g = foxGong(B); g.cd = Math.max(0, g.cd - dt); g.ring = Math.max(0, (g.ring || 0) - dt);
  B.decoys = B.decoys || [];
  switch (B.state) {
    case 'prowl': { B.st += dt; const want = d > 150 ? 1 : d < 100 ? -1 : 0, a = B.anim * 1.3; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.x += (dx / dd * want + Math.cos(a) * 0.6) * 110 * dt; B.y += (dy / dd * want + Math.sin(a) * 0.6) * 110 * dt; clampBoss(B); if (B.st > 1.6) bossRest(B, 0.1); break; }
    case 'fire': B.st -= dt; if (B.st <= 0) { const n = B.phase === 3 ? 12 : 8, off = rng(); for (const src of [B, ...B.decoys.filter(q => !q.popped)]) for (let i = 0; i < (src === B ? n : 3); i++) { const a = (i + off) / (src === B ? n : 3) * Math.PI * 2; projectiles.push({ kind: 'fire', weak: true, x: src.x, y: src.y - 30, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, ang: a, t: 0, life: 2 }); } SFX.play('wisp'); bossRest(B, 0.6); } break;
    case 'illusion': B.st -= dt; if (B.st <= 0) { const A = B.arena, n = B.phase === 3 ? 5 : 3, spots = []; for (let i = 0; i <= n; i++) spots.push({ x: A.x0 + 50 + rng() * (A.x1 - A.x0 - 100), y: A.y0 + 70 + rng() * (A.y1 - A.y0 - 90) }); burst(B.x, B.y - 20, '#ffb347', 16); const me = spots.pop(); B.x = me.x; B.y = me.y; B.decoys = spots; SFX.play('wisp'); if (!elderHint) { elderHint = true; toast('Which one is real? Strike the great bell in the courtyard to shatter her illusions!', 4500); } bossRest(B, 0.6); } break;
    case 'dashWind': B.st -= dt; if (B.st <= 0) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd * 380; B.vy = dy / dd * 380; B.state = 'dash'; B.st = 0.35; SFX.play('dash'); } break;
    case 'dash': B.st -= dt; B.x += B.vx * dt; B.y += B.vy * dt; clampBoss(B); if (!B.dhit && !fainted && !P.dash && d < 30) { B.dhit = true; damagePlayer(2, B); } if (B.st <= 0) { B.dhit = false; bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawElderFox(c, B) {
  const g = foxGong(B);
  shadow(c, g.x, g.y + 2, 20, 6);
  c.fillStyle = '#5a3a22'; c.fillRect(g.x - 24, g.y - 70, 6, 72); c.fillRect(g.x + 18, g.y - 70, 6, 72); c.fillStyle = '#c8402a'; c.fillRect(g.x - 28, g.y - 76, 56, 8);
  const sw = g.ring > 0 ? Math.sin(time * 30) * g.ring * 0.3 : 0; c.save(); c.translate(g.x, g.y - 68); c.rotate(sw);
  c.fillStyle = g.cd > 0 ? '#8a6a34' : '#d9a23c'; c.beginPath(); c.moveTo(-14, 10); c.quadraticCurveTo(-16, 40, -18, 44); c.lineTo(18, 44); c.quadraticCurveTo(16, 40, 14, 10); c.quadraticCurveTo(0, 2, -14, 10); c.fill(); c.fillStyle = '#ffe9a8'; c.fillRect(-10, 16, 3, 20); c.restore();
  if (g.ring > 0) { c.strokeStyle = `rgba(255,233,168,${g.ring})`; c.lineWidth = 3; c.beginPath(); c.ellipse(g.x, g.y - 40, 60 * (1.5 - g.ring), 30 * (1.5 - g.ring), 0, 0, Math.PI * 2); c.stroke(); }
  const one = (x, y, alpha) => {
    const f = P.x < x ? -1 : 1, bob = Math.sin(B.anim * 4) * 3, sc = 1.8;
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, x, y + 4, 26, 8);
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#f2e6d6' : '#e8a040'; c.beginPath(); c.ellipse(x - f * (18 + i * 2), y - 20 - i * 9 + bob, 16, 6, -f * (0.4 + i * 0.25), 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#e8a040'; ellipse(c, x, y - 20 + bob, 10 * sc, 8 * sc); ellipse(c, x + f * 16, y - 36 + bob, 7 * sc, 6 * sc);
    c.beginPath(); c.moveTo(x + f * 8, y - 46 + bob); c.lineTo(x + f * 10, y - 60 + bob); c.lineTo(x + f * 16, y - 46 + bob); c.fill(); c.beginPath(); c.moveTo(x + f * 18, y - 46 + bob); c.lineTo(x + f * 24, y - 58 + bob); c.lineTo(x + f * 26, y - 42 + bob); c.fill();
    c.fillStyle = '#f2e6d6'; ellipse(c, x + f * 22, y - 32 + bob, 5, 4); ellipse(c, x, y - 14 + bob, 8, 6);
    c.fillStyle = B.state === 'dazed' ? '#ffe08a' : '#7fe0f0'; c.fillRect(x + f * 18 - 1, y - 40 + bob, 3, 3);
    c.fillStyle = '#c8402a'; c.fillRect(x + f * 14 - 6, y - 52 + bob, 12, 3);
    c.restore();
  };
  for (const q of B.decoys || []) if (!q.popped) one(q.x, q.y, 1);
  c.globalAlpha = 1; bossFlash(c, B); one(B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), B.y, c.globalAlpha); c.globalAlpha = 1;
  if (B.state === 'fire' || B.state === 'dashWind' || B.state === 'illusion') bossWarn(c, B, B.y - 90);
  if (B.state === 'sleep') bossZ(c, { x: B.x, y: B.y - 40, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 80, 22);
}
// ---------- the Koi Dragon: swims under the sacred pool, strands itself on the islet ----------
const isPool = (x, y) => { const t = tileAt(Math.floor(x / T), Math.floor(y / T)); return t === DEEP || t === LILY; };
function poolSpotNear(B, x, y) { const A = B.arena; for (let i = 0; i < 60; i++) { const a = rng() * Math.PI * 2, r = 70 + rng() * 120, nx = Math.max(A.x0 + 70, Math.min(A.x1 - 70, x + Math.cos(a) * r)), ny = Math.max(A.y0 + 50, Math.min(A.y1 - 50, y + Math.sin(a) * r * 0.6)); if (tileAt(Math.floor(nx / T), Math.floor(ny / T)) === DEEP) return { x: nx, y: ny }; } return { x: (SHRINE_D.x0 + 10) * T, y: 3 * T }; }
const isletCenter = () => ({ x: (SHRINE_D.x0 + 20) * T, y: 6 * T });
function updateKoiDragon(B, dt, fainted, d) {
  switch (B.state) {
    case 'swim': { B.st -= dt; if (!B.tgt) B.tgt = poolSpotNear(B, P.x, P.y); const dx = B.tgt.x - B.x, dy = B.tgt.y - B.y, dd = Math.hypot(dx, dy) || 1; B.x += dx / dd * Math.min(dd, 220 * dt); B.y += dy / dd * Math.min(dd, 220 * dt); if (Math.random() < dt * 10) particles.push({ x: B.x + (rng() - 0.5) * 40, y: B.y, vx: 0, vy: -20, life: 0.4, color: '#bfe8ff', size: 3 }); if (B.st <= 0 && dd < 10) { B.tgt = null; bossRest(B, 0.1); } else if (B.st <= -2) { B.tgt = null; bossRest(B, 0.1); } break; }
    case 'rise': B.st -= dt; if (B.st <= 0) {
      if (B.atk === 'spit') { const a = Math.atan2(P.y - 14 - (B.y - 50), P.x - B.x), n = B.phase === 1 ? 5 : 7; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.22; projectiles.push({ kind: 'bubble', x: B.x, y: B.y - 50, vx: Math.cos(a + o) * 150, vy: Math.sin(a + o) * 150, ph: rng() * 6, t: 0, life: 2.6 }); } SFX.play('wisp'); }
      else { B.ring = { x: B.x, y: B.y, r: 30, max: 260, hit: false }; impact(6); SFX.play('slam'); }
      B.state = 'sink'; B.st = 0.9;
    } break;
    case 'sink': B.st -= dt; if (B.st <= 0) bossRest(B, 0.1); break;
    case 'lungeWind': B.st -= dt; if (B.st <= 0) { const ic = isletCenter(); B.sx = B.x; B.sy = B.y; B.tx = ic.x + (rng() - 0.5) * 60; B.ty = ic.y + (rng() - 0.5) * 30; B.state = 'lunge'; B.st = 0.55; SFX.play('leap'); } break;
    case 'lunge': { B.st -= dt; const k = 1 - Math.max(0, B.st) / 0.55; B.x = B.sx + (B.tx - B.sx) * k; B.y = B.sy + (B.ty - B.sy) * k; B.z = Math.sin(Math.PI * k) * 70;
      if (B.st <= 0) { B.z = 0; impact(12); hitStop = 0.08; SFX.play('slam'); burst(B.x, B.y, '#bfe8ff', 20); if (!fainted && !P.dash && d < 60) damagePlayer(2, B); B.state = 'dazed'; B.st = 2.8; B.beached = true; floatText(B.x, B.y - 100, 'It\'s stranded! Strike now!', '#ffe08a'); }
      break; }
    case 'slide': { B.st -= dt; const dx = B.tgt.x - B.x, dy = B.tgt.y - B.y, dd = Math.hypot(dx, dy) || 1; B.x += dx / dd * Math.min(dd, 300 * dt); B.y += dy / dd * Math.min(dd, 300 * dt); if (B.st <= 0 || dd < 8) { B.tgt = null; B.beached = false; bossRest(B, 0.2); } break; }
    case 'dazed': B.st -= dt; if (B.st <= 0) { if (B.beached) { B.state = 'slide'; B.st = 0.8; B.tgt = poolSpotNear(B, B.x, B.y); SFX.play('slime'); } else bossRest(B, 0.3); } break;
  }
}
function drawKoiDragon(c, B) {
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y, z = B.z || 0, f = P.x < B.x ? -1 : 1;
  const under = B.state === 'swim' || B.state === 'sleep' || B.state === 'slide' && !B.beached;
  if (B.state === 'swim' || B.state === 'rest' && !B.beached) { c.fillStyle = 'rgba(20,40,80,.35)'; c.beginPath(); c.ellipse(x, y, 54, 16, Math.sin(time) * 0.2, 0, Math.PI * 2); c.fill(); for (let i = 0; i < 2; i++) { const ph = (time * 1.5 + i * 0.5) % 1; c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - ph)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 30 + ph * 40, 10 + ph * 12, 0, 0, Math.PI * 2); c.stroke(); } return; }
  if (B.state === 'sleep') { c.fillStyle = 'rgba(20,40,80,.3)'; ellipse(c, x, y, 54, 16); bossZ(c, { x, y: y - 20, z: 0, anim: B.anim }); return; }
  const rise = B.state === 'rise' ? 1 - Math.max(0, B.st) / 0.7 : B.state === 'sink' ? Math.max(0, B.st) / 0.9 : 1, out = B.beached || B.state === 'lunge';
  if (!out) { c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, 40, 12, 0, 0, Math.PI * 2); c.stroke(); }
  else { c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y + 4, 60, 14); }
  c.save(); if (!out) { c.beginPath(); c.rect(x - 120, y - 200, 240, 200); c.clip(); }
  c.globalAlpha = 1; bossFlash(c, B);
  const by = y - z + (1 - rise) * 80, len = out ? 1 : 0.6;
  // body coil
  for (let i = 8; i >= 0; i--) { const sx = x - f * i * 12 * len, sy = by - 20 - Math.sin(i * 0.7 + time * 3) * 8 - (out ? 0 : i * 6), r = 16 - i * 0.9; c.fillStyle = i % 2 ? '#e8703a' : '#ffffff'; circle(c, sx, sy, r); c.fillStyle = 'rgba(255,214,90,.5)'; circle(c, sx - 2, sy - 3, r * 0.4); }
  c.fillStyle = '#e8703a'; c.beginPath(); c.moveTo(x - f * 100 * len, by - 24); c.lineTo(x - f * 124 * len, by - 44); c.lineTo(x - f * 124 * len, by - 8); c.closePath(); c.fill();
  // head
  const hx = x + f * 14, hy = by - 44;
  c.fillStyle = '#e8703a'; ellipse(c, hx, hy, 22, 16); c.fillStyle = '#ffffff'; ellipse(c, hx + f * 10, hy + 4, 12, 8);
  c.fillStyle = '#d9a23c'; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(hx - 6 + s * 6, hy - 12); c.lineTo(hx - 12 + s * 10, hy - 34); c.lineTo(hx - 2 + s * 6, hy - 14); c.fill(); }
  c.strokeStyle = '#ffe9a8'; c.lineWidth = 2; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(hx + f * 18, hy + 2 + s * 3); c.quadraticCurveTo(hx + f * 34, hy + s * 14, hx + f * 40, hy + 10 + s * 16); c.stroke(); }
  c.fillStyle = B.state === 'dazed' ? '#ffe08a' : '#1a1210'; circle(c, hx + f * 8, hy - 4, 4); c.fillStyle = '#ffffff'; c.fillRect(hx + f * 8 - 1, hy - 6, 2, 2);
  c.restore(); c.globalAlpha = 1;
  if (B.state === 'lungeWind') { const ic = isletCenter(); c.strokeStyle = `rgba(236,82,87,${0.5 + Math.sin(time * 16) * 0.3})`; c.lineWidth = 3; c.beginPath(); c.ellipse(ic.x, ic.y, 90, 50, 0, 0, Math.PI * 2); c.stroke(); bossWarn(c, { x }, by - 110); }
  if (B.state === 'rise') bossWarn(c, { x }, by - 110);
  if (B.state === 'dazed') drawStars(c, hx, hy - 40, 24);
}
function drawShrineGate(c) {
  const x = SHRINE.x, y = SHRINE.y;
  c.fillStyle = 'rgba(0,0,0,.25)'; ellipse(c, x, y - 2, 64, 12);
  c.fillStyle = '#8a8478'; c.fillRect(x - 50, y - 8, 100, 10);
  c.fillStyle = '#e6dcc8'; c.fillRect(x - 40, y - 60, 80, 52); c.fillStyle = '#c8402a'; c.fillRect(x - 40, y - 60, 8, 52); c.fillRect(x + 32, y - 60, 8, 52);
  c.fillStyle = '#3a2a3a'; c.beginPath(); c.moveTo(x - 62, y - 56); c.quadraticCurveTo(x - 40, y - 64, x - 30, y - 86); c.lineTo(x + 30, y - 86); c.quadraticCurveTo(x + 40, y - 64, x + 62, y - 56); c.closePath(); c.fill();
  c.fillStyle = '#5a4a5a'; c.fillRect(x - 32, y - 92, 64, 8);
  c.fillStyle = '#1a1210'; c.fillRect(x - 14, y - 40, 28, 40); c.fillStyle = 'rgba(255,200,220,.35)'; c.fillRect(x - 12, y - 14, 24, 14);
  c.fillStyle = '#e888b4'; for (const [ox, oy] of [[-58, -60], [56, -64], [-44, -86], [40, -90]]) circle(c, x + ox, y + oy, 8);
}
function drawBell(c, sw, lit) {
  shadow(c, sw.x, sw.y + 3, 12, 4);
  c.fillStyle = '#5a3a22'; c.fillRect(sw.x - 14, sw.y - 40, 4, 42); c.fillRect(sw.x + 10, sw.y - 40, 4, 42); c.fillStyle = '#c8402a'; c.fillRect(sw.x - 17, sw.y - 44, 34, 5);
  const sw2 = lit ? Math.sin(time * 6) * 0.15 : 0; c.save(); c.translate(sw.x, sw.y - 39); c.rotate(sw2);
  c.fillStyle = lit ? '#ffd65a' : '#8a6a34'; c.beginPath(); c.moveTo(-8, 4); c.quadraticCurveTo(-9, 18, -11, 22); c.lineTo(11, 22); c.quadraticCurveTo(9, 18, 8, 4); c.quadraticCurveTo(0, -2, -8, 4); c.fill(); c.fillStyle = '#ffe9a8'; c.fillRect(-5, 8, 2, 10); c.restore();
  if (lit) { c.fillStyle = `rgba(255,214,90,${0.2 + Math.sin(time * 4) * 0.08})`; circle(c, sw.x, sw.y - 28, 22); }
}
// ---------- air ----------
const MAX_AIR = () => 12 * (gearA().breath || 1);
let airTick = 0;
const inReef = () => (P.x >= REEF_D.x0 * T && P.x < (REEF_D.x0 + DW) * T) || (P.x >= PALACE_D.x0 * T && P.x < (PALACE_D.x0 + DW) * T);
function updateAir(dt, fainted) {
  if (!inReef()) { P.air = MAX_AIR(); return; }
  if (P.air === undefined) P.air = MAX_AIR();
  const inDome = Math.hypot(P.x - REEF_D.camp.x, (P.y - REEF_D.camp.y - 30) / 0.75) < 5 * T || Math.hypot(P.x - (REEF_D.x0 + 20) * T, P.y - 4 * T) < 2.5 * T;
  const vent = AIR_VENTS.some(v => Math.hypot(P.x - v.x, P.y - v.y) < 44);
  if (inDome || vent) { P.air = Math.min(MAX_AIR(), P.air + dt * (vent ? 8 : 6)); airTick = 0; return; }
  P.air = Math.max(0, P.air - dt);
  if (P.air <= 0 && !fainted) { airTick -= dt; if (airTick <= 0) { airTick = 1.6; if (S.hp > 0) { S.hp--; updateHUD(); floatText(P.x, P.y - 60, 'Out of air!', '#bfe8ff'); SFX.play('hurt'); if (S.hp <= 0) damagePlayer(1, { x: P.x, y: P.y + 10 }); } } }
  else if (P.air < 3 && Math.random() < dt * 0.6) floatText(P.x, P.y - 60, 'Air running low!', '#bfe8ff');
}
function drawAirBar(c) {
  if (!inReef()) return;
  const n = Math.ceil(MAX_AIR() / 2), have = (P.air === undefined ? MAX_AIR() : P.air) / 2;
  if (have >= n - 0.01) return;
  for (let i = 0; i < n; i++) { const x = P.x - (n - 1) * 5 + i * 10, y = P.y - 74; c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.stroke(); if (i < have) { c.fillStyle = i < have - 1 || have % 1 > 0.5 ? 'rgba(160,220,255,.9)' : 'rgba(160,220,255,.4)'; circle(c, x, y, 3.2); } }
}
function drawAirVents(c, inView) {
  for (const v of AIR_VENTS) {
    if (!inView(v.x, v.y, 60)) continue;
    c.fillStyle = '#2a3a5a'; ellipse(c, v.x, v.y, 12, 5); c.fillStyle = '#7ec8e8'; ellipse(c, v.x, v.y, 6, 2.5);
    for (let i = 0; i < 6; i++) { const ph = (time * 0.9 + i / 6) % 1, x = v.x + Math.sin(time * 3 + i * 2) * 5, y = v.y - ph * 90; c.strokeStyle = `rgba(220,245,255,${0.9 * (1 - ph)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, 2 + ph * 4, 0, Math.PI * 2); c.stroke(); }
  }
  const D = REEF_D.camp; c.strokeStyle = 'rgba(200,240,255,.55)'; c.lineWidth = 3; c.beginPath(); c.ellipse(D.x, D.y + 30, 5 * T, 3.75 * T, 0, Math.PI, 0); c.stroke(); c.fillStyle = 'rgba(200,240,255,.08)'; c.beginPath(); c.ellipse(D.x, D.y + 30, 5 * T, 3.75 * T, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(D.x - 2.5 * T, D.y - 50, 18, 40, 0.6, 0, Math.PI * 2); c.fill();
}
function drawReefTile(c, x, y, px, py, t) {
  const h = hash(x, y), floor = q => isLand(q);
  if (t !== DEEP) {
    spr(c, 'p_c', px, py); c.fillStyle = t === PATH ? 'rgba(60,110,150,.35)' : 'rgba(40,110,170,.38)'; c.fillRect(px, py, T, T);
    if (h > 0.8) { c.fillStyle = 'rgba(255,240,200,.4)'; c.beginPath(); c.ellipse(px + h * 22, py + 8 + h * 14, 3, 2, 0, 0, Math.PI * 2); c.fill(); }
    if (h < 0.06) { c.fillStyle = '#e8b0c8'; c.beginPath(); c.moveTo(px + 10, py + 22); c.lineTo(px + 13, py + 16); c.lineTo(px + 16, py + 22); c.closePath(); c.fill(); }
    return;
  }
  c.fillStyle = '#16243e'; c.fillRect(px, py, T, T);
  const edge = floor(tileAt(x, y + 1)) || floor(tileAt(x, y - 1)) || floor(tileAt(x - 1, y)) || floor(tileAt(x + 1, y));
  if (edge) {
    c.fillStyle = '#3a3a6a'; c.fillRect(px + 2, py + 2, T - 4, T - 6); c.fillStyle = '#4a4a80'; c.fillRect(px + 4, py + 4, T - 12, 8);
    const cols = ['#e8703a', '#e888b4', '#ffd65a', '#7fe0f0']; c.fillStyle = cols[Math.floor(h * 4)];
    if (h > 0.45) for (let i = 0; i < 1 + Math.floor(h * 3); i++) { const bx = px + 6 + i * 9 + h * 3, by = py + 24 - (i % 2) * 4; c.fillRect(bx, by - 10, 3, 10); c.fillRect(bx - 3, by - 8, 3, 3); c.fillRect(bx + 3, by - 6, 3, 3); }
  } else if (h > 0.6) { c.fillStyle = '#1e2e4e'; circle(c, px + 16, py + 16, 10); }
}
function drawReefOverlay(c, k) {
  const W2 = c.canvas.width, H2 = c.canvas.height;
  c.fillStyle = 'rgba(20,80,170,.16)'; c.fillRect(0, 0, W2, H2);
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { const x = ((i * 0.23 + time * 0.02) % 1) * W2 * 1.4 - W2 * 0.2, a = 0.05 + Math.sin(time * 0.7 + i) * 0.03; c.fillStyle = `rgba(180,230,255,${a})`; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 70 * k, 0); c.lineTo(x - 140 * k, H2); c.lineTo(x - 220 * k, H2); c.closePath(); c.fill(); }
  c.restore();
}
function drawKelp(c, r) {
  for (let i = 0; i < 3; i++) { const ox = -8 + i * 8, h = 50 + ((i * 13 + r.seed * 30) % 20); c.strokeStyle = i % 2 ? '#2f7a4a' : '#4aa85a'; c.lineWidth = 5; c.beginPath(); c.moveTo(ox, 0); for (let s = 1; s <= 5; s++) c.lineTo(ox + Math.sin(time * 1.6 + s * 0.8 + r.seed * 6 + i) * s * 1.6, -h * s / 5); c.stroke(); }
  c.fillStyle = '#5ab85a'; for (let s = 1; s < 5; s++) { c.beginPath(); c.ellipse(Math.sin(time * 1.6 + s) * s * 1.6 + 4, -s * 11, 5, 2, 0.6, 0, Math.PI * 2); c.fill(); }
}
// ---------- reef creatures: jellyfish, pufferfish, reef sharks, moray eels ----------
function updateReefFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'jelly') {
    e.zt = Math.max(0, (e.zt || 0) - dt);
    if (e.state === 'charge') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 3 + rng(); e.zt = 0.3; SFX.play('slam'); if (!fainted && !P.dash && d < 66) damagePlayer(1, e); } return true; }
    moveEnemy(e, (chase ? dx / d * D.sp : Math.cos(e.anim * 0.7) * 15) * dt, (chase ? dy / d * D.sp : Math.sin(e.anim * 0.5) * 15) * dt + Math.sin(e.anim * 3) * 10 * dt);
    if (chase && d < 90 && e.cd <= 0) { e.state = 'charge'; e.st = 0.8; }
    touch(D.dmg); return true;
  }
  if (ai === 'puffer') {
    e.puff = Math.max(0, (e.puff || 0) - dt);
    if (chase && d < 80 && e.puff <= 0 && e.cd <= 0) { e.puff = 2.2; e.cd = 3.5; SFX.play('leap'); }
    if (e.puff > 0) { touch(1, 26); return true; }
    if (chase) moveEnemy(e, dx / d * D.sp * dt + Math.sin(e.anim * 4) * 20 * dt, dy / d * D.sp * dt); else wander(D.sp);
    return true;
  }
  if (ai === 'shark') {
    if (e.state === 'dash') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 28 && !fainted) { e.hit = true; damagePlayer(2, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 2.2 + rng(); } return true; }
    if (chase) { const a = Math.atan2(e.y - P.y, e.x - P.x) + 1.4 * dt * 1.2, tx = P.x + Math.cos(a) * 150, ty = P.y + Math.sin(a) * 100, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1; moveEnemy(e, ex / el * Math.min(el, D.sp * dt), ey / el * Math.min(el, D.sp * dt)); e.face = ex < 0 ? -1 : 1; if (e.cd <= 0 && d < 200) { e.state = 'dash'; e.st = 0.45; e.lx = dx / d * 380; e.ly = dy / d * 380; e.hit = false; e.face = dx < 0 ? -1 : 1; SFX.play('dash'); } }
    else wander(D.sp * 0.5);
    return true;
  }
  if (ai === 'eel') {
    if (e.state === 'lunge') { e.st -= dt; e.ext = Math.min(1, e.ext + dt * 8); if (!e.hit && !fainted && !P.dash && segDist(P.x, P.y - 10, e.x, e.y - 8, e.x + Math.cos(e.la) * 80 * e.ext, e.y - 8 + Math.sin(e.la) * 60 * e.ext) < 16) { e.hit = true; damagePlayer(1, e); } if (e.st <= 0) { e.state = 'out'; e.st = 1.2; } return true; }
    if (e.state === 'out') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 1.5; } return true; }
    e.ext = Math.max(0, (e.ext || 0) - dt * 4);
    if (chase && d < 110 && e.cd <= 0) { e.state = 'lunge'; e.st = 0.25; e.la = Math.atan2(dy, dx); e.hit = false; SFX.play('swing'); }
    return true;
  }
  return updateCogFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
Object.assign(PROC_DRAW, {
  jelly(c, e, k) {
    const y = e.y - 34 + Math.sin(e.anim * 3) * 4, pulse = 1 + Math.sin(e.anim * 4) * 0.08, ch = e.state === 'charge';
    if (e.zt > 0) { c.strokeStyle = `rgba(255,246,168,${e.zt * 3})`; c.lineWidth = 3; c.beginPath(); c.ellipse(e.x, e.y, 66, 40, 0, 0, Math.PI * 2); c.stroke(); }
    if (ch) { c.fillStyle = `rgba(255,246,168,${0.2 + (1 - e.st / 0.8) * 0.3})`; circle(c, e.x, y, 26); }
    c.strokeStyle = 'rgba(232,176,232,.7)'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(e.x - 8 + i * 4, y + 4); c.quadraticCurveTo(e.x - 10 + i * 4 + Math.sin(time * 4 + i) * 4, y + 16, e.x - 8 + i * 4 + Math.sin(time * 3 + i) * 3, y + 28); c.stroke(); }
    c.fillStyle = ch ? 'rgba(255,240,180,.85)' : 'rgba(232,176,232,.75)'; c.beginPath(); c.ellipse(e.x, y, 13 * k * pulse, 10 * k, 0, Math.PI, 0); c.fill(); c.fillRect(e.x - 13 * k * pulse, y - 1, 26 * k * pulse, 4);
    c.fillStyle = 'rgba(255,255,255,.6)'; ellipse(c, e.x - 4, y - 5, 3, 2);
  },
  puffer(c, e, k) {
    const p = e.puff > 0, r = (p ? 16 : 9) * k, y = e.y - 18 + Math.sin(e.anim * 3) * 3, f = P.x < e.x ? -1 : 1;
    shadow(c, e.x, e.y + 2, r, 4);
    c.fillStyle = '#e8c060'; circle(c, e.x, y, r); c.fillStyle = '#f2e6c0'; ellipse(c, e.x, y + r * 0.35, r * 0.7, r * 0.45);
    if (p) { c.strokeStyle = '#8a6a34'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(e.x + Math.cos(a) * r, y + Math.sin(a) * r); c.lineTo(e.x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6)); c.stroke(); } }
    c.fillStyle = '#e8c060'; c.beginPath(); c.moveTo(e.x - f * r, y); c.lineTo(e.x - f * (r + 7), y - 5); c.lineTo(e.x - f * (r + 7), y + 5); c.closePath(); c.fill();
    c.fillStyle = '#1a1210'; circle(c, e.x + f * r * 0.45, y - r * 0.3, 2);
  },
  shark(c, e, k) {
    const f = e.face || 1, y = e.y - 18, sw = Math.sin(e.anim * 8) * 3;
    shadow(c, e.x, e.y + 4, 24 * k, 5 * k);
    c.fillStyle = '#5a6a80'; c.beginPath(); c.moveTo(e.x + f * 28, y); c.quadraticCurveTo(e.x, y - 14, e.x - f * 22, y + sw * 0.3); c.quadraticCurveTo(e.x, y + 12, e.x + f * 28, y); c.fill();
    c.fillStyle = '#d8dce6'; c.beginPath(); c.moveTo(e.x + f * 26, y + 2); c.quadraticCurveTo(e.x, y + 10, e.x - f * 16, y + 2); c.closePath(); c.fill();
    c.fillStyle = '#5a6a80'; c.beginPath(); c.moveTo(e.x - f * 2, y - 9); c.lineTo(e.x - f * 8, y - 22); c.lineTo(e.x - f * 12, y - 8); c.fill(); c.beginPath(); c.moveTo(e.x - f * 20, y); c.lineTo(e.x - f * 32, y - 12 + sw); c.lineTo(e.x - f * 30, y + 10 + sw); c.closePath(); c.fill();
    c.fillStyle = '#1a1210'; circle(c, e.x + f * 18, y - 3, 2); if (e.state === 'dash') { c.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) c.fillRect(e.x + f * (14 + i * 3), y + 4, 2, 3); }
  },
  eel(c, e, k) {
    c.fillStyle = '#1a1826'; ellipse(c, e.x, e.y, 14, 7); c.fillStyle = '#3a3a6a'; c.fillRect(e.x - 16, e.y - 12, 32, 8);
    const ext = e.state === 'out' ? 1 : (e.ext || 0), a = e.la === undefined ? -Math.PI / 2 : e.la, len = 12 + ext * 70;
    const hx = e.x + Math.cos(a) * len, hy = e.y - 8 + Math.sin(a) * len * 0.75;
    c.strokeStyle = '#4a7a3a'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.x, e.y - 4); c.quadraticCurveTo((e.x + hx) / 2 + Math.sin(time * 6) * 8, (e.y + hy) / 2, hx, hy); c.stroke(); c.strokeStyle = '#7ab84a'; c.lineWidth = 3; c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#4a7a3a'; ellipse(c, hx, hy, 8, 6); c.fillStyle = '#ffe08a'; c.fillRect(hx - 3, hy - 3, 2, 2); c.fillRect(hx + 2, hy - 3, 2, 2);
    if (e.state === 'lunge' || e.state === 'out') { c.fillStyle = '#ffffff'; c.fillRect(hx - 3, hy + 2, 1.5, 3); c.fillRect(hx + 2, hy + 2, 1.5, 3); }
  },
});
function drawDivingBell(c, x, y, home) {
  shadow(c, x, y + 2, 22, 6);
  if (!home) { c.strokeStyle = '#5a3a22'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - 52); c.lineTo(x, y - 100); c.stroke(); c.fillStyle = '#5a3a22'; c.fillRect(x - 30, y - 104, 60, 6); }
  c.fillStyle = '#8a6a34'; c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x - 18, y - 36); c.quadraticCurveTo(x, y - 58, x + 18, y - 36); c.lineTo(x + 22, y); c.closePath(); c.fill();
  c.fillStyle = '#d9a23c'; c.beginPath(); c.moveTo(x - 18, y - 4); c.lineTo(x - 14, y - 34); c.quadraticCurveTo(x - 4, y - 48, x - 4, y - 36); c.lineTo(x - 6, y - 4); c.closePath(); c.fill();
  c.fillStyle = '#9fd4f5'; circle(c, x, y - 26, 8); c.strokeStyle = '#5a3a22'; c.lineWidth = 2; c.beginPath(); c.arc(x, y - 26, 8, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#5a3a22'; for (let i = 0; i < 5; i++) circle(c, x - 18 + i * 9, y - 3, 1.6);
  if (home && Math.random() < 0.2) particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 50, vx: 0, vy: -40, life: 0.8, color: '#dff6ff', size: 2 });
}
// ---------- the Siren: her song pulls you in and shields her ----------
let sirenHint = false;
function updateSiren(B, dt, fainted, d) {
  const A = B.arena;
  switch (B.state) {
    case 'swim': { B.st += dt; const a = B.anim * 1.2, tx = A.cx + Math.sin(a) * 90, ty = A.cy + Math.sin(a * 2) * 70, dx = tx - B.x, dy = ty - B.y, dd = Math.hypot(dx, dy) || 1; B.x += dx / dd * Math.min(dd, 120 * dt); B.y += dy / dd * Math.min(dd, 120 * dt); if (B.st > 1.6) bossRest(B, 0.1); break; }
    case 'sing': {
      B.st -= dt;
      if (!fainted && !P.dash) { const dx = B.x - P.x, dy = B.y - P.y, dd = Math.hypot(dx, dy) || 1; moveBody(P, dx / dd * (B.phase === 3 ? 115 : 95) * dt, dy / dd * (B.phase === 3 ? 115 : 95) * dt, 9); if (dd < 44) { damagePlayer(2, B); P.kx = -dx / dd * 420; P.ky = -dy / dd * 420; } }
      if (Math.random() < dt * 8) particles.push({ x: B.x + (rng() - 0.5) * 30, y: B.y - 50, vx: (rng() - 0.5) * 40, vy: -40, life: 0.8, color: '#ffe9f2', size: 3 });
      if (!sirenHint) { sirenHint = true; toast('Her song drags you toward her and shields her. Walk away, then strike when the song ends!', 4500); }
      if (B.st <= 0) bossRest(B, 0.7);
      break;
    }
    case 'bubbles': B.st -= dt; if (B.st <= 0) { const a = Math.atan2(P.y - 14 - (B.y - 40), P.x - B.x), n = B.phase === 1 ? 5 : 7; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.22; projectiles.push({ kind: 'bubble', x: B.x, y: B.y - 40, vx: Math.cos(a + o) * 140, vy: Math.sin(a + o) * 140, ph: rng() * 6, t: 0, life: 2.6 }); } SFX.play('wisp'); bossRest(B, 0.8); } break;
    case 'dive': B.st -= dt; B.alpha = Math.max(0, B.st / 0.4); if (B.st <= 0) { B.x = A.x0 + 60 + rng() * (A.x1 - A.x0 - 120); B.y = A.y0 + 80 + rng() * (A.y1 - A.y0 - 100); B.alpha = 1; burst(B.x, B.y - 30, '#bfe8ff', 14); bossRest(B, 0.6); } break;
    case 'jellies': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['jellyfish', 'jellyfish'], 4); bossRest(B, 0.5); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawSiren(c, B) {
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y - 20 + Math.sin(B.anim * 2) * 4, sing = B.state === 'sing';
  if (sing) { for (let i = 0; i < 3; i++) { const ph = (time * 1.2 + i / 3) % 1; c.strokeStyle = `rgba(255,214,234,${0.6 * (1 - ph)})`; c.lineWidth = 3; c.beginPath(); c.ellipse(x, B.y - 10, 40 + ph * 160, (40 + ph * 160) * 0.6, 0, 0, Math.PI * 2); c.stroke(); } c.strokeStyle = 'rgba(200,240,255,.6)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y - 30, 42, 0, Math.PI * 2); c.stroke(); }
  c.fillStyle = 'rgba(0,0,0,.25)'; ellipse(c, B.x, B.y + 4, 24, 7);
  c.save(); c.globalAlpha = B.alpha === undefined ? 1 : B.alpha; bossFlash(c, B);
  const sw = Math.sin(time * 3) * 8;
  c.fillStyle = '#2a8a8a'; c.beginPath(); c.moveTo(x - 10, y - 20); c.quadraticCurveTo(x - 14 + sw * 0.3, y + 10, x + sw, y + 20); c.quadraticCurveTo(x + 14 + sw * 0.3, y + 10, x + 10, y - 20); c.closePath(); c.fill();
  c.fillStyle = '#4ac8b8'; c.beginPath(); c.moveTo(x + sw, y + 18); c.lineTo(x + sw - 16, y + 30); c.lineTo(x + sw + 16, y + 30); c.closePath(); c.fill();
  c.fillStyle = '#f2d0b0'; c.fillRect(x - 8, y - 46, 16, 26); circle(c, x, y - 54, 9);
  c.fillStyle = '#e888b4'; c.fillRect(x - 8, y - 38, 16, 5);
  c.fillStyle = '#c8402a'; c.beginPath(); c.moveTo(x - 10, y - 60); c.quadraticCurveTo(x - 20, y - 40, x - 14 + sw * 0.4, y - 18); c.lineTo(x - 8, y - 46); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x + 10, y - 60); c.quadraticCurveTo(x + 20, y - 40, x + 14 + sw * 0.4, y - 18); c.lineTo(x + 8, y - 46); c.closePath(); c.fill(); ellipse(c, x, y - 60, 11, 6);
  c.fillStyle = '#1a3a4a'; c.fillRect(x - 5, y - 56, 2, 2); c.fillRect(x + 3, y - 56, 2, 2); c.fillStyle = '#c8402a'; c.beginPath(); c.ellipse(x, y - 50, 2.5, sing ? 3 : 1, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd65a'; c.beginPath(); c.moveTo(x - 8, y - 63); c.lineTo(x - 4, y - 70); c.lineTo(x, y - 64); c.lineTo(x + 4, y - 70); c.lineTo(x + 8, y - 63); c.fill();
  c.restore();
  if (B.state === 'bubbles' || B.state === 'sing') bossWarn(c, { x }, y - 90);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 40, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 80, 18);
}
// ---------- the Kraken: tentacles slam from the edges; sever them to bring up the head ----------
function krakenTents(B) {
  if (!B.tents) B.tents = [[8, 2], [31, 2], [7, 6], [32, 6], [12, 9.5], [27, 9.5]].map(([x, y]) => ({ bx: (PALACE_D.x0 + x) * T + 16, by: y * T + 16, state: 'hidden', st: 0, hp: 6, tx: 0, ty: 0, k: 0 }));
  return B.tents;
}
function tentPts(t) { const pts = []; for (let i = 0; i <= 6; i++) { const k = i / 6 * t.k; pts.push({ x: t.bx + (t.tx - t.bx) * k + Math.sin(i + time * 3) * 6 * (1 - i / 6), y: t.by + (t.ty - t.by) * k }); } return pts; }
function hitKraken(B, hx, hy, rad, dmg) {
  if (!B.active || B.state === 'dying' || B.state === 'wake') return false;
  if (B.state === 'dazed' && Math.hypot(B.x - hx, B.y - 40 - hy) < rad + 50) { damageBoss(B, dmg); return true; }
  for (const t of krakenTents(B)) {
    if (t.state !== 'down') continue;
    if (!tentPts(t).some(p => Math.hypot(p.x - hx, p.y - 10 - hy) < rad + 14)) continue;
    t.hp -= dmg; damageBoss(B, Math.ceil(dmg / 2)); burst(t.tx, t.ty - 10, '#9a5ab8', 10);
    if (t.hp <= 0) { t.state = 'severed'; t.st = 8; t.hp = 6; B.cut = (B.cut || 0) + 1; SFX.play('crumble'); floatText(t.tx, t.ty - 50, 'Tentacle severed!', '#ffe08a');
      if (B.cut >= 3 && B.state !== 'dazed') { B.cut = 0; B.state = 'dazed'; B.st = 3.2; impact(10); floatText(B.x, B.y - 120, 'The Kraken surfaces! Strike its head!', '#ffe08a'); } }
    return true;
  }
  return false;
}
function updateKraken(B, dt, fainted, d) {
  const tents = krakenTents(B);
  if (B.state === 'fight') {
    B.tcd = (B.tcd || 1) - dt;
    if (B.tcd <= 0) { B.tcd = B.phase === 3 ? 0.9 : B.phase === 2 ? 1.2 : 1.6; const idle = tents.filter(t => t.state === 'hidden'); if (idle.length) { const t = idle[Math.floor(rng() * idle.length)]; t.state = 'rise'; t.st = 0.8; } }
    B.icd = (B.icd || 6) - dt;
    if (B.icd <= 0 && B.phase >= 2) { B.icd = 7; for (let i = 0; i < 3; i++) HAZARDS.push({ x: P.x + (rng() - 0.5) * 200, y: P.y + (rng() - 0.5) * 120, r: 50, t: 0, life: 4, tick: 99, ink: true }); SFX.play('slime'); if (B.phase === 3) summonMinions(B, ['jellyfish'], 3); }
  }
  if (B.state === 'dazed') { B.st -= dt; if (B.st <= 0) { B.state = 'fight'; } }
  for (const t of tents) {
    switch (t.state) {
      case 'rise': t.st -= dt; if (Math.random() < dt * 20) particles.push({ x: t.bx + (rng() - 0.5) * 20, y: t.by, vx: 0, vy: -40, life: 0.4, color: '#bfe8ff', size: 3 }); if (t.st <= 0) { t.state = 'slam'; t.st = 0.3; const dx = P.x - t.bx, dy = P.y - t.by, dd = Math.hypot(dx, dy) || 1, len = Math.min(280, dd + 30); t.tx = t.bx + dx / dd * len; t.ty = t.by + dy / dd * len; t.k = 0; t.hit = false; SFX.play('swing'); } break;
      case 'slam': t.st -= dt; t.k = Math.min(1, 1 - t.st / 0.3); if (t.st <= 0) { t.k = 1; impact(5); SFX.play('slam'); if (!t.hit && !fainted && !P.dash && tentPts(t).some(p => Math.hypot(P.x - p.x, P.y - p.y) < 20)) { t.hit = true; damagePlayer(2, { x: t.bx, y: t.by }); } t.state = 'down'; t.st = 1.7; } break;
      case 'down': t.st -= dt; if (t.st <= 0) { t.state = 'retract'; t.st = 0.3; } break;
      case 'retract': t.st -= dt; t.k = Math.max(0, t.st / 0.3); if (t.st <= 0) { t.state = 'hidden'; } break;
      case 'severed': t.st -= dt; t.k = 0; if (t.st <= 0) t.state = 'hidden'; break;
    }
  }
}
function drawKraken(c, B) {
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : 0), y = B.y, up = B.state === 'dazed' ? 1 : B.state === 'sleep' ? 0.2 : 0.45, g = 0.6 + Math.sin(time * 3) * 0.3;
  c.fillStyle = 'rgba(20,30,60,.45)'; ellipse(c, x, y + 6, 90, 26);
  for (let i = 0; i < 3; i++) { const ph = (time * 0.8 + i / 3) % 1; c.strokeStyle = `rgba(200,240,255,${0.4 * (1 - ph)})`; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 6, 70 + ph * 50, 20 + ph * 14, 0, 0, Math.PI * 2); c.stroke(); }
  c.save(); c.beginPath(); c.rect(x - 140, y - 220, 280, 226); c.clip();
  c.globalAlpha = 1; bossFlash(c, B);
  const hy = y + (1 - up) * 110;
  c.fillStyle = '#6a3a8a'; c.beginPath(); c.ellipse(x, hy - 70, 66, 80, 0, Math.PI, 0); c.lineTo(x + 66, hy + 10); c.lineTo(x - 66, hy + 10); c.closePath(); c.fill();
  c.fillStyle = '#8a5ab0'; c.beginPath(); c.ellipse(x - 14, hy - 96, 36, 40, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#c8a8e8'; for (const [ox, oy, r] of [[-30, -60, 6], [24, -84, 5], [36, -50, 4], [-10, -116, 4]]) circle(c, x + ox, hy + oy, r);
  for (const s of [-1, 1]) { c.fillStyle = '#f2e6d6'; ellipse(c, x + s * 26, hy - 40, 14, 12); c.fillStyle = B.state === 'dazed' ? '#ffe08a' : `rgba(255,214,90,${g})`; ellipse(c, x + s * 26, hy - 40, 9, 9); c.fillStyle = '#1a1210'; c.fillRect(x + s * 26 - 6, hy - 41, 12, 3); }
  c.restore(); c.globalAlpha = 1;
  for (const t of krakenTents(B)) {
    c.fillStyle = 'rgba(20,30,60,.4)'; ellipse(c, t.bx, t.by + 4, 18, 6);
    if (t.state === 'rise') { const pr = 1 - t.st / 0.8; c.strokeStyle = `rgba(236,82,87,${0.4 + pr * 0.5})`; c.lineWidth = 2; c.beginPath(); c.ellipse(t.bx, t.by, 20 + pr * 8, 8 + pr * 3, 0, 0, Math.PI * 2); c.stroke(); }
    if (t.state === 'severed') { c.fillStyle = '#4a2a5a'; ellipse(c, t.bx, t.by - 4, 10, 6); continue; }
    if (t.k <= 0) continue;
    const pts = tentPts(t);
    c.lineCap = 'round'; for (let i = 0; i < pts.length - 1; i++) { const w = 26 - i * 3.2; c.strokeStyle = '#6a3a8a'; c.lineWidth = w; c.beginPath(); c.moveTo(pts[i].x, pts[i].y - 10); c.lineTo(pts[i + 1].x, pts[i + 1].y - 10); c.stroke(); }
    c.lineCap = 'butt'; c.fillStyle = '#e6c8f2'; for (let i = 1; i < pts.length - 1; i++) { circle(c, pts[i].x - 4, pts[i].y - 6, 3.5); circle(c, pts[i].x + 4, pts[i].y - 6, 3.5); }
    if (t.state === 'down') healthBar(c, t.tx, t.ty - 34, t.hp / 6);
  }
  if (B.state === 'sleep') bossZ(c, { x, y: y - 40, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 130, 30);
}
function drawPalaceGate(c) {
  const x = PALACE.x, y = PALACE.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 70, 12);
  c.fillStyle = '#8a9aa8'; c.fillRect(x - 60, y - 8, 120, 10);
  for (const ox of [-52, -30, 30, 52]) { c.fillStyle = '#a8b8c4'; c.fillRect(x + ox - 6, y - 70 + (Math.abs(ox) > 40 ? 18 : 0), 12, 70 - (Math.abs(ox) > 40 ? 18 : 0)); c.fillStyle = '#7a8a98'; c.fillRect(x + ox + 2, y - 70 + (Math.abs(ox) > 40 ? 18 : 0), 4, 70 - (Math.abs(ox) > 40 ? 18 : 0)); }
  c.fillStyle = '#8a9aa8'; c.beginPath(); c.moveTo(x - 44, y - 70); c.lineTo(x, y - 96); c.lineTo(x + 44, y - 70); c.closePath(); c.fill();
  c.fillStyle = '#0a1a2a'; c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 16, y - 34); c.quadraticCurveTo(x, y - 50, x + 16, y - 34); c.lineTo(x + 16, y); c.closePath(); c.fill();
  c.fillStyle = '#4aa85a'; for (const [ox, oy] of [[-56, -40], [48, -20], [-30, -76]]) { c.fillRect(x + ox, y + oy, 3, 22); }
  c.fillStyle = '#e8703a'; c.fillRect(x + 26, y - 18, 4, 14); c.fillRect(x + 22, y - 14, 4, 3);
}
function drawClam(c, sw, lit) {
  shadow(c, sw.x, sw.y + 3, 16, 5);
  const open = lit ? 0.5 + Math.sin(time * 2) * 0.1 : 0;
  c.fillStyle = '#8a7aa8'; c.beginPath(); c.ellipse(sw.x, sw.y - 6, 16, 9, 0, 0, Math.PI); c.fill();
  c.save(); c.translate(sw.x, sw.y - 6); c.rotate(-open); c.fillStyle = '#a89ac8'; c.beginPath(); c.ellipse(0, 0, 16, 10, 0, Math.PI, Math.PI * 2); c.fill(); c.strokeStyle = '#6a5a8a'; c.lineWidth = 1; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(i * 6, -9); c.stroke(); } c.restore();
  if (lit) { c.fillStyle = '#ffffff'; circle(c, sw.x, sw.y - 8, 4); c.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(time * 4) * 0.1})`; circle(c, sw.x, sw.y - 10, 16); }
}
// ---------- teleport pads ----------
let padLock = null;
function updateTelepads(fainted) {
  if (fainted || P.ride || (dungeonAt(P.x) !== COG_D && dungeonAt(P.x) !== TOWER_D)) return;
  let on = null;
  for (const p of TELEPADS) for (const [from, to] of [[p.a, p.b], [p.b, p.a]]) if (Math.hypot(P.x - from.x, P.y - from.y) < 16) on = { from, to, p };
  if (!on) { padLock = null; return; }
  if (padLock === on.from) return;
  burst(P.x, P.y - 20, on.p.col, 16); P.x = on.to.x; P.y = on.to.y; padLock = on.to; burst(P.x, P.y - 20, on.p.col, 16); SFX.play('wisp'); fade = 0.35;
}
function drawTelepads(c, inView) {
  for (const p of TELEPADS) for (const q of [p.a, p.b]) {
    if (!inView(q.x, q.y, 40)) continue;
    c.fillStyle = '#4a4a54'; ellipse(c, q.x, q.y, 20, 10); c.fillStyle = '#2a2a30'; ellipse(c, q.x, q.y, 16, 8);
    const g = 0.5 + Math.sin(time * 4 + q.x) * 0.3; c.fillStyle = p.col; c.globalAlpha = g; ellipse(c, q.x, q.y, 12, 6); c.globalAlpha = 1;
    c.strokeStyle = '#8a7a50'; c.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + time; c.beginPath(); c.moveTo(q.x + Math.cos(a) * 17, q.y + Math.sin(a) * 8.5); c.lineTo(q.x + Math.cos(a) * 21, q.y + Math.sin(a) * 10.5); c.stroke(); }
    if (Math.random() < 0.15) particles.push({ x: q.x + (Math.random() - 0.5) * 20, y: q.y, vx: 0, vy: -40, life: 0.6, color: p.col, size: 2 });
  }
}
function drawCogTile(c, x, y, px, py, t) {
  const h = hash(x, y), floor = q => isLand(q);
  if (t !== DEEP) {
    c.fillStyle = t === PATH ? '#8a7a60' : '#7a7468'; c.fillRect(px, py, T, T); c.fillStyle = t === PATH ? '#9a8a6a' : '#868074'; c.fillRect(px + 1, py + 1, T - 2, T - 2);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px, py + T - 2, T, 2); c.fillRect(px + T - 2, py, 2, T);
    c.fillStyle = '#5a5448'; for (const [ox, oy] of [[4, 4], [T - 6, 4], [4, T - 6], [T - 6, T - 6]]) c.fillRect(px + ox, py + oy, 2, 2);
    if (h > 0.9) { c.strokeStyle = 'rgba(60,50,40,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px + 6, py + 10); c.lineTo(px + 14, py + 18); c.lineTo(px + 22, py + 14); c.stroke(); }
    if (h < 0.04) { c.fillStyle = 'rgba(90,140,60,.5)'; c.fillRect(px + 8, py + 20, 6, 3); }
    return;
  }
  c.fillStyle = '#1e1c22'; c.fillRect(px, py, T, T);
  const edge = floor(tileAt(x, y + 1)) || floor(tileAt(x, y - 1)) || floor(tileAt(x - 1, y)) || floor(tileAt(x + 1, y));
  if (!edge) return;
  c.fillStyle = '#3a3640'; c.fillRect(px + 1, py + 1, T - 2, T - 2); c.fillStyle = '#4a4650'; c.fillRect(px + 3, py + 3, T - 6, 6);
  if (h > 0.6) { c.fillStyle = '#8a6a34'; c.fillRect(px, py + 14, T, 5); c.fillStyle = '#b08a44'; c.fillRect(px, py + 14, T, 2); }
  else if (h > 0.3) { c.strokeStyle = '#8a7a50'; c.lineWidth = 3; c.beginPath(); c.arc(px + 16, py + 18, 8, 0, Math.PI * 2); c.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.fillStyle = '#8a7a50'; c.fillRect(px + 16 + Math.cos(a) * 10 - 2, py + 18 + Math.sin(a) * 10 - 2, 4, 4); } }
  else { c.fillStyle = '#2a2830'; c.fillRect(px + 6, py + 12, 20, 14); c.fillStyle = h > 0.15 ? '#e0503a' : '#7fe07a'; c.fillRect(px + 10, py + 16, 3, 3); }
}
function drawSteamPipe(c, o) {
  shadow(c, o.x, o.y + 2, 10, 4);
  c.fillStyle = '#8a6a34'; c.fillRect(o.x - 5, o.y - 40, 10, 40); c.fillStyle = '#b08a44'; c.fillRect(o.x - 5, o.y - 40, 3, 40); c.fillStyle = '#6a5028'; c.fillRect(o.x - 8, o.y - 44, 16, 6); c.fillRect(o.x - 8, o.y - 16, 16, 4);
  if (Math.sin(time * 1.3 + o.x) > 0.4 && Math.random() < 0.3) particles.push({ x: o.x + (Math.random() - 0.5) * 6, y: o.y - 46, vx: (Math.random() - 0.5) * 10, vy: -30, life: 1, color: '#e6e6ea', size: 5 });
}
function drawBigGear(c, o) {
  const r = 26, a = time * (o.v % 2 ? 0.6 : -0.6);
  shadow(c, o.x, o.y + 2, 22, 6);
  c.fillStyle = '#5a5448'; c.fillRect(o.x - 4, o.y - 30, 8, 30);
  c.save(); c.translate(o.x, o.y - 40); c.rotate(a);
  c.fillStyle = '#8a7a50'; for (let i = 0; i < 10; i++) { c.save(); c.rotate(i / 10 * Math.PI * 2); c.fillRect(-4, -r - 6, 8, 8); c.restore(); }
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.fillStyle = '#6a5a3a'; c.beginPath(); c.arc(0, 0, r - 8, 0, Math.PI * 2); c.fill(); c.fillStyle = '#8a7a50'; c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.fill();
  c.restore();
}
// ---------- Cogwork creatures: clockwork soldiers, sparkbots, bomb beetles, gear turrets ----------
function updateCogFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'soldier') {
    if (e.state === 'wound') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 1; floatText(e.x, e.y - 50, '*click*', '#e8d070'); } if (Math.random() < dt * 8) particles.push({ x: e.x, y: e.y - 30, vx: (Math.random() - 0.5) * 60, vy: -40, life: 0.3, color: '#ffe08a', size: 2 }); return true; }
    if (e.state === 'thrustWind') { e.st -= dt; if (e.st <= 0) { e.state = 'thrust'; e.st = 0.25; e.lx = Math.sign(e.fx) * 300; e.ly = Math.sign(e.fy) * 300; e.hit = false; SFX.play('swing'); } return true; }
    if (e.state === 'thrust') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); if (!e.hit && d < 34 && !fainted) { e.hit = true; damagePlayer(1, e); } if (e.st <= 0) { e.state = 'move'; e.cd = 1; e.n = (e.n || 0) + 1; if (e.n >= 3) { e.n = 0; e.state = 'wound'; e.st = 2.2; floatText(e.x, e.y - 50, 'Winding down!', '#ffe08a'); } } return true; }
    if (e.fx === undefined) { e.fx = 1; e.fy = 0; }
    if (chase) {
      if (Math.abs(dx) > Math.abs(dy)) { e.fx = Math.sign(dx); e.fy = 0; } else { e.fx = 0; e.fy = Math.sign(dy); }
      const aligned = Math.abs(e.fx ? dy : dx) < 26;
      if (aligned && d < 150 && e.cd <= 0) { e.state = 'thrustWind'; e.st = 0.4; return true; }
      moveEnemy(e, e.fx * D.sp * dt, e.fy * D.sp * dt);
    } else { const ox = e.x, oy = e.y; moveEnemy(e, e.fx * D.sp * 0.6 * dt, e.fy * D.sp * 0.6 * dt); if (Math.hypot(e.x - ox, e.y - oy) < D.sp * 0.1 * dt) { const t = e.fx; e.fx = -e.fy; e.fy = t; } }
    touch(D.dmg); return true;
  }
  if (ai === 'sparkbot') {
    if (e.state === 'charge') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 2.4 + rng(); e.flip = !e.flip; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + (e.flip ? Math.PI / 4 : 0); projectiles.push({ kind: 'spark', x: e.x, y: e.y - 12, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, ang: a, t: 0, life: 1.4 }); } SFX.play('slam'); } return true; }
    e.wt = (e.wt || 0) - dt; if (e.wt <= 0) { e.wt = 0.8 + rng(); e.ra = chase ? Math.atan2(dy, dx) + (rng() - 0.5) * 2 : rng() * Math.PI * 2; }
    moveEnemy(e, Math.cos(e.ra) * D.sp * dt, Math.sin(e.ra) * D.sp * dt);
    if (chase && d < 200 && e.cd <= 0) { e.state = 'charge'; e.st = 0.5; }
    touch(D.dmg); return true;
  }
  if (ai === 'beetle') {
    if (chase) { if (e.flee > 0) { e.flee -= dt; moveEnemy(e, -dx / d * D.sp * 1.3 * dt, -dy / d * D.sp * 1.3 * dt); } else moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 70 && e.cd <= 0) { e.cd = 3 + rng(); e.flee = 1; projectiles.push({ kind: 'bomb', x: e.x, y: e.y, vx: 0, vy: 0, t: 0, life: 1.7 }); SFX.play('swing'); } }
    else wander(D.sp * 0.6);
    touch(D.dmg); return true;
  }
  if (ai === 'turret') {
    if (e.dir === undefined) e.dir = rng() * Math.PI * 2;
    const want = Math.atan2(dy, dx); let da = want - e.dir; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    if (chase) e.dir += Math.max(-1.4 * dt, Math.min(1.4 * dt, da));
    if (e.state === 'burst') { e.st -= dt; e.bt -= dt; if (e.bt <= 0 && e.shots < 3) { e.bt = 0.14; e.shots++; projectiles.push({ kind: 'bullet', x: e.x + Math.cos(e.dir) * 16, y: e.y - 20 + Math.sin(e.dir) * 10, vx: Math.cos(e.dir) * 240, vy: Math.sin(e.dir) * 240, ang: e.dir, t: 0, life: 1.6 }); SFX.play('hit'); } if (e.st <= 0) { e.state = 'move'; e.cd = 2.4; } return true; }
    if (chase && e.cd <= 0 && Math.abs(da) < 0.3) { e.state = 'burst'; e.st = 0.6; e.bt = 0; e.shots = 0; }
    return true;
  }
  return updateStarFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander);
}
Object.assign(PROC_DRAW, {
  soldier(c, e, k) {
    const fx = e.fx || 1, fy = e.fy || 0, walk = e.state === 'move' ? Math.sin(e.anim * 8) * 2 : 0, wound = e.state === 'wound', f = fx || (P.x < e.x ? -1 : 1);
    shadow(c, e.x, e.y + 2, 11 * k, 4 * k);
    c.fillStyle = '#6a5028'; c.fillRect(e.x - 6, e.y - 10 + walk, 4, 10); c.fillRect(e.x + 2, e.y - 10 - walk, 4, 10);
    c.fillStyle = wound ? '#8a7050' : '#b08a44'; c.fillRect(e.x - 9, e.y - 30, 18, 20); c.fillStyle = '#d0aa5c'; c.fillRect(e.x - 9, e.y - 30, 18, 4);
    c.fillStyle = '#8a6a34'; circle(c, e.x, e.y - 36, 7); c.fillStyle = wound ? '#5a5050' : '#7fe0f0'; c.fillRect(e.x - 4 + f, e.y - 38, 8, 2);
    c.save(); c.translate(e.x, e.y - 34); c.rotate(-e.anim * (wound ? 0.5 : 3)); c.strokeStyle = '#d0aa5c'; c.lineWidth = 2; c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.moveTo(0, -5); c.lineTo(0, 5); c.stroke(); c.restore();
    const ext = e.state === 'thrust' ? 14 : e.state === 'thrustWind' ? -6 : 0, sx = e.x + (fx || f) * (12 + ext), sy = e.y - 20 + fy * (8 + ext);
    c.strokeStyle = '#5a3a22'; c.lineWidth = 3; c.beginPath(); c.moveTo(e.x, e.y - 22); c.lineTo(sx + (fx || 0) * 14, sy + fy * 14); c.stroke(); c.fillStyle = '#c8c0b0'; circle(c, sx + (fx || 0) * 16, sy + fy * 16, 3);
    if (wound) drawStars(c, e.x, e.y - 50, 10);
  },
  sparkbot(c, e, k) {
    const y = e.y - 12, ch = e.state === 'charge';
    shadow(c, e.x, e.y + 2, 10 * k, 3 * k);
    c.fillStyle = '#4a4a54'; circle(c, e.x, y, 10 * k); c.fillStyle = '#6a6a78'; circle(c, e.x - 2, y - 2, 6 * k);
    c.fillStyle = ch ? '#fff6a8' : '#7fe0f0'; circle(c, e.x, y, 4); c.strokeStyle = '#8a8a94'; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x, y - 10); c.lineTo(e.x, y - 18); c.stroke(); c.fillStyle = ch ? '#fff6a8' : '#e0503a'; circle(c, e.x, y - 19, 2.5);
    if (ch) { c.strokeStyle = `rgba(255,246,168,${0.4 + Math.random() * 0.5})`; c.lineWidth = 2; for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + (e.flip ? 0 : Math.PI / 4) + Math.PI / 4; c.beginPath(); c.moveTo(e.x, y); c.lineTo(e.x + Math.cos(a) * 18, y + Math.sin(a) * 14); c.stroke(); } }
  },
  beetle(c, e, k) {
    const f = P.x < e.x ? -1 : 1, walk = Math.sin(e.anim * 14) * 2;
    shadow(c, e.x, e.y + 2, 12 * k, 4 * k);
    c.strokeStyle = '#2a2a30'; c.lineWidth = 2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(e.x + i * 5, e.y - 6); c.lineTo(e.x + i * 7 - 4, e.y + (i % 2 ? walk : -walk)); c.moveTo(e.x + i * 5, e.y - 6); c.lineTo(e.x + i * 7 + 4, e.y - (i % 2 ? walk : -walk)); c.stroke(); }
    c.fillStyle = '#3a5a3a'; ellipse(c, e.x, e.y - 9, 12 * k, 8 * k); c.fillStyle = '#8a7a50'; c.fillRect(e.x - 1, e.y - 17, 2, 16);
    c.fillStyle = '#2a2a30'; ellipse(c, e.x + f * 11, e.y - 9, 5, 4); c.fillStyle = '#e0503a'; c.fillRect(e.x + f * 13 - 1, e.y - 11, 2, 2);
    c.fillStyle = '#1a1a1e'; circle(c, e.x - f * 4, e.y - 15, 4); c.fillStyle = '#e0503a'; c.fillRect(e.x - f * 4 - 1, e.y - 21, 2, 3);
  },
  turret(c, e, k) {
    const dir = e.dir || 0;
    shadow(c, e.x, e.y + 2, 14 * k, 5 * k);
    c.fillStyle = '#4a4650'; c.fillRect(e.x - 12, e.y - 14, 24, 14); c.fillStyle = '#5a5662'; c.fillRect(e.x - 12, e.y - 14, 24, 4);
    c.save(); c.translate(e.x, e.y - 20); c.rotate(dir);
    c.fillStyle = '#8a7a50'; c.fillRect(0, -3, 20, 6); c.fillStyle = '#2a2a30'; c.fillRect(18, -2, 4, 4); c.restore();
    c.fillStyle = '#6a6a78'; circle(c, e.x, e.y - 20, 9); c.fillStyle = e.state === 'burst' ? '#e0503a' : '#7fe0f0'; circle(c, e.x + Math.cos(dir) * 4, e.y - 21 + Math.sin(dir) * 3, 3);
  },
});
function drawBigPad(c, x, y) {
  c.fillStyle = '#4a4a54'; ellipse(c, x, y, 28, 13); c.fillStyle = '#2a2a30'; ellipse(c, x, y, 22, 10);
  const g = 0.5 + Math.sin(time * 4) * 0.3; c.fillStyle = `rgba(127,224,240,${g})`; ellipse(c, x, y, 16, 7);
  c.strokeStyle = '#8a7a50'; c.lineWidth = 3; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + time; c.beginPath(); c.moveTo(x + Math.cos(a) * 24, y + Math.sin(a) * 11); c.lineTo(x + Math.cos(a) * 29, y + Math.sin(a) * 13.5); c.stroke(); }
  if (Math.random() < 0.2) particles.push({ x: x + (Math.random() - 0.5) * 26, y, vx: 0, vy: -50, life: 0.7, color: '#7fe0f0', size: 2 });
}
// ---------- the Clockwork Knight: armored, until the pendulum smashes him ----------
function pendulumPos(B) { const A = B.arena; return { x: A.cx + Math.sin(time * 1.5) * 125, y: A.cy + 30, px: A.cx, py: A.y0 + 10 }; }
let pendHint = false;
function updateKnight2(B, dt, fainted, d) {
  const pd = pendulumPos(B); B.pcd = Math.max(0, (B.pcd || 0) - dt);
  if (!fainted && !P.dash && Math.hypot(P.x - pd.x, P.y - pd.y) < 30) damagePlayer(2, { x: pd.x, y: pd.y });
  if (B.pcd <= 0 && B.state !== 'dying' && Math.hypot(B.x - pd.x, B.y - pd.y) < 44) {
    B.pcd = 2.5; impact(12); hitStop = 0.08; SFX.play('slam'); burst(B.x, B.y - 30, '#ffe08a', 20);
    B.hp = Math.max(1, B.hp - 6); B.hurt = 0.2; bossBar(); floatText(B.x, B.y - 100, 'CLANG! The pendulum smashes him!', '#ffe08a');
    B.state = 'dazed'; B.st = 2.8; B.x += Math.sign(B.x - pd.x || 1) * 30; clampBoss(B);
  }
  switch (B.state) {
    case 'march': { B.st += dt; const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; if (dd > 40) { B.x += dx / dd * (B.phase === 3 ? 85 : 65) * dt; B.y += dy / dd * (B.phase === 3 ? 85 : 65) * dt; clampBoss(B); } if (dd < 70 && B.st > 0.6) { B.state = B.phase >= 2 && rng() < 0.4 ? 'spinWind' : 'thrustWind'; B.st = 0.45; } else if (B.st > 2.2) bossRest(B, 0.1); break; }
    case 'thrustWind': B.st -= dt; if (B.st <= 0) { const dx = P.x - B.x, dy = P.y - B.y, dd = Math.hypot(dx, dy) || 1; B.vx = dx / dd * 360; B.vy = dy / dd * 360; B.state = 'thrust'; B.st = 0.3; SFX.play('dash'); } break;
    case 'thrust': B.st -= dt; B.x += B.vx * dt; B.y += B.vy * dt; clampBoss(B); if (!B.thit && !fainted && !P.dash && d < 36) { B.thit = true; damagePlayer(2, B); } if (B.st <= 0) { B.thit = false; bossRest(B, 0.5); } break;
    case 'spinWind': B.st -= dt; if (B.st <= 0) { B.state = 'spin'; B.st = 0.6; SFX.play('swing'); } break;
    case 'spin': B.st -= dt; B.spin = (B.spin || 0) + dt * 20; if (!B.thit && !fainted && !P.dash && d < 64) { B.thit = true; damagePlayer(2, B); } if (B.st <= 0) { B.thit = false; bossRest(B, 0.5); } break;
    case 'bots': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['sparkbot', 'sparkbot'], 3); bossRest(B, 0.4); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) bossRest(B, 0.3); break;
  }
}
function drawKnight2(c, B) {
  const pd = pendulumPos(B);
  c.strokeStyle = '#6a5028'; c.lineWidth = 6; c.beginPath(); c.moveTo(pd.px, pd.py); c.lineTo(pd.x, pd.y - 30); c.stroke(); c.fillStyle = '#8a7a50'; circle(c, pd.px, pd.py, 8);
  shadow(c, pd.x, pd.y + 6, 28, 6);
  c.fillStyle = '#b08a44'; circle(c, pd.x, pd.y - 20, 26); c.fillStyle = '#d0aa5c'; circle(c, pd.x - 6, pd.y - 26, 12); c.fillStyle = '#c8c0b0'; c.beginPath(); c.moveTo(pd.x - 26, pd.y - 8); c.lineTo(pd.x, pd.y + 8); c.lineTo(pd.x + 26, pd.y - 8); c.closePath(); c.fill();
  const x = B.x + (B.state === 'dying' ? Math.sin(time * 70) * 4 : B.state === 'thrustWind' || B.state === 'spinWind' ? Math.sin(time * 50) * 2 : 0), y = B.y, walk = B.state === 'march' ? Math.sin(B.anim * 9) * 3 : 0, f = P.x < x ? -1 : 1;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y + 4, 26, 8);
  c.save(); c.globalAlpha = 1; bossFlash(c, B);
  if (B.state === 'spin') { c.translate(x, y - 30); c.rotate(B.spin); c.translate(-x, -(y - 30)); }
  c.fillStyle = '#6a5028'; c.fillRect(x - 12, y - 18 + walk, 9, 18 - walk); c.fillRect(x + 3, y - 18 - walk, 9, 18 + walk);
  c.fillStyle = B.state === 'dazed' ? '#8a7050' : '#b08a44'; c.fillRect(x - 18, y - 54, 36, 38); c.fillStyle = '#d0aa5c'; c.fillRect(x - 18, y - 54, 36, 6); c.fillStyle = '#6a5028'; c.fillRect(x - 3, y - 48, 6, 30);
  c.fillStyle = '#8a6a34'; c.fillRect(x - 12, y - 74, 24, 22); c.fillStyle = B.state === 'dazed' ? '#5a5050' : '#e0503a'; c.fillRect(x - 8 + f * 2, y - 66, 16, 3);
  c.fillStyle = '#e0503a'; c.fillRect(x - 2, y - 84, 4, 12);
  c.save(); c.translate(x, y - 64); c.rotate(-B.anim * 2); c.strokeStyle = '#d0aa5c'; c.lineWidth = 3; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.moveTo(0, -8); c.lineTo(0, 8); c.stroke(); c.restore();
  const ext = B.state === 'thrust' ? 20 : B.state === 'thrustWind' ? -8 : 0; c.strokeStyle = '#c8c0b0'; c.lineWidth = 5; c.beginPath(); c.moveTo(x + f * 16, y - 40); c.lineTo(x + f * (44 + ext), y - 34); c.stroke(); c.fillStyle = '#4a4650'; c.fillRect(x - f * 26 - 8, y - 52, 16, 30);
  c.restore();
  if (B.state === 'thrustWind' || B.state === 'spinWind') bossWarn(c, { x }, y - 100);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 60, z: 0, anim: B.anim });
  if (B.state === 'dazed') drawStars(c, x, y - 90, 22);
  if (B.active && !pendHint) { pendHint = true; setTimeout(() => toast('His armor shrugs off your blade. Lure him into the swinging pendulum!', 4500), 1500); }
}
// ---------- the Great Clock: sweeping hands, jammed by its escapement gears ----------
function clockGears(B) { return B.gears || (B.gears = [[9, 3], [30, 3], [20, 9.3]].map(([x, y], i) => ({ x: (TOWER_D.x0 + x) * T + 16, y: y * T + 16, lit: false, i }))); }
function hitClockGears(B, hx, hy, rad) {
  if (B.type !== 'clock' || !B.active || B.state === 'dazed' || B.state === 'dying') return;
  for (const g of clockGears(B)) {
    if (Math.hypot(g.x - hx, g.y - 20 - hy) > rad + 18) continue;
    if (g.i === B.glow) { g.lit = true; SFX.play('lucky'); burst(g.x, g.y - 20, '#ffe08a', 14); floatText(g.x, g.y - 60, 'Jammed!', '#ffe08a'); B.glow = -1; B.gt = 0.6;
      if (clockGears(B).every(q => q.lit)) { B.state = 'dazed'; B.st = 4; impact(12); SFX.play('slam'); floatText(B.x, B.y - 130, 'The clock stops! Strike its face!', '#ffe08a'); } }
    else if (!g.lit) { floatText(g.x, g.y - 50, 'Not glowing yet', '#c8c0b0'); SFX.play('mine'); }
  }
}
function clockHands(B) { const m = B.ma || 0, h = B.ha || 0; return [{ a: m, len: 300, w: 10 }, { a: h, len: 190, w: 16 }]; }
function updateClock(B, dt, fainted, d) {
  const gears = clockGears(B), stopped = B.state === 'dazed' || B.state === 'dying';
  if (!stopped) { B.ma = (B.ma || 0) + dt * (B.phase === 3 ? 1.25 : B.phase === 2 ? 1.05 : 0.85); B.ha = (B.ha || Math.PI) + dt * 0.35; }
  if (!stopped && !fainted && !P.dash) for (const hd of clockHands(B)) { const ex = B.x + Math.cos(hd.a) * hd.len, ey = B.y - 40 + Math.sin(hd.a) * hd.len * 0.75; if (segDist(P.x, P.y - 14, B.x, B.y - 40, ex, ey) < hd.w + 4) { damagePlayer(2, { x: P.x - Math.cos(hd.a + Math.PI / 2) * 20, y: P.y - Math.sin(hd.a + Math.PI / 2) * 20 }); break; } }
  // the escapement gears light up one after another
  if (!stopped) { B.gt = (B.gt || 1.5) - dt; if (B.gt <= 0) { if (B.glow >= 0 && B.glow !== undefined) { for (const g of gears) g.lit = false; } const left = gears.filter(g => !g.lit); B.glow = left.length ? left[Math.floor(rng() * left.length)].i : -1; B.gt = B.phase === 3 ? 1.6 : 2.2; } }
  switch (B.state) {
    case 'tick': B.st += dt; if (B.st > 2) bossRest(B, 0.1); break;
    case 'cuckoo': B.st -= dt; if (B.st <= 0) { for (const o of [-0.5, 0, 0.5]) projectiles.push({ kind: 'wisp', x: B.x, y: B.y - 70, ang: Math.atan2(P.y - B.y, P.x - B.x) + o, t: 0, life: 3.4 }); SFX.play('wisp'); bossRest(B, 0.5); } break;
    case 'chime': B.st -= dt; if (B.st <= 0) { B.ring = { x: B.x, y: B.y, r: 30, max: 280, hit: false }; SFX.play('lucky'); impact(6); bossRest(B, 0.6); } break;
    case 'gears': B.st -= dt; if (B.st <= 0) { summonMinions(B, ['sparkbot', 'beetle'], 4); bossRest(B, 0.4); } break;
    case 'dazed': B.st -= dt; if (B.st <= 0) { for (const g of gears) g.lit = false; B.glow = -1; B.gt = 1; bossRest(B, 0.5); } break;
  }
}
function drawClock(c, B) {
  const x = B.x, y = B.y - 40, stopped = B.state === 'dazed';
  for (const g of clockGears(B)) {
    shadow(c, g.x, g.y + 2, 18, 5); const glow = g.i === B.glow, a = time * (stopped ? 0 : 2);
    if (glow) { c.fillStyle = `rgba(255,224,138,${0.35 + Math.sin(time * 12) * 0.15})`; circle(c, g.x, g.y - 22, 28); }
    c.save(); c.translate(g.x, g.y - 22); c.rotate(a); c.fillStyle = g.lit ? '#5a5050' : glow ? '#ffd65a' : '#8a7a50'; for (let i = 0; i < 8; i++) { c.save(); c.rotate(i / 8 * Math.PI * 2); c.fillRect(-3, -20, 6, 7); c.restore(); } c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2a2a30'; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill(); c.restore();
  }
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, B.y + 4, 70, 16);
  c.globalAlpha = 1; bossFlash(c, B);
  c.fillStyle = '#5a4020'; c.fillRect(x - 70, y - 60, 140, 110); c.fillStyle = '#8a6a34'; c.fillRect(x - 64, y - 54, 128, 98);
  c.fillStyle = '#3a2a14'; c.beginPath(); c.moveTo(x - 80, y - 60); c.lineTo(x, y - 110); c.lineTo(x + 80, y - 60); c.closePath(); c.fill();
  c.fillStyle = stopped ? '#e6dcc8' : '#f2e6d0'; circle(c, x, y - 6, 46); c.strokeStyle = '#3a2a14'; c.lineWidth = 3; c.beginPath(); c.arc(x, y - 6, 46, 0, Math.PI * 2); c.stroke();
  c.fillStyle = '#3a2a14'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.fillRect(x + Math.cos(a) * 38 - 2, y - 6 + Math.sin(a) * 38 - 2, 4, 4); }
  if (stopped) { c.fillStyle = '#1a1210'; circle(c, x, y - 6, 20); c.fillStyle = `rgba(255,224,138,${0.6 + Math.sin(time * 10) * 0.3})`; circle(c, x, y - 6, 12); }
  c.globalAlpha = 1;
  // the great hands sweep the room
  for (const hd of clockHands(B)) { const ex = x + Math.cos(hd.a) * hd.len, ey = y + Math.sin(hd.a) * hd.len * 0.75; c.strokeStyle = stopped ? '#5a5050' : '#2a2a30'; c.lineWidth = hd.w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke(); c.strokeStyle = stopped ? '#7a7070' : '#d0aa5c'; c.lineWidth = hd.w * 0.4; c.stroke(); c.lineCap = 'butt'; c.fillStyle = '#d0aa5c'; circle(c, ex, ey, hd.w * 0.6); }
  c.fillStyle = '#d0aa5c'; circle(c, x, y, 8);
  if (B.state === 'cuckoo' || B.state === 'chime') bossWarn(c, { x }, y - 130);
  if (B.state === 'sleep') bossZ(c, { x, y: y - 60, z: 0, anim: B.anim });
  if (stopped) drawStars(c, x, y - 120, 30);
}
function drawClockTower(c) {
  const x = TOWER.x, y = TOWER.y;
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y - 2, 56, 12);
  c.fillStyle = '#6a6458'; c.fillRect(x - 44, y - 140, 88, 140); c.fillStyle = '#7a7468'; c.fillRect(x - 40, y - 140, 30, 140);
  c.fillStyle = '#3a2a14'; c.beginPath(); c.moveTo(x - 52, y - 140); c.lineTo(x, y - 196); c.lineTo(x + 52, y - 140); c.closePath(); c.fill();
  c.fillStyle = '#f2e6d0'; circle(c, x, y - 108, 26); c.strokeStyle = '#3a2a14'; c.lineWidth = 3; c.beginPath(); c.arc(x, y - 108, 26, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#2a2a30'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - 108); c.lineTo(x + Math.cos(time * 0.5) * 18, y - 108 + Math.sin(time * 0.5) * 18); c.moveTo(x, y - 108); c.lineTo(x + Math.cos(time * 0.05) * 12, y - 108 + Math.sin(time * 0.05) * 12); c.stroke();
  c.fillStyle = '#1a1210'; c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 16, y - 34); c.quadraticCurveTo(x, y - 50, x + 16, y - 34); c.lineTo(x + 16, y); c.closePath(); c.fill();
  c.fillStyle = '#8a6a34'; c.fillRect(x - 40, y - 64, 80, 5);
}
function drawLever(c, sw, lit) {
  shadow(c, sw.x, sw.y + 3, 12, 4);
  c.fillStyle = '#4a4650'; c.fillRect(sw.x - 12, sw.y - 10, 24, 12); c.fillStyle = '#5a5662'; c.fillRect(sw.x - 12, sw.y - 10, 24, 3);
  c.save(); c.translate(sw.x, sw.y - 8); c.rotate(lit ? 0.7 : -0.7); c.fillStyle = '#8a7a50'; c.fillRect(-2, -26, 4, 26); c.fillStyle = lit ? '#7fe07a' : '#e0503a'; circle(c, 0, -27, 5); c.restore();
}
// ---------- meteor showers ----------
let meteorT = 6, meteorHint = false;
function updateMeteors(dt) {
  if (dungeonAt(P.x) !== STAR_D) { meteorT = Math.max(meteorT, 5); return; }
  meteorT -= dt;
  if (meteorT > 0) return;
  meteorT = 9 + rng() * 5;
  floatText(P.x, P.y - 80, 'Meteor shower!', '#ffb347'); SFX.play('boss');
  if (!meteorHint) { meteorHint = true; toast('A meteor shower! Step out of the red rings, then collect the star shards they leave behind.', 4500); }
  for (let i = 0; i < 6; i++) { const tx = i === 0 ? P.x : P.x + (rng() - 0.5) * 360, ty = i === 0 ? P.y : P.y + (rng() - 0.5) * 220; if (!walkable(tx, ty)) continue; projectiles.push({ kind: 'rock', fall: true, meteor: true, tx, ty, x: tx, y: ty, t: -0.3 - i * 0.35, dur: 1.1, z: 360 }); }
}
function meteorLand(p) {
  HAZARDS.push({ x: p.tx, y: p.ty, r: 26, t: 0, life: 1.4, tick: 0.2, fire: true });
  for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2, v = 60 + rng() * 100; particles.push({ x: p.tx, y: p.ty - 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.6, color: i % 2 ? '#ffd65a' : '#9fd4ff', size: 4 }); }
  if (rng() < 0.45) drop(p.tx, p.ty - 6, 'starshard', 1);
}
function drawMeteor(c, p) {
  if (p.t < 0) return;
  const k = Math.max(0, Math.min(1, p.t / p.dur)), y = p.ty - (1 - k) * 360, x = p.tx + (1 - k) * 120;
  c.strokeStyle = 'rgba(255,200,120,.5)'; c.lineWidth = 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 50, y - 80); c.stroke();
  c.fillStyle = '#ffb347'; circle(c, x, y, 9); c.fillStyle = '#fff6c8'; circle(c, x - 2, y - 2, 4);
}
function drawStarTile(c, x, y, px, py, t) {
  const h = hash(x, y), solid = (xx, yy) => isLand(tileAt(xx, yy));
  if (t !== DEEP) {
    spr(c, h < 0.35 ? 'grass1' : 'grass0', px, py);
    if (t === PATH) spr(c, edgeKey('p_', notPath, x, y), px, py);
    c.fillStyle = t === PATH ? 'rgba(40,40,90,.55)' : 'rgba(20,24,70,.62)'; c.fillRect(px, py, T, T);
    if (t !== PATH && h > 0.86) { c.fillStyle = ['#9fd4ff', '#d6b8ff', '#ffe9a8'][Math.floor(h * 30) % 3]; c.fillRect(px + h * 22, py + 8 + h * 12, 2, 2); }
    return;
  }
  c.fillStyle = '#070a1e'; c.fillRect(px, py, T, T);
  if (solid(x, y - 1)) { c.fillStyle = '#3a3460'; c.fillRect(px, py, T, 16); c.fillStyle = '#2a2448'; c.fillRect(px, py + 10, T, 6); c.beginPath(); c.moveTo(px + 2, py + 16); c.lineTo(px + 8 + h * 8, py + 26); c.lineTo(px + 18, py + 16); c.lineTo(px + 26 - h * 4, py + 22); c.lineTo(px + 30, py + 16); c.closePath(); c.fill(); return; }
  if (h > 0.55) { c.fillStyle = h > 0.9 ? '#ffffff' : 'rgba(200,210,255,.7)'; c.fillRect(px + h * 28, py + (1 - h) * 28, h > 0.9 ? 2 : 1, h > 0.9 ? 2 : 1); }
  if (h < 0.05) { c.fillStyle = 'rgba(160,120,255,.15)'; circle(c, px + 16, py + 16, 14); }
}
function drawTelescope(c, o) {
  const x = o.x, y = o.y; shadow(c, x, y + 2, 18, 5);
  c.strokeStyle = '#5a3a22'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - 24); c.lineTo(x - 12, y); c.moveTo(x, y - 24); c.lineTo(x + 12, y); c.moveTo(x, y - 24); c.lineTo(x, y); c.stroke();
  c.save(); c.translate(x, y - 26); c.rotate(-0.7 + Math.sin(time * 0.3) * 0.1); c.fillStyle = '#8a6a34'; c.fillRect(-6, -5, 36, 10); c.fillStyle = '#d9a23c'; c.fillRect(26, -6, 6, 12); c.fillStyle = '#9fd4ff'; c.fillRect(31, -4, 2, 8); c.restore();
}
function drawCrater(c, o) { c.fillStyle = 'rgba(10,8,30,.55)'; ellipse(c, o.x, o.y, 26, 12); c.strokeStyle = 'rgba(120,110,170,.6)'; c.lineWidth = 2; c.beginPath(); c.ellipse(o.x, o.y, 26, 12, 0, Math.PI, Math.PI * 2); c.stroke(); if (o.v % 2) { c.fillStyle = `rgba(159,212,255,${0.5 + Math.sin(time * 3 + o.x) * 0.3})`; diamond(c, o.x, o.y - 2, 3, 5); } }
function drawMoonbeam(c, x, y, home) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createLinearGradient(x, y - 260, x, y); g.addColorStop(0, 'rgba(200,220,255,0)'); g.addColorStop(1, `rgba(200,220,255,${0.35 + Math.sin(time * 2) * 0.08})`);
  c.fillStyle = g; c.beginPath(); c.moveTo(x - 14, y - 260); c.lineTo(x + 14, y - 260); c.lineTo(x + 26, y); c.lineTo(x - 26, y); c.closePath(); c.fill(); c.restore();
  c.fillStyle = 'rgba(220,235,255,.5)'; ellipse(c, x, y, 26, 9);
  if (Math.random() < 0.25) particles.push({ x: x + (Math.random() - 0.5) * 30, y: y - Math.random() * 40, vx: 0, vy: -60, life: 0.8, color: '#e6f0ff', size: 2 });
}
// ---------- Starfall creatures: star sprites, void orbs, meteor golems, lunar hoppers ----------
function updateStarFoe(e, D, dt, d, dx, dy, chase, fainted, touch, wander) {
  const ai = AI(e.kind);
  if (ai === 'sprite') {
    if (e.state === 'twinkle') { e.st -= dt; if (e.st <= 0) { const a = Math.atan2(P.y - 14 - (e.y - 30), P.x - e.x); for (let i = 0; i < 5; i++) { const o = (i - 2) * 0.3; projectiles.push({ kind: 'star', x: e.x, y: e.y - 30, vx: Math.cos(a + o) * 160, vy: Math.sin(a + o) * 160, ang: a + o, t: 0, life: 1.8 }); } SFX.play('wisp'); e.state = 'move'; e.cd = 2.6 + rng(); } return true; }
    if (chase) { const a = e.anim * 1.8 + e.hx, tx = P.x + Math.cos(a) * 110, ty = P.y + Math.sin(a) * 75, ex = tx - e.x, ey = ty - e.y, el = Math.hypot(ex, ey) || 1; moveEnemy(e, ex / el * Math.min(el, D.sp * dt), ey / el * Math.min(el, D.sp * dt)); if (e.cd <= 0) { e.state = 'twinkle'; e.st = 0.5; } }
    else moveEnemy(e, Math.cos(e.anim) * 25 * dt + (e.hx - e.x) * 0.3 * dt, Math.sin(e.anim * 1.3) * 20 * dt + (e.hy - e.y) * 0.3 * dt);
    return true;
  }
  if (ai === 'voidorb') {
    if (chase) { if (d > 30) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 170 && !fainted && !P.dash) { moveBody(P, -dx / d * 70 * dt, -dy / d * 70 * dt, 9); if (Math.random() < dt * 12) particles.push({ x: P.x + (Math.random() - 0.5) * 30, y: P.y - 14, vx: -dx / d * 60, vy: -dy / d * 60, life: 0.4, color: '#8a6ab8', size: 2 }); } }
    else wander(D.sp * 0.5);
    touch(D.dmg, 24); return true;
  }
  if (ai === 'mgolem') {
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'move'; e.cd = 2.6; impact(6); SFX.play('slam'); HAZARDS.push({ x: e.x, y: e.y, r: 44, t: 0, life: 1.6, tick: 0.2, fire: true }); if (!fainted && !P.dash && d < 56) damagePlayer(2, e); } return true; }
    if (chase) { if (d > 40) moveEnemy(e, dx / d * D.sp * dt, dy / d * D.sp * dt); if (d < 70 && e.cd <= 0) { e.state = 'windup'; e.st = 0.7; } } else wander(D.sp);
    touch(D.dmg, 24); return true;
  }
  if (ai === 'hopper') {
    e.ringT = Math.max(0, (e.ringT || 0) - dt);
    if (e.state === 'jump') { e.st -= dt; const k = 1 - Math.max(0, e.st) / 1; e.x = e.sx + (e.tx - e.sx) * k; e.y = e.sy + (e.ty - e.sy) * k; e.lift = Math.sin(Math.PI * k) * 90; if (e.st <= 0) { e.lift = 0; e.state = 'move'; e.cd = 2.4 + rng(); e.ringT = 0.4; impact(5); SFX.play('slam'); if (!fainted && !P.dash && d < 62) damagePlayer(2, e); } return true; }
    if (chase) { e.wt = (e.wt || 0) - dt; if (e.cd <= 0 && d < 220) { e.state = 'jump'; e.st = 1; e.sx = e.x; e.sy = e.y; let tx = P.x, ty = P.y; if (!walkable(tx, ty)) { tx = e.x; ty = e.y; } e.tx = tx; e.ty = ty; SFX.play('leap'); } else if (e.wt <= 0) { e.wt = 0.6; moveEnemy(e, dx / d * 26, dy / d * 26); } }
    else wander(D.sp * 0.4);
    return true;
  }
  return false;
}
Object.assign(PROC_DRAW, {
  sprite(c, e, k) {
    const y = e.y - 32 + Math.sin(e.anim * 3) * 4, tw = e.state === 'twinkle' ? 1.4 : 1, r = 9 * k * tw;
    c.fillStyle = `rgba(255,246,200,${0.25 * tw})`; circle(c, e.x, y, 18 * k);
    c.fillStyle = '#ffe9a8'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2 + e.anim, rr = i % 2 ? r * 0.45 : r; c.lineTo(e.x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill();
    c.fillStyle = '#5a4a8a'; c.fillRect(e.x - 3, y - 2, 2, 2); c.fillRect(e.x + 1, y - 2, 2, 2);
    if (Math.random() < 0.2) particles.push({ x: e.x + (Math.random() - 0.5) * 14, y: y + 6, vx: 0, vy: 20, life: 0.4, color: '#ffe9a8', size: 2 });
  },
  voidorb(c, e, k) {
    const y = e.y - 26 + Math.sin(e.anim * 2) * 3;
    for (let i = 0; i < 3; i++) { const ph = (time * 0.8 + i / 3) % 1; c.strokeStyle = `rgba(138,106,184,${0.5 * ph})`; c.lineWidth = 2; c.beginPath(); c.arc(e.x, y, 40 * (1 - ph) + 12, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#0a0612'; circle(c, e.x, y, 13 * k); c.strokeStyle = '#8a6ab8'; c.lineWidth = 2; c.beginPath(); c.arc(e.x, y, 13 * k, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#d6b8ff'; c.fillRect(e.x - 5, y - 3, 3, 3); c.fillRect(e.x + 2, y - 3, 3, 3);
    c.strokeStyle = '#d6b8ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(e.x, y + 3, 5, 0.2, Math.PI - 0.2); c.stroke();
  },
  mgolem(c, e, k) {
    const raise = e.state === 'windup' ? 1 - e.st / 0.7 : 0, walk = Math.sin(e.anim * 6) * 2, g = 0.6 + Math.sin(time * 6 + e.hx) * 0.3;
    shadow(c, e.x, e.y + 2, 16 * k, 5 * k);
    c.fillStyle = '#3a3044'; c.fillRect(e.x - 11, e.y - 12 + walk, 8, 12); c.fillRect(e.x + 3, e.y - 12 - walk, 8, 12);
    c.fillStyle = '#4a4058'; ellipse(c, e.x, e.y - 26, 16 * k, 16 * k); c.fillStyle = '#5a5070'; ellipse(c, e.x - 4, e.y - 30, 10 * k, 9 * k);
    c.strokeStyle = `rgba(255,170,70,${g})`; c.lineWidth = 2; c.beginPath(); c.moveTo(e.x - 10, e.y - 30); c.lineTo(e.x - 2, e.y - 22); c.lineTo(e.x + 6, e.y - 32); c.lineTo(e.x + 12, e.y - 24); c.stroke();
    c.fillStyle = `rgba(255,190,90,${g})`; circle(c, e.x, e.y - 26, 5);
    c.fillStyle = '#3a3044'; for (const s of [-1, 1]) c.fillRect(e.x + s * 18 - 5, e.y - 32 - raise * 18, 10, 12);
    c.fillStyle = '#ffd65a'; c.fillRect(e.x - 6, e.y - 36, 3, 2); c.fillRect(e.x + 3, e.y - 36, 3, 2);
  },
  hopper(c, e, k) {
    const lift = e.lift || 0, f = P.x < e.x ? -1 : 1;
    if (e.ringT > 0) { const r = (1 - e.ringT / 0.4) * 62; c.strokeStyle = `rgba(214,226,255,${e.ringT * 2})`; c.lineWidth = 3; c.beginPath(); c.ellipse(e.x, e.y, r, r * 0.6, 0, 0, Math.PI * 2); c.stroke(); }
    if (e.state === 'jump') { c.strokeStyle = 'rgba(236,82,87,.5)'; c.lineWidth = 2; c.beginPath(); c.ellipse(e.tx, e.ty, 30, 12, 0, 0, Math.PI * 2); c.stroke(); }
    shadow(c, e.x, e.y + 2, 14 * Math.max(0.5, 1 - lift / 120), 4);
    const y = e.y - lift;
    c.fillStyle = '#e6e6f2'; ellipse(c, e.x, y - 14, 12 * k, 11 * k); circle(c, e.x + f * 8, y - 26, 8 * k);
    for (const s of [-1, 1]) { c.fillStyle = '#e6e6f2'; c.beginPath(); c.ellipse(e.x + f * 6 + s * 4, y - 40, 3, 10, s * 0.2, 0, Math.PI * 2); c.fill(); c.fillStyle = '#f2b0c8'; c.beginPath(); c.ellipse(e.x + f * 6 + s * 4, y - 40, 1.5, 7, s * 0.2, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#c8302a'; c.fillRect(e.x + f * 11 - 1, y - 28, 2, 2); c.fillStyle = '#ffffff'; circle(c, e.x - f * 12, y - 12, 4);
  },
});
// ---------- ambient life: falling leaves in the forest, butterflies in the meadow, fireflies in the grove ----------
let viewRect = { x: 0, y: 0, w: 800, h: 600 };
function updateAmbient(dt) {
  if (ambient.length < (inDungeon(P.x) && dungeonAt(P.x).outdoor ? 70 : 34) && Math.random() < dt * (inDungeon(P.x) && dungeonAt(P.x).outdoor ? 30 : 12)) {
    const x = viewRect.x + Math.random() * viewRect.w, y = viewRect.y + Math.random() * viewRect.h;
    const tx = Math.floor(x / T), ty = Math.floor(y / T), rg = region[ty * W + tx];
    if (isLand(tileAt(tx, ty))) {
      if (rg === 4) ambient.push({ kind: 'leaf', x, y: y - 60, life: 4, ph: Math.random() * 6, col: Math.random() < 0.5 ? '#5aa65c' : '#d9a23c' });
      else if (rg === 18) ambient.push({ kind: 'glow', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10 });
      else if (rg === 17) ambient.push({ kind: 'mote', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 4 });
      else if (rg === 16) ambient.push({ kind: 'bub', x, y: y + 60, life: 4, ph: Math.random() * 6 });
      else if (rg === 15) ambient.push({ kind: 'petal', x, y: y - 60, life: 4, ph: Math.random() * 6 });
      else if (rg === 14) ambient.push({ kind: 'fly', x, y, life: 6, ph: Math.random() * 6, col: ['#3a8ae0', '#ffd65a', '#e0503a', '#ffffff'][Math.floor(Math.random() * 4)], vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 20 });
      else if (rg === 3) ambient.push({ kind: 'fly', x, y, life: 6, ph: Math.random() * 6, col: ['#ffffff', '#ffd65a', '#f28fb4'][Math.floor(Math.random() * 3)], vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 20 });
      else if (rg === 13) ambient.push({ kind: 'mote', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 4 });
      else if (rg === 12) ambient.push({ kind: 'glow', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12 });
      else if (rg === 11) ambient.push({ kind: 'mote', x, y, life: 5, ph: Math.random() * 6, vx: 8 + Math.random() * 8, vy: -2 - Math.random() * 4 });
      else if (rg === 10) ambient.push(Math.random() < 0.6 ? { kind: 'ember', x, y: y + 40, life: 3, ph: Math.random() * 6 } : { kind: 'ash', x, y: y - 60, life: 4, ph: Math.random() * 6 });
      else if (rg === 9) ambient.push(Math.random() < 0.5 ? { kind: 'glow', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14 } : { kind: 'spore', x, y, life: 4, ph: Math.random() * 6 });
      else if (rg === 8 && Math.random() < 0.5) ambient.push({ kind: 'dust', x, y, life: 3, ph: Math.random() * 6 });
      else if (rg === 6) { for (let i = 0; i < 2; i++) ambient.push({ kind: 'snow', x: viewRect.x + Math.random() * viewRect.w, y: viewRect.y - 10 + Math.random() * viewRect.h * 0.5, life: 4, ph: Math.random() * 6 }); }
      else if (rg === 5) ambient.push({ kind: 'mote', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 6 });
      else if (rg === 1) ambient.push({ kind: 'glow', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14 });
    }
  }
  for (let i = ambient.length - 1; i >= 0; i--) {
    const a = ambient[i]; a.life -= dt; a.ph += dt;
    if (a.kind === 'leaf') { a.y += 22 * dt; a.x += Math.sin(a.ph * 2) * 22 * dt; }
    else if (a.kind === 'bub') { a.y -= 34 * dt; a.x += Math.sin(a.ph * 3) * 10 * dt; }
    else if (a.kind === 'petal') { a.y += 20 * dt; a.x += Math.sin(a.ph * 1.8) * 22 * dt + 6 * dt; }
    else if (a.kind === 'ember') { a.y -= 30 * dt; a.x += Math.sin(a.ph * 3) * 14 * dt; }
    else if (a.kind === 'ash') { a.y += 16 * dt; a.x += Math.sin(a.ph * 1.5) * 10 * dt; }
    else if (a.kind === 'spore') { a.y -= 10 * dt; a.x += Math.sin(a.ph * 2) * 8 * dt; }
    else if (a.kind === 'dust') { a.x += 26 * dt; a.y += Math.sin(a.ph * 2) * 6 * dt; }
    else if (a.kind === 'snow') { a.y += 38 * dt; a.x += Math.sin(a.ph * 1.5) * 16 * dt - 6 * dt; }
    else if (a.kind === 'fly') { if (Math.random() < dt) { a.vx = (Math.random() - 0.5) * 40; a.vy = (Math.random() - 0.5) * 30; } a.x += a.vx * dt; a.y += a.vy * dt + Math.sin(a.ph * 5) * 0.4; }
    else { a.x += a.vx * dt; a.y += a.vy * dt; }
    if (a.life <= 0) ambient.splice(i, 1);
  }
}
function drawAmbient(c) {
  for (const a of ambient) {
    const fade = Math.min(1, a.life, (a.kind === 'leaf' ? 4 : a.kind === 'fly' ? 6 : 5) - a.life);
    if (a.kind === 'bub') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.7; c.strokeStyle = '#dff6ff'; c.lineWidth = 1; c.beginPath(); c.arc(a.x, a.y, 2 + (a.ph % 1) * 2, 0, Math.PI * 2); c.stroke(); continue; }
    if (a.kind === 'petal') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.85; c.fillStyle = a.ph % 2 < 1 ? '#f2a0c8' : '#ffd6ea'; const w = 2 + Math.abs(Math.sin(a.ph * 3)) * 2; c.fillRect(Math.round(a.x - w / 2), Math.round(a.y), Math.round(w), 2); continue; }
    if (a.kind === 'ember') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.9; c.fillStyle = a.ph % 1 < 0.5 ? '#ffb347' : '#ff7a2a'; c.fillRect(Math.round(a.x), Math.round(a.y), 2, 2); continue; }
    if (a.kind === 'ash') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.6; c.fillStyle = '#9a928e'; c.fillRect(Math.round(a.x), Math.round(a.y), 2, 2); continue; }
    if (a.kind === 'spore') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.6; c.fillStyle = '#d6f2a0'; c.fillRect(Math.round(a.x), Math.round(a.y), 2, 2); continue; }
    if (a.kind === 'dust') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.5; c.fillStyle = '#f2dcae'; c.fillRect(Math.round(a.x), Math.round(a.y), 3, 1); continue; }
    if (a.kind === 'snow') { c.globalAlpha = Math.max(0, Math.min(1, a.life)) * 0.85; c.fillStyle = '#ffffff'; c.fillRect(Math.round(a.x), Math.round(a.y), a.ph > 3 ? 3 : 2, a.ph > 3 ? 3 : 2); continue; }
    if (a.kind === 'mote') { c.globalAlpha = Math.max(0, fade) * 0.6; c.fillStyle = '#ffe9c4'; c.fillRect(Math.round(a.x), Math.round(a.y), 2, 2); continue; }
    c.globalAlpha = Math.max(0, fade);
    if (a.kind === 'leaf') { c.fillStyle = a.col; const w = 2 + Math.abs(Math.sin(a.ph * 3)) * 3; c.fillRect(Math.round(a.x - w / 2), Math.round(a.y), Math.round(w), 3); }
    else if (a.kind === 'fly') { c.fillStyle = a.col; const f = Math.abs(Math.sin(a.ph * 14)) * 3 + 1; c.fillRect(Math.round(a.x - f - 1), Math.round(a.y), Math.round(f), 3); c.fillRect(Math.round(a.x + 1), Math.round(a.y), Math.round(f), 3); }
    else { const p = 0.5 + Math.sin(a.ph * 3) * 0.5; c.globalAlpha *= p; c.fillStyle = 'rgba(214,200,255,.35)'; circle(c, a.x, a.y, 5); c.fillStyle = '#fff4b8'; c.fillRect(Math.round(a.x - 1), Math.round(a.y - 1), 2, 2); }
  }
  c.globalAlpha = 1;
}

// ---------- render ----------
let vw = 0, vh = 0, dpr = 1, Z = 1;
const camFocus = { x: 0, y: 0 };
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); vw = innerWidth; vh = innerHeight;
  cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
  cvs.style.width = vw + 'px'; cvs.style.height = vh + 'px';
  Z = Math.max(1, Math.min(2.25, Math.min(vw / (20 * T), vh / (13 * T))));
}
addEventListener('resize', resize);

function shadow(c, x, y, rx, ry) { c.fillStyle = 'rgba(0,0,0,.22)'; ellipse(c, x, y, rx, ry); }
// scale-around-the-base helper so things can squash, grow and topple from where they stand
function withBase(c, x, y, sx, sy, rot, fn) { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(sx, sy); fn(); c.restore(); }
function drawPalm(c, r) {
  const sw = Math.sin(time * 1.5 + r.seed * 9) * 2;
  c.strokeStyle = '#5a3a1e'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(6, -30, 4 + sw, -58); c.stroke();
  c.strokeStyle = '#a0703c'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(6, -30, 4 + sw, -58); c.stroke();
  c.strokeStyle = 'rgba(90,58,30,.6)'; c.lineWidth = 1; for (let i = 1; i < 6; i++) { const yy = -2 - i * 10; c.beginPath(); c.moveTo(-2 + i * 0.6, yy); c.lineTo(6 + i * 0.4, yy - 2); c.stroke(); }
  c.lineCap = 'butt';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.55 + sw * 0.03, len = 30 - Math.abs(i - 3) * 2;
    c.save(); c.translate(4 + sw, -58); c.rotate(a);
    c.fillStyle = '#2f6b3a'; c.beginPath(); c.ellipse(len / 2, 0, len / 2 + 2, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4f9a4a'; c.beginPath(); c.ellipse(len / 2, -1, len / 2, 4, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  c.fillStyle = '#6b4423'; circle(c, 1 + sw, -54, 4); circle(c, 8 + sw, -53, 4);
}
function drawRemains(c, r) {
  if (r.type === 'tree') {
    if (r.fall < 0.7) { // toppling tree
      const k = Math.min(1, r.fall / 0.55), rot = r.fallDir * k * k * 1.45;
      c.globalAlpha = r.fall > 0.5 ? Math.max(0, 1 - (r.fall - 0.5) / 0.2) : 1;
      withBase(c, r.x, r.y + 6, 1, 1, rot, () => { if (r.key === 'palm') drawPalm(c, r); else sprB(c, r.key, 0, 1, 3); });
      c.globalAlpha = 1;
    }
    c.fillStyle = 'rgba(0,0,0,.2)'; ellipse(c, r.x, r.y + 4, 11, 4);
    c.fillStyle = '#3b2414'; c.fillRect(r.x - 7, r.y - 4, 14, 9);
    c.fillStyle = '#7a4b27'; c.fillRect(r.x - 6, r.y - 3, 12, 7); c.fillStyle = '#c99a63'; ellipse(c, r.x, r.y - 3, 6, 2.5);
  } else if (r.type === 'rock' || r.type === 'crystal') {
    c.fillStyle = r.type === 'rock' ? '#7f7a76' : '#6c5ce7';
    c.fillRect(r.x - 9, r.y + 1, 4, 3); c.fillRect(r.x + 3, r.y + 2, 5, 3); c.fillRect(r.x - 2, r.y - 1, 3, 2);
  }
}
function drawRes(c, r) {
  if (!r.alive) { drawRemains(c, r); return; }
  const s = r.shake ? Math.round(Math.sin(time * 70) * 2) : 0;
  const g = r.grow === undefined ? 1 : r.grow, pop = g < 1 ? (g < 0.7 ? g / 0.7 * 1.15 : 1.15 - (g - 0.7) / 0.3 * 0.15) : 1;
  const squash = r.shake > 0.1 && r.type !== 'tree' ? 1 + (r.shake - 0.1) * 1.2 : 1;
  withBase(c, r.x + s, r.y + 7, pop * squash, pop / squash, 0, () => {
    if (r.type === 'tree') { shadow(c, 0, -4, 15, 5); if (r.key === 'palm') drawPalm(c, r); else if (r.key === 'blossom') drawBlossomTree(c, r); else if (r.key === 'kelp') drawKelp(c, r); else sprB(c, r.key, 0, 0, 3); }
    else if (r.type === 'rock') { shadow(c, 0, -4, 15, 5); sprB(c, 'rock_g', 0, 1, 2.25); }
    else if (r.type === 'herb') { const sw = Math.sin(time * 2 + r.seed * 9) > 0.7 ? 1 : 0; sprB(c, r.key, sw, -1, 2); }
    else if (r.type === 'pot') drawPot(c, { ...r, x: 0, y: -7 });
    else if (r.type === 'crate') { shadow(c, 0, -4, 12, 4); sprB(c, 'crate', 0, 0, 2); }
    else if (r.type === 'vine') drawVine(c, r);
    else if (r.type === 'obsidian') drawObsidian(c, r);
    else if (r.type === 'tallgrass') drawTallGrass(c, r);
    else if (r.type === 'crystal') {
      const gl = 0.22 + Math.sin(time * 3 + r.seed * 10) * 0.08;
      c.fillStyle = `rgba(165,147,255,${gl})`; circle(c, 0, -19, 22);
      shadow(c, 0, -4, 13, 4); sprB(c, r.ice ? 'crystal_ice' : 'crystal', 0, 1, 2.5);
      if (Math.sin(time * 2.3 + r.seed * 20) > 0.97) { c.fillStyle = '#ffffff'; c.fillRect(-6, -34, 2, 6); c.fillRect(-8, -32, 6, 2); }
    }
  });
  if (r.hp < r.max && r.type !== 'herb') healthBar(c, r.x, r.y + 8, r.hp / r.max);
}
function drawEnemy(c, e) {
  if (ENEMY[e.kind].hopper) drawSlime(c, e); else drawCreature(c, e);
  if (e.frozen > 0 && e.alive) { c.fillStyle = 'rgba(170,225,255,.35)'; ellipse(c, e.x, e.y - 14, 18, 16); c.fillStyle = '#ffffff'; c.fillRect(Math.round(e.x - 8), Math.round(e.y - 26), 2, 2); c.fillRect(Math.round(e.x + 6), Math.round(e.y - 18), 2, 2); }
}
function drawCreature(c, e) {
  const D = ENEMY[e.kind], A = ATLAS[D.sprite];
  if (D.proc) {
    let k = 1; if (!e.alive) k = Math.max(0.05, Math.max(0, e.dieT) / 0.4); else if (e.spawnT > 0) k = 1 - e.spawnT / 0.45;
    c.globalAlpha = e.hurt > 0 ? 0.55 : 1; PROC_DRAW[D.proc](c, e, Math.max(0.1, k)); c.globalAlpha = 1;
    if (e.alive && e.state === 'windup') bossWarn(c, { x: e.x }, e.y - 44);
    if (e.alive && e.hp < e.max) healthBar(c, e.x, e.y - 44, e.hp / e.max);
    return;
  }
  let sx = 1, sy = 1, lift = 0, ox = 0, alpha = 1;
  if (AI(e.kind) === 'bat') { lift = 20 + Math.sin(e.anim * 5) * 5; sy = 0.75 + Math.abs(Math.sin(e.anim * 18)) * 0.35; sx = 1.1 - (sy - 0.75) * 0.3; }
  else if (AI(e.kind) === 'spider') { ox = Math.sin(e.anim * 40) * (Math.sin(e.anim * 7) > 0 ? 1.2 : 0); sy = 1 + Math.sin(e.anim * 14) * 0.04; }
  else if (AI(e.kind) === 'crab') { ox = Math.sin(e.anim * 9) * 2; sy = 1 + Math.abs(Math.sin(e.anim * 9)) * 0.05; }
  else if (AI(e.kind) === 'cyclops') { lift = Math.abs(Math.sin(e.anim * 4)) * 3; if (e.state === 'windup') { sy = 1.12; sx = 0.92; } }
  else if (AI(e.kind) === 'ghost') { lift = 12 + Math.sin(e.anim * 2) * 5; alpha = e.faded ? 0.18 : 0.88; }
  else if (AI(e.kind) === 'snail') { if (e.shell > 0) { sy = 0.6; sx = 0.85; } else sx = 1 + Math.sin(e.anim * 3) * 0.05; }
  else if (AI(e.kind) === 'rat') { ox = Math.sin(e.anim * 30) * 1; sy = 0.8; sx = 0.85; }
  else if (AI(e.kind) === 'bandit') { lift = Math.abs(Math.sin(e.anim * 10)) * 2; }
  else if (AI(e.kind) === 'mage') { lift = 4 + Math.sin(e.anim * 2.5) * 3; if (e.state === 'windup') { c.fillStyle = 'rgba(255,170,80,.5)'; circle(c, e.x, e.y - 56, 6 + (1 - e.st / 0.55) * 6); } }
  if (e.state === 'windup') ox += Math.sin(time * 60) * 2;
  if (e.state === 'attack' && AI(e.kind) === 'spider') lift = 8;
  if (!e.alive) { const k = 1 - Math.max(0, e.dieT) / 0.4; sx *= 1 - k; sy *= 1 - k; alpha *= 1 - k; }
  if (e.spawnT > 0) { const k = 1 - e.spawnT / 0.45, pop = k < 0.7 ? k / 0.7 * 1.2 : 1.2 - (k - 0.7) / 0.3 * 0.2; sx *= pop; sy *= pop; }
  shadow(c, e.x, e.y + 2, D.flyer ? 8 : 12, D.flyer ? 3 : 4);
  if (e.hurt > 0) alpha *= 0.5;
  c.globalAlpha = alpha;
  const w = 40 * sx, h = 40 * sy;
  c.drawImage(IMG.kenney_atlas, A[0], A[1], 16, 16, Math.round(e.x + ox - w / 2), Math.round(e.y + 6 - h - lift), Math.round(w), Math.round(h));
  c.globalAlpha = 1;
  if (!e.alive) return;
  if (e.state === 'windup') { c.fillStyle = '#ffe08a'; c.strokeStyle = '#2a1a00'; c.lineWidth = 3; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.strokeText('!', e.x, e.y - 42 - lift); c.fillText('!', e.x, e.y - 42 - lift); }
  if (AI(e.kind) === 'crab' && e.state === 'recover') drawStars(c, e.x, e.y - 40, 10);
  if (AI(e.kind) === 'bandit' && e.loot) { c.fillStyle = '#f4b740'; c.strokeStyle = '#2a1a00'; c.lineWidth = 2; c.font = '700 11px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.strokeText(`${e.loot}g`, e.x, e.y - 52 - lift); c.fillText(`${e.loot}g`, e.x, e.y - 52 - lift); }
  if (e.hp < e.max && !e.faded) healthBar(c, e.x, e.y - 42 - lift, e.hp / e.max);
}
function drawStars(c, x, y, r) { c.fillStyle = '#ffe08a'; for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; c.fillRect(Math.round(x + Math.cos(a) * r - 2), Math.round(y + Math.sin(a) * r * 0.4 - 2), 4, 4); } }
function drawProjectiles(c) {
  for (const p of projectiles) {
    if (p.kind === 'sunball') {
      c.fillStyle = 'rgba(255,214,90,.3)'; circle(c, p.x, p.y, 32); c.fillStyle = '#b8862a'; circle(c, p.x, p.y, 22); c.fillStyle = '#f4b740'; circle(c, p.x, p.y, 19);
      c.save(); c.translate(p.x, p.y); c.rotate(p.t * 6); c.fillStyle = '#ffe9a8'; for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.fillRect(-2, -16, 4, 8); } c.restore();
      c.fillStyle = '#ffffff'; circle(c, p.x - 6, p.y - 6, 4);
      continue;
    }
    if (p.kind === 'beam') {
      if (p.t < 0) continue;
      c.save(); c.translate(p.x, p.y); c.rotate(p.ang);
      c.strokeStyle = gearW().col; c.globalAlpha = 0.85; c.lineWidth = 5; c.beginPath(); c.arc(-6, 0, 16, -1.1, 1.1); c.stroke();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(-6, 0, 16, -0.8, 0.8); c.stroke();
      c.restore(); c.globalAlpha = 1;
      continue;
    }
    if (p.kind === 'rock') {
      const pulse = 0.5 + Math.sin(time * 16) * 0.3;
      c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 2; c.beginPath(); c.ellipse(p.tx, p.ty, 22, 10, 0, 0, Math.PI * 2); c.stroke();
      shadow(c, p.x, p.fall ? p.ty : p.y + 30 * (1 - Math.max(0, p.t) / p.dur), 7, 3);
      if (p.meteor) drawMeteor(c, p);
      else if (p.seed) { const fy = p.y - p.z; c.fillStyle = '#3d6a24'; circle(c, p.x, fy, 6); c.fillStyle = '#7ab84a'; circle(c, p.x - 1, fy - 1, 4); }
      else if (p.bone) { const fy = p.y - p.z; c.save(); c.translate(p.x, fy); c.rotate(p.t * 14); c.fillStyle = '#efe6d8'; c.fillRect(-9, -2, 18, 4); circle(c, -9, -2, 3); circle(c, -9, 2, 3); circle(c, 9, -2, 3); circle(c, 9, 2, 3); c.restore(); }
      else if (p.flask) { const fy = p.y - p.z; c.save(); c.translate(p.x, fy); c.rotate(p.t * 9); c.fillStyle = '#3d6a44'; circle(c, 0, 2, 7); c.fillStyle = '#7fd17a'; circle(c, 0, 3, 5); c.fillStyle = '#c9b18a'; c.fillRect(-2, -9, 4, 6); c.restore(); }
      else sprB(c, p.ice ? 'crystal_ice' : 'rock_g', p.x, p.y - p.z + 8, 1.25);
    } else if (p.kind === 'wisp') {
      c.fillStyle = 'rgba(180,160,255,.35)'; circle(c, p.x, p.y, 9); c.fillStyle = '#efeaff'; circle(c, p.x, p.y, 4);
    } else if (p.kind === 'hex') {
      c.save(); c.translate(p.x, p.y); c.rotate(p.t * 10); c.fillStyle = 'rgba(181,140,255,.35)'; circle(c, 0, 0, 11); c.fillStyle = '#b58cff'; for (let i = 0; i < 3; i++) { c.rotate(Math.PI * 2 / 3); c.fillRect(-2, -9, 4, 7); } c.restore(); c.fillStyle = '#f0e6ff'; circle(c, p.x, p.y, 3);
    } else if (p.kind === 'sand') {
      c.fillStyle = 'rgba(232,200,138,.45)'; circle(c, p.x, p.y, 10); c.fillStyle = '#c99a5a'; circle(c, p.x, p.y, 6); c.fillStyle = '#f2dcae'; circle(c, p.x - 2, p.y - 2, 2);
    } else if (p.kind === 'bomb') {
      const k = p.t / p.life, blink = Math.sin(time * (10 + k * 30)) > 0; c.strokeStyle = `rgba(236,82,87,${0.3 + k * 0.5})`; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, 54, 43, 0, 0, Math.PI * 2); c.stroke();
      shadow(c, p.x, p.y + 2, 8, 3); c.fillStyle = '#1a1a1e'; circle(c, p.x, p.y - 8, 8); c.fillStyle = blink ? '#e0503a' : '#5a5a64'; circle(c, p.x - 2, p.y - 10, 2.5); c.strokeStyle = '#8a6a34'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x + 3, p.y - 15); c.quadraticCurveTo(p.x + 6, p.y - 20, p.x + 4, p.y - 23); c.stroke(); c.fillStyle = '#ffd65a'; circle(c, p.x + 4, p.y - 24, 2 + Math.random());
    } else if (p.kind === 'star') {
      c.fillStyle = 'rgba(255,233,168,.3)'; circle(c, p.x, p.y, 8); c.fillStyle = '#ffe9a8'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + p.t * 6, rr = i % 2 ? 2.5 : 6; c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr); } c.closePath(); c.fill();
    } else if (p.kind === 'spark') {
      c.strokeStyle = '#fff6a8'; c.lineWidth = 2; c.beginPath(); c.moveTo(p.x - 6, p.y - 3); c.lineTo(p.x, p.y + 2); c.lineTo(p.x - 2, p.y - 2); c.lineTo(p.x + 6, p.y + 3); c.stroke(); c.fillStyle = 'rgba(255,246,168,.35)'; circle(c, p.x, p.y, 7);
    } else if (p.kind === 'bullet') {
      c.fillStyle = 'rgba(255,180,90,.35)'; circle(c, p.x, p.y, 6); c.fillStyle = '#d0aa5c'; circle(c, p.x, p.y, 3);
    } else if (p.kind === 'dart') {
      c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); c.fillStyle = '#6a4a2a'; c.fillRect(-10, -1, 16, 2); c.fillStyle = '#c8c0b0'; c.beginPath(); c.moveTo(6, -3); c.lineTo(11, 0); c.lineTo(6, 3); c.fill(); c.fillStyle = '#e0503a'; c.fillRect(-12, -3, 4, 6); c.restore();
    } else if (p.kind === 'venom') {
      c.fillStyle = 'rgba(127,209,122,.35)'; circle(c, p.x, p.y, 8); c.fillStyle = '#5ab85a'; circle(c, p.x, p.y, 4); c.fillStyle = '#d6ffd0'; c.fillRect(p.x - 2, p.y - 2, 2, 2);
    } else if (p.kind === 'shard') {
      c.save(); c.translate(p.x, p.y); c.rotate((p.ang || 0) + Math.PI / 2); c.fillStyle = 'rgba(165,147,255,.4)'; circle(c, 0, 0, 7); c.fillStyle = '#c8bcff'; diamond(c, 0, 0, 3, 8); c.fillStyle = '#ffffff'; diamond(c, -1, -1, 1, 4); c.restore();
    } else if (p.kind === 'ice') {
      c.save(); c.translate(p.x, p.y); c.rotate((p.ang || 0) + Math.PI / 2); c.fillStyle = 'rgba(190,240,255,.4)'; circle(c, 0, 0, 9); c.fillStyle = '#9fe8ff'; diamond(c, 0, 0, 4, 9); c.fillStyle = '#ffffff'; diamond(c, -1, -1, 1.5, 5); c.restore();
    } else if (p.kind === 'bolt') {
      if (p.t < 0) continue;
      if (p.t < 0.7) { const k = p.t / 0.7; c.strokeStyle = `rgba(255,240,120,${0.3 + k * 0.6})`; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, 26 - k * 10, 11 - k * 4, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = `rgba(255,240,120,${k * 0.25})`; c.beginPath(); c.ellipse(p.x, p.y, 26 - k * 10, 11 - k * 4, 0, 0, Math.PI * 2); c.fill(); }
      else if (p.t < 0.84) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = '#fff6a8'; c.lineWidth = 4; c.beginPath(); let bx = p.x, by = p.y - 320; c.moveTo(bx, by); for (let i = 1; i <= 8; i++) { bx = p.x + (i < 8 ? (Math.random() - 0.5) * 24 : 0); by = p.y - 320 + i * 40; c.lineTo(bx, by); } c.stroke(); c.fillStyle = 'rgba(255,250,200,.6)'; circle(c, p.x, p.y, 22); c.restore(); }
      else { c.fillStyle = 'rgba(40,40,50,.4)'; ellipse(c, p.x, p.y, 14, 6); }
    } else if (p.kind === 'spike') {
      if (p.t < 0) continue;
      if (p.bonespike) {
        if (p.t < 0.5) { c.fillStyle = `rgba(60,50,70,${0.3 + p.t})`; ellipse(c, p.x, p.y, 8 + p.t * 10, 4 + p.t * 5); }
        else { const k = Math.min(1, (p.t - 0.5) / 0.08); c.fillStyle = '#e6dcc8'; c.beginPath(); c.moveTo(p.x - 10, p.y + 3); c.lineTo(p.x - 5, p.y - 26 * k); c.lineTo(p.x, p.y + 2); c.lineTo(p.x + 5, p.y - 18 * k); c.lineTo(p.x + 10, p.y + 3); c.closePath(); c.fill(); c.strokeStyle = '#8a8070'; c.lineWidth = 1; c.stroke(); }
        continue;
      }
      if (p.flame) {
        if (p.t < 0.5) { c.fillStyle = `rgba(255,120,40,${0.2 + p.t * 0.8})`; ellipse(c, p.x, p.y, 8 + p.t * 10, 4 + p.t * 5); }
        else { const k = Math.min(1, (p.t - 0.5) / 0.08) * (1 - Math.max(0, p.t - 0.8) * 4); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,120,40,.6)'; ellipse(c, p.x, p.y - 14 * k, 9, 16 * k + 1); c.fillStyle = 'rgba(255,230,140,.6)'; ellipse(c, p.x, p.y - 10 * k, 4, 10 * k + 1); c.restore(); }
        continue;
      }
      if (p.root) {
        if (p.t < 0.5) { c.fillStyle = `rgba(90,60,30,${0.3 + p.t})`; ellipse(c, p.x, p.y, 8 + p.t * 10, 4 + p.t * 5); }
        else { const k = Math.min(1, (p.t - 0.5) / 0.08); c.fillStyle = '#4a3220'; c.beginPath(); c.moveTo(p.x - 11, p.y + 4); c.quadraticCurveTo(p.x - 8, p.y - 18 * k, p.x - 2, p.y - 30 * k); c.lineTo(p.x + 3, p.y + 2); c.quadraticCurveTo(p.x + 8, p.y - 14 * k, p.x + 9, p.y - 22 * k); c.lineTo(p.x + 12, p.y + 4); c.closePath(); c.fill(); c.fillStyle = '#4f8a3a'; circle(c, p.x - 2, p.y - 30 * k, 3); }
        continue;
      }
      if (p.t < 0.5) { c.strokeStyle = `rgba(160,220,255,${0.4 + p.t})`; c.lineWidth = 2; c.beginPath(); c.ellipse(p.x, p.y, 10 + p.t * 12, 5 + p.t * 6, 0, 0, Math.PI * 2); c.stroke(); }
      else { const k = Math.min(1, (p.t - 0.5) / 0.08); c.fillStyle = '#d6f4ff'; c.beginPath(); c.moveTo(p.x - 12, p.y + 4); c.lineTo(p.x - 4, p.y - 30 * k); c.lineTo(p.x + 2, p.y + 2); c.lineTo(p.x + 7, p.y - 20 * k); c.lineTo(p.x + 13, p.y + 4); c.closePath(); c.fill(); c.strokeStyle = '#6fb8d8'; c.lineWidth = 1.5; c.stroke(); }
    } else if (p.kind === 'axe') {
      c.save(); c.translate(p.x, p.y); c.rotate(p.t * 18); const A = ATLAS.axe; c.drawImage(IMG.kenney_atlas, A[0], A[1], 16, 16, -18, -18, 36, 36); c.restore();
    } else if (p.kind === 'fire') {
      const pu = 1 + Math.sin(time * 20) * 0.15;
      c.fillStyle = 'rgba(255,140,60,.35)'; circle(c, p.x, p.y, 12 * pu); c.fillStyle = '#ffb347'; circle(c, p.x, p.y, 7 * pu); c.fillStyle = '#fff2c4'; circle(c, p.x - 1, p.y - 1, 3);
    } else if (p.kind === 'web') {
      c.strokeStyle = '#f2f2f2'; c.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + p.t * 3; c.beginPath(); c.moveTo(p.x - Math.cos(a) * 8, p.y - Math.sin(a) * 8); c.lineTo(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8); c.stroke(); }
      c.beginPath(); c.arc(p.x, p.y, 5, 0, Math.PI * 2); c.stroke();
    } else if (p.kind === 'bubble') {
      c.fillStyle = 'rgba(190,232,255,.3)'; circle(c, p.x, p.y, 9); c.strokeStyle = 'rgba(230,248,255,.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 9, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ffffff'; c.fillRect(Math.round(p.x - 4), Math.round(p.y - 5), 2, 2);
    } else if (p.kind === 'orb') {
      const pu = 1 + Math.sin(time * 14) * 0.12;
      c.fillStyle = p.returned ? 'rgba(255,224,138,.35)' : 'rgba(170,140,255,.35)'; circle(c, p.x, p.y, 17 * pu);
      c.fillStyle = p.returned ? '#ffe08a' : '#b58cff'; circle(c, p.x, p.y, 10 * pu); c.fillStyle = '#ffffff'; circle(c, p.x - 3, p.y - 3, 3.5);
    } else {
      c.save(); c.translate(p.x, p.y); c.rotate(p.ang + Math.PI / 2); c.fillStyle = '#6c5ce7'; diamond(c, 0, 0, 4, 9); c.fillStyle = '#e6e0ff'; diamond(c, -1, -1, 1.5, 5); c.restore();
    }
  }
}
function drawCampfire(c, o) {
  shadow(c, o.x, o.y + 2, 16, 5);
  c.fillStyle = '#5a3a22'; c.save(); c.translate(o.x, o.y); c.rotate(0.4); c.fillRect(-14, -3, 28, 6); c.rotate(-0.8); c.fillRect(-14, -3, 28, 6); c.restore();
  for (let i = 0; i < 3; i++) { const f = Math.sin(time * 12 + i * 2) * 3; c.fillStyle = ['#ec5257', '#ffb347', '#fff2c4'][i]; c.beginPath(); c.moveTo(o.x - 9 + i * 3, o.y - 2); c.quadraticCurveTo(o.x + f, o.y - 26 + i * 6, o.x + 9 - i * 3, o.y - 2); c.closePath(); c.fill(); }
  if (Math.random() < 0.3) particles.push({ x: o.x + (Math.random() - 0.5) * 10, y: o.y - 20, vx: (Math.random() - 0.5) * 10, vy: -40, life: 0.6, color: '#ffb347', size: 2 });
}
function drawTent(c, o) {
  shadow(c, o.x, o.y + 4, 34, 8);
  c.fillStyle = '#6b5236'; c.beginPath(); c.moveTo(o.x - 36, o.y + 4); c.lineTo(o.x, o.y - 52); c.lineTo(o.x + 36, o.y + 4); c.closePath(); c.fill();
  c.fillStyle = '#8a6c48'; c.beginPath(); c.moveTo(o.x - 36, o.y + 4); c.lineTo(o.x, o.y - 52); c.lineTo(o.x - 6, o.y + 4); c.closePath(); c.fill();
  c.fillStyle = '#1e140c'; c.beginPath(); c.moveTo(o.x - 9, o.y + 4); c.lineTo(o.x, o.y - 20); c.lineTo(o.x + 9, o.y + 4); c.closePath(); c.fill();
  c.fillStyle = 'rgba(242,248,255,.85)'; c.beginPath(); c.moveTo(o.x - 10, o.y - 40); c.lineTo(o.x, o.y - 52); c.lineTo(o.x + 10, o.y - 40); c.closePath(); c.fill();
  c.fillStyle = '#c0392b'; c.fillRect(o.x - 1, o.y - 66, 2, 16); c.fillRect(o.x + 1, o.y - 66, 10, 6);
}
function drawBossAny(c, B) { ({ knight2: drawKnight2, clock: drawClock, siren: drawSiren, kraken: drawKraken, elderfox: drawElderFox, koidragon: drawKoiDragon, chameleon: drawChameleon, serpent: drawSerpent, mole: drawMole, hydra: drawHydra, shadow: drawShadowBoss, lich: drawLich, aegis: drawAegis, storm: drawStormlord, forge: drawForgemaster, drake: drawDrake, hag: drawHag, treant: drawTreant, mummy: drawMummy, scarab: drawScarab, wyrm: drawWyrm, jarl: drawJarl, wraith: drawWraith, slime: drawBoss, golem: drawGolem, wizard: drawWizard, queen: drawQueen, crab: drawCrab, bat: drawBat, knight: drawKnight })[B.type](c, B); }
function drawJarl(c, B) {
  let sx = 1, sy = 1, ox = 0;
  if (B.state === 'stride') { const k = Math.abs(Math.sin(B.anim * 7)); sy = 1 - k * 0.05; sx = 1 + k * 0.03; }
  else if (B.state === 'axeWind' || B.state === 'spikesWind' || B.state === 'warcry') ox = Math.sin(time * 60) * 2.5;
  else if (B.state === 'dazed') { sy = 0.92; sx = 1.05; }
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.6; sx = 1 + k * 0.2; ox = Math.sin(time * 70) * 4; }
  else if (B.state === 'sleep') sy = 1 - Math.sin(B.anim * 1.2) * 0.02;
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 38, 12);
  if (B.state === 'warcry') { c.strokeStyle = `rgba(236,82,87,${0.5 + Math.sin(time * 20) * 0.3})`; c.lineWidth = 4; c.beginPath(); c.ellipse(B.x, B.y - 10, 60, 30, 0, 0, Math.PI * 2); c.stroke(); }
  c.globalAlpha = 1; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 10, sx, sy, 0, () => sprB(c, 'viking', 0, 0, 5.5));
  c.globalAlpha = 1;
  const armed = !['axeOut', 'dazed', 'dying'].includes(B.state);
  if (armed) {
    const A = ATLAS.axe, up = B.state === 'axeWind' || B.state === 'spikesWind';
    c.save(); c.translate(B.x + ox + (up ? 6 : 34), B.y - (up ? 104 : 40)); c.rotate(up ? -0.6 : 0.3); c.drawImage(IMG.kenney_atlas, A[0], A[1], 16, 16, -20, -20, 40, 40); c.restore();
  }
  if (B.state === 'axeWind' || B.state === 'spikesWind') bossWarn(c, B, B.y - 112);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') { drawStars(c, B.x, B.y - 96, 26); }
}
function drawWraith(c, B) {
  const one = (x, y, real) => {
    const bob = B.z;
    if (real) { c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, x, y + 4, 30 * Math.max(0.5, 1 - bob / 90), 10); }
    c.globalAlpha = 1;
    if (B.state !== 'dazed') { c.fillStyle = `rgba(170,225,255,${0.18 + Math.sin(time * 3 + x) * 0.07})`; circle(c, x, y - 44 - bob, 50); }
    c.globalAlpha = 0.85; if (real) bossFlash(c, B);
    const tilt = B.state === 'dazed' && real ? 0.35 : 0, ox = B.state === 'dying' ? Math.sin(time * 70) * 4 : 0;
    withBase(c, x + ox, y + 8 - bob, 1, 1, tilt, () => sprB(c, 'ghost_ice', 0, 0, 6));
    c.globalAlpha = 1;
    if (B.state === 'breathWind') { const k = 1 - B.st / 0.6; c.fillStyle = `rgba(220,245,255,${0.4 + k * 0.4})`; circle(c, x, y - 52 - bob, 6 + k * 8); }
  };
  if (B.decoys) for (const dc of B.decoys) if (!dc.popped) one(dc.x, dc.y, false);
  one(B.x, B.y, true);
  if (B.state === 'breathWind') bossWarn(c, B, B.y - 110 - B.z);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 80, 24);
}

function bossZ(c, B, text) { const f = (B.anim % 2) / 2; c.globalAlpha = 1 - f; c.fillStyle = '#eef3e6'; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.fillText('z', B.x + 34 + f * 14, B.y - 80 - B.z - f * 26); c.globalAlpha = 1; }
function bossWarn(c, B, y) { c.fillStyle = '#ffe08a'; c.strokeStyle = '#2a1a00'; c.lineWidth = 3; c.font = '700 22px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.strokeText('!', B.x, y); c.fillText('!', B.x, y); }
function bossFlash(c, B) { if (B.hurt > 0 || (B.state === 'dying' && Math.floor(time * 20) % 2)) c.globalAlpha *= 0.55; }
function drawQueen(c, B) {
  let sx = 1, sy = 1, ox = 0;
  if (B.state === 'skitter') { ox = Math.sin(B.anim * 40) * 1.5; sy = 1 + Math.sin(B.anim * 16) * 0.04; }
  else if (B.state === 'pounceWind' || B.state === 'web' || B.state === 'eggs') { ox = Math.sin(time * 60) * 2; sy = 0.9; sx = 1.08; }
  else if (B.state === 'dazed') { sy = 0.85; sx = 1.1; }
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.7; sx = 1 + k * 0.3; ox = Math.sin(time * 70) * 4; }
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 44 * Math.max(0.4, 1 - B.z / 120), 14);
  c.globalAlpha = 1; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 10 - B.z, sx, sy, 0, () => sprB(c, 'spider', 0, 0, 5.5));
  c.globalAlpha = 1;
  c.fillStyle = '#ec5257'; for (const ex of [-10, -3, 4, 11]) c.fillRect(Math.round(B.x + ox + ex), Math.round(B.y - 58 - B.z), 3, 3);
  if (B.state === 'pounceWind') bossWarn(c, B, B.y - 96);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') { drawStars(c, B.x, B.y - 80, 26); c.strokeStyle = 'rgba(240,240,240,.6)'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(B.x - 40 + i * 20, B.y - 70); c.lineTo(B.x - 30 + i * 15, B.y); c.stroke(); } }
}
function drawCrab(c, B) {
  if (B.state === 'lurk' || B.state === 'sink') {
    const pulse = 0.45 + Math.sin(time * 18) * 0.3;
    c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y, 56, 26, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(190,232,255,.5)'; c.lineWidth = 2; for (let i = 0; i < 2; i++) { const r = ((time * 40 + i * 25) % 50); c.beginPath(); c.ellipse(B.x, B.y, r, r * 0.45, 0, 0, Math.PI * 2); c.stroke(); }
  }
  let sx = 1, sy = 1, ox = 0, rot = 0;
  if (B.state === 'scuttle') { ox = Math.sin(B.anim * 14) * 3; sy = 1 + Math.abs(Math.sin(B.anim * 14)) * 0.05; }
  else if (B.state === 'bubbles' || B.state === 'summon') { ox = Math.sin(time * 60) * 2; sx = 1.06; sy = 0.94; }
  else if (B.state === 'dazed') rot = Math.PI;
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.6; ox = Math.sin(time * 70) * 4; }
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 48, 15);
  c.globalAlpha = B.alpha; bossFlash(c, B);
  if (rot) withBase(c, B.x, B.y - 40, sx, sy, rot, () => sprB(c, 'crab', 0, 46, 6));
  else withBase(c, B.x + ox, B.y + 10, sx, sy, 0, () => sprB(c, 'crab', 0, 0, 6));
  c.globalAlpha = 1;
  if (B.state !== 'dazed' && B.alpha > 0.5) { const C = ATLAS.crown; c.drawImage(IMG.kenney_atlas, C[0], C[1] + 8, 16, 8, Math.round(B.x + ox - 20), Math.round(B.y - 100), 40, 20); }
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 70, 28);
}
function drawBat(c, B) {
  const flap = Math.abs(Math.sin(B.anim * (B.state === 'dazed' ? 3 : 14)));
  let sx = 1.1 - flap * 0.2, sy = 0.75 + flap * 0.35, ox = 0;
  if (B.state === 'swoopWind' || B.state === 'screech') ox = Math.sin(time * 60) * 2;
  if (B.state === 'sleep') { sy = 1; sx = 0.8; }
  if (B.state === 'dazed') { sy = 0.7; sx = 1.2; }
  if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy *= 1 - k * 0.6; ox = Math.sin(time * 70) * 4; }
  const sh = Math.max(0.35, 1 - B.z / 120);
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 40 * sh, 12 * sh);
  if (B.state === 'swoopWind') { c.strokeStyle = 'rgba(236,82,87,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(P.x, P.y); c.stroke(); }
  c.globalAlpha = 1; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 8 - B.z, sx, sy, 0, () => sprB(c, 'bat', 0, 0, 5.5));
  c.globalAlpha = 1;
  if (B.state === 'swoopWind') bossWarn(c, B, B.y - 110 - B.z);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 70, 26);
}
function drawKnight(c, B) {
  let sx = 1, sy = 1, ox = 0, flip = 1;
  if (B.state === 'guard') { sy = 1 - Math.abs(Math.sin(B.anim * 6)) * 0.04; }
  else if (B.state === 'slashWind' || B.state === 'ghosts' || B.state === 'plunge') ox = Math.sin(time * 60) * 2;
  else if (B.state === 'spin') flip = Math.cos(B.anim * 30) >= 0 ? 1 : -1;
  else if (B.state === 'recover') { sy = 0.95; sx = 1.04; }
  else if (B.state === 'dazed') { sy = 0.9; sx = 1.06; }
  else if (B.state === 'dying') { const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.6; sx = 1 + k * 0.2; ox = Math.sin(time * 70) * 4; }
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 36, 12);
  c.fillStyle = `rgba(200,208,224,${0.16 + Math.sin(time * 3) * 0.06})`; circle(c, B.x, B.y - 40, 46);
  c.globalAlpha = 1; bossFlash(c, B);
  withBase(c, B.x + ox, B.y + 10, sx * flip, sy, 0, () => sprB(c, 'knight', 0, 0, 5));
  c.globalAlpha = 1;
  if (B.state === 'slash' && B.st < 0.3) {
    const base = Math.atan2(B.vy, B.vx), k = B.st / 0.3;
    c.strokeStyle = `rgba(230,236,255,${1 - k})`; c.lineWidth = 8; c.lineCap = 'round';
    c.beginPath(); c.arc(B.x, B.y - 30, 66, base - 1.1, base - 1.1 + 2.2 * Math.min(1, k * 1.6)); c.stroke(); c.lineCap = 'butt';
  }
  if (B.state === 'spin') { c.strokeStyle = 'rgba(230,236,255,.6)'; c.lineWidth = 5; c.beginPath(); c.ellipse(B.x, B.y - 24, 62, 30, 0, 0, Math.PI * 2); c.stroke(); }
  if (B.shield > 0) { c.strokeStyle = 'rgba(200,220,255,.9)'; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y - 38, 44, 50, 0, 0, Math.PI * 2); c.stroke(); }
  if (B.state === 'slashWind') bossWarn(c, B, B.y - 100);
  if (B.state === 'sleep') bossZ(c, B);
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 86, 26);
}
function drawSwitch(c, sw, lit) {
  shadow(c, sw.x, sw.y + 3, 11, 4);
  sprB(c, 'pillar', sw.x, sw.y + 6, 1.6);
  const g = lit ? 0.35 + Math.sin(time * 4) * 0.1 : 0.18;
  c.fillStyle = lit ? `rgba(255,224,138,${g})` : `rgba(120,170,255,${g})`; circle(c, sw.x, sw.y - 26, 16);
  c.fillStyle = lit ? '#ffe08a' : '#7aa7ff'; circle(c, sw.x, sw.y - 26, 7); c.fillStyle = '#ffffff'; circle(c, sw.x - 2, sw.y - 28, 2);
}
function drawTempleGate(c) {
  const x = TEMPLE.x, y = TEMPLE.y;
  c.fillStyle = 'rgba(0,0,0,.25)'; ellipse(c, x, y - 2, 60, 12);
  c.fillStyle = '#8c8f86'; c.fillRect(x - 46, y - 52, 92, 50); c.fillStyle = '#a7aa9f'; c.fillRect(x - 50, y - 60, 100, 10);
  c.fillStyle = '#6e7168'; for (let i = 0; i < 4; i++) c.fillRect(x - 46, y - 44 + i * 11, 92, 1);
  c.fillStyle = '#0d1412'; c.fillRect(x - 16, y - 40, 32, 38);
  c.fillStyle = '#5a5d55'; for (let i = 0; i < 3; i++) c.fillRect(x - 16 + i * 3, y - 10 + i * 4, 32 - i * 6, 3);
  c.fillStyle = '#3d8448'; for (const [ox, oy, r] of [[-44, -56, 9], [-36, -48, 7], [40, -58, 10], [46, -40, 7], [-48, -20, 8], [20, -62, 6]]) circle(c, x + ox, y + oy, r);
  c.fillStyle = '#5aa65c'; for (const [ox, oy] of [[-40, -58], [44, -56], [-46, -22]]) circle(c, x + ox, y + oy, 4);
}
function drawCryptDoor(c) {
  const x = CRYPT.x, y = CRYPT.y;
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, x, y - 2, 58, 12);
  c.fillStyle = '#4a4458'; c.beginPath(); c.moveTo(x - 44, y - 2); c.lineTo(x - 44, y - 50); c.lineTo(x, y - 74); c.lineTo(x + 44, y - 50); c.lineTo(x + 44, y - 2); c.closePath(); c.fill();
  c.fillStyle = '#5f5873'; c.fillRect(x - 48, y - 54, 96, 6);
  c.fillStyle = '#2b2735'; for (let i = 0; i < 4; i++) c.fillRect(x - 44, y - 42 + i * 10, 88, 1);
  c.fillStyle = '#16131c'; c.beginPath(); c.moveTo(x - 15, y - 2); c.lineTo(x - 15, y - 30); c.quadraticCurveTo(x, y - 44, x + 15, y - 30); c.lineTo(x + 15, y - 2); c.closePath(); c.fill();
  c.fillStyle = '#e6e0d0'; circle(c, x, y - 60, 6); c.fillStyle = '#16131c'; c.fillRect(x - 4, y - 62, 3, 3); c.fillRect(x + 1, y - 62, 3, 3);
  const g = 0.16 + Math.sin(time * 2) * 0.06; c.fillStyle = `rgba(181,140,255,${g})`; circle(c, x, y - 18, 12);
}

function drawGolem(c, B) {
  let sx = 1, sy = 1, ox = 0, rot = 0;
  if (B.state === 'sleep') { const br = Math.sin(B.anim * 1.2) * 0.03; sy = 1 - br; }
  else if (B.state === 'stomp') { const k = Math.abs(Math.sin(B.anim * 7)); sy = 1 - k * 0.06; sx = 1 + k * 0.04; }
  else if (B.state === 'chargeWind' || B.state === 'boulders') ox = Math.sin(time * 60) * 2.5;
  else if (B.state === 'charge') rot = Math.sign(B.vx || 1) * 0.15;
  else if (B.state === 'dazed') { sx = 1.05; sy = 0.92; }
  else if (B.state === 'dying') { ox = Math.sin(time * 70) * 4; const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.6; sx = 1 + k * 0.2; }
  c.fillStyle = 'rgba(0,0,0,.3)'; ellipse(c, B.x, B.y + 4, 40 * Math.max(0.5, 1 - B.z / 80), 13);
  if (B.hurt > 0 || (B.state === 'dying' && Math.floor(time * 20) % 2)) c.globalAlpha = 0.55;
  withBase(c, B.x + ox, B.y + 10 - B.z, sx, sy, rot, () => sprB(c, 'cyclops', 0, 0, 5));
  c.globalAlpha = 1;
  if (B.state === 'boulders') sprB(c, 'rock_g', B.x, B.y - 82, 2.25);
  if (B.state === 'chargeWind') { c.fillStyle = '#ffe08a'; c.strokeStyle = '#2a1a00'; c.lineWidth = 3; c.font = '700 22px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.strokeText('!', B.x, B.y - 92); c.fillText('!', B.x, B.y - 92); }
  if (B.state === 'sleep') { const f = (B.anim % 2) / 2; c.globalAlpha = 1 - f; c.fillStyle = '#eef3e6'; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.fillText('z', B.x + 36 + f * 14, B.y - 80 - f * 26); c.globalAlpha = 1; }
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 86, 26);
}
function drawWizard(c, B) {
  const bob = B.z, glow = 0.25 + Math.sin(time * 4) * 0.1;
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 26 * Math.max(0.5, 1 - bob / 80), 9);
  c.globalAlpha = B.alpha;
  if (B.state !== 'dazed') { c.fillStyle = `rgba(181,140,255,${glow})`; circle(c, B.x, B.y - 34 - bob, 44); }
  if (B.state === 'orb') { const k = 1 - B.st / 0.9; c.fillStyle = `rgba(200,180,255,${0.4 + k * 0.4})`; circle(c, B.x, B.y - 84 - bob, 6 + k * 10); }
  if (B.hurt > 0 || (B.state === 'dying' && Math.floor(time * 20) % 2)) c.globalAlpha *= 0.55;
  const tilt = B.state === 'dazed' ? 0.35 : 0, ox = B.state === 'dying' ? Math.sin(time * 70) * 4 : 0;
  withBase(c, B.x + ox, B.y + 8 - bob, 1, 1, tilt, () => sprB(c, 'wizard', 0, 0, 4.5));
  c.globalAlpha = 1;
  if (B.shield > 0 || (B.state !== 'dazed' && B.state !== 'dying' && B.active && Math.sin(time * 3) > 0.9)) {
    c.strokeStyle = `rgba(200,220,255,${B.shield > 0 ? 0.9 : 0.35})`; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y - 36 - bob, 40, 48, 0, 0, Math.PI * 2); c.stroke();
  }
  if (B.state === 'sleep') { const f = (B.anim % 2) / 2; c.globalAlpha = 1 - f; c.fillStyle = '#eef3e6'; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.fillText('z', B.x + 30 + f * 14, B.y - 80 - bob - f * 26); c.globalAlpha = 1; }
  if (B.state === 'dazed') drawStars(c, B.x, B.y - 76, 22);
}
function drawChest(c, ch) {
  const open = dgs(dungeonAt(ch.x)).chests[ch.id];
  shadow(c, ch.x, ch.y + 3, 13, 4);
  sprB(c, open ? 'chest_open' : 'chest', ch.x, ch.y + 6, 2);
  if (!open && Math.sin(time * 3 + ch.x) > 0.85) { c.fillStyle = '#ffffff'; c.fillRect(ch.x + 8, ch.y - 26, 2, 6); c.fillRect(ch.x + 6, ch.y - 24, 6, 2); }
}
function drawMine(c) {
  const x = MINE.x, y = MINE.y;
  c.fillStyle = 'rgba(0,0,0,.25)'; ellipse(c, x, y - 2, 64, 14);
  for (const [ox, oy, sc] of [[-44, -6, 3], [44, -6, 3], [-30, -34, 3.2], [30, -34, 3.2], [0, -50, 3.4], [-54, -26, 2.4], [54, -26, 2.4]]) sprB(c, 'rock_g', x + ox, y + oy, sc);
  c.fillStyle = '#120d0b'; c.beginPath(); c.moveTo(x - 17, y - 2); c.lineTo(x - 17, y - 30); c.quadraticCurveTo(x, y - 46, x + 17, y - 30); c.lineTo(x + 17, y - 2); c.closePath(); c.fill();
  c.fillStyle = '#6b4423'; c.fillRect(x - 21, y - 36, 5, 34); c.fillRect(x + 16, y - 36, 5, 34); c.fillRect(x - 23, y - 40, 46, 6);
  c.fillStyle = '#3b2414'; c.fillRect(x - 23, y - 35, 46, 1);
  if (!S.mineOpen) { sprB(c, 'rock_g', x - 8, y + 2, 1.6); sprB(c, 'rock_g', x + 9, y + 1, 1.4); sprB(c, 'rock_g', x, y - 10, 1.5); }
  else { const g = 0.18 + Math.sin(time * 3) * 0.06; c.fillStyle = `rgba(255,170,80,${g})`; circle(c, x, y - 18, 10); }
}

function drawBoss(c, B) {
  let sx = 1, sy = 1, ox = 0;
  if (B.state === 'sleep') { const br = Math.sin(B.anim * 1.5) * 0.04; sx = 1 + br; sy = 1 - br; }
  else if (B.state === 'hop') { const k = Math.min(1, B.st / 0.72); if (k < 0.15 || k > 0.85) { sx = 1.15; sy = 0.85; } else { sx = 0.9; sy = 1.12; } }
  else if (B.state === 'summon' || B.state === 'shards') { const k = Math.sin(time * 30) * 0.05; sx = 1.1 + k; sy = 0.9 - k; ox = Math.sin(time * 50) * 2; }
  else if (B.state === 'dazed') { sx = 1.18; sy = 0.82; }
  else if (B.state === 'dying') { ox = Math.sin(time * 70) * 4; const k = 1 - Math.max(0, B.st) / 1.8; sy = 1 - k * 0.5; sx = 1 + k * 0.3; }
  else { const br = Math.sin(B.anim * 3) * 0.05; sx = 1 + br; sy = 1 - br; }
  // landing warning while the King is in the air
  if (B.state === 'hover' || B.state === 'fall' || B.state === 'rise') {
    const pulse = 0.45 + Math.sin(time * 18) * 0.3;
    c.fillStyle = `rgba(236,82,87,${pulse * 0.35})`; ellipse(c, B.x, B.y, 58, 28);
    c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 3; c.beginPath(); c.ellipse(B.x, B.y, 58, 28, 0, 0, Math.PI * 2); c.stroke();
  }
  const shr = Math.max(0.3, 1 - B.z / 400);
  c.fillStyle = 'rgba(0,0,0,.28)'; ellipse(c, B.x, B.y + 4, 46 * shr, 16 * shr);
  const w = 104 * sx, h = 104 * sy, A = ATLAS.slime, top = B.y + 14 - h - B.z;
  if (B.hurt > 0 || (B.state === 'dying' && Math.floor(time * 20) % 2)) c.globalAlpha = 0.55;
  c.drawImage(IMG.kenney_atlas, A[0], A[1], 16, 16, Math.round(B.x + ox - w / 2), Math.round(top), Math.round(w), Math.round(h));
  c.globalAlpha = 1;
  const C = ATLAS.crown; c.drawImage(IMG.kenney_atlas, C[0], C[1] + 8, 16, 8, Math.round(B.x + ox - 24), Math.round(top - 14 + h * 0.06), 48, 24);
  if (B.state === 'sleep') { const f = (B.anim % 2) / 2; c.globalAlpha = 1 - f; c.fillStyle = '#eef3e6'; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.fillText('z', B.x + 40 + f * 14, top - f * 26); c.globalAlpha = 1; }
  if (B.state === 'dazed') drawStars(c, B.x, top - 4, 30);
}
function drawRing(c, B) {
  const R = B.ring; if (!R) return;
  const k = R.r / R.max;
  c.strokeStyle = `rgba(255,255,255,${0.9 - k * 0.6})`; c.lineWidth = 6; c.beginPath(); c.ellipse(R.x, R.y, R.r, R.r * 0.6, 0, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = `rgba(165,147,255,${0.8 - k * 0.6})`; c.lineWidth = 12; c.beginPath(); c.ellipse(R.x, R.y, R.r - 8, (R.r - 8) * 0.6, 0, 0, Math.PI * 2); c.stroke();
}
function drawSlime(c, e) {
  const sq = Math.sin(e.hop);
  let lift = Math.max(0, sq) * 7, sx = 1 + Math.max(0, -sq) * 0.18, sy = 1 - Math.max(0, -sq) * 0.14 + Math.max(0, sq) * 0.08, ox = 0;
  if (!e.alive) { const k = 1 - Math.max(0, e.dieT) / 0.4; sx = 1 + k * 0.9; sy = Math.max(0.08, 1 - k * 0.92); lift = 0; c.globalAlpha = Math.max(0, 1 - k * 0.8); }
  else if (e.state === 'windup') { const k = 1 - e.st / 0.5; sx = 1 + k * 0.3; sy = 1 - k * 0.3; lift = 0; ox = Math.sin(time * 60) * 1.5; }
  else if (e.state === 'leap') { const k = 1 - e.st / 0.38; lift = Math.sin(Math.PI * k) * 26; sx = 0.85; sy = 1.2; }
  if (e.spawnT > 0) { const k = 1 - e.spawnT / 0.45, pop = k < 0.7 ? k / 0.7 * 1.2 : 1.2 - (k - 0.7) / 0.3 * 0.2; sx *= pop; sy *= pop; }
  shadow(c, e.x, e.y + 2, Math.max(4, 13 - lift * 0.3), 4);
  const base = ENEMY[e.kind].small ? 26 : 40, w = base * sx, h = base * sy, a = ATLAS[ENEMY[e.kind].sprite];
  if (e.hurt > 0) c.globalAlpha = 0.5;
  c.drawImage(IMG.kenney_atlas, a[0], a[1], 16, 16, Math.round(e.x + ox - w / 2), Math.round(e.y + 6 - h - lift), Math.round(w), Math.round(h));
  c.globalAlpha = 1;
  if (!e.alive) return;
  if (e.state === 'windup') { c.fillStyle = '#ffe08a'; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.fillText('!', e.x, e.y - 44); }
  if (e.hp < e.max && !ENEMY[e.kind].small) healthBar(c, e.x, e.y - 38 - lift, e.hp / e.max);
}
function healthBar(c, x, y, f) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 13, y, 26, 5); c.fillStyle = '#ec5257'; c.fillRect(x - 12, y + 1, 24 * f, 3); }
const ARMOR_SHEET = { hero_walk: 'walk', hero_idle: 'idle', hero_run: 'run', hero_sit: 'sit', hero_emote: 'emote', hero_jump: 'jump', hero_combat_idle: 'combat_idle',
  hero_thrust: 'thrust', hero_spellcast: 'spellcast', hero_hurt: 'hurt', hero_sword: 'slash', hero_axe: 'slash', hero_pick: 'slash', hero_backslash: 'backslash' };
const armorCache = {};
// recolor the plate-armor overlay into each armor's palette, once per sheet
function armorSheet(armor, anim) {
  const key = armor + ':' + anim; if (armorCache[key]) return armorCache[key];
  const src = IMG['arm_' + anim], tint = ARMORS[armor].tint; if (!src || !tint) return null;
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d'); g.drawImage(src, 0, 0);
  const id = g.getImageData(0, 0, cv.width, cv.height), d = id.data, pal = tint.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    if (l < 0.12) continue; // keep the dark outline
    const t = Math.min(1, Math.max(0, (l - 0.15) / 0.75)), a = t < 0.5 ? pal[0] : pal[1], b = t < 0.5 ? pal[1] : pal[2], u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    d[i] = a[0] + (b[0] - a[0]) * u; d[i + 1] = a[1] + (b[1] - a[1]) * u; d[i + 2] = a[2] + (b[2] - a[2]) * u;
  }
  g.putImageData(id, 0, 0); return (armorCache[key] = cv);
}
function drawLPC(c, sheet, frame, row, x, y, size) {
  const img = IMG[sheet]; if (!img) return;
  const ox = size === 128 ? 64 : 32, oy = size === 128 ? 94 : 62;
  c.drawImage(img, frame * size, row * size, size, size, Math.round(x - ox), Math.round(y - oy), size, size);
  if (ARMOR_SHEET[sheet] && S.gear.armor !== 'cloth') {
    const ov = armorSheet(S.gear.armor, ARMOR_SHEET[sheet]);
    if (ov) c.drawImage(ov, frame * size, row * size, size, size, Math.round(x - ox), Math.round(y - oy), size, size);
  }
}
const enemyNear = r => enemies.some(e => e.alive && Math.hypot(e.x - P.x, e.y - P.y) < r);
function drawPlayer(c) {
  if (P.inv > 0 && !(P.act && P.act.kind === 'faint') && Math.floor(time * 20) % 2 === 0) return;
  for (const g of P.trail) { c.globalAlpha = g.life * 2.2; drawLPC(c, 'hero_jump', g.frame, g.row, g.x, g.y, 64); }
  c.globalAlpha = 1;
  shadow(c, P.x, P.y + 1, 11, 4);
  if (P.hex > 0) { for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; c.fillStyle = '#b58cff'; circle(c, P.x + Math.cos(a) * 14, P.y - 62 + Math.sin(a) * 5, 3); } }
  if (P.slow > 0) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { const a = i * 0.8 + 0.3; c.beginPath(); c.moveTo(P.x - Math.cos(a) * 16, P.y - 20 - Math.sin(a) * 16); c.lineTo(P.x + Math.cos(a) * 16, P.y - 20 + Math.sin(a) * 16); c.stroke(); } }
  if (P.held && P.charge > 0.15 && !P.act) {
    const f = Math.min(1, (P.charge - 0.15) / 0.45), full = f >= 1;
    c.strokeStyle = full ? `rgba(255,224,138,${0.6 + Math.sin(time * 20) * 0.3})` : 'rgba(255,255,255,.55)'; c.lineWidth = full ? 3 : 2;
    c.beginPath(); c.ellipse(P.x, P.y, 22, 9, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.stroke();
  }
  const row = dirRow(P.fx, P.fy);
  if (P.act) {
    const A = P.act, i = Math.min(A.frames.length - 1, Math.floor(A.t / A.dur * A.frames.length));
    drawLPC(c, A.sheet, A.frames[i], A.rows ? A.rows[i] : A.oneRow ? 0 : row, P.x, P.y, A.size);
    if (!A.special && ['sword', 'backslash'].includes(A.kind) && S.gear.weapon !== 'wood' && Math.abs(A.t - A.hitAt) < 0.09) {
      const base = Math.atan2(P.fy, P.fx), k = 1 - Math.abs(A.t - A.hitAt) / 0.09, R = gearW().heavy ? 44 : 34;
      c.strokeStyle = gearW().col; c.globalAlpha = k * 0.75; c.lineWidth = gearW().heavy ? 8 : 5; c.lineCap = 'round';
      c.beginPath(); c.arc(P.x, P.y - 22, R, base - 1.1, base + 1.1); c.stroke(); c.lineCap = 'butt'; c.globalAlpha = 1;
    }
    if (A.special && A.kind !== 'spin' && Math.abs(A.t - A.hitAt) < 0.1) {
      const base = Math.atan2(P.fy, P.fx), k = 1 - Math.abs(A.t - A.hitAt) / 0.1;
      c.strokeStyle = `rgba(255,224,138,${k})`; c.lineWidth = 7; c.lineCap = 'round';
      c.beginPath(); c.arc(P.x, P.y - 22, 36, base - 1.2, base + 1.2); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${k})`; c.lineWidth = 2.5; c.beginPath(); c.arc(P.x, P.y - 22, 36, base - 1.0, base + 1.0); c.stroke(); c.lineCap = 'butt';
    }
    if (A.kind === 'spin') {
      const k = Math.max(0, 1 - A.t / A.dur), rad = 30 + A.t * 90;
      c.strokeStyle = `rgba(255,224,138,${k})`; c.lineWidth = 5;
      c.beginPath(); c.ellipse(P.x, P.y - 12, rad, rad * 0.55, 0, 0, Math.PI * 2); c.stroke();
    }
  } else if (P.dash) {
    const k = Math.min(1, P.dash.t / P.dash.dur);
    drawLPC(c, 'hero_jump', Math.min(4, Math.floor(k * 5)), row, P.x, P.y - Math.sin(Math.PI * k) * 14, 64);
  }
  else if (P.moving && P.running) drawLPC(c, 'hero_run', Math.floor(P.walkDist / 9) % 8, row, P.x, P.y, 64);
  else if (P.moving) drawLPC(c, 'hero_walk', 1 + Math.floor(P.walkDist / 7) % 8, row, P.x, P.y, 64);
  else if (P.idleT > 7) drawLPC(c, 'hero_sit', P.idleT < 7.25 ? 0 : 1, row, P.x, P.y, 64);
  else if (enemyNear(150)) drawLPC(c, 'hero_combat_idle', Math.floor(time * 3) % 2, row, P.x, P.y, 64);
  else drawLPC(c, 'hero_idle', Math.floor(time * 1.6) % 2, row, P.x, P.y, 64);
}
function drawHouse(c, h) {
  const x0 = h.x - 48, y0 = h.y - 96;
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x0 + 4, h.y - 4, 96, 8);
  const rows = h.style === 'red' || h.style === 'sand' && false ? [['roof_l', 'roof_m', 'roof_r'], ['roof2_l', 'roof2_m', 'roof2_r'], ['wall_l', 'door', 'wall_r']]
    : [['roofB_l', 'roofB_m', 'roofB_r'], ['roofB2_l', 'roofB2_m', 'roofB2_r'], ['wallS_l', 'doorS', 'wallS_r']];
  rows.forEach((row, j) => row.forEach((k, i) => spr(c, k, x0 + i * 32, y0 + j * 32)));
  if (h.style === 'sand') { c.fillStyle = 'rgba(240,180,100,.35)'; c.fillRect(x0, y0, 96, 64); }
  if (h.style === 'snow') {
    c.fillStyle = 'rgba(244,249,255,.9)'; c.fillRect(x0 + 2, y0 + 2, 92, 12);
    for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(x0 + 6 + i * 16, y0 + 14); c.lineTo(x0 + 10 + i * 16, y0 + 22 + (i % 2) * 6); c.lineTo(x0 + 14 + i * 16, y0 + 14); c.fill(); }
    c.fillStyle = 'rgba(244,249,255,.75)'; c.fillRect(x0 + 2, y0 + 34, 92, 6);
  }
  if (h.interior) { const g = 0.12 + Math.sin(time * 2 + h.x) * 0.04; c.fillStyle = `rgba(255,200,120,${g})`; c.fillRect(h.x - 12, h.y - 30, 24, 28); }
}
function drawInteriorTile(c, x, y, I) {
  const t = tileAt(x, y), px = x * T, py = y * T, lx = x - I.x0, ly = y - 46, h = hash(x, y);
  c.fillStyle = '#0d0907'; c.fillRect(px, py, T, T);
  if (t === FLOOR || t === MAT) {
    if (I.style === 'stone') {
      c.fillStyle = '#8c877d'; c.fillRect(px, py, T, T); c.fillStyle = '#77726a'; c.fillRect(px, py + 15, T, 2); c.fillRect(px + ((y % 2) ? 15 : 0), py, 2, 15); c.fillRect(px + ((y % 2) ? 0 : 15), py + 17, 2, 15);
      c.fillStyle = `rgba(255,255,255,${h * 0.06})`; c.fillRect(px, py, T, T);
    } else {
      c.fillStyle = I.style === 'snow' ? '#8a6648' : '#9a6a3c'; c.fillRect(px, py, T, T);
      c.fillStyle = 'rgba(0,0,0,.22)'; for (let i = 0; i < 4; i++) c.fillRect(px, py + i * 8, T, 1);
      c.fillRect(px + Math.floor(h * 28), py + 8 * Math.floor(h * 4), 1, 8);
      c.fillStyle = 'rgba(255,230,190,.08)'; c.fillRect(px, py + 1, T, 2);
    }
    if (ly === 1) { c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(px, py, T, 8); }
    if (t === MAT) { c.fillStyle = '#5a2424'; c.fillRect(px + 2, py + 6, 28, 22); c.fillStyle = '#a94a3a'; c.fillRect(px + 4, py + 8, 24, 18); c.fillStyle = '#d9a23c'; c.fillRect(px + 4, py + 16, 24, 2); }
  } else if (ly === 0 && lx >= 1 && lx <= 10) {
    spr(c, I.style === 'stone' ? 'wallS_m' : 'wall_m', px, py);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(px, py + 26, T, 6);
  } else {
    c.fillStyle = '#2b1d14'; c.fillRect(px, py, T, T); c.fillStyle = '#3d2a1c'; c.fillRect(px + 2, py + 2, T - 4, T - 4);
  }
}
function drawBed(c, n) {
  shadow(c, n.x, n.y + 4, 20, 6);
  c.fillStyle = '#5a3a22'; c.fillRect(n.x - 18, n.y - 44, 36, 50);
  c.fillStyle = '#f2ecdf'; c.fillRect(n.x - 15, n.y - 41, 30, 12);
  c.fillStyle = n.col || '#c2477a'; c.fillRect(n.x - 15, n.y - 27, 30, 30); c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(n.x - 15, n.y - 27, 30, 4);
}
function drawSign(c, n) { shadow(c, n.x, n.y + 3, 10, 3); sprB(c, 'sign', n.x, n.y + 6, 2); }
function drawPot(c, r) {
  const s = r.shake ? Math.sin(time * 70) * 1.5 : 0, x = r.x + s, y = r.y;
  shadow(c, r.x, y + 3, 10, 4);
  c.fillStyle = '#5a2e1a'; ellipse(c, x, y - 8, 11, 11); c.fillStyle = '#b5652f'; ellipse(c, x, y - 8, 9.5, 9.5);
  c.fillStyle = '#8a4a24'; c.fillRect(x - 6, y - 21, 12, 5); c.fillStyle = '#5a2e1a'; c.fillRect(x - 7, y - 23, 14, 3);
  c.fillStyle = 'rgba(255,220,180,.35)'; ellipse(c, x - 4, y - 11, 2.5, 4); c.fillStyle = '#d9a23c'; c.fillRect(x - 9, y - 9, 18, 2);
}
function drawProp(c, o) {
  const x = o.x, y = o.y;
  switch (o.prop) {
    case 'window': c.fillStyle = '#3b2414'; c.fillRect(x - 13, y - 13, 26, 22); c.fillStyle = '#9fd3ee'; c.fillRect(x - 10, y - 10, 20, 16); c.fillStyle = '#3b2414'; c.fillRect(x - 1, y - 10, 2, 16); c.fillRect(x - 10, y - 3, 20, 2); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x - 8, y - 8, 4, 4); break;
    case 'hearth': {
      c.fillStyle = '#6c6764'; c.fillRect(x - 26, y - 46, 52, 48); c.fillStyle = '#8c877d'; c.fillRect(x - 30, y - 50, 60, 8);
      c.fillStyle = '#1a1210'; c.fillRect(x - 15, y - 30, 30, 30);
      for (let i = 0; i < 3; i++) { const f = Math.sin(time * 12 + i * 2) * 2; c.fillStyle = ['#ec5257', '#ffb347', '#fff2c4'][i]; c.beginPath(); c.moveTo(x - 10 + i * 3, y - 2); c.quadraticCurveTo(x + f, y - 24 + i * 5, x + 10 - i * 3, y - 2); c.closePath(); c.fill(); }
      const g = 0.12 + Math.sin(time * 8) * 0.03; c.fillStyle = `rgba(255,170,80,${g})`; circle(c, x, y + 10, 56); break;
    }
    case 'rug': c.fillStyle = '#6b2a3a'; c.fillRect(x - (o.long ? 34 : 44), y - (o.long ? 60 : 30), o.long ? 68 : 88, o.long ? 120 : 52); c.fillStyle = '#a3485a'; c.fillRect(x - (o.long ? 30 : 40), y - (o.long ? 56 : 26), o.long ? 60 : 80, o.long ? 112 : 44); c.fillStyle = '#d9a23c'; c.fillRect(x - (o.long ? 30 : 40), y - 2, o.long ? 60 : 80, 2); break;
    case 'altar': c.fillStyle = '#c9c4b8'; c.fillRect(x - 30, y - 30, 60, 30); c.fillStyle = '#e6e0d0'; c.fillRect(x - 34, y - 34, 68, 8); c.fillStyle = '#d9a23c'; c.fillRect(x - 3, y - 58, 6, 24); c.fillRect(x - 11, y - 50, 22, 5); break;
    case 'candles': for (const d of [-6, 0, 6]) { c.fillStyle = '#f2ecdf'; c.fillRect(x + d - 2, y - 16 + Math.abs(d), 4, 14 - Math.abs(d)); c.fillStyle = Math.sin(time * 14 + d) > 0 ? '#ffb347' : '#fff2c4'; circle(c, x + d, y - 19 + Math.abs(d), 2.5); } break;
    case 'pew': c.fillStyle = '#5a3a22'; c.fillRect(x - 40, y - 22, 80, 8); c.fillStyle = '#7a4b27'; c.fillRect(x - 40, y - 14, 80, 12); c.fillStyle = '#3b2414'; c.fillRect(x - 38, y - 2, 6, 6); c.fillRect(x + 32, y - 2, 6, 6); break;
    case 'counter': c.fillStyle = '#5a3a22'; c.fillRect(x - 70, y - 24, 140, 26); c.fillStyle = '#a8713f'; c.fillRect(x - 74, y - 30, 148, 8); sprB(c, 'potion', x - 40, y - 28, 1.5); sprB(c, 'coin', x + 10, y - 28, 1.2); sprB(c, 'crystal', x + 44, y - 28, 1.4); break;
    case 'rack': c.fillStyle = '#5a3a22'; c.fillRect(x - 16, y - 50, 4, 50); c.fillRect(x + 12, y - 50, 4, 50); c.fillRect(x - 18, y - 44, 36, 4); sprB(c, 'sword', x - 6, y - 4, 2); sprB(c, 'axe', x + 6, y - 8, 1.6); break;
    case 'lamp': {
      shadow(c, x, y + 2, 6, 2); c.fillStyle = '#2b2735'; c.fillRect(x - 2, y - 46, 4, 46); c.fillRect(x - 6, y - 2, 12, 4);
      c.fillStyle = '#3b3a44'; c.fillRect(x - 7, y - 58, 14, 14); c.fillStyle = '#ffe08a'; c.fillRect(x - 5, y - 56, 10, 10);
      c.fillStyle = `rgba(255,224,138,${0.18 + Math.sin(time * 3 + x) * 0.05})`; circle(c, x, y - 51, 20); break;
    }
    case 'well': {
      shadow(c, x, y + 4, 26, 7); c.fillStyle = '#6c6764'; ellipse(c, x, y - 8, 24, 13); c.fillStyle = '#8c877d'; ellipse(c, x, y - 12, 24, 12); c.fillStyle = '#1d4e6b'; ellipse(c, x, y - 12, 17, 8);
      c.fillStyle = '#5a3a22'; c.fillRect(x - 24, y - 50, 4, 40); c.fillRect(x + 20, y - 50, 4, 40); c.fillStyle = '#a8442f'; c.beginPath(); c.moveTo(x - 30, y - 46); c.lineTo(x, y - 64); c.lineTo(x + 30, y - 46); c.closePath(); c.fill();
      c.fillStyle = '#3b2414'; c.fillRect(x - 1, y - 46, 2, 22); c.fillStyle = '#7a4b27'; c.fillRect(x - 4, y - 26, 8, 6); break;
    }
    case 'hay': shadow(c, x, y + 3, 16, 5); c.fillStyle = '#c99a3c'; c.fillRect(x - 15, y - 20, 30, 22); c.fillStyle = '#e8c060'; c.fillRect(x - 15, y - 20, 30, 5); c.fillStyle = '#8a6420'; c.fillRect(x - 15, y - 9, 30, 2); break;
    case 'scarecrow': c.fillStyle = '#5a3a22'; c.fillRect(x - 2, y - 44, 4, 46); c.fillRect(x - 20, y - 34, 40, 4); c.fillStyle = '#c2477a'; c.fillRect(x - 10, y - 34, 20, 18); c.fillStyle = '#e8c060'; circle(c, x, y - 44, 8); c.fillStyle = '#7a4b27'; c.fillRect(x - 12, y - 54, 24, 4); c.fillRect(x - 7, y - 60, 14, 6); break;
    case 'flowers': for (let i = 0; i < 7; i++) { const a = i * 2.4, r = 6 + (i % 3) * 7; c.fillStyle = '#3d8448'; c.fillRect(x + Math.cos(a) * r - 1, y + Math.sin(a) * r * 0.6 - 4, 2, 6); c.fillStyle = ['#f28fb4', '#ffd65a', '#ffffff', '#b58cff'][i % 4]; circle(c, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6 - 5, 3); } break;
    case 'logs': shadow(c, x, y + 3, 22, 6); for (const [ox, oy] of [[-12, 0], [12, 0], [0, -12]]) { c.fillStyle = '#6b4423'; c.fillRect(x + ox - 14, y + oy - 10, 28, 12); c.fillStyle = '#c99a63'; ellipse(c, x + ox + 13, y + oy - 4, 4, 6); } if (inDungeon(x)) { c.fillStyle = 'rgba(242,248,255,.85)'; c.fillRect(x - 26, y - 25, 52, 4); } break;
    case 'net': c.fillStyle = '#5a3a22'; c.fillRect(x - 24, y - 40, 4, 42); c.fillRect(x + 20, y - 40, 4, 42); c.fillRect(x - 24, y - 40, 48, 3); c.strokeStyle = 'rgba(230,220,190,.8)'; c.lineWidth = 1; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(x - 20 + i * 8, y - 37); c.lineTo(x - 20 + i * 8, y - 6); c.stroke(); c.beginPath(); c.moveTo(x - 20, y - 34 + i * 5); c.lineTo(x + 20, y - 34 + i * 5); c.stroke(); } break;
    case 'cactus': {
      shadow(c, x, y + 3, 10, 4); const hgt = [34, 44, 28][o.v || 0];
      c.fillStyle = '#2f6b3a'; c.fillRect(x - 7, y - hgt, 14, hgt); circle(c, x, y - hgt, 7);
      if ((o.v || 0) !== 2) { c.fillRect(x - 17, y - hgt + 12, 10, 6); c.fillRect(x - 17, y - hgt + 2, 6, 14); circle(c, x - 14, y - hgt + 2, 3); c.fillRect(x + 7, y - hgt + 18, 10, 6); c.fillRect(x + 11, y - hgt + 8, 6, 14); circle(c, x + 14, y - hgt + 8, 3); }
      c.fillStyle = '#4f9a4a'; c.fillRect(x - 3, y - hgt, 3, hgt - 2);
      c.fillStyle = '#f28fb4'; if ((o.v || 0) === 1) circle(c, x, y - hgt - 6, 3.5);
      break;
    }
    case 'stall': {
      shadow(c, x, y + 3, 34, 7); c.fillStyle = '#6b4423'; c.fillRect(x - 34, y - 52, 4, 54); c.fillRect(x + 30, y - 52, 4, 54);
      for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#f3ead2' : (o.col || '#d9a23c'); c.fillRect(x - 38 + i * 11, y - 60, 11, 14); }
      c.fillStyle = '#8a5a32'; c.fillRect(x - 32, y - 16, 64, 16); c.fillStyle = '#a8713f'; c.fillRect(x - 34, y - 20, 68, 6);
      sprB(c, o.goods || 'herb_b', x - 16, y - 18, 1.4); sprB(c, 'potion', x, y - 18, 1.2); sprB(c, 'coin', x + 16, y - 18, 1.1);
      break;
    }
    case 'ruin': shadow(c, x, y + 3, 14, 5); c.fillStyle = '#b8a888'; c.fillRect(x - 11, y - (o.h || 40), 22, o.h || 40); c.fillStyle = '#d6c8a6'; c.fillRect(x - 14, y - (o.h || 40) - 6, 28, 8); c.fillStyle = 'rgba(90,70,40,.35)'; c.fillRect(x - 3, y - (o.h || 40) + 6, 2, (o.h || 40) - 10); break;
    case 'raft': shadow(c, x, y + 4, 28, 6); for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#7a5a34' : '#5a4024'; c.fillRect(x - 26, y - 16 + i * 5, 52, 5); } c.fillStyle = '#3b2414'; c.fillRect(x - 20, y - 18, 3, 26); c.fillRect(x + 17, y - 18, 3, 26); c.fillStyle = '#5a4024'; c.fillRect(x + 10, y - 40, 3, 30); break;
    case 'boat': shadow(c, x, y + 4, 34, 7); c.fillStyle = '#5a3a22'; c.beginPath(); c.moveTo(x - 36, y - 14); c.lineTo(x + 36, y - 14); c.lineTo(x + 26, y); c.lineTo(x - 26, y); c.closePath(); c.fill(); c.fillStyle = '#8a5a32'; c.fillRect(x - 32, y - 14, 64, 4); c.fillStyle = '#3b2414'; c.fillRect(x - 4, y - 14, 8, 10); break;
  }
}

function drawNPC(c, n) {
  const near = Math.hypot(n.x - P.x, n.y - P.y) < 50;
  if (n.boat) { if (n.id.startsWith('beam_')) drawMoonbeam(c, n.x, n.y, n.id === 'beam_home'); else if (n.id.startsWith('cogpad')) drawBigPad(c, n.x, n.y); else if (n.id.startsWith('bell_')) drawDivingBell(c, n.x, n.y, n.id === 'bell_home'); else if (n.id.startsWith('pass_')) drawPass(c, n.x, n.y, n.id === 'pass_home'); else if (n.id.startsWith('turtle')) drawTurtle(c, n.x, n.y, n.id === 'turtle_home'); else if (n.id.startsWith('cart_')) drawCart(c, n.x, n.y); else if (n.id.startsWith('lift')) drawLift(c, n.x, n.y); else if (n.id.startsWith('gate')) drawSpiritGate(c, n.x, n.y, n.id === 'gate_home'); else if (n.id.startsWith('thermal')) drawThermal(c, n.x, n.y, n.id === 'thermal_home'); else if (n.id.startsWith('balloon')) drawBalloon(c, n.x, n.y); else drawProp(c, { prop: n.id.startsWith('raft') ? 'raft' : 'boat', x: n.x, y: n.y }); if (near) { c.font = '600 11px "Atkinson Hyperlegible", sans-serif'; c.textAlign = 'center'; const w = c.measureText(n.name).width + 10; c.fillStyle = 'rgba(18,35,42,.85)'; c.fillRect(n.x - w / 2, n.y + 6, w, 15); c.fillStyle = '#eef3e6'; c.fillText(n.name, n.x, n.y + 17); } return; }
  if (n.bed) { drawBed(c, n); if (near) { c.font = '600 11px "Atkinson Hyperlegible", sans-serif'; c.textAlign = 'center'; const w = c.measureText('Bed').width + 10; c.fillStyle = 'rgba(18,35,42,.85)'; c.fillRect(n.x - w / 2, n.y + 6, w, 15); c.fillStyle = '#eef3e6'; c.fillText('Bed', n.x, n.y + 17); } return; }
  if (n.sign) { drawSign(c, n); if (near) { c.font = '600 11px "Atkinson Hyperlegible", sans-serif'; c.textAlign = 'center'; const w = c.measureText(n.name).width + 10; c.fillStyle = 'rgba(18,35,42,.85)'; c.fillRect(n.x - w / 2, n.y + 6, w, 15); c.fillStyle = '#eef3e6'; c.fillText(n.name, n.x, n.y + 17); } return; }
  if (n.bench) {
    shadow(c, n.x, n.y + 4, 24, 6);
    c.fillStyle = '#3b2414'; c.fillRect(n.x - 25, n.y - 17, 50, 11);
    c.fillStyle = '#6b4423'; c.fillRect(n.x - 19, n.y - 8, 5, 12); c.fillRect(n.x + 14, n.y - 8, 5, 12);
    c.fillStyle = '#a8713f'; c.fillRect(n.x - 24, n.y - 16, 48, 8); c.fillStyle = '#c48a52'; c.fillRect(n.x - 24, n.y - 16, 48, 2);
    sprB(c, 'pickaxe', n.x - 10, n.y - 13, 1.25); sprB(c, 'axe', n.x + 10, n.y - 13, 1.25);
  } else {
    shadow(c, n.x, n.y + 1, 11, 4);
    if (n.moving) drawLPC(c, n.walk, 1 + Math.floor(n.step / 7) % 8, dirRow(n.fx, n.fy), n.x, n.y, 64);
    else drawLPC(c, n.sheet, Math.floor(time * 1.4) % 2, near ? dirRow(P.x - n.x, P.y - n.y) : dirRow(n.fx, n.fy), n.x, n.y, 64);
  }
  const qm = questMark(n.id);
  if (qm) { const b = Math.sin(time * 5) * 2; c.fillStyle = qm === '?' ? '#7fe07a' : '#f4b740'; c.strokeStyle = '#2a1a00'; c.lineWidth = 3; c.font = '700 22px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.strokeText(qm, n.x, n.y - 62 + b); c.fillText(qm, n.x, n.y - 62 + b); }
  const alert = !qm && ((n.id === 'oma' && !S.met.oma) || (n.id === 'tobin' && ((!S.met.tobin && !S.bridge) || (S.gold >= GOAL && !S.bridge))));
  if (alert) { const b = Math.sin(time * 5) * 2; c.fillStyle = '#f4b740'; c.strokeStyle = '#2a1a00'; c.lineWidth = 3; c.font = '700 20px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.strokeText('!', n.x, n.y - 62 + b); c.fillText('!', n.x, n.y - 62 + b); }
  if (near) { c.font = '600 11px "Atkinson Hyperlegible", sans-serif'; c.textAlign = 'center'; const w = c.measureText(n.name).width + 10; c.fillStyle = 'rgba(18,35,42,.85)'; c.fillRect(n.x - w / 2, n.y + 6, w, 15); c.fillStyle = '#eef3e6'; c.fillText(n.name, n.x, n.y + 17); }
}
function drawAnimal(c, a) {
  const b = (a.vx || a.vy) ? Math.abs(Math.sin(a.hop)) * 2 : 0, s = 2, k = ATLAS[a.key];
  shadow(c, a.x, a.y + 1, 10, 3);
  c.save(); c.translate(Math.round(a.x), Math.round(a.y - b));
  if (a.flip) c.scale(-1, 1);
  c.drawImage(IMG.kenney_atlas, k[0], k[1], 16, 16, -8 * s, -16 * s + 4, 16 * s, 16 * s);
  c.restore();
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = interiorAt(P.x, P.y) ? '#0d0907' : inDungeon(P.x) && !dungeonAt(P.x).outdoor ? '#0b0910' : '#5ec6e8'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  const viewW = vw / Z, viewH = vh / Z;
  // during the boss fight, frame both the hero and the King
  const AB = activeBoss();
  if (AB) { camFocus.x += (P.x * 0.6 + AB.x * 0.4 - camFocus.x) * 0.08; camFocus.y += (P.y * 0.6 + (AB.y - 40) * 0.4 - camFocus.y) * 0.08; }
  else { camFocus.x += (P.x - camFocus.x) * 0.2; camFocus.y += (P.y - camFocus.y) * 0.2; if (Math.hypot(P.x - camFocus.x, P.y - camFocus.y) > 300) { camFocus.x = P.x; camFocus.y = P.y; } }
  const IN = interiorAt(P.x, P.y), CD = IN ? null : dungeonAt(P.x), inD = !!CD, bx0 = IN ? IN.x0 * T : inD ? CD.x0 * T : 0, bw = IN ? 12 * T : (inD ? DW : OW) * T, bh = IN ? 9 * T : (inD ? 44 : H) * T, by0 = IN ? 46 * T : 0;
  let camX = bw <= viewW ? bx0 + (bw - viewW) / 2 : Math.max(bx0, Math.min(bx0 + bw - viewW, camFocus.x - viewW / 2));
  let camY = bh <= viewH ? by0 + (bh - viewH) / 2 : Math.max(by0, Math.min(by0 + bh - viewH, camFocus.y - 20 - viewH / 2));
  if (shake) { camX += (Math.random() - 0.5) * shake; camY += (Math.random() - 0.5) * shake; }
  const k = dpr * Z;
  ctx.setTransform(k, 0, 0, k, -Math.round(camX * k), -Math.round(camY * k));
  if (IN) { ctx.save(); ctx.beginPath(); ctx.rect(IN.x0 * T, 46 * T, 12 * T, 9 * T); ctx.clip(); }
  ctx.imageSmoothingEnabled = false;
  const sx = Math.max(0, Math.floor(camX)), sy = Math.max(0, Math.floor(camY));
  const sw = Math.min(W * T - sx, Math.ceil(viewW) + 2), sh = Math.min(H * T - sy, Math.ceil(viewH) + 2);
  if (sw > 0 && sh > 0) for (let i = Math.floor(sx / CW); i <= Math.min(NCH - 1, Math.floor((sx + sw) / CW)); i++) {
    const a0 = Math.max(sx, i * CW), a1 = Math.min(sx + sw, (i + 1) * CW);
    if (a1 > a0) ctx.drawImage(chunks[i].cv, a0 - i * CW, sy, a1 - a0, sh, a0, sy, a1 - a0, sh);
  }
  // gentle water sparkle
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let ty = Math.floor(camY / T); ty < (camY + viewH) / T; ty++) for (let tx = Math.floor(camX / T); tx < (camX + viewW) / T; tx++) {
    if (tileAt(tx, ty) !== DEEP || tx >= OW || hash(tx, ty) < 0.8) continue;
    const ph = (time * 0.8 + hash(ty, tx) * 6) % 3; if (ph > 1) continue;
    ctx.fillRect(tx * T + 6 + hash(tx + 1, ty) * 18, ty * T + 8 + hash(tx, ty + 1) * 14, 6 * (1 - Math.abs(ph - 0.5) * 2) + 2, 2);
  }
  viewRect = { x: camX, y: camY, w: viewW, h: viewH };
  const inViewT = (x, y, m = 70) => x > camX - m && x < camX + viewW + m && y > camY - m && y < camY + viewH + m * 1.5;
  if (CD === TOMB_D) drawTraps(ctx, inViewT);
  if (CD === CINDER_D || CD === FORGE_D) drawCinderGround(ctx, camX, camY, viewW, viewH, inViewT);
  if (CD === CAVE_D || CD === VAULT_D) drawRails(ctx, inViewT);
  if (CD === COG_D || CD === TOWER_D) drawTelepads(ctx, inViewT);
  if (CD === SERP_D) drawDartTraps(ctx);
  if (CD === VALE_D || CD === SHRINE_D) drawLilyWobble(ctx);
  if (CD === REEF_D || CD === PALACE_D) drawAirVents(ctx, inViewT);
  if (CD === SKY_D || CD === SPIRE_D || CD === TOWER_D) drawSkyOverlay(ctx, camX, camY, viewW, viewH, CD === SKY_D);
  const inView = (x, y, m = 70) => x > camX - m && x < camX + viewW + m && y > camY - m && y < camY + viewH + m * 1.5;
  for (const p of pickups) {
    if (!inView(p.x, p.y)) continue;
    const b = Math.sin(time * 6 + p.t * 3) * 2, spin = p.item === 'gold' ? Math.max(0.15, Math.abs(Math.cos(time * 5 + p.x))) : 1;
    shadow(ctx, p.x, p.y + 8, 6, 2);
    ctx.drawImage(ICON_CANVAS[p.item], Math.round(p.x - 10 * spin), Math.round(p.y - 10 + b), Math.round(20 * spin), 20);
  }
  const list = [];
  for (const d of decor) if (inView(d.x, d.y)) { if (d.prop === 'rug' || d.prop === 'flowers' || d.wall) { if (d.prop === 'rug' || d.prop === 'flowers') drawProp(ctx, d); else list.push([d.y - 200, 5, d]); } else list.push([d.y, 5, d]); }
  for (const r of resources) if ((r.alive || (r.type !== 'herb' && r.type !== 'pot' && r.type !== 'crate' && r.type !== 'vine' && r.type !== 'tallgrass')) && inView(r.x, r.y)) list.push([r.y, 0, r]);
  for (const e of enemies) if ((e.alive || e.dieT > 0) && inView(e.x, e.y)) list.push([e.y, 1, e]);
  for (const n of NPCS) if (inView(n.x, n.y)) list.push([n.y, 2, n]);
  for (const a of animals) if (inView(a.x, a.y)) list.push([a.y, 6, a]);
  for (const h of HOUSES) if (inView(h.x, h.y, 150)) list.push([h.y - 4, 4, h]);
  for (const B of BOSSES) if ((!S.defeated[B.type] || B.state === 'dying') && inView(B.x, B.y, 220)) { list.push([B.y, 7, B]); drawRing(ctx, B); }
  for (const D of DUNGEONS) {
    for (const ch of D.chests) if (inView(ch.x, ch.y)) list.push([ch.y, 8, ch]);
    for (const sw of D.switches) if (inView(sw.x, sw.y)) list.push([sw.y, 10, sw]);
    if (D.entrance && inView(D.entrance.x, D.entrance.y, 120)) list.push([D.entrance.y - 6, 9, D]);
  }
  list.push([P.y, 3, P]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, kind, o] of list) {
    if (kind === 0) drawRes(ctx, o);
    else if (kind === 1) drawEnemy(ctx, o);
    else if (kind === 7) drawBossAny(ctx, o);
    else if (kind === 8) drawChest(ctx, o);
    else if (kind === 9) (o.id === 'mine' ? drawMine : o.id === 'temple' ? drawTempleGate : o.id === 'tomb' ? drawPyramid : o.id === 'hollow' ? drawHollowTree : o.id === 'forge' ? drawForgeGate : o.id === 'spire' ? drawSpireGate : o.id === 'ossuary' ? drawOssGate : o.id === 'vault' ? drawVaultGate : o.id === 'serpent' ? drawSerpentTemple : o.id === 'shrine' ? drawShrineGate : o.id === 'palace' ? drawPalaceGate : o.id === 'tower' ? drawClockTower : drawCryptDoor)(ctx);
    else if (kind === 10) (dungeonAt(o.x) === OSS_D ? drawBrazier : dungeonAt(o.x) === SHRINE_D ? drawBell : dungeonAt(o.x) === PALACE_D ? drawClam : dungeonAt(o.x) === TOWER_D ? drawLever : drawSwitch)(ctx, o, !!dgs(dungeonAt(o.x)).switches[o.id]);
    else if (kind === 2) drawNPC(ctx, o);
    else if (kind === 3) { if (P.ride) drawCart(ctx, P.x, P.y + 6); drawPlayer(ctx); if (P.ride) drawCartFront(ctx, P.x, P.y + 6); }
    else if (kind === 4) drawHouse(ctx, o);
    else if (kind === 5 && o.prop) { if (o.prop === 'rug') continue; drawProp(ctx, o); }
    else if (kind === 5 && o.bigshroom) drawBigShroom(ctx, o);
    else if (kind === 5 && o.forge) drawForge(ctx, o);
    else if (kind === 5 && o.windmill) drawWindmill(ctx, o);
    else if (kind === 5 && o.lantern) drawLantern(ctx, o.lantern);
    else if (kind === 5 && o.steampipe) drawSteamPipe(ctx, o);
    else if (kind === 5 && o.telescope) drawTelescope(ctx, o);
    else if (kind === 5 && o.crater) drawCrater(ctx, o);
    else if (kind === 5 && o.biggear) drawBigGear(ctx, o);
    else if (kind === 5 && o.templeIdol) drawTempleIdol(ctx, o);
    else if (kind === 5 && o.stonelantern) drawStoneLantern(ctx, o);
    else if (kind === 5 && o.arch) drawBlossomArch(ctx, o);
    else if (kind === 5 && o.glowcap) drawGlowcap(ctx, o);
    else if (kind === 5 && o.grave) drawGrave(ctx, o);
    else if (kind === 5 && o.fire) drawCampfire(ctx, o);
    else if (kind === 5 && o.tent) drawTent(ctx, o);
    else if (kind === 5) { if (o.glow) { ctx.fillStyle = o.ice ? `rgba(160,225,255,${0.2 + Math.sin(time * 2 + o.x) * 0.08})` : `rgba(165,147,255,${0.2 + Math.sin(time * 2 + o.x) * 0.08})`; circle(ctx, o.x, o.y - 20, 26); } if (o.solid) shadow(ctx, o.x, o.y + 3, 12, 4); sprB(ctx, o.key, o.x, o.y + 6, o.s); }
    else drawAnimal(ctx, o);
  }
  for (const p of particles) { const z = p.size || 4; ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - z / 2), Math.round(p.y - z / 2), z, z); }
  ctx.globalAlpha = 1;
  drawProjectiles(ctx);
  drawHazards(ctx);
  if (CD === CINDER_D || CD === FORGE_D) drawVentFlames(ctx, inView);
  if (CD === REEF_D || CD === PALACE_D) drawAirBar(ctx);
  drawAmbient(ctx);
  if (inD && !CD.outdoor) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of CD.torches) { const tx = (CD.x0 + q.x) * T + 16, ty = q.y * T + 24; if (!inView(tx, ty, 120)) continue; const f = 0.13 + Math.sin(time * 9 + q.x) * 0.03 + Math.sin(time * 23 + q.y) * 0.02; const g = ctx.createRadialGradient(tx, ty, 4, tx, ty, 110); g.addColorStop(0, `rgba(255,170,80,${f * 2})`); g.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = g; ctx.fillRect(tx - 110, ty - 110, 220, 220); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = '700 13px "Pixelify Sans", sans-serif';
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2);
    if (f.big) {
      const s = 1 + Math.max(0, f.life - 1.05) * 3;
      ctx.save(); ctx.translate(f.x, f.y); ctx.scale(s, s);
      ctx.font = '700 20px "Pixelify Sans", sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#2a1a00';
      ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore(); ctx.font = '700 13px "Pixelify Sans", sans-serif';
    } else { ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(f.text, f.x + 1, f.y + 1); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
  }
  ctx.globalAlpha = 1;
  // darkness vignette in the mine, then the travel fade (screen space)
  if (IN) ctx.restore();
  if (inD && CD.outdoor) {
    const fx = FROST_D.fire.x, fy = FROST_D.fire.y;
    if (inView(fx, fy, 160)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const f = 0.16 + Math.sin(time * 9) * 0.03; const g = ctx.createRadialGradient(fx, fy, 4, fx, fy, 130); g.addColorStop(0, `rgba(255,170,80,${f * 2})`); g.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = g; ctx.fillRect(fx - 130, fy - 130, 260, 260); ctx.restore(); }
  }
  if (inD || fade > 0 || blizzard > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (CD === REEF_D || CD === PALACE_D) drawReefOverlay(ctx, k);
    if (CD === STAR_D) { ctx.fillStyle = 'rgba(10,12,44,.22)'; ctx.fillRect(0, 0, cvs.width, cvs.height); const g = ctx.createRadialGradient(cvs.width / 2, cvs.height / 2, cvs.height * 0.3, cvs.width / 2, cvs.height / 2, cvs.height * 0.85); g.addColorStop(0, 'rgba(10,10,40,0)'); g.addColorStop(1, 'rgba(8,8,30,.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (CD === COG_D) { const g = ctx.createRadialGradient(cvs.width / 2, cvs.height / 2, cvs.height * 0.3, cvs.width / 2, cvs.height / 2, cvs.height * 0.85); g.addColorStop(0, 'rgba(140,90,30,0)'); g.addColorStop(1, 'rgba(90,60,20,.3)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (CD === CINDER_D) { const g = ctx.createRadialGradient(cvs.width / 2, cvs.height / 2, cvs.height * 0.3, cvs.width / 2, cvs.height / 2, cvs.height * 0.85); g.addColorStop(0, 'rgba(255,90,30,0)'); g.addColorStop(1, `rgba(140,40,20,${0.36 + Math.sin(time * 0.8) * 0.05})`); ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (CD === MIRE_D) { const g = ctx.createRadialGradient(cvs.width / 2, cvs.height / 2, cvs.height * 0.25, cvs.width / 2, cvs.height / 2, cvs.height * 0.8); g.addColorStop(0, 'rgba(150,190,140,0)'); g.addColorStop(1, `rgba(150,190,140,${0.42 + Math.sin(time * 0.5) * 0.06})`); ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (blizzard > 0) { ctx.fillStyle = `rgba(235,245,255,${Math.min(0.6, blizzard * 0.6)})`; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (inD && !CD.outdoor && CD !== OSS_D && CD !== VAULT_D) { const px = (P.x - camX) * k, py = (P.y - 20 - camY) * k, g = ctx.createRadialGradient(px, py, 90 * k, px, py, 340 * k); g.addColorStop(0, 'rgba(6,4,12,0)'); g.addColorStop(1, 'rgba(6,4,12,.72)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (CD === DUSK_D || CD === OSS_D || CD === CAVE_D || CD === VAULT_D) drawDarkness(ctx, camX, camY, k);
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, cvs.width, cvs.height); }
  }
  mctx.imageSmoothingEnabled = false;
  const mPX = IN ? IN.house.x : P.x, mPY = IN ? IN.house.y + 10 : P.y, mCD = dungeonAt(mPX), mInD = !!mCD;
  const mOx = mInD ? mCD.x0 * T : 0, mW = (mInD ? DW : OW) * T, mH = (mInD ? 44 : H) * T;
  mctx.fillStyle = '#0b0910'; mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.drawImage(miniCache, mOx / T * 2, 0, mW / T * 2, mH / T * 2, 0, 0, mini.width, mini.height);
  const mxs = mini.width / mW, mys = mini.height / mH;
  camX -= mOx;
  if (!IN) { mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 1; mctx.strokeRect(camX * mxs, camY * mys, viewW * mxs, viewH * mys); }
  if (!mInD) {
    mctx.fillStyle = '#c2477a'; mctx.fillRect(NPCS[0].x * mxs - 2, NPCS[0].y * mys - 2, 4, 4);
    mctx.fillStyle = '#f4b740'; mctx.fillRect(NPCS[2].x * mxs - 2, NPCS[2].y * mys - 2, 4, 4);
    for (const [D, col] of [[MINE_D, '#8a5a32'], [TEMPLE_D, '#3d8448'], [CRYPT_D, '#8c7ab8']]) { mctx.fillStyle = col; mctx.fillRect(D.entrance.x * mxs - 3, D.entrance.y * mys - 3, 6, 6); }
  } else {
    for (const D of DUNGEONS) if (D.entrance && dungeonAt(D.entrance.x) === mCD) { mctx.fillStyle = '#d9a23c'; mctx.fillRect((D.entrance.x - mOx) * mxs - 3, D.entrance.y * mys - 3, 6, 6); }
    for (const B of BOSSES) if (B.type !== 'slime' && !S.defeated[B.type] && dungeonAt(B.hx) === mCD) { mctx.fillStyle = Math.floor(time * 2) % 2 ? '#ec5257' : '#f4b740'; mctx.fillRect((B.hx - mOx) * mxs - 3, B.hy * mys - 3, 6, 6); }
    for (const ch of mCD.chests) if (ch.y < 44 * T && !dgs(mCD).chests[ch.id]) { mctx.fillStyle = '#ffe08a'; mctx.fillRect((ch.x - mOx) * mxs - 2, ch.y * mys - 2, 4, 4); }
  }
  if (!S.defeated.slime && !mInD) { mctx.fillStyle = Math.floor(time * 2) % 2 ? '#ec5257' : '#f4b740'; mctx.fillRect(ARENA.x * mxs - 3, ARENA.y * mys - 3, 6, 6); }
  mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.arc((mPX - mOx) * mxs, mPY * mys, 2.5, 0, 7); mctx.fill();
}

// ---------- save / load ----------
function serialize() { return { ...S, px: P.x, py: P.y }; }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (_) {} }
function applySave(d) {
  if (!d || typeof d !== 'object') return;
  const base = freshState();
  const dgsIn = { ...(d.dgs || {}) }; if (d.dg && !dgsIn.mine) dgsIn.mine = d.dg;
  for (const k in dgsIn) { const g = dgsIn[k] || {}; dgsIn[k] = { open: { ...(g.open || {}) }, chests: { ...(g.chests || {}) }, switches: { ...(g.switches || {}) }, keys: g.keys || 0, bossKey: !!g.bossKey }; }
  S = { ...base, ...d, inv: { ...base.inv, ...(d.inv || {}) }, tools: { ...base.tools, ...(d.tools || {}) }, met: { ...(d.met || {}) },
    defeated: { ...(d.defeated || {}), ...(d.bossDefeated ? { slime: true } : {}) }, dgs: dgsIn, quests: { ...(d.quests || {}) }, kills: { ...(d.kills || {}) }, found: { ...(d.found || {}) } };
  delete S['bossDefeated']; delete S['dg'];
  S.gear = { weapon: 'wood', armor: 'cloth', weapons: ['wood'], armors: ['cloth'], ...(d.gear || {}) };
  S.gear.weapons = [...new Set(['wood', ...(S.gear.weapons || [])])]; S.gear.armors = [...new Set(['cloth', ...(S.gear.armors || [])])];
  if (d.tools && d.tools.blade && !S.gear.weapons.includes('crystal')) { S.gear.weapons.push('crystal'); S.gear.weapon = 'crystal'; }
  delete S.tools.blade; delete S['maxHp'];
  if (S.hp <= 0) S.hp = maxHp();
  S.hp = Math.min(S.hp, maxHp());
}

// ---------- boot ----------
function loadImages() {
  return Promise.all(Object.entries(ASSETS).map(([k, src]) => new Promise(res => { const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = res; im.src = src; })));
}
async function start(hot) {
  await loadImages();
  let data = hot && hot.save;
  if (!data) { try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (_) { data = null; } }
  applySave(data);
  if (S.bridge) for (const [x, y] of bridgeTiles) tiles[y * W + x] = PLANK;
  for (const D of DUNGEONS) for (const d of D.doors) if (dgs(D).open[d.id]) { for (const [x, y] of d.cells) dset(D, x, y, FLOOR); if (d.kind === 'gate') for (const e of enemies) if (e.dreg === d.reg) { e.alive = false; e.dieT = 0; } }
  for (const B of BOSSES) if (S.defeated[B.type]) B.state = 'dead';
  if (qState('ring') && qState('ring').state === 'active') spawnRing();
  if (qState('idol') && qState('idol').state === 'active') spawnFind('idol', 8, SUN_D.x0, DW);
  if (qState('bloom') && qState('bloom').state === 'active') spawnFind('bloom', 10, CINDER_D.x0, DW);
  if (qState('chime') && qState('chime').state === 'active') spawnFind('chime', 11, SKY_D.x0, DW);
  if (qState('comb') && qState('comb').state === 'active') spawnComb();
  if (qState('lens') && qState('lens').state === 'active') spawnFind('lens', 18, STAR_D.x0, DW);
  if (qState('mainspring') && qState('mainspring').state === 'active') spawnFind('mainspring', 17, COG_D.x0, DW);
  if (qState('compass') && qState('compass').state === 'active') spawnFind('compass', 16, REEF_D.x0, DW);
  if (qState('jadeidol') && qState('jadeidol').state === 'active') spawnFind('jadeidol', 14, JUNGLE_D.x0, DW);
  if (qState('goldpick') && qState('goldpick').state === 'active') spawnFind('goldpick', 13, CAVE_D.x0, DW);
  for (const q of QUESTS) if (questReady(q)) questReadyNotified[q.id] = true;
  P.x = S.px; P.y = S.py;
  camFocus.x = P.x; camFocus.y = P.y;
  if (!walkable(P.x, P.y)) { P.x = cx * T; P.y = (cy + 2) * T; }
  buildIcons(); buildCache(); resize(); updateHUD();
  window.claude?.hot?.snapshot?.(() => ({ save: serialize() }));
  if (!S.intro) {
    S.intro = true;
    say('Brindle Isle', [
      'The storm passed in the night. You wake on a small island village.',
      'The only bridge to the mainland was swept away. Rebuilding it will cost 400 gold.',
      'Gather, craft, and trade your way there. Oma Fen, by the cottage, is a good place to start.',
    ], () => toast('Special moves: hit 3 times in a row for a finisher, hold Space to charge a Whirlwind, Shift to dash.', 6000));
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt); render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
})();
