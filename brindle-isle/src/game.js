(() => {
'use strict';
// Art is embedded by build.py: character sprites from the LPC project, tiles from Kenney's Tiny packs.
const ASSETS = __ASSETS__;
const ATLAS = __ATLAS__;
const T = 32, W = 72, H = 56, GOAL = 400, SEED = 7;
const SAVE_KEY = 'brindle-isle-save-v1';
const $ = id => document.getElementById(id);
const cvs = $('game'), ctx = cvs.getContext('2d');
const mini = $('minimap'), mctx = mini.getContext('2d');
const IMG = {};

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
const DEEP = 0, LAND = 2, PATH = 6, PLANK = 9;
const REGIONS = ['village', 'grove', 'quarry', 'meadow', 'forest'];
const REGION_TINT = [null, 'rgba(96,44,160,.34)', 'rgba(128,110,84,.38)', 'rgba(255,226,90,.10)', 'rgba(8,52,28,.30)'];
const tiles = new Uint8Array(W * H), region = new Uint8Array(W * H);
const cx = W / 2, cy = H / 2;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? DEEP : tiles[y * W + x];
const isLand = t => t >= LAND;
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
  const dx = (x - cx) / (W * 0.46), dy = (y - cy) / (H * 0.46);
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
road(1, 0, 13); road(-1, 0, 13); road(0, -1, 12);
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
function buildCache() {
  const c = cctx; c.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tiles[y * W + x], rg = region[y * W + x];
    if (isLand(t) && t !== PATH && !isBridge(x, y) && REGION_TINT[rg]) { tc.fillStyle = REGION_TINT[rg]; tc.fillRect(x, y, 1, 1); }
  }
  c.imageSmoothingEnabled = true; c.drawImage(tint, 0, 0, W * T, H * T); c.imageSmoothingEnabled = false;
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
};
const RECIPES = [
  { id: 'pickaxe', name: 'Stone Pickaxe', desc: 'Lets you mine crystals. Breaks rocks twice as fast and doubles stone.', cost: { wood: 5, stone: 4 }, tool: true },
  { id: 'planks', name: 'Plank Bundle', desc: 'Sells for 14g, much more than loose wood.', cost: { wood: 4 } },
  { id: 'potion', name: 'Meadow Tonic', desc: 'Restores 3 hearts (press Q). Sells for 20g.', cost: { herb: 2, goo: 1 } },
  { id: 'charm', name: 'Crystal Charm', desc: 'A collector\'s piece. Sells for 70g.', cost: { crystal: 2, stone: 2 } },
  { id: 'blade', name: 'Crystal Blade', desc: 'Doubles sword damage. Makes the grove slimes easy.', cost: { crystal: 3, wood: 3 }, tool: true },
];
function freshState() {
  return { gold: 0, inv: { wood: 0, stone: 0, herb: 0, goo: 0, crystal: 0, planks: 0, potion: 0, charm: 0 },
    tools: { pickaxe: false, blade: false }, hp: 6, maxHp: 6, bridge: false, met: {}, intro: false, time: 0, earned: 0,
    px: cx * T, py: (cy + 2) * T };
}
let S = freshState();
const P = { x: 0, y: 0, fx: 0, fy: 1, inv: 0, walkDist: 0, moving: false, kx: 0, ky: 0, healT: 0, act: null };

// ---------- objects ----------
const resources = [], enemies = [], pickups = [], particles = [], floats = [], decor = [], animals = [];
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
  if (t !== LAND || nearVillage(x, y, 8)) continue;
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
    if (tiles[y * W + x] === LAND && region[y * W + x] === rg && !nearVillage(x, y, minDist)) return [x * T + 16, y * T + 16];
  }
  return [cx * T + 300, cy * T];
}
function addEnemy(kind, rg) {
  const [x, y] = randomTileIn(rg, 11);
  enemies.push({ kind, x, y, hx: x, hy: y, hp: kind === 'purple' ? 4 : 2, max: kind === 'purple' ? 4 : 2, alive: true, respawn: 0, hop: rng() * 6, hurt: 0, kx: 0, ky: 0, wx: 0, wy: 0, wt: 0 });
}
for (let i = 0; i < 4; i++) addEnemy('green', 4);
for (let i = 0; i < 3; i++) addEnemy('green', 3);
for (let i = 0; i < 3; i++) addEnemy('green', 2);
for (let i = 0; i < 6; i++) addEnemy('purple', 1);

