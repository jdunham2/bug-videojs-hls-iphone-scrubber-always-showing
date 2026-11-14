(() => {
'use strict';
// Art is embedded by build.py: character sprites from the LPC project, tiles from Kenney's Tiny packs.
const ASSETS = __ASSETS__;
const ATLAS = __ATLAS__;
// The overworld (OW wide) and the Old Mine dungeon (DW wide, starting at DX) share one tile grid.
const T = 32, OW = 72, DX = OW + 2, DW = 40, W = DX + DW, H = 56, GOAL = 400, SEED = 7;
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
const DEEP = 0, LAND = 2, PATH = 6, PLANK = 9, WALL = 10, FLOOR = 11, GATE = 12, LOCK = 13, BDOOR = 14, STAIRS = 15;
const REGIONS = ['village', 'grove', 'quarry', 'meadow', 'forest'];
const REGION_TINT = [null, 'rgba(96,44,160,.34)', 'rgba(128,110,84,.38)', 'rgba(255,226,90,.10)', 'rgba(8,52,28,.30)'];
const tiles = new Uint8Array(W * H), region = new Uint8Array(W * H);
const cx = OW / 2, cy = H / 2;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? DEEP : tiles[y * W + x];
const isLand = t => t >= LAND && t !== WALL && t !== GATE && t !== LOCK && t !== BDOOR;
const inDungeon = x => x >= DX * T;
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
// the Old Mine entrance sits in the quarry at the end of the east road
let MINE = { x: (cx + 16) * T, y: (cy - 1) * T };
search: for (let x = cx + 15; x < cx + 24; x++) for (let y = cy - 3; y <= cy + 1; y++) {
  let ok = true; for (let yy = y - 2; yy <= y + 1; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (!isLand(tileAt(xx, yy))) ok = false;
  if (ok) { MINE = { x: x * T, y: y * T + 4, tx: x, ty: y }; break search; }
}
const nearMine = (tx, ty, d) => Math.hypot(tx - MINE.x / T, ty - MINE.y / T) < d;
road(1, 0, Math.round(MINE.x / T) - cx + 1); road(-1, 0, 13); road(0, -1, Math.max(12, cy - arenaTY - 5));
for (let y = Math.floor(MINE.y / T); y <= cy; y++) { const i = y * W + Math.round(MINE.x / T); if (isLand(tiles[i])) tiles[i] = PATH; const j = i - 1; if (isLand(tiles[j])) tiles[j] = PATH; }

// ---------- the Old Mine (dungeon layout) ----------
const DUN = { doors: [], chests: [], torches: [], spawns: [] };
const dset = (x, y, t) => { tiles[y * W + DX + x] = t; };
const dget = (x, y) => tileAt(DX + x, y);
for (let y = 0; y < H; y++) for (let x = OW; x < W; x++) { tiles[y * W + x] = x >= DX ? WALL : DEEP; region[y * W + x] = 5; }
function carve(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) dset(x, y, FLOOR); }
carve(2, 1, 17, 11);   // Rockjaw's chamber
carve(22, 1, 37, 11);  // the Hollow Wizard's sanctum
carve(3, 13, 36, 21);  // pillared hall
carve(2, 23, 37, 32);  // crystal cavern
for (let y = 23; y <= 32; y++) for (let x = 2; x <= 37; x++) {
  const edge = y === 23 || y === 32 || x === 2 || x === 37;
  if (edge && Math.abs(x - 19.5) > 3 && !(x <= 4 && y <= 25) && hash(x + 300, y) < 0.45) dset(x, y, WALL);
}
carve(19, 33, 20, 34); carve(13, 35, 26, 42);
dset(19, 42, STAIRS); dset(20, 42, STAIRS);
function addDoor(id, kind, cells, t) { for (const [x, y] of cells) dset(x, y, t); DUN.doors.push({ id, kind, cells, below: [cells[0][0], cells[0][1] + 1] }); }
addDoor('gate', 'gate', [[19, 22], [20, 22]], GATE);
addDoor('lock', 'lock', [[9, 12], [10, 12]], LOCK);
addDoor('boss', 'boss', [[29, 12], [30, 12]], BDOOR);
for (const [x, y] of [[6, 0], [13, 0], [25, 0], [34, 0], [5, 12], [16, 12], [23, 12], [35, 12], [9, 22], [30, 22], [15, 34], [24, 34]]) DUN.torches.push({ x, y });
// flood-fill rooms (doors count as walls) so a gate knows which creatures guard it
const dreg = new Int16Array(W * H).fill(-1);
{
  let id = 0;
  for (let y = 0; y < H; y++) for (let x = DX; x < W; x++) {
    const t0 = tiles[y * W + x]; if ((t0 !== FLOOR && t0 !== STAIRS) || dreg[y * W + x] >= 0) continue;
    const q = [[x, y]]; dreg[y * W + x] = id;
    while (q.length) { const [qx, qy] = q.pop(); for (const [nx, ny] of [[qx + 1, qy], [qx - 1, qy], [qx, qy + 1], [qx, qy - 1]]) { const t = tileAt(nx, ny); if ((t === FLOOR || t === STAIRS) && dreg[ny * W + nx] < 0) { dreg[ny * W + nx] = id; q.push([nx, ny]); } } }
    id++;
  }
  for (const d of DUN.doors) d.reg = dreg[d.below[1] * W + DX + d.below[0]];
}
const DSTART = { x: (DX + 20) * T, y: 40 * T + 16 };
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
const cache = document.createElement('canvas'); cache.width = W * T; cache.height = H * T;
const cctx = cache.getContext('2d');
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
const floorLike = t => t === FLOOR || t === STAIRS || t === GATE || t === LOCK || t === BDOOR;
function drawDungeonTile(c, x, y) {
  const t = tileAt(x, y), px = x * T, py = y * T, lx = x - DX;
  c.fillStyle = '#0b0910'; c.fillRect(px, py, T, T);
  if (floorLike(t)) {
    const h = hash(x, y); spr(c, h < 0.03 ? 'd_floor2' : h < 0.12 ? 'd_floor1' : 'd_floor0', px, py);
    if (!floorLike(tileAt(x, y - 1))) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(px, py, T, 8); }
    if (t === STAIRS) spr(c, 'd_stairs', px, py);
    if (t === GATE) spr(c, 'd_gate', px, py);
    if (t === LOCK) spr(c, 'd_door', px, py);
    if (t === BDOOR) spr(c, 'd_bossdoor', px, py);
  } else if (floorLike(tileAt(x, y + 1))) {
    spr(c, DUN.torches.some(q => q.x === lx && q.y === y) ? 'd_walltorch' : 'd_wall', px, py);
  } else {
    let near = false; for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) if (floorLike(tileAt(x + xx, y + yy))) near = true;
    if (near) spr(c, 'd_top', px, py);
  }
}
function redrawArea(x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= DX) drawDungeonTile(cctx, x, y);
  const m = miniCache.getContext('2d'); m.drawImage(cache, 0, 0, miniCache.width, miniCache.height);
}
function buildCache() {
  const c = cctx; c.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++) for (let x = DX; x < W; x++) drawDungeonTile(c, x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < OW; x++) {
    const t = tiles[y * W + x], px = x * T, py = y * T, h = hash(x, y), rg = region[y * W + x];
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
  c.imageSmoothingEnabled = true; c.drawImage(tint, 0, 0, W * T, H * T); c.imageSmoothingEnabled = false;
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
  const m = miniCache.getContext('2d'); m.imageSmoothingEnabled = true;
  m.drawImage(cache, 0, 0, miniCache.width, miniCache.height);
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
};
const RECIPES = [
  { id: 'pickaxe', name: 'Stone Pickaxe', desc: 'Lets you mine crystals. Breaks rocks twice as fast and doubles stone.', cost: { wood: 5, stone: 4 }, tool: true },
  { id: 'planks', name: 'Plank Bundle', desc: 'Sells for 14g, much more than loose wood.', cost: { wood: 4 } },
  { id: 'potion', name: 'Meadow Tonic', desc: 'Restores 3 hearts (press Q). Sells for 20g.', cost: { herb: 2, goo: 1 } },
  { id: 'charm', name: 'Crystal Charm', desc: 'A collector\'s piece. Sells for 70g.', cost: { crystal: 2, stone: 2 } },
  { id: 'blade', name: 'Crystal Blade', desc: 'Doubles sword damage. Makes the grove slimes easy.', cost: { crystal: 3, wood: 3 }, tool: true },
];
function freshState() {
  return { gold: 0, inv: { wood: 0, stone: 0, herb: 0, goo: 0, crystal: 0, planks: 0, potion: 0, charm: 0, crown: 0, gem: 0 }, defeated: {}, mineOpen: false, dg: { open: {}, chests: {}, keys: 0, bossKey: false },
    tools: { pickaxe: false, blade: false }, hp: 6, maxHp: 6, bridge: false, met: {}, intro: false, time: 0, earned: 0,
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
const SOLID = { tree: 11, rock: 12, crystal: 11 };
const RES_HP = { tree: 3, rock: 4, herb: 1, crystal: 5 };
const TREE_KINDS = [null, ['tree_grove'], ['tree_tall', 'tree_small'], ['tree_orange', 'tree_autumn', 'tree_round'], ['tree_round', 'tree_pine', 'tree_fir']];
function addRes(type, tx, ty) {
  const r = { type, x: tx * T + 16 + (rng() - 0.5) * 10, y: ty * T + 20 + (rng() - 0.5) * 6, hp: RES_HP[type], max: RES_HP[type], alive: true, respawn: 0, shake: 0, seed: rng() };
  if (type === 'tree') { const k = TREE_KINDS[region[ty * W + tx]] || TREE_KINDS[4]; r.key = k[Math.floor(r.seed * k.length)]; }
  if (type === 'herb') r.key = r.seed > 0.5 ? 'herb_a' : 'herb_b';
  resources.push(r);
}
const nearVillage = (x, y, d) => Math.hypot(x - cx, y - cy) < d;
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  const t = tiles[y * W + x];
  if (t !== LAND || nearVillage(x, y, 8) || nearArena(x, y, 7) || nearMine(x, y, 3.5)) continue;
  if (!isLand(tileAt(x, y + 1)) || !isLand(tileAt(x, y - 1))) continue;
  const r = rng(), rg = region[y * W + x];
  if (rg === 4) { if (r < 0.17) addRes('tree', x, y); else if (r < 0.2) addRes('herb', x, y); else if (r < 0.24) decor.push({ key: r < 0.22 ? 'bush' : 'mush', x: x * T + 16, y: y * T + 22, s: 2 }); }
  else if (rg === 2) { if (r < 0.1) addRes('rock', x, y); else if (r < 0.12) addRes('tree', x, y); else if (r < 0.13) decor.push({ key: 'sprout', x: x * T + 16, y: y * T + 22, s: 2 }); }
  else if (rg === 3) { if (r < 0.09) addRes('herb', x, y); else if (r < 0.12) addRes('tree', x, y); else if (r < 0.13) addRes('rock', x, y); else if (r < 0.16) decor.push({ key: r < 0.145 ? 'bush2' : 'sprout', x: x * T + 16, y: y * T + 22, s: 2 }); }
  else if (rg === 1) { if (r < 0.045) addRes('crystal', x, y); else if (r < 0.09) addRes('rock', x, y); else if (r < 0.115) addRes('tree', x, y); else if (r < 0.13) decor.push({ key: 'mush', x: x * T + 16, y: y * T + 22, s: 2 }); }
}
function randomTileIn(rg, minDist) {
  for (let i = 0; i < 800; i++) {
    const x = 2 + Math.floor(rng() * (W - 4)), y = 2 + Math.floor(rng() * (H - 4));
    if (tiles[y * W + x] === LAND && region[y * W + x] === rg && !nearVillage(x, y, minDist) && !nearArena(x, y, 9) && !nearMine(x, y, 5)) return [x * T + 16, y * T + 16];
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
};
function makeEnemy(kind, x, y) {
  return { kind, x, y, hx: x, hy: y, hp: ENEMY[kind].hp, max: ENEMY[kind].hp, alive: true, respawn: 0, hop: rng() * 6, anim: rng() * 6, hurt: 0,
    kx: 0, ky: 0, wx: 0, wy: 0, wt: 0, state: 'move', st: 0, cd: rng() * 2, phaseT: rng() * 3, faded: false };
}
function addEnemy(kind, rg) { const [x, y] = randomTileIn(rg, 11); enemies.push(makeEnemy(kind, x, y)); }
for (const [kind, rg, n] of [['green', 4, 3], ['bat', 4, 3], ['green', 3, 2], ['crab', 3, 3], ['green', 2, 2], ['spider', 2, 2], ['cyclops', 2, 2], ['purple', 1, 4], ['ghost', 1, 3]])
  for (let i = 0; i < n; i++) addEnemy(kind, rg);
// dungeon creatures never respawn; clearing a room opens its gate
for (const [kind, x, y] of [['bat', 8, 26], ['bat', 30, 27], ['bat', 20, 29], ['spider', 12, 30], ['spider', 27, 25], ['purple', 6, 29], ['purple', 33, 30],
  ['green', 15, 38], ['green', 24, 38], ['ghost', 8, 15], ['ghost', 31, 15], ['cyclops', 12, 19], ['cyclops', 27, 19], ['purple', 19, 17], ['bat', 22, 15]]) {
  const e = makeEnemy(kind, (DX + x) * T + 16, y * T + 16); e.noRespawn = true; e.dreg = dreg[y * W + DX + x]; enemies.push(e);
}
for (const [x, y] of [[5, 25], [35, 24], [34, 31], [4, 31], [22, 24]]) addRes('crystal', DX + x, y);
for (const [x, y] of [[10, 24], [15, 31], [25, 31], [30, 25], [14, 37], [25, 40]]) addRes('rock', DX + x, y);
DUN.chests.push({ id: 'key', item: 'key', x: (DX + 3) * T + 16, y: 24 * T + 22 }, { id: 'hall', item: 'gold', x: (DX + 35) * T + 16, y: 14 * T + 22 });
for (const [x, y] of [[8, 17], [31, 17], [24, 3], [35, 3], [24, 9], [35, 9]]) decor.push({ key: 'pillar', x: (DX + x) * T + 16, y: y * T + 22, s: 2.5, solid: 13 });
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
};
function makeBoss(type, x, y, arena) {
  const I = BOSS_INFO[type];
  return { type, name: I.name, x, y, hx: x, hy: y, z: 0, hp: I.hp, max: I.hp, state: 'sleep', st: 0, active: false, hurt: 0, seq: 0, phase: 1,
    sx: 0, sy: 0, tx: 0, ty: 0, vx: 0, vy: 0, volleys: 0, ring: null, anim: 0, arena, alpha: 1, shield: 0, timer: 0, spin: 0 };
}
const roomArena = (x0, y0, x1, y1) => ({ rect: true, x0: (DX + x0) * T, y0: y0 * T, x1: (DX + x1 + 1) * T, y1: (y1 + 1) * T, cx: (DX + (x0 + x1 + 1) / 2) * T, cy: (y0 + y1 + 1) / 2 * T });
const BOSSES = [
  makeBoss('slime', ARENA.x, ARENA.y, { cx: ARENA.x, cy: ARENA.y, r: ARENA.r }),
  makeBoss('golem', (DX + 10) * T, 6 * T, roomArena(2, 1, 17, 11)),
  makeBoss('wizard', (DX + 30) * T, 5 * T, roomArena(22, 1, 37, 11)),
];

// village
const HOUSE = { x: cx * T - 84, y: cy * T - 66 }; // bottom-center of Oma's cottage
const NPCS = [
  { id: 'oma', name: 'Oma Fen', x: HOUSE.x, y: HOUSE.y + 18, sheet: 'oma_idle', walk: 'oma_walk', verb: 'Trade with', path: [[HOUSE.x - 46, HOUSE.y + 18], [HOUSE.x + 40, HOUSE.y + 18], [HOUSE.x, HOUSE.y + 18]] },
  { id: 'bench', name: 'Workbench', x: cx * T + 76, y: cy * T - 46, bench: true, verb: 'Craft at' },
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
const RECTS = [{ x0: HOUSE.x - 48, x1: HOUSE.x + 48, y0: HOUSE.y - 40, y1: HOUSE.y - 2 }, { x0: MINE.x - 56, x1: MINE.x - 18, y0: MINE.y - 56, y1: MINE.y - 4 }, { x0: MINE.x + 18, x1: MINE.x + 56, y0: MINE.y - 56, y1: MINE.y - 4 }, { x0: MINE.x - 18, x1: MINE.x + 18, y0: MINE.y - 56, y1: MINE.y - 20 }];
decor.push({ key: 'barrel', x: HOUSE.x - 64, y: HOUSE.y + 4, s: 2, solid: 10 }, { key: 'crate', x: HOUSE.x + 64, y: HOUSE.y + 2, s: 2, solid: 11 },
  { key: 'hive', x: cx * T + 128, y: cy * T - 50, s: 2, solid: 10 }, { key: 'sign', x: cx * T - 52, y: dockY * T + 2, s: 2, solid: 8 },
  { key: 'fence_l', x: cx * T + 96, y: cy * T + 88, s: 2 }, { key: 'fence_h', x: cx * T + 128, y: cy * T + 88, s: 2 }, { key: 'fence_r', x: cx * T + 160, y: cy * T + 88, s: 2 });
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
  charm: c => { c.strokeStyle = '#f4b740'; c.lineWidth = 2.5; c.beginPath(); c.arc(16, 17, 10, 0, 7); c.stroke(); c.fillStyle = '#a593ff'; diamond(c, 16, 17, 5, 8); c.fillStyle = '#f4b740'; c.fillRect(14, 3, 4, 5); },
};
const ICON_ATLAS = { gem: 'gem', key: 'key', bosskey: 'bosskey', crown: 'crown', stone: 'rock_g', herb: 'herb_a', crystal: 'crystal', potion: 'potion', pickaxe: 'pickaxe', blade: 'blade', gold: 'coin' };
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
const INV_ORDER = ['wood', 'stone', 'herb', 'goo', 'crystal', 'planks', 'potion', 'charm', 'crown', 'gem'];
function objectiveText() {
  if (inDungeon(P.x)) {
    if (!S.dg.open.gate) return 'Defeat every creature in the crystal cavern to open the sealed gate to the north.';
    if (!S.dg.open.lock) return S.dg.keys ? 'Use the small key on the locked door in the hall\'s west wall.' : 'Find a small key. A chest hides in a corner of the crystal cavern.';
    if (!S.defeated.golem) return 'Defeat Rockjaw in the west chamber. Make him charge into a wall.';
    if (!S.dg.open.boss) return 'Open the skull door in the hall\'s east wall with the Boss Key.';
    if (!S.defeated.wizard) return 'Defeat the Hollow Wizard. Swing at his orb to send it back.';
    return 'The Old Mine is quiet now. Take the stairs back up.';
  }
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
  for (let i = 0; i < S.maxHp; i++) h += `<span class="${i < S.hp ? 'on' : 'off'}">♥</span>`;
  $('hearts').innerHTML = h;
  $('gold').textContent = S.gold;
  $('objective').textContent = objectiveText();
  document.querySelector('.objective .label').textContent = inDungeon(P.x) ? 'The Old Mine' : 'Goal · Rebuild the south bridge';
  $('fund').style.width = Math.min(100, S.gold / GOAL * 100) + '%';
  let inv = '';
  for (const k of INV_ORDER) if ((k !== 'crown' && k !== 'gem') || S.inv[k]) inv += `<button class="slot ${S.inv[k] ? '' : 'zero'}" data-item="${k}" title="${ITEMS[k].name}" aria-label="${ITEMS[k].name}: ${S.inv[k]}"><img src="${ICONS[k]}" alt=""><b>${S.inv[k]}</b></button>`;
  if (S.tools.pickaxe) inv += `<div class="slot tool" title="Stone Pickaxe"><img src="${ICONS.pickaxe}" alt="Stone Pickaxe"></div>`;
  if (S.tools.blade) inv += `<div class="slot tool" title="Crystal Blade"><img src="${ICONS.blade}" alt="Crystal Blade"></div>`;
  if (S.dg.keys) inv += `<div class="slot tool" title="Small Key"><img src="${ICONS.key}" alt="Small Key"><b>${S.dg.keys}</b></div>`;
  if (S.dg.bossKey) inv += `<div class="slot tool" title="Boss Key"><img src="${ICONS.bosskey}" alt="Boss Key"></div>`;
  $('inventory').innerHTML = inv;
}
$('inventory').addEventListener('click', e => { const b = e.target.closest('[data-item]'); if (!b) return; if (b.dataset.item === 'potion') drinkTonic(); else toast(`${ITEMS[b.dataset.item].name} · sells for ${ITEMS[b.dataset.item].price}g`); });

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
    $('panelTitle').textContent = 'Oma Fen\'s Shop';
    const v = sellAllValue();
    html = `<p class="sub">Oma buys anything you bring. Crafted goods are worth far more than raw materials.</p>
      <button class="primary" data-act="sellall" ${v ? '' : 'disabled'}>Sell everything except tonics (+${v}g)</button><div class="rows">` +
      INV_ORDER.map(k => `<div class="row ${S.inv[k] ? '' : 'empty'}"><img src="${ICONS[k]}" alt=""><div class="meta"><b>${ITEMS[k].name}</b><span>${ITEMS[k].price}g each · you have ${S.inv[k]}</span></div>
        <button data-act="sell1" data-k="${k}" ${S.inv[k] ? '' : 'disabled'}>Sell 1</button><button data-act="sellk" data-k="${k}" ${S.inv[k] ? '' : 'disabled'}>All</button></div>`).join('') + '</div>';
  } else if (panel === 'craft') {
    $('panelTitle').textContent = 'Workbench';
    html = `<p class="sub">Turn what you gather into tools and goods worth selling.</p><div class="rows">` + RECIPES.map(r => {
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
  } else if (panel === 'help') {
    $('panelTitle').textContent = 'Controls';
    html = `<dl class="controls">
      <dt>WASD / Arrows</dt><dd>Move (joystick on touch screens)</dd>
      <dt>Space / J / E</dt><dd>Use the right tool on whatever is in front of you: sword for slimes, axe for trees, pickaxe for rocks, hands for herbs. Also talks and opens the workbench (A button).</dd>
      <dt>Shift / K</dt><dd>Leap through danger. Keep holding to sprint (hold the Dash button on touch).</dd>
      <dt>M</dt><dd>Sound on or off</dd>
      <dt>Q</dt><dd>Drink a Meadow Tonic</dd>
      <dt>Esc</dt><dd>Close menus</dd></dl>
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
      <dt>Slime King</dt><dd>Boss at the north tip. Leap over his shockwave, then hit him while he's dazed for double damage.</dd></dl>
      <div class="label">The Old Mine</div>
      <dl class="controls">
      <dt>Getting in</dt><dd>East of the village, at the end of the road. Needs a pickaxe to clear the rubble.</dd>
      <dt>Gates and keys</dt><dd>Clear the cavern to open its gate. Find the small key in a chest to open the locked door.</dd>
      <dt>Rockjaw</dt><dd>Dodge his charge so he crashes into a wall, then hit him while he's stunned. Watch for red circles: rocks are falling.</dd>
      <dt>Hollow Wizard</dt><dd>His shield blocks swords. Swing at his orb to send it back and break the shield.</dd></dl>
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
function showVictory() {
  const m = Math.floor(S.time / 60);
  $('victoryStats').textContent = `You earned ${S.earned}g in ${m} minute${m === 1 ? '' : 's'} and funded the crossing. That is the end of this slice of Brindle Isle. Thanks for playing!`;
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
  if (dlg) { advanceDialogue(); return false; }
  if (!$('victory').hidden || panel || P.dash) return false;
  if (P.act) { if (!['faint', 'drink', 'spin'].includes(P.act.kind)) P.queued = true; return true; }
  const n = nearestNPC();
  if (n) { face(n); interact(n); return false; }
  const ch = nearestChest(); if (ch) { face(ch); openChest(ch); return false; }
  const dr = doorAhead(); if (dr) { doorMsgCd = 0; tryDoor(dr); return false; }
  const { enemy, res } = findTarget();
  const orb = projectiles.find(o => o.kind === 'orb' && !o.returned && Math.hypot(o.x - P.x, o.y - P.y + 14) < 90);
  if (orb) { face({ x: orb.x, y: orb.y + 14 }); doAct('sword', hitEnemies); return true; }
  if (enemy) { face(enemy); doAct('sword', hitEnemies); return true; }
  const AB = activeBoss();
  if (AB && bossHittable(AB) && Math.hypot(AB.x - P.x, AB.y - P.y) < 110) { face(AB); doAct('sword', hitEnemies); return true; }
  if (res) {
    face(res);
    if (res.type === 'tree') doAct('axe', a => hitResource(res, a));
    else if (res.type === 'herb') doAct('gather', a => hitResource(res, a));
    else doAct(S.tools.pickaxe ? 'pick' : 'sword', a => hitResource(res, a));
    return true;
  }
  doAct('sword', hitEnemies);
  return true;
}
function interact(n) {
  if (n.id === 'bench') { openPanel('craft'); return; }
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
  if (S.hp >= S.maxHp) { toast('Your hearts are already full.'); return; }
  S.inv.potion--; updateHUD(); SFX.play('drink');
  startAct('drink', () => { S.hp = Math.min(S.maxHp, S.hp + 3); burst(P.x, P.y - 30, '#e45a8f', 12); updateHUD(); floatText(P.x, P.y - 52, '+3 ♥', '#ec5257'); });
}
function damageEnemy(e, dmg, kx, ky) {
  const D = ENEMY[e.kind];
  if (D.ghostly && e.faded) { floatText(e.x, e.y - 44, 'Miss', '#c8d0e0'); burst(e.x, e.y - 20, '#c8d0e0', 4); return false; }
  e.hp -= dmg; e.hurt = 0.2; e.kx = kx * (D.heavy ? 0.4 : 1); e.ky = ky * (D.heavy ? 0.4 : 1);
  if (e.state !== 'move') { e.state = 'move'; e.cd = Math.max(e.cd, 0.8); } // a hit interrupts wind-ups
  burst(e.x, e.y - 14, D.col, 8); floatText(e.x + (rng() - 0.5) * 12, e.y - 46, String(dmg), '#ffffff');
  if (e.hp <= 0) killEnemy(e);
  return true;
}
function deflect(hx, hy, rad) {
  let n = 0;
  for (const p of projectiles) if (p.kind === 'orb' && !p.returned && !p.dead && Math.hypot(p.x - hx, p.y - hy) < rad + 8) {
    p.returned = true; p.sp = 270; floatText(p.x, p.y - 20, 'Return!', '#ffe08a'); SFX.play('special'); impact(4); burst(p.x, p.y, '#ffe08a', 10);
  }
  for (const p of projectiles) if (!p.dead && p.kind !== 'orb' && (p.kind !== 'rock' || p.z < 50) && Math.hypot(p.x - hx, p.y - (p.z || 0) - hy) < rad) { p.dead = true; n++; burst(p.x, p.y - (p.z || 0), '#ffffff', 8); }
  if (n) { floatText(hx, hy - 20, 'Deflect!', '#ffffff'); SFX.play('hit'); }
}
function hitEnemies(a) {
  const sp = a && a.special, reach = sp ? 30 : 24, rad = sp ? 46 : 34;
  const hx = P.x + P.fx * reach, hy = P.y - 10 + P.fy * reach, dmg = (S.tools.blade ? 2 : 1) * (sp ? 2 : 1);
  let hit = false;
  for (const e of enemies) {
    if (!e.alive || Math.hypot(e.x - hx, e.y - 10 - hy) > rad + (ENEMY[e.kind].flyer ? 10 : 0)) continue;
    if (damageEnemy(e, dmg, P.fx * (sp ? 520 : 260), P.fy * (sp ? 520 : 260))) hit = true;
  }
  const AB = activeBoss();
  if (AB && bossHittable(AB) && Math.hypot(AB.x - hx, AB.y - 26 - AB.z - hy) < rad + 30) { damageBoss(AB, dmg); hit = true; }
  deflect(hx, hy, rad + 6);
  if (sp) { impact(7); burst(hx, hy, '#ffe08a', 14); } else if (hit) impact(2);
  if (hit) SFX.play('hit');
}
function spinHit(a) {
  const dmg = (S.tools.blade ? 2 : 1) * 2;
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
    if (d > 72) continue;
    damageEnemy(e, dmg, dx / d * 460, dy / d * 460);
  }
  const AB = activeBoss();
  if (AB && bossHittable(AB) && Math.hypot(AB.x - P.x, AB.y - P.y) < 100) damageBoss(AB, dmg);
  deflect(P.x, P.y - 14, 80);
  for (const r of resources) if (r.alive && Math.hypot(r.x - P.x, r.y - P.y) < 62) hitResource(r, a);
  for (let i = 0; i < 24; i++) { const ang = i / 24 * Math.PI * 2; particles.push({ x: P.x + Math.cos(ang) * 40, y: P.y - 14 + Math.sin(ang) * 26, vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 80 - 30, life: 0.5, color: '#ffe08a' }); }
  impact(8);
}
function hitResource(r, a) {
  if (!r.alive || Math.hypot(r.x - P.x, r.y - P.y) > 72) return;
  const sp = a && a.special;
  r.shake = 0.2;
  if (r.type === 'crystal' && !S.tools.pickaxe) { toast('Too hard for a sword. Craft a Stone Pickaxe at the village workbench.'); burst(r.x, r.y - 14, '#cfc6ff', 4); return; }
  const power = (r.type === 'rock' || r.type === 'crystal') ? (S.tools.pickaxe ? 2 : 1) : (S.tools.blade && r.type === 'tree' ? 2 : 1);
  r.hp -= power * (sp && sp !== 'Whirlwind' ? 2 : 1);
  if (sp && sp !== 'Whirlwind') { impact(6); burst(r.x, r.y - 18, '#ffe08a', 12); }
  const col = { tree: '#7a4b27', rock: '#9a978f', herb: '#5bbf55', crystal: '#a593ff' }[r.type];
  if (r.hp > 0) SFX.play(r.type === 'tree' ? 'chop' : r.type === 'herb' ? 'pick' : 'mine');
  if (r.type === 'tree') for (let i = 0; i < 4; i++) particles.push({ x: r.x + (rng() - 0.5) * 30, y: r.y - 40 - rng() * 20, vx: (rng() - 0.5) * 40, vy: -20, life: 0.9, color: i % 2 ? '#5aa65c' : '#3d8448', leaf: true });
  burst(r.x, r.y - 16, col, 6);
  if (r.hp > 0) return;
  r.alive = false; r.respawn = 35 + rng() * 20; r.fall = 0; r.fallDir = P.x <= r.x ? 1 : -1;
  SFX.play(r.type === 'tree' ? 'fall' : r.type === 'herb' ? 'pick' : 'crumble');
  if (r.type === 'rock' || r.type === 'crystal') for (let i = 0; i < 10; i++) { const a = rng() * Math.PI * 2, v = 60 + rng() * 120; particles.push({ x: r.x, y: r.y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: 0.7, color: r.type === 'rock' ? (i % 2 ? '#9c9690' : '#6c6764') : (i % 2 ? '#a593ff' : '#e6e0ff'), size: 5 }); }
  // Lucky hit: a random bonus drop with a gold sparkle
  const lucky = rng() < 0.15 ? 1 : 0;
  if (lucky) { SFX.play('lucky'); floatText(r.x, r.y - 44, 'Lucky!', '#ffe08a'); burst(r.x, r.y - 20, '#ffe08a', 16); }
  if (r.type === 'tree') drop(r.x, r.y - 10, 'wood', 2 + lucky);
  if (r.type === 'rock') drop(r.x, r.y - 6, 'stone', (S.tools.pickaxe ? 2 : 1) + lucky);
  if (r.type === 'herb') drop(r.x, r.y - 4, 'herb', (sp === 'Green Thumb' ? 3 : 1) + lucky);
  if (r.type === 'crystal') drop(r.x, r.y - 8, 'crystal', 1 + lucky);
  burst(r.x, r.y - 16, col, 12);
}
function killEnemy(e) {
  const D = ENEMY[e.kind];
  e.alive = false; e.respawn = 25; e.dieT = 0.4; e.state = 'move'; e.faded = false; SFX.play('slime');
  burst(e.x, e.y - 10, D.col, 16);
  for (const [item, n] of D.drops) drop(e.x, e.y - 6, item, n);
}
function drop(x, y, item, n, v = 1) { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, s = 60 + rng() * 60 + (n > 6 ? rng() * 80 : 0); pickups.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, item, t: 0, v }); } }
function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, s = 40 + rng() * 90; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + rng() * 0.3, color }); } }
function floatText(x, y, text, color) { floats.push({ x, y, text, color, life: 1.1 }); }
function damagePlayer(n, from) {
  if (P.inv > 0 || P.dash || (P.act && P.act.kind === 'faint')) return;
  S.hp -= n; P.inv = 1.0; P.idleT = 0; SFX.play('hurt');
  const hearts = $('hearts'); hearts.classList.remove('hit'); void hearts.offsetWidth; hearts.classList.add('hit');
  const a = Math.atan2(P.y - from.y, P.x - from.x); P.kx = Math.cos(a) * 320; P.ky = Math.sin(a) * 320;
  burst(P.x, P.y - 24, '#ec5257', 8);
  if (S.hp <= 0) {
    S.hp = 0; P.kx = P.ky = 0; P.inv = 3;
    startAct('faint', () => {
      const lost = Math.floor(S.gold * 0.1); S.gold -= lost;
      S.hp = S.maxHp; P.x = cx * T; P.y = (cy + 2) * T; P.fx = 0; P.fy = 1;
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
  for (const c of DUN.chests) pushCircle(b, c.x, c.y, r + 11);
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
  let moveMul = 1;
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
  const ml = Math.hypot(mx, my);
  P.moving = false;
  P.running = (keys['shift'] || touchRun) && !P.act && !P.held;
  if (ml > 0.15 && moveMul > 0) {
    const n = Math.min(1, ml); mx /= ml; my /= ml;
    if (!P.act) { P.fx = mx; P.fy = my; }
    const ox = P.x, oy = P.y, sp = 130 * n * moveMul * (P.running ? 1.65 : 1);
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
  P.inv = Math.max(0, P.inv - dt);
  if (Math.hypot(P.x - cx * T, P.y - cy * T) < 6 * T && S.hp < S.maxHp && S.hp > 0) { P.healT += dt; if (P.healT > 3) { P.healT = 0; S.hp++; updateHUD(); floatText(P.x, P.y - 56, '+♥', '#ec5257'); } } else P.healT = 0;
  if (S.bridge && !edgeToast && P.y > (H - 2) * T) { edgeToast = true; toast('The mainland is just over the horizon. That is a story for the full game.', 4000); }
  for (const r of resources) {
    r.shake = Math.max(0, r.shake - dt);
    if (!r.alive) { const pf = r.fall; r.fall += dt; if (r.type === 'tree' && pf < 0.5 && r.fall >= 0.5) { burst(r.x + r.fallDir * 44, r.y - 4, '#5aa65c', 12); impact(3); } r.respawn -= dt; if (r.respawn <= 0 && Math.hypot(r.x - P.x, r.y - P.y) > 60) { r.alive = true; r.hp = r.max; r.grow = 0; } }
    else if (r.grow !== undefined && r.grow < 1) r.grow = Math.min(1, r.grow + dt * 2.5);
  }
  const fainted = P.act && P.act.kind === 'faint';
  for (const e of enemies) updateEnemy(e, dt, fainted);
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].remove) enemies.splice(i, 1);
  updateProjectiles(dt, fainted);
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
      else if (p.item === 'key') { S.dg.keys++; banner('Small Key!', '#ffe08a'); SFX.play('lucky'); }
      else if (p.item === 'bosskey') { S.dg.bossKey = true; banner('Boss Key!', '#ff9a9a'); SFX.play('craft'); }
      else { S.inv[p.item]++; floatText(P.x, P.y - 56, `+1 ${ITEMS[p.item].name}`, '#eef3e6'); SFX.play('collect'); }
      updateHUD();
      const slot = p.item === 'gold' ? document.querySelector('.gold') : document.querySelector(`.slot[data-item="${p.item}"]`);
      if (slot) { slot.classList.remove('bump'); void slot.offsetWidth; slot.classList.add('bump'); }
    } else if (p.t > 60) pickups.splice(i, 1);
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
  else if (dr && dr.kind !== 'gate') { pr.hidden = false; pr.innerHTML = dr.kind === 'lock' ? (S.dg.keys ? `<kbd>${key}</kbd> Unlock the door` : 'Locked door (needs a small key)') : (S.dg.bossKey ? `<kbd>${key}</kbd> Open the skull door` : 'Skull door (needs the Boss Key)'); }
  else if (Math.hypot(P.x - MINE.x, P.y - MINE.y) < 70) { pr.hidden = false; pr.innerHTML = S.mineOpen || S.tools.pickaxe ? 'Walk in to enter the Old Mine' : 'The Old Mine (rubble: needs a pickaxe)'; }
  else if (tileAt(Math.floor(P.x / T), Math.floor((P.y + 20) / T)) === STAIRS) { pr.hidden = false; pr.innerHTML = 'Walk down the stairs to leave the mine'; }
  else pr.hidden = true;
  saveT += dt; if (saveT > 8) { saveT = 0; save(); }
}
function updateAnimal(a, dt) {
  a.t -= dt; a.hop += dt * 8;
  if (a.t <= 0) { a.t = 1.5 + rng() * 3; const go = rng() < 0.55, ang = rng() * Math.PI * 2, sp = a.key === 'chicken' ? 34 : 18; a.vx = go ? Math.cos(ang) * sp : 0; a.vy = go ? Math.sin(ang) * sp * 0.6 : 0; }
  const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
  if (Math.hypot(nx - (cx * T + 60), ny - (cy * T + 60)) < 170 && walkable(nx, ny)) { a.x = nx; a.y = ny; } else { a.vx = -a.vx; a.vy = -a.vy; }
  if (a.vx) a.flip = a.vx > 0;
}

// ---------- the Old Mine: travel, chests, doors and gates ----------
let fade = 0, linkCd = 0, doorMsgCd = 0, gateCheck = 0;
function travel(x, y, fx, fy, msg) {
  P.x = x; P.y = y; P.fx = fx; P.fy = fy; P.act = null; P.dash = null; P.kx = P.ky = 0; camFocus.x = x; camFocus.y = y;
  fade = 1; linkCd = 1; projectiles.length = 0; setTimeout(updateHUD, 0); SFX.play('dash'); if (msg) setTimeout(() => banner(msg, '#ffe08a'), 250);
}
const doorAt = (tx, ty) => DUN.doors.find(d => !S.dg.open[d.id] && d.cells.some(([x, y]) => DX + x === tx && y === ty));
function openDoor(d, quiet) {
  S.dg.open[d.id] = true;
  for (const [x, y] of d.cells) dset(x, y, FLOOR);
  redrawArea(DX + d.cells[0][0] - 1, d.cells[0][1] - 1, DX + d.cells[d.cells.length - 1][0] + 1, d.cells[0][1] + 1);
  if (quiet) return;
  SFX.play('crumble'); SFX.play('craft'); impact(5); burst((DX + d.cells[0][0]) * T + 32, d.cells[0][1] * T + 16, '#ffe08a', 16);
  updateHUD();
  banner(d.kind === 'gate' ? 'The gate opens!' : d.kind === 'boss' ? 'The great door groans open...' : 'Unlocked!', '#ffe08a');
  save();
}
function tryDoor(d) {
  if (doorMsgCd > 0) return; doorMsgCd = 1.5;
  if (d.kind === 'gate') toast('Sealed by old magic. Defeat every creature in the cavern to open it.');
  else if (d.kind === 'lock') { if (S.dg.keys > 0) { S.dg.keys--; openDoor(d); updateHUD(); } else toast('Locked. There must be a small key somewhere in the mine.'); }
  else if (S.dg.bossKey) openDoor(d); else toast('A heavy door with a skull lock. Rockjaw guards its key.');
}
function doorAhead() { const tx = Math.floor((P.x + P.fx * 20) / T), ty = Math.floor((P.y - 4 + P.fy * 20) / T); return doorAt(tx, ty); }
const nearestChest = () => DUN.chests.find(c => !S.dg.chests[c.id] && Math.hypot(c.x - P.x, c.y - P.y) < 44);
function openChest(c) {
  S.dg.chests[c.id] = true; SFX.play('lucky'); burst(c.x, c.y - 16, '#ffe08a', 14);
  if (c.item === 'key') drop(c.x, c.y - 10, 'key', 1); else drop(c.x, c.y - 10, 'gold', 10, 4);
  save();
}
function updateWorldLinks(dt) {
  linkCd = Math.max(0, linkCd - dt); doorMsgCd = Math.max(0, doorMsgCd - dt);
  const dm = Math.hypot(P.x - MINE.x, P.y - MINE.y);
  if (linkCd <= 0 && dm < 18 && P.fy < -0.3) {
    if (!S.mineOpen && !S.tools.pickaxe) { if (doorMsgCd <= 0) { doorMsgCd = 1.5; toast('Rubble blocks the Old Mine. A pickaxe could clear it.'); } P.y = MINE.y + 22; }
    else {
      if (!S.mineOpen) { S.mineOpen = true; SFX.play('crumble'); toast('You clear the rubble with your pickaxe.'); }
      travel(DSTART.x, DSTART.y, 0, -1, 'The Old Mine');
    }
  }
  if (linkCd <= 0 && tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === STAIRS && P.fy > 0.3) travel(MINE.x, MINE.y + 34, 0, 1, null);
  // bumping into a locked door tries to open it
  if (P.moving && inDungeon(P.x)) { const d = doorAhead(); if (d) tryDoor(d); }
  gateCheck -= dt;
  if (gateCheck <= 0) {
    gateCheck = 0.4;
    for (const d of DUN.doors) if (d.kind === 'gate' && !S.dg.open[d.id] && inDungeon(P.x) && !enemies.some(e => e.alive && e.dreg === d.reg)) openDoor(d);
  }
}

// ---------- enemy AI ----------
function moveEnemy(e, dx, dy) {
  if (ENEMY[e.kind].flyer && !inDungeon(e.x)) { e.x = Math.max(16, Math.min(OW * T - 16, e.x + dx)); e.y = Math.max(16, Math.min(H * T - 16, e.y + dy)); }
  else { moveBody(e, dx, dy, 9); pushOut(e, 9); }
}
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
  e.hurt = Math.max(0, e.hurt - dt); if (e.spawnT > 0) e.spawnT -= dt;
  e.cd = Math.max(0, e.cd - dt); e.anim += dt;
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
  const homeD = Math.hypot(e.hx - e.x, e.hy - e.y);
  const chase = !fainted && d < D.aggro && (homeD < 320 || e.minion) && Math.hypot(P.x - cx * T, P.y - cy * T) > 7 * T;
  const touch = (n, r = 20) => { if (d < r && !fainted && !e.faded) damagePlayer(n, e); };
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
  if (e.kind === 'bat') { // flutters around you, then swoops
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
  if (e.kind === 'spider') { // creeps in bursts, then pounces
    if (e.state === 'windup') { e.st -= dt; if (e.st <= 0) { e.state = 'attack'; e.st = 0.28; lockOn(340); SFX.play('leap'); } return; }
    if (e.state === 'attack') { e.st -= dt; moveEnemy(e, e.lx * dt, e.ly * dt); touch(D.dmg, 22); if (e.st <= 0) { e.state = 'move'; e.cd = 1.6 + rng(); } return; }
    const burstF = Math.sin(e.anim * 7) > 0 ? 1.7 : 0.15;
    if (chase) { moveEnemy(e, dx / d * D.sp * burstF * dt, dy / d * D.sp * burstF * dt); if (d < 115 && e.cd <= 0) { e.state = 'windup'; e.st = 0.35; } }
    else wander(D.sp * burstF);
    touch(D.dmg);
    return;
  }
  if (e.kind === 'crab') { // winds up, then charges in a straight line; dizzy if it hits something
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
  if (e.kind === 'cyclops') { // keeps its distance and lobs rocks at where you stand
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
  if (e.kind === 'ghost') { // fades out (can't be hit) and casts homing wisps
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
        else { p.dead = true; burst(p.x, p.y, '#ffe08a', 20); wizardDaze(o); }
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
      }
    } else {
      if (p.kind === 'wisp') {
        const want = Math.atan2(P.y - 14 - p.y, P.x - p.x); let da = want - p.ang;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        p.ang += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
        p.x += Math.cos(p.ang) * 95 * dt; p.y += Math.sin(p.ang) * 95 * dt;
        if (Math.random() < dt * 30) particles.push({ x: p.x, y: p.y, vx: 0, vy: -10, life: 0.3, color: '#c9b8ff', size: 3 });
      } else { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (!fainted && Math.hypot(P.x - p.x, P.y - 14 - p.y) < 14) { damagePlayer(1, p); p.dead = true; burst(p.x, p.y, '#c9b8ff', 6); }
      if (p.t > p.life) p.dead = true;
    }
  }
  for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);
}

// ---------- bosses ----------
const activeBoss = () => BOSSES.find(B => B.active);
const bossHittable = B => B && B.active && B.z < 30 && !['dying', 'wake', 'vanish', 'appear', 'dead'].includes(B.state);
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
let shieldHint = false;
function damageBoss(B, n) {
  if (B.type === 'wizard' && B.state !== 'dazed') {
    B.shield = 0.35; floatText(B.x, B.y - 90 - B.z, 'Blocked!', '#c8d0ff'); SFX.play('mine');
    if (!shieldHint) { shieldHint = true; toast('His magic shield blocks your sword. Swing at his orb to send it back at him!', 4500); }
    return;
  }
  const dazed = B.state === 'dazed', dmg = n * (dazed ? 2 : 1);
  B.hp -= dmg; B.hurt = 0.15;
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
  }
}
function finishBoss(B) {
  B.state = 'dead'; B.active = false; S.defeated[B.type] = true; bossBar();
  for (let i = 0; i < 40; i++) { const a = rng() * Math.PI * 2, v = 80 + rng() * 200; particles.push({ x: B.x, y: B.y - 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.9, color: i % 3 ? BOSS_INFO[B.type].col : '#ffe08a', size: 6 }); }
  if (B.type === 'slime') { drop(B.x, B.y - 10, 'gold', 20, 5); drop(B.x, B.y - 10, 'crystal', 3); drop(B.x, B.y - 10, 'crown', 1); banner('Slime King defeated!', '#ffe08a'); }
  if (B.type === 'golem') { drop(B.x, B.y - 10, 'gold', 12, 5); drop(B.x, B.y - 10, 'stone', 4); drop(B.x, B.y - 10, 'bosskey', 1); banner('Rockjaw defeated!', '#ffe08a'); }
  if (B.type === 'wizard') { drop(B.x, B.y - 10, 'gold', 20, 10); drop(B.x, B.y - 10, 'gem', 1); banner('The Old Mine is free!', '#ffe08a'); }
  impact(12); SFX.play('craft'); save(); updateHUD();
  P.pendingCheer = null; setTimeout(() => { if (!P.act) { P.fx = 0; P.fy = 1; startAct('cheer', () => burst(P.x, P.y - 50, '#ffe08a', 20)); } }, 900);
}
function updateBosses(dt, fainted) {
  for (const B of BOSSES) {
    if ((S.defeated[B.type] || B.state === 'dead') && B.state !== 'dying') continue;
    B.anim += dt; B.hurt = Math.max(0, B.hurt - dt); B.shield = Math.max(0, B.shield - dt);
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
    if (B.state === 'wake' || B.state === 'rest') { B.st -= dt; if (B.type === 'wizard') B.z += (16 + Math.sin(B.anim * 2) * 6 - B.z) * 0.1; if (B.st <= 0) bossNext(B); }
    else if (B.type === 'slime') updateSlimeKing(B, dt, fainted, d);
    else if (B.type === 'golem') updateGolem(B, dt, fainted, d);
    else updateWizard(B, dt, fainted, d);
    const harmless = ['dazed', 'vanish', 'appear', 'dying', 'wake', 'dead'].includes(B.state);
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

// ---------- ambient life: falling leaves in the forest, butterflies in the meadow, fireflies in the grove ----------
let viewRect = { x: 0, y: 0, w: 800, h: 600 };
function updateAmbient(dt) {
  if (ambient.length < 34 && Math.random() < dt * 12) {
    const x = viewRect.x + Math.random() * viewRect.w, y = viewRect.y + Math.random() * viewRect.h;
    const tx = Math.floor(x / T), ty = Math.floor(y / T), rg = region[ty * W + tx];
    if (isLand(tileAt(tx, ty))) {
      if (rg === 4) ambient.push({ kind: 'leaf', x, y: y - 60, life: 4, ph: Math.random() * 6, col: Math.random() < 0.5 ? '#5aa65c' : '#d9a23c' });
      else if (rg === 3) ambient.push({ kind: 'fly', x, y, life: 6, ph: Math.random() * 6, col: ['#ffffff', '#ffd65a', '#f28fb4'][Math.floor(Math.random() * 3)], vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 20 });
      else if (rg === 5) ambient.push({ kind: 'mote', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 8, vy: -4 - Math.random() * 6 });
      else if (rg === 1) ambient.push({ kind: 'glow', x, y, life: 5, ph: Math.random() * 6, vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14 });
    }
  }
  for (let i = ambient.length - 1; i >= 0; i--) {
    const a = ambient[i]; a.life -= dt; a.ph += dt;
    if (a.kind === 'leaf') { a.y += 22 * dt; a.x += Math.sin(a.ph * 2) * 22 * dt; }
    else if (a.kind === 'fly') { if (Math.random() < dt) { a.vx = (Math.random() - 0.5) * 40; a.vy = (Math.random() - 0.5) * 30; } a.x += a.vx * dt; a.y += a.vy * dt + Math.sin(a.ph * 5) * 0.4; }
    else { a.x += a.vx * dt; a.y += a.vy * dt; }
    if (a.life <= 0) ambient.splice(i, 1);
  }
}
function drawAmbient(c) {
  for (const a of ambient) {
    const fade = Math.min(1, a.life, (a.kind === 'leaf' ? 4 : a.kind === 'fly' ? 6 : 5) - a.life);
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
function drawRemains(c, r) {
  if (r.type === 'tree') {
    if (r.fall < 0.7) { // toppling tree
      const k = Math.min(1, r.fall / 0.55), rot = r.fallDir * k * k * 1.45;
      c.globalAlpha = r.fall > 0.5 ? Math.max(0, 1 - (r.fall - 0.5) / 0.2) : 1;
      withBase(c, r.x, r.y + 6, 1, 1, rot, () => sprB(c, r.key, 0, 1, 3));
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
    if (r.type === 'tree') { shadow(c, 0, -4, 15, 5); sprB(c, r.key, 0, 0, 3); }
    else if (r.type === 'rock') { shadow(c, 0, -4, 15, 5); sprB(c, 'rock_g', 0, 1, 2.25); }
    else if (r.type === 'herb') { const sw = Math.sin(time * 2 + r.seed * 9) > 0.7 ? 1 : 0; sprB(c, r.key, sw, -1, 2); }
    else if (r.type === 'crystal') {
      const gl = 0.22 + Math.sin(time * 3 + r.seed * 10) * 0.08;
      c.fillStyle = `rgba(165,147,255,${gl})`; circle(c, 0, -19, 22);
      shadow(c, 0, -4, 13, 4); sprB(c, 'crystal', 0, 1, 2.5);
      if (Math.sin(time * 2.3 + r.seed * 20) > 0.97) { c.fillStyle = '#ffffff'; c.fillRect(-6, -34, 2, 6); c.fillRect(-8, -32, 6, 2); }
    }
  });
  if (r.hp < r.max && r.type !== 'herb') healthBar(c, r.x, r.y + 8, r.hp / r.max);
}
function drawEnemy(c, e) { if (ENEMY[e.kind].hopper) drawSlime(c, e); else drawCreature(c, e); }
function drawCreature(c, e) {
  const D = ENEMY[e.kind], A = ATLAS[D.sprite];
  let sx = 1, sy = 1, lift = 0, ox = 0, alpha = 1;
  if (e.kind === 'bat') { lift = 20 + Math.sin(e.anim * 5) * 5; sy = 0.75 + Math.abs(Math.sin(e.anim * 18)) * 0.35; sx = 1.1 - (sy - 0.75) * 0.3; }
  else if (e.kind === 'spider') { ox = Math.sin(e.anim * 40) * (Math.sin(e.anim * 7) > 0 ? 1.2 : 0); sy = 1 + Math.sin(e.anim * 14) * 0.04; }
  else if (e.kind === 'crab') { ox = Math.sin(e.anim * 9) * 2; sy = 1 + Math.abs(Math.sin(e.anim * 9)) * 0.05; }
  else if (e.kind === 'cyclops') { lift = Math.abs(Math.sin(e.anim * 4)) * 3; if (e.state === 'windup') { sy = 1.12; sx = 0.92; } }
  else if (e.kind === 'ghost') { lift = 12 + Math.sin(e.anim * 2) * 5; alpha = e.faded ? 0.18 : 0.88; }
  if (e.state === 'windup') ox += Math.sin(time * 60) * 2;
  if (e.state === 'attack' && e.kind === 'spider') lift = 8;
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
  if (e.kind === 'crab' && e.state === 'recover') drawStars(c, e.x, e.y - 40, 10);
  if (e.hp < e.max && !e.faded) healthBar(c, e.x, e.y - 42 - lift, e.hp / e.max);
}
function drawStars(c, x, y, r) { c.fillStyle = '#ffe08a'; for (let i = 0; i < 3; i++) { const a = time * 5 + i * 2.1; c.fillRect(Math.round(x + Math.cos(a) * r - 2), Math.round(y + Math.sin(a) * r * 0.4 - 2), 4, 4); } }
function drawProjectiles(c) {
  for (const p of projectiles) {
    if (p.kind === 'rock') {
      const pulse = 0.5 + Math.sin(time * 16) * 0.3;
      c.strokeStyle = `rgba(236,82,87,${pulse})`; c.lineWidth = 2; c.beginPath(); c.ellipse(p.tx, p.ty, 22, 10, 0, 0, Math.PI * 2); c.stroke();
      shadow(c, p.x, p.fall ? p.ty : p.y + 30 * (1 - Math.max(0, p.t) / p.dur), 7, 3);
      sprB(c, 'rock_g', p.x, p.y - p.z + 8, 1.25);
    } else if (p.kind === 'wisp') {
      c.fillStyle = 'rgba(180,160,255,.35)'; circle(c, p.x, p.y, 9); c.fillStyle = '#efeaff'; circle(c, p.x, p.y, 4);
    } else if (p.kind === 'orb') {
      const pu = 1 + Math.sin(time * 14) * 0.12;
      c.fillStyle = p.returned ? 'rgba(255,224,138,.35)' : 'rgba(170,140,255,.35)'; circle(c, p.x, p.y, 17 * pu);
      c.fillStyle = p.returned ? '#ffe08a' : '#b58cff'; circle(c, p.x, p.y, 10 * pu); c.fillStyle = '#ffffff'; circle(c, p.x - 3, p.y - 3, 3.5);
    } else {
      c.save(); c.translate(p.x, p.y); c.rotate(p.ang + Math.PI / 2); c.fillStyle = '#6c5ce7'; diamond(c, 0, 0, 4, 9); c.fillStyle = '#e6e0ff'; diamond(c, -1, -1, 1.5, 5); c.restore();
    }
  }
}
function drawBossAny(c, B) { if (B.type === 'slime') drawBoss(c, B); else if (B.type === 'golem') drawGolem(c, B); else drawWizard(c, B); }
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
  const open = S.dg.chests[ch.id];
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
  const base = ENEMY[e.kind].small ? 26 : 40, w = base * sx, h = base * sy, a = ATLAS[e.kind === 'purple' ? 'slime_p' : 'slime'];
  if (e.hurt > 0) c.globalAlpha = 0.5;
  c.drawImage(IMG.kenney_atlas, a[0], a[1], 16, 16, Math.round(e.x + ox - w / 2), Math.round(e.y + 6 - h - lift), Math.round(w), Math.round(h));
  c.globalAlpha = 1;
  if (!e.alive) return;
  if (e.state === 'windup') { c.fillStyle = '#ffe08a'; c.font = '700 16px "Pixelify Sans", sans-serif'; c.textAlign = 'center'; c.fillText('!', e.x, e.y - 44); }
  if (e.hp < e.max && !ENEMY[e.kind].small) healthBar(c, e.x, e.y - 38 - lift, e.hp / e.max);
}
function healthBar(c, x, y, f) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 13, y, 26, 5); c.fillStyle = '#ec5257'; c.fillRect(x - 12, y + 1, 24 * f, 3); }
function drawLPC(c, sheet, frame, row, x, y, size) {
  const img = IMG[sheet]; if (!img) return;
  const ox = size === 128 ? 64 : 32, oy = size === 128 ? 94 : 62;
  c.drawImage(img, frame * size, row * size, size, size, Math.round(x - ox), Math.round(y - oy), size, size);
}
const enemyNear = r => enemies.some(e => e.alive && Math.hypot(e.x - P.x, e.y - P.y) < r);
function drawPlayer(c) {
  if (P.inv > 0 && !(P.act && P.act.kind === 'faint') && Math.floor(time * 20) % 2 === 0) return;
  for (const g of P.trail) { c.globalAlpha = g.life * 2.2; drawLPC(c, 'hero_jump', g.frame, g.row, g.x, g.y, 64); }
  c.globalAlpha = 1;
  shadow(c, P.x, P.y + 1, 11, 4);
  if (P.held && P.charge > 0.15 && !P.act) {
    const f = Math.min(1, (P.charge - 0.15) / 0.45), full = f >= 1;
    c.strokeStyle = full ? `rgba(255,224,138,${0.6 + Math.sin(time * 20) * 0.3})` : 'rgba(255,255,255,.55)'; c.lineWidth = full ? 3 : 2;
    c.beginPath(); c.ellipse(P.x, P.y, 22, 9, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); c.stroke();
  }
  const row = dirRow(P.fx, P.fy);
  if (P.act) {
    const A = P.act, i = Math.min(A.frames.length - 1, Math.floor(A.t / A.dur * A.frames.length));
    drawLPC(c, A.sheet, A.frames[i], A.rows ? A.rows[i] : A.oneRow ? 0 : row, P.x, P.y, A.size);
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
function drawHouse(c) {
  const x0 = HOUSE.x - 48, y0 = HOUSE.y - 96;
  c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x0 + 4, HOUSE.y - 4, 96, 8);
  [['roof_l', 'roof_m', 'roof_r'], ['roof2_l', 'roof2_m', 'roof2_r'], ['wall_l', 'door', 'wall_r']].forEach((row, j) => row.forEach((k, i) => spr(c, k, x0 + i * 32, y0 + j * 32)));
}
function drawNPC(c, n) {
  const near = Math.hypot(n.x - P.x, n.y - P.y) < 50;
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
  const alert = (n.id === 'oma' && !S.met.oma) || (n.id === 'tobin' && ((!S.met.tobin && !S.bridge) || (S.gold >= GOAL && !S.bridge)));
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
  ctx.fillStyle = inDungeon(P.x) ? '#0b0910' : '#5ec6e8'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  const viewW = vw / Z, viewH = vh / Z;
  // during the boss fight, frame both the hero and the King
  const AB = activeBoss();
  if (AB) { camFocus.x += (P.x * 0.6 + AB.x * 0.4 - camFocus.x) * 0.08; camFocus.y += (P.y * 0.6 + (AB.y - 40) * 0.4 - camFocus.y) * 0.08; }
  else { camFocus.x += (P.x - camFocus.x) * 0.2; camFocus.y += (P.y - camFocus.y) * 0.2; if (Math.hypot(P.x - camFocus.x, P.y - camFocus.y) > 300) { camFocus.x = P.x; camFocus.y = P.y; } }
  const inD = inDungeon(P.x), bx0 = inD ? DX * T : 0, bw = (inD ? DW : OW) * T, bh = (inD ? 44 : H) * T;
  let camX = bw <= viewW ? bx0 + (bw - viewW) / 2 : Math.max(bx0, Math.min(bx0 + bw - viewW, camFocus.x - viewW / 2));
  let camY = bh <= viewH ? (bh - viewH) / 2 : Math.max(0, Math.min(bh - viewH, camFocus.y - 20 - viewH / 2));
  if (shake) { camX += (Math.random() - 0.5) * shake; camY += (Math.random() - 0.5) * shake; }
  const k = dpr * Z;
  ctx.setTransform(k, 0, 0, k, -Math.round(camX * k), -Math.round(camY * k));
  ctx.imageSmoothingEnabled = false;
  const sx = Math.max(0, Math.floor(camX)), sy = Math.max(0, Math.floor(camY));
  const sw = Math.min(W * T - sx, Math.ceil(viewW) + 2), sh = Math.min(H * T - sy, Math.ceil(viewH) + 2);
  if (sw > 0 && sh > 0) ctx.drawImage(cache, sx, sy, sw, sh, sx, sy, sw, sh);
  // gentle water sparkle
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let ty = Math.floor(camY / T); ty < (camY + viewH) / T; ty++) for (let tx = Math.floor(camX / T); tx < (camX + viewW) / T; tx++) {
    if (tileAt(tx, ty) !== DEEP || tx >= OW || hash(tx, ty) < 0.8) continue;
    const ph = (time * 0.8 + hash(ty, tx) * 6) % 3; if (ph > 1) continue;
    ctx.fillRect(tx * T + 6 + hash(tx + 1, ty) * 18, ty * T + 8 + hash(tx, ty + 1) * 14, 6 * (1 - Math.abs(ph - 0.5) * 2) + 2, 2);
  }
  viewRect = { x: camX, y: camY, w: viewW, h: viewH };
  const inView = (x, y, m = 70) => x > camX - m && x < camX + viewW + m && y > camY - m && y < camY + viewH + m * 1.5;
  for (const p of pickups) {
    if (!inView(p.x, p.y)) continue;
    const b = Math.sin(time * 6 + p.t * 3) * 2, spin = p.item === 'gold' ? Math.max(0.15, Math.abs(Math.cos(time * 5 + p.x))) : 1;
    shadow(ctx, p.x, p.y + 8, 6, 2);
    ctx.drawImage(ICON_CANVAS[p.item], Math.round(p.x - 10 * spin), Math.round(p.y - 10 + b), Math.round(20 * spin), 20);
  }
  const list = [];
  for (const d of decor) if (inView(d.x, d.y)) list.push([d.y, 5, d]);
  for (const r of resources) if ((r.alive || r.type !== 'herb') && inView(r.x, r.y)) list.push([r.y, 0, r]);
  for (const e of enemies) if ((e.alive || e.dieT > 0) && inView(e.x, e.y)) list.push([e.y, 1, e]);
  for (const n of NPCS) if (inView(n.x, n.y)) list.push([n.y, 2, n]);
  for (const a of animals) if (inView(a.x, a.y)) list.push([a.y, 6, a]);
  if (inView(HOUSE.x, HOUSE.y, 150)) list.push([HOUSE.y - 4, 4, null]);
  for (const B of BOSSES) if ((!S.defeated[B.type] || B.state === 'dying') && inView(B.x, B.y, 220)) { list.push([B.y, 7, B]); drawRing(ctx, B); }
  for (const ch of DUN.chests) if (inView(ch.x, ch.y)) list.push([ch.y, 8, ch]);
  if (inView(MINE.x, MINE.y, 120)) list.push([MINE.y - 6, 9, null]);
  list.push([P.y, 3, P]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, kind, o] of list) {
    if (kind === 0) drawRes(ctx, o);
    else if (kind === 1) drawEnemy(ctx, o);
    else if (kind === 7) drawBossAny(ctx, o);
    else if (kind === 8) drawChest(ctx, o);
    else if (kind === 9) drawMine(ctx);
    else if (kind === 2) drawNPC(ctx, o);
    else if (kind === 3) drawPlayer(ctx);
    else if (kind === 4) drawHouse(ctx);
    else if (kind === 5) { if (o.glow) { ctx.fillStyle = `rgba(165,147,255,${0.2 + Math.sin(time * 2 + o.x) * 0.08})`; circle(ctx, o.x, o.y - 20, 26); } if (o.solid) shadow(ctx, o.x, o.y + 3, 12, 4); sprB(ctx, o.key, o.x, o.y + 6, o.s); }
    else drawAnimal(ctx, o);
  }
  for (const p of particles) { const z = p.size || 4; ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - z / 2), Math.round(p.y - z / 2), z, z); }
  ctx.globalAlpha = 1;
  drawProjectiles(ctx);
  drawAmbient(ctx);
  if (inD) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const q of DUN.torches) { const tx = (DX + q.x) * T + 16, ty = q.y * T + 24; if (!inView(tx, ty, 120)) continue; const f = 0.13 + Math.sin(time * 9 + q.x) * 0.03 + Math.sin(time * 23 + q.y) * 0.02; const g = ctx.createRadialGradient(tx, ty, 4, tx, ty, 110); g.addColorStop(0, `rgba(255,170,80,${f * 2})`); g.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = g; ctx.fillRect(tx - 110, ty - 110, 220, 220); }
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
  if (inD || fade > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (inD) { const px = (P.x - camX) * k, py = (P.y - 20 - camY) * k, g = ctx.createRadialGradient(px, py, 90 * k, px, py, 340 * k); g.addColorStop(0, 'rgba(6,4,12,0)'); g.addColorStop(1, 'rgba(6,4,12,.72)'); ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.width, cvs.height); }
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, cvs.width, cvs.height); }
  }
  mctx.imageSmoothingEnabled = false;
  const mOx = inD ? DX * T : 0, mW = (inD ? DW : OW) * T, mH = (inD ? 44 : H) * T;
  mctx.fillStyle = '#0b0910'; mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.drawImage(miniCache, mOx / T * 2, 0, mW / T * 2, mH / T * 2, 0, 0, mini.width, mini.height);
  const mxs = mini.width / mW, mys = mini.height / mH;
  camX -= mOx;
  mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 1; mctx.strokeRect(camX * mxs, camY * mys, viewW * mxs, viewH * mys);
  if (!inD) {
    mctx.fillStyle = '#c2477a'; mctx.fillRect(NPCS[0].x * mxs - 2, NPCS[0].y * mys - 2, 4, 4);
    mctx.fillStyle = '#f4b740'; mctx.fillRect(NPCS[2].x * mxs - 2, NPCS[2].y * mys - 2, 4, 4);
    mctx.fillStyle = '#8a5a32'; mctx.fillRect(MINE.x * mxs - 3, MINE.y * mys - 3, 6, 6);
  } else {
    for (const B of BOSSES) if (B.type !== 'slime' && !S.defeated[B.type]) { mctx.fillStyle = Math.floor(time * 2) % 2 ? '#ec5257' : '#f4b740'; mctx.fillRect((B.hx - mOx) * mxs - 3, B.hy * mys - 3, 6, 6); }
    for (const ch of DUN.chests) if (!S.dg.chests[ch.id]) { mctx.fillStyle = '#ffe08a'; mctx.fillRect((ch.x - mOx) * mxs - 2, ch.y * mys - 2, 4, 4); }
  }
  if (!S.defeated.slime && !inD) { mctx.fillStyle = Math.floor(time * 2) % 2 ? '#ec5257' : '#f4b740'; mctx.fillRect(ARENA.x * mxs - 3, ARENA.y * mys - 3, 6, 6); }
  mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.arc((P.x - mOx) * mxs, P.y * mys, 2.5, 0, 7); mctx.fill();
}

// ---------- save / load ----------
function serialize() { return { ...S, px: P.x, py: P.y }; }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (_) {} }
function applySave(d) {
  if (!d || typeof d !== 'object') return;
  const base = freshState();
  const dg = d.dg || {};
  S = { ...base, ...d, inv: { ...base.inv, ...(d.inv || {}) }, tools: { ...base.tools, ...(d.tools || {}) }, met: { ...(d.met || {}) },
    defeated: { ...(d.defeated || {}), ...(d.bossDefeated ? { slime: true } : {}) }, dg: { ...base.dg, ...dg, open: { ...(dg.open || {}) }, chests: { ...(dg.chests || {}) } } };
  delete S['bossDefeated'];
  if (S.hp <= 0) S.hp = S.maxHp;
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
  for (const d of DUN.doors) if (S.dg.open[d.id]) { for (const [x, y] of d.cells) dset(x, y, FLOOR); if (d.kind === 'gate') for (const e of enemies) if (e.dreg === d.reg) { e.alive = false; e.dieT = 0; } }
  for (const B of BOSSES) if (S.defeated[B.type]) B.state = 'dead';
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