// village
const HOUSE = { x: cx * T - 84, y: cy * T - 66 }; // bottom-center of Oma's cottage
const NPCS = [
  { id: 'oma', name: 'Oma Fen', x: HOUSE.x, y: HOUSE.y + 18, sheet: 'oma_idle', verb: 'Trade with' },
  { id: 'bench', name: 'Workbench', x: cx * T + 76, y: cy * T - 46, bench: true, verb: 'Craft at' },
  { id: 'tobin', name: 'Tobin', x: cx * T + 24, y: dockY * T + 6, sheet: 'tobin_idle', verb: 'Talk to' },
];
const RECTS = [{ x0: HOUSE.x - 48, x1: HOUSE.x + 48, y0: HOUSE.y - 40, y1: HOUSE.y - 2 }];
decor.push({ key: 'barrel', x: HOUSE.x - 64, y: HOUSE.y + 4, s: 2, solid: 10 }, { key: 'crate', x: HOUSE.x + 64, y: HOUSE.y + 2, s: 2, solid: 11 },
  { key: 'hive', x: cx * T + 128, y: cy * T - 50, s: 2, solid: 10 }, { key: 'sign', x: cx * T - 52, y: dockY * T + 2, s: 2, solid: 8 },
  { key: 'fence_l', x: cx * T + 96, y: cy * T + 88, s: 2 }, { key: 'fence_h', x: cx * T + 128, y: cy * T + 88, s: 2 }, { key: 'fence_r', x: cx * T + 160, y: cy * T + 88, s: 2 });
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
const ICON_ATLAS = { stone: 'rock_g', herb: 'herb_a', crystal: 'crystal', potion: 'potion', pickaxe: 'pickaxe', blade: 'blade', gold: 'coin' };
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
const INV_ORDER = ['wood', 'stone', 'herb', 'goo', 'crystal', 'planks', 'potion', 'charm'];
function objectiveText() {
  if (S.bridge) return 'The bridge is open. Keep exploring, or cross it to the mainland.';
  if (S.gold >= GOAL) return 'You have enough! Bring 400g to Tobin at the south dock.';
  if (!S.tools.pickaxe) {
    if (S.inv.wood < 5 || S.inv.stone < 4) return `Chop trees and break rocks (wood ${Math.min(S.inv.wood, 5)}/5, stone ${Math.min(S.inv.stone, 4)}/4), then craft a pickaxe at the village workbench.`;
    return 'Craft a Stone Pickaxe at the workbench in the village.';
  }
  return `Mine crystals in the purple grove up north, craft Crystal Charms, and sell them to Oma Fen. ${S.gold} / ${GOAL}g`;
}
function updateHUD() {
  let h = '';
  for (let i = 0; i < S.maxHp; i++) h += `<span class="${i < S.hp ? 'on' : 'off'}">♥</span>`;
  $('hearts').innerHTML = h;
  $('gold').textContent = S.gold;
  $('objective').textContent = objectiveText();
  $('fund').style.width = Math.min(100, S.gold / GOAL * 100) + '%';
  let inv = '';
  for (const k of INV_ORDER) inv += `<button class="slot ${S.inv[k] ? '' : 'zero'}" data-item="${k}" title="${ITEMS[k].name}" aria-label="${ITEMS[k].name}: ${S.inv[k]}"><img src="${ICONS[k]}" alt=""><b>${S.inv[k]}</b></button>`;
  if (S.tools.pickaxe) inv += `<div class="slot tool" title="Stone Pickaxe"><img src="${ICONS.pickaxe}" alt="Stone Pickaxe"></div>`;
  if (S.tools.blade) inv += `<div class="slot tool" title="Crystal Blade"><img src="${ICONS.blade}" alt="Crystal Blade"></div>`;
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
function closePanel() { if (!panel) return; panel = null; panelEl.hidden = true; save(); }
$('panelClose').addEventListener('click', closePanel);
panelEl.addEventListener('click', e => { if (e.target === panelEl) closePanel(); });
const canAfford = cost => Object.entries(cost).every(([k, n]) => S.inv[k] >= n);
const sellAllValue = () => INV_ORDER.filter(k => k !== 'potion').reduce((s, k) => s + S.inv[k] * ITEMS[k].price, 0);
let resetArmed = false;
const CREDITS = `<div class="credits"><b>Art credits.</b> Characters: Universal LPC Spritesheet Character Generator (Liberated Pixel Cup) by __LPC_AUTHORS__. Licensed CC-BY-SA 3.0, GPL 3.0 and OGA-BY 3.0; colors adjusted for this game. Tiles, trees, animals, slimes and items: Kenney's Tiny Town, Tiny Battle, Tiny Farm and Tiny Dungeon packs (kenney.nl, CC0).</div>`;
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
      <dt>Q</dt><dd>Drink a Meadow Tonic</dd>
      <dt>Esc</dt><dd>Close menus</dd></dl>
      <p class="sub">Standing in the village slowly restores your hearts. Progress saves in this browser automatically.</p>
      <button class="btn" data-act="reset">${resetArmed ? 'Tap again to erase your save' : 'Start a new game'}</button>${CREDITS}`;
  }
  body.innerHTML = html;
}
body.addEventListener('click', e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const k = b.dataset.k, act = b.dataset.act;
  if (act === 'sell1' || act === 'sellk') {
    const n = act === 'sell1' ? 1 : S.inv[k]; if (!n) return;
    S.inv[k] -= n; addGold(n * ITEMS[k].price); toast(`Sold ${n} ${ITEMS[k].name} for ${n * ITEMS[k].price}g`);
  } else if (act === 'sellall') {
    const v = sellAllValue(); for (const kk of INV_ORDER) if (kk !== 'potion') S.inv[kk] = 0; addGold(v); toast(`Sold everything for ${v}g`);
  } else if (act === 'craft') {
    const r = RECIPES.find(r => r.id === k); if (!r || !canAfford(r.cost)) return;
    for (const [kk, n] of Object.entries(r.cost)) S.inv[kk] -= n;
    if (r.tool) S.tools[r.id] = true; else S.inv[r.id]++;
    toast(`Crafted ${r.name}!`);
  } else if (act === 'fund') {
    if (S.gold < GOAL) return; S.gold -= GOAL; S.bridge = true;
    for (const [x, y] of bridgeTiles) tiles[y * W + x] = PLANK;
    buildCache(); closePanel(); showVictory();
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
$('victoryBtn').addEventListener('click', () => { $('victory').hidden = true; updateHUD(); });

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
  if (k === ' ' || k === 'j' || k === 'e' || k === 'enter') onAction();
  if (k === 'q') drinkTonic();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
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
$('btnA').addEventListener('pointerdown', e => { e.preventDefault(); onAction(); });
$('btnTonic').addEventListener('pointerdown', e => { e.preventDefault(); drinkTonic(); });

// ---------- hero animation ----------
// Each action plays real LPC frames; the effect lands on a specific frame (hitAt) so impacts match the motion.
const ACTS = {
  sword:  { sheet: 'hero_sword', size: 128, frames: [0, 1, 2, 3, 4, 5], dur: 0.36, hitAt: 0.2, move: 0.4 },
  axe:    { sheet: 'hero_axe', size: 128, frames: [5, 5, 4, 3, 1, 0, 0], dur: 0.5, hitAt: 0.33, move: 0 },
  pick:   { sheet: 'hero_pick', size: 128, frames: [5, 5, 4, 3, 1, 0, 0], dur: 0.5, hitAt: 0.33, move: 0 },
  gather: { sheet: 'hero_thrust', size: 64, frames: [0, 1, 2, 3, 4, 5, 6, 7], dur: 0.45, hitAt: 0.28, move: 0 },
  drink:  { sheet: 'hero_spellcast', size: 64, frames: [0, 1, 2, 3, 4, 5, 6, 6, 6], dur: 0.8, hitAt: 0.5, move: 0 },
  faint:  { sheet: 'hero_hurt', size: 64, frames: [0, 1, 2, 3, 4, 5, 5, 5, 5], dur: 1.3, hitAt: 1.25, move: 0, oneRow: true },
};
function startAct(kind, onHit) { P.act = { kind, ...ACTS[kind], t: 0, hit: false, onHit }; }
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
  if (dlg) { advanceDialogue(); return; }
  if (!$('victory').hidden || panel || P.act) return;
  const n = nearestNPC();
  if (n) { face(n); interact(n); return; }
  const { enemy, res } = findTarget();
  if (enemy) { face(enemy); startAct('sword', hitEnemies); return; }
  if (res) {
    face(res);
    if (res.type === 'tree') startAct('axe', () => hitResource(res));
    else if (res.type === 'herb') startAct('gather', () => hitResource(res));
    else startAct(S.tools.pickaxe ? 'pick' : 'sword', () => hitResource(res));
    return;
  }
  startAct('sword', hitEnemies);
}
function interact(n) {
  if (n.id === 'bench') { openPanel('craft'); return; }
  if (n.id === 'oma') {
    if (!S.met.oma) { S.met.oma = true; say('Oma Fen', [
      'A new face! Washed up with the last storm, did you? Welcome to Brindle Isle.',
      'Bring me anything you find. Wood, stone, herbs, slime goo. I pay fair, and I pay more for crafted goods.',
      'Want real money? The purple grove up north is full of crystals. You will need a pickaxe from the workbench across the square.',
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
  S.inv.potion--; updateHUD();
  startAct('drink', () => { S.hp = Math.min(S.maxHp, S.hp + 3); burst(P.x, P.y - 30, '#e45a8f', 12); updateHUD(); floatText(P.x, P.y - 52, '+3 ♥', '#ec5257'); });
}
function hitEnemies() {
  const hx = P.x + P.fx * 24, hy = P.y - 10 + P.fy * 24, dmg = S.tools.blade ? 2 : 1;
  for (const e of enemies) {
    if (!e.alive || Math.hypot(e.x - hx, e.y - 10 - hy) > 34) continue;
    e.hp -= dmg; e.hurt = 0.2; e.kx = P.fx * 260; e.ky = P.fy * 260; burst(e.x, e.y - 12, e.kind === 'purple' ? '#a879ff' : '#5fd0b0', 6);
    if (e.hp <= 0) killEnemy(e);
  }
}
function hitResource(r) {
  if (!r.alive || Math.hypot(r.x - P.x, r.y - P.y) > 64) return;
  r.shake = 0.2;
  if (r.type === 'crystal' && !S.tools.pickaxe) { toast('Too hard for a sword. Craft a Stone Pickaxe at the village workbench.'); burst(r.x, r.y - 14, '#cfc6ff', 4); return; }
  const power = (r.type === 'rock' || r.type === 'crystal') ? (S.tools.pickaxe ? 2 : 1) : (S.tools.blade && r.type === 'tree' ? 2 : 1);
  r.hp -= power;
  const col = { tree: '#7a4b27', rock: '#9a978f', herb: '#5bbf55', crystal: '#a593ff' }[r.type];
  burst(r.x, r.y - 16, col, 6);
  if (r.hp > 0) return;
  r.alive = false; r.respawn = 35 + rng() * 20;
  if (r.type === 'tree') drop(r.x, r.y - 10, 'wood', 2);
  if (r.type === 'rock') drop(r.x, r.y - 6, 'stone', S.tools.pickaxe ? 2 : 1);
  if (r.type === 'herb') drop(r.x, r.y - 4, 'herb', 1);
  if (r.type === 'crystal') drop(r.x, r.y - 8, 'crystal', 1);
  burst(r.x, r.y - 16, col, 12);
}
function killEnemy(e) {
  e.alive = false; e.respawn = 25;
  burst(e.x, e.y - 10, e.kind === 'purple' ? '#a879ff' : '#5fd0b0', 16);
  drop(e.x, e.y - 6, 'goo', e.kind === 'purple' ? 2 : 1);
  drop(e.x, e.y - 6, 'gold', e.kind === 'purple' ? 3 : 1);
}
function drop(x, y, item, n) { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, s = 60 + rng() * 60; pickups.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, item, t: 0 }); } }
function burst(x, y, color, n) { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, s = 40 + rng() * 90; particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + rng() * 0.3, color }); } }
function floatText(x, y, text, color) { floats.push({ x, y, text, color, life: 1.1 }); }
function damagePlayer(n, from) {
  if (P.inv > 0 || (P.act && P.act.kind === 'faint')) return;
  S.hp -= n; P.inv = 1.0;
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
  for (const a of animals) updateAnimal(a, dt);
  if (paused()) return;
  S.time += dt;
  // hero action
  let moveMul = 1;
  if (P.act) {
    const A = P.act; A.t += dt; moveMul = A.move;
    if (!A.hit && A.t >= A.hitAt) { A.hit = true; A.onHit && A.onHit(); }
    if (A.t >= A.dur) P.act = null;
  }
  let mx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joy.dx;
  let my = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0) + joy.dy;
  const ml = Math.hypot(mx, my);
  P.moving = false;
  if (ml > 0.15 && moveMul > 0) {
    const n = Math.min(1, ml); mx /= ml; my /= ml;
    if (!P.act) { P.fx = mx; P.fy = my; }
    const ox = P.x, oy = P.y, sp = 130 * n * moveMul;
    moveBody(P, mx * sp * dt, my * sp * dt, 9);
    const moved = Math.hypot(P.x - ox, P.y - oy);
    if (moved > 0.01) { P.moving = true; P.walkDist += moved; }
  }
  if (P.kx || P.ky) { moveBody(P, P.kx * dt, P.ky * dt, 9); P.kx *= Math.pow(0.002, dt); P.ky *= Math.pow(0.002, dt); if (Math.hypot(P.kx, P.ky) < 5) P.kx = P.ky = 0; }
  pushOut(P, 9);
  P.inv = Math.max(0, P.inv - dt);
  if (Math.hypot(P.x - cx * T, P.y - cy * T) < 6 * T && S.hp < S.maxHp && S.hp > 0) { P.healT += dt; if (P.healT > 3) { P.healT = 0; S.hp++; updateHUD(); floatText(P.x, P.y - 56, '+♥', '#ec5257'); } } else P.healT = 0;
  if (S.bridge && !edgeToast && P.y > (H - 2) * T) { edgeToast = true; toast('The mainland is just over the horizon. That is a story for the full game.', 4000); }
  for (const r of resources) {
    r.shake = Math.max(0, r.shake - dt);
    if (!r.alive) { r.respawn -= dt; if (r.respawn <= 0 && Math.hypot(r.x - P.x, r.y - P.y) > 60) { r.alive = true; r.hp = r.max; } }
  }
  const fainted = P.act && P.act.kind === 'faint';
  for (const e of enemies) {
    if (!e.alive) { e.respawn -= dt; if (e.respawn <= 0 && Math.hypot(e.hx - P.x, e.hy - P.y) > 320) { e.alive = true; e.hp = e.max; e.x = e.hx; e.y = e.hy; } continue; }
    e.hurt = Math.max(0, e.hurt - dt);
    const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
    const homeD = Math.hypot(e.hx - e.x, e.hy - e.y);
    const chase = !fainted && d < (e.kind === 'purple' ? 200 : 160) && homeD < 320 && Math.hypot(P.x - cx * T, P.y - cy * T) > 7 * T;
    const sp = e.kind === 'purple' ? 72 : 55;
    e.hop += dt * (chase ? 9 : 4);
    let vx = 0, vy = 0;
    const knocked = Math.abs(e.kx) + Math.abs(e.ky) > 5;
    if (knocked) { vx = e.kx; vy = e.ky; e.kx *= Math.pow(0.001, dt); e.ky *= Math.pow(0.001, dt); }
    else if (chase) { vx = dx / d * sp; vy = dy / d * sp; }
    else if (homeD > 220) { vx = (e.hx - e.x) / homeD * sp; vy = (e.hy - e.y) / homeD * sp; }
    else { e.wt -= dt; if (e.wt <= 0) { e.wt = 1 + rng() * 2; const a = rng() * Math.PI * 2, go = rng() < 0.6; e.wx = go ? Math.cos(a) * sp * 0.5 : 0; e.wy = go ? Math.sin(a) * sp * 0.5 : 0; } vx = e.wx; vy = e.wy; }
    const hopF = knocked ? 1 : Math.max(0, Math.sin(e.hop)) * 1.8;
    moveBody(e, vx * hopF * dt, vy * hopF * dt, 9); pushOut(e, 9);
    if (d < 20 && !fainted) damagePlayer(e.kind === 'purple' ? 2 : 1, e);
  }
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.01, dt); p.vy *= Math.pow(0.01, dt);
    const d = Math.hypot(P.x - p.x, P.y - 14 - p.y);
    if (p.t > 0.35 && d < 72 && !fainted) { const s = 260 * dt; p.x += (P.x - p.x) / d * s; p.y += (P.y - 14 - p.y) / d * s; }
    if (p.t > 0.35 && d < 14 && !fainted) {
      pickups.splice(i, 1);
      if (p.item === 'gold') { addGold(1); floatText(P.x, P.y - 56, '+1g', '#f4b740'); }
      else { S.inv[p.item]++; floatText(P.x, P.y - 56, `+1 ${ITEMS[p.item].name}`, '#eef3e6'); }
      updateHUD();
    } else if (p.t > 60) pickups.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; if (p.life <= 0) particles.splice(i, 1); }
  for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.life -= dt; f.y -= 28 * dt; if (f.life <= 0) floats.splice(i, 1); }
  const n = nearestNPC(), pr = $('prompt');
  if (n && !P.act) { pr.hidden = false; const key = matchMedia('(pointer: coarse)').matches ? 'A' : 'Space'; pr.innerHTML = `<kbd>${key}</kbd> ${n.verb} ${n.name}`; } else pr.hidden = true;
  saveT += dt; if (saveT > 8) { saveT = 0; save(); }
}
function updateAnimal(a, dt) {
  a.t -= dt; a.hop += dt * 8;
  if (a.t <= 0) { a.t = 1.5 + rng() * 3; const go = rng() < 0.55, ang = rng() * Math.PI * 2, sp = a.key === 'chicken' ? 34 : 18; a.vx = go ? Math.cos(ang) * sp : 0; a.vy = go ? Math.sin(ang) * sp * 0.6 : 0; }
  const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
  if (Math.hypot(nx - (cx * T + 60), ny - (cy * T + 60)) < 170 && walkable(nx, ny)) { a.x = nx; a.y = ny; } else { a.vx = -a.vx; a.vy = -a.vy; }
  if (a.vx) a.flip = a.vx > 0;
}

// ---------- render ----------
let vw = 0, vh = 0, dpr = 1, Z = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); vw = innerWidth; vh = innerHeight;
  cvs.width = Math.round(vw * dpr); cvs.height = Math.round(vh * dpr);
  cvs.style.width = vw + 'px'; cvs.style.height = vh + 'px';
  Z = Math.max(1, Math.min(2.25, Math.min(vw / (20 * T), vh / (13 * T))));
}
addEventListener('resize', resize);

function shadow(c, x, y, rx, ry) { c.fillStyle = 'rgba(0,0,0,.22)'; ellipse(c, x, y, rx, ry); }
function drawRes(c, r) {
  const s = r.shake ? Math.round(Math.sin(time * 70) * 2) : 0;
  if (r.type === 'tree') { shadow(c, r.x, r.y + 3, 15, 5); sprB(c, r.key, r.x + s, r.y + 7, 3); }
  else if (r.type === 'rock') { shadow(c, r.x, r.y + 3, 15, 5); sprB(c, 'rock_g', r.x + s, r.y + 8, 2.25); }
  else if (r.type === 'herb') { const sw = Math.sin(time * 2 + r.seed * 9) > 0.7 ? 1 : 0; sprB(c, r.key, r.x + sw, r.y + 6, 2); }
  else if (r.type === 'crystal') {
    const g = 0.22 + Math.sin(time * 3 + r.seed * 10) * 0.08;
    c.fillStyle = `rgba(165,147,255,${g})`; circle(c, r.x, r.y - 12, 22);
    shadow(c, r.x, r.y + 3, 13, 4); sprB(c, 'crystal', r.x + s, r.y + 8, 2.5);
  }
  if (r.hp < r.max && r.type !== 'herb') healthBar(c, r.x, r.y + 8, r.hp / r.max);
}
function drawSlime(c, e) {
  const sq = Math.sin(e.hop), lift = Math.max(0, sq) * 7, sx = 1 + Math.max(0, -sq) * 0.18, sy = 1 - Math.max(0, -sq) * 0.14 + Math.max(0, sq) * 0.08;
  shadow(c, e.x, e.y + 2, 13 - lift * 0.5, 4);
  const w = 40 * sx, h = 40 * sy, a = ATLAS[e.kind === 'purple' ? 'slime_p' : 'slime'];
  if (e.hurt > 0) c.globalAlpha = 0.5;
  c.drawImage(IMG.kenney_atlas, a[0], a[1], 16, 16, Math.round(e.x - w / 2), Math.round(e.y + 6 - h - lift), Math.round(w), Math.round(h));
  c.globalAlpha = 1;
  if (e.hp < e.max) healthBar(c, e.x, e.y - 38 - lift, e.hp / e.max);
}
function healthBar(c, x, y, f) { c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(x - 13, y, 26, 5); c.fillStyle = '#ec5257'; c.fillRect(x - 12, y + 1, 24 * f, 3); }
function drawLPC(c, sheet, frame, row, x, y, size) {
  const img = IMG[sheet]; if (!img) return;
  const ox = size === 128 ? 64 : 32, oy = size === 128 ? 94 : 62;
  c.drawImage(img, frame * size, row * size, size, size, Math.round(x - ox), Math.round(y - oy), size, size);
}
function drawPlayer(c) {
  if (P.inv > 0 && !(P.act && P.act.kind === 'faint') && Math.floor(time * 20) % 2 === 0) return;
  shadow(c, P.x, P.y + 1, 11, 4);
  const row = dirRow(P.fx, P.fy);
  if (P.act) {
    const A = P.act, i = Math.min(A.frames.length - 1, Math.floor(A.t / A.dur * A.frames.length));
    drawLPC(c, A.sheet, A.frames[i], A.oneRow ? 0 : row, P.x, P.y, A.size);
  } else if (P.moving) drawLPC(c, 'hero_walk', 1 + Math.floor(P.walkDist / 7) % 8, row, P.x, P.y, 64);
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
    const row = near ? dirRow(P.x - n.x, P.y - n.y) : 2;
    drawLPC(c, n.sheet, Math.floor(time * 1.4 + n.x) % 2, row, n.x, n.y, 64);
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
  ctx.fillStyle = '#5ec6e8'; ctx.fillRect(0, 0, cvs.width, cvs.height);
  const viewW = vw / Z, viewH = vh / Z;
  const camX = W * T <= viewW ? (W * T - viewW) / 2 : Math.max(0, Math.min(W * T - viewW, P.x - viewW / 2));
  const camY = H * T <= viewH ? (H * T - viewH) / 2 : Math.max(0, Math.min(H * T - viewH, P.y - 20 - viewH / 2));
  const k = dpr * Z;
  ctx.setTransform(k, 0, 0, k, -Math.round(camX * k), -Math.round(camY * k));
  ctx.imageSmoothingEnabled = false;
  const sx = Math.max(0, Math.floor(camX)), sy = Math.max(0, Math.floor(camY));
  const sw = Math.min(W * T - sx, Math.ceil(viewW) + 2), sh = Math.min(H * T - sy, Math.ceil(viewH) + 2);
  if (sw > 0 && sh > 0) ctx.drawImage(cache, sx, sy, sw, sh, sx, sy, sw, sh);
  // gentle water sparkle
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let ty = Math.floor(camY / T); ty < (camY + viewH) / T; ty++) for (let tx = Math.floor(camX / T); tx < (camX + viewW) / T; tx++) {
    if (isLand(tileAt(tx, ty)) || hash(tx, ty) < 0.8) continue;
    const ph = (time * 0.8 + hash(ty, tx) * 6) % 3; if (ph > 1) continue;
    ctx.fillRect(tx * T + 6 + hash(tx + 1, ty) * 18, ty * T + 8 + hash(tx, ty + 1) * 14, 6 * (1 - Math.abs(ph - 0.5) * 2) + 2, 2);
  }
  const inView = (x, y, m = 70) => x > camX - m && x < camX + viewW + m && y > camY - m && y < camY + viewH + m * 1.5;
  for (const p of pickups) { if (!inView(p.x, p.y)) continue; const b = Math.sin(time * 6 + p.t * 3) * 2; shadow(ctx, p.x, p.y + 8, 6, 2); ctx.drawImage(ICON_CANVAS[p.item], Math.round(p.x - 10), Math.round(p.y - 10 + b), 20, 20); }
  const list = [];
  for (const d of decor) if (inView(d.x, d.y)) list.push([d.y, 5, d]);
  for (const r of resources) if (r.alive && inView(r.x, r.y)) list.push([r.y, 0, r]);
  for (const e of enemies) if (e.alive && inView(e.x, e.y)) list.push([e.y, 1, e]);
  for (const n of NPCS) if (inView(n.x, n.y)) list.push([n.y, 2, n]);
  for (const a of animals) if (inView(a.x, a.y)) list.push([a.y, 6, a]);
  if (inView(HOUSE.x, HOUSE.y, 150)) list.push([HOUSE.y - 4, 4, null]);
  list.push([P.y, 3, P]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, kind, o] of list) {
    if (kind === 0) drawRes(ctx, o);
    else if (kind === 1) drawSlime(ctx, o);
    else if (kind === 2) drawNPC(ctx, o);
    else if (kind === 3) drawPlayer(ctx);
    else if (kind === 4) drawHouse(ctx);
    else if (kind === 5) { if (o.solid) shadow(ctx, o.x, o.y + 3, 12, 4); sprB(ctx, o.key, o.x, o.y + 6, o.s); }
    else drawAnimal(ctx, o);
  }
  for (const p of particles) { ctx.globalAlpha = Math.max(0, p.life * 1.6); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 2), 4, 4); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.font = '700 13px "Pixelify Sans", sans-serif';
  for (const f of floats) { ctx.globalAlpha = Math.min(1, f.life * 2); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(f.text, f.x + 1, f.y + 1); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
  ctx.globalAlpha = 1;
  mctx.imageSmoothingEnabled = false;
  mctx.drawImage(miniCache, 0, 0, mini.width, mini.height);
  const mxs = mini.width / (W * T), mys = mini.height / (H * T);
  mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 1; mctx.strokeRect(camX * mxs, camY * mys, viewW * mxs, viewH * mys);
  mctx.fillStyle = '#c2477a'; mctx.fillRect(NPCS[0].x * mxs - 2, NPCS[0].y * mys - 2, 4, 4);
  mctx.fillStyle = '#f4b740'; mctx.fillRect(NPCS[2].x * mxs - 2, NPCS[2].y * mys - 2, 4, 4);
  mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.arc(P.x * mxs, P.y * mys, 2.5, 0, 7); mctx.fill();
}

// ---------- save / load ----------
function serialize() { return { ...S, px: P.x, py: P.y }; }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); } catch (_) {} }
function applySave(d) {
  if (!d || typeof d !== 'object') return;
  const base = freshState();
  S = { ...base, ...d, inv: { ...base.inv, ...(d.inv || {}) }, tools: { ...base.tools, ...(d.tools || {}) }, met: { ...(d.met || {}) } };
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
  P.x = S.px; P.y = S.py;
  if (!walkable(P.x, P.y)) { P.x = cx * T; P.y = (cy + 2) * T; }
  buildIcons(); buildCache(); resize(); updateHUD();
  window.claude?.hot?.snapshot?.(() => ({ save: serialize() }));
  if (!S.intro) {
    S.intro = true;
    say('Brindle Isle', [
      'The storm passed in the night. You wake on a small island village.',
      'The only bridge to the mainland was swept away. Rebuilding it will cost 400 gold.',
      'Gather, craft, and trade your way there. Oma Fen, by the cottage, is a good place to start.',
    ]);
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
