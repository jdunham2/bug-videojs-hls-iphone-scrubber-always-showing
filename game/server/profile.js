// Server-authoritative hero profiles: characters per class, gold, bag, stash, talents, shop, trades.
import { CLASSES, canLearn } from '../public/shared/classes.js';
import { computeStats, xpForLevel } from '../public/shared/stats.js';
import { LEVEL_CAP, PARAGON, paragonXp } from '../public/shared/rifts.js';
import { generateItem, WEAPONS, SALVAGE, levelUpItem, rerollAffix, GEMS, gemKey, parseGem, itemPower } from '../public/shared/items.js';
import { RNG } from '../public/shared/rng.js';

export const BAG_SIZE = 24, STASH_SIZE = 48, MAX_POTIONS = 9;

export function newProfile(token) {
  return { token, name: 'Hero', color: '#e8a33d', gold: 60, stash: [], chests: {}, chars: {}, created: Date.now() };
}

export function starterChar(cls) {
  const C = CLASSES[cls];
  const w = generateItem(new RNG(7), 1, { slot: 'weapon', type: C.starter, rarity: 0 });
  w.name = { sword: 'Worn Sword', dagger: 'Worn Daggers', staff: 'Worn Staff', bow: 'Worn Bow' }[C.starter];
  return { level: 1, xp: 0, potions: 3, equipped: { weapon: w, helm: null, chest: null, boots: null }, bag: [], talents: {} };
}

export const getChar = (prof, cls) => (prof.chars[cls] ||= starterChar(cls));

export function profileView(p) {
  const pr = p.prof;
  pr.mats ||= { shards: 0, cores: 0 };
  pr.gems ||= {};
  return { t: 'profile', name: pr.name, color: pr.color, gold: pr.gold, stash: pr.stash, mats: pr.mats, gems: pr.gems, looks: pr.looks || [], riftMax: pr.riftMax || 1, research: pr.research || {}, peaks: !!pr.peaks, cls: p.cls, char: p.char, buffs: activeBuffs(p) };
}

export function activeBuffs(p) {
  const now = Date.now(), out = {};
  for (const [k, until] of Object.entries(p.buffs || {})) if (until > now) out[k] = Math.round((until - now) / 1000);
  return out;
}

export const statsOf = (p) => computeStats(p.char, p.cls, activeBuffs(p));

// roll loot biased toward the receiving player's class weapons
export function rollItem(p, level, opts = {}) {
  const types = Math.random() < 0.75 ? CLASSES[p.cls].weapons : Object.keys(WEAPONS);
  return generateItem(null, level, { types, ...opts });
}

export function addXp(p, n, send) {
  const c = p.char;
  c.paragon ||= { pts: 0, xp: 0, alloc: {} };
  if (c.level >= LEVEL_CAP) {
    c.paragon.xp += n;
    while (c.paragon.xp >= paragonXp(c.paragon.pts)) { c.paragon.xp -= paragonXp(c.paragon.pts); c.paragon.pts++; send({ t: 'paragonUp', pts: c.paragon.pts }); }
    p.dirty = true; return;
  }
  c.xp += n;
  let up = false;
  while (c.level < LEVEL_CAP && c.xp >= xpForLevel(c.level)) { c.xp -= xpForLevel(c.level); c.level++; up = true; }
  if (up) send({ t: 'levelUp', level: c.level });
  if (c.level >= LEVEL_CAP && c.xp > 0) { const left = c.xp; c.xp = 0; addXp(p, left, send); }
  p.dirty = true;
}

// ---- inventory ops: return an error string or null ----
export function equip(p, i) {
  const c = p.char, it = c.bag[i];
  if (!it) return 'No item there.';
  if (it.slot === 'weapon' && !CLASSES[p.cls].weapons.includes(it.type)) return `A ${CLASSES[p.cls].name} cannot wield that.`;
  const cur = c.equipped[it.slot];
  c.equipped[it.slot] = it;
  if (cur) c.bag[i] = cur; else c.bag.splice(i, 1);
  p.dirty = true; return null;
}
export function unequip(p, slot) {
  const c = p.char;
  if (!c.equipped[slot]) return 'Nothing equipped.';
  if (slot === 'weapon') return 'You need a weapon equipped.';
  if (c.bag.length >= BAG_SIZE) return 'Your bag is full.';
  c.bag.push(c.equipped[slot]); c.equipped[slot] = null; p.dirty = true; return null;
}
export function sell(p, i) {
  const it = p.char.bag[i]; if (!it) return 'No item there.';
  p.char.bag.splice(i, 1); p.prof.gold += it.price; p.dirty = true; return null;
}
export function discard(p, i) { if (!p.char.bag[i]) return 'No item there.'; p.char.bag.splice(i, 1); p.dirty = true; return null; }

export function makeShop(level) {
  const stock = [];
  for (let i = 0; i < 6; i++) {
    const it = generateItem(null, level, { minRarity: i < 2 ? 2 : 1, luck: 1.8 });
    it.cost = Math.round(it.price * 4 + 10 * level);
    stock.push(it);
  }
  return stock;
}
export function buy(p, i) {
  const it = p.shop?.[i]; if (!it) return 'That item is gone.';
  if (p.prof.gold < it.cost) return 'Not enough gold.';
  if (p.char.bag.length >= BAG_SIZE) return 'Your bag is full.';
  p.prof.gold -= it.cost;
  const copy = { ...it }; delete copy.cost;
  p.char.bag.push(copy); p.shop.splice(i, 1); p.dirty = true; return null;
}
export function buySpecial(p, kind, level) {
  const cost = kind === 'potion' ? 25 : 90 * level;
  if (p.prof.gold < cost) return 'Not enough gold.';
  if (kind === 'potion') { if (p.char.potions >= MAX_POTIONS) return `You can carry ${MAX_POTIONS} potions.`; p.char.potions++; }
  else { if (p.char.bag.length >= BAG_SIZE) return 'Your bag is full.'; p.char.bag.push(rollItem(p, level, { minRarity: 2, luck: 2.5 })); }
  p.prof.gold -= cost; p.dirty = true; return null;
}
export function learn(p, id) {
  if (!canLearn(p.cls, p.char.talents, id, p.char.level)) return 'You cannot learn that yet.';
  p.char.talents[id] = (p.char.talents[id] || 0) + 1; p.dirty = true; return null;
}
export function resetTalents(p) {
  const cost = 25 * p.char.level;
  if (p.prof.gold < cost) return `Resetting costs ${cost} gold.`;
  p.prof.gold -= cost; p.char.talents = {}; p.dirty = true; return null;
}
export function stashOp(p, op, i) {
  const c = p.char, s = p.prof.stash;
  if (op === 'put') { if (!c.bag[i]) return 'No item there.'; if (s.length >= STASH_SIZE) return 'The stash is full.'; s.push(c.bag.splice(i, 1)[0]); }
  else { if (!s[i]) return 'No item there.'; if (c.bag.length >= BAG_SIZE) return 'Your bag is full.'; c.bag.push(s.splice(i, 1)[0]); }
  p.dirty = true; return null;
}

// ---- trading ----
export function tradeView(tr, p) {
  const me = tr.a === p ? 'a' : 'b', them = me === 'a' ? 'b' : 'a';
  const items = (side) => tr.offer[side].items.map((id) => tr[side].char.bag.find((x) => x.id === id)).filter(Boolean);
  return { t: 'tradeState', withName: tr[them].prof.name, mine: { items: items(me), gold: tr.offer[me].gold }, theirs: { items: items(them), gold: tr.offer[them].gold }, accMine: !!tr.acc[me], accTheirs: !!tr.acc[them] };
}
export function executeTrade(tr) {
  const { a, b } = tr;
  const pick = (p, ids) => ids.map((id) => p.char.bag.find((x) => x.id === id));
  const ia = pick(a, tr.offer.a.items), ib = pick(b, tr.offer.b.items);
  if (ia.some((x) => !x) || ib.some((x) => !x)) return 'An offered item is no longer available.';
  if (a.prof.gold < tr.offer.a.gold || b.prof.gold < tr.offer.b.gold) return 'Not enough gold.';
  if (a.char.bag.length - ia.length + ib.length > BAG_SIZE || b.char.bag.length - ib.length + ia.length > BAG_SIZE) return 'Not enough bag space.';
  a.char.bag = a.char.bag.filter((x) => !ia.includes(x)).concat(ib);
  b.char.bag = b.char.bag.filter((x) => !ib.includes(x)).concat(ia);
  a.prof.gold += tr.offer.b.gold - tr.offer.a.gold;
  b.prof.gold += tr.offer.a.gold - tr.offer.b.gold;
  a.dirty = b.dirty = true;
  return null;
}

// ---- blacksmith ----
const rng = new RNG(Date.now() & 0xffffff);
function itemRef(p, src, ref) { return src === 'eq' ? p.char.equipped[ref] : p.char.bag[ref | 0]; }
export const smithCosts = (it, level) => ({ reroll: { shards: 6 * (it.rarity + 1), gold: 15 * level }, upgrade: { shards: 10 * (it.rarity + 1) + it.level * 2, cores: it.rarity === 4 ? 1 : 0 } });
export function salvage(p, i) {
  const it = p.char.bag[i]; if (!it) return 'No item there.';
  const m = (p.prof.mats ||= { shards: 0, cores: 0 });
  m.shards += Math.round(SALVAGE[it.rarity] * (1 + it.level * 0.1));
  if (it.rarity === 4) m.cores++;
  p.char.bag.splice(i, 1); p.dirty = true; return null;
}
export function reroll(p, src, ref, key, level) {
  const it = itemRef(p, src, ref); if (!it) return 'No item there.';
  const c = smithCosts(it, level).reroll, m = (p.prof.mats ||= { shards: 0, cores: 0 });
  if (m.shards < c.shards || p.prof.gold < c.gold) return `Rerolling costs ${c.shards} shards and ${c.gold} gold.`;
  if (!rerollAffix(it, key, rng, it.level)) return 'That affix cannot be rerolled.';
  m.shards -= c.shards; p.prof.gold -= c.gold; p.dirty = true; return null;
}
export function upgradeItem(p, src, ref) {
  const it = itemRef(p, src, ref); if (!it) return 'No item there.';
  if (it.level >= p.char.level + 5) return 'The item cannot exceed your level by more than 5.';
  const c = smithCosts(it, 0).upgrade, m = (p.prof.mats ||= { shards: 0, cores: 0 });
  if (m.shards < c.shards || m.cores < c.cores) return `Upgrading costs ${c.shards} shards${c.cores ? ' and 1 Ember Core' : ''}.`;
  m.shards -= c.shards; m.cores -= c.cores; levelUpItem(it); p.dirty = true; return null;
}

export function spendParagon(p, key) {
  const c = p.char; c.paragon ||= { pts: 0, xp: 0, alloc: {} };
  const spent = Object.values(c.paragon.alloc).reduce((a, b) => a + b, 0);
  if (!PARAGON[key] || spent >= c.paragon.pts) return 'No Paragon points available.';
  if (PARAGON[key].max && (c.paragon.alloc[key] || 0) >= PARAGON[key].max) return 'That stat is maxed.';
  c.paragon.alloc[key] = (c.paragon.alloc[key] || 0) + 1; p.dirty = true; return null;
}

// ---- gems & sockets ----
export function dropGem(p, level) {
  const tier = Math.max(1, Math.min(5, 1 + Math.floor(Math.random() * (1 + level / 4))));
  const k = gemKey(Object.keys(GEMS)[Math.floor(Math.random() * 3)], tier);
  const g = (p.prof.gems ||= {}); g[k] = (g[k] || 0) + 1; p.dirty = true; return k;
}
const repower = (it) => { it.power = itemPower(it); it.price = Math.round(it.power * (it.rarity + 1) * 0.4 + 3); };
export function socket(p, src, ref, idx, k) {
  const it = itemRef(p, src, ref); if (!it?.sockets) return 'That item has no sockets.';
  if (!(idx in it.sockets) || it.sockets[idx]) return 'That socket is not empty.';
  const g = (p.prof.gems ||= {}); if (!g[k]) return 'You do not have that gem.';
  g[k]--; if (!g[k]) delete g[k];
  it.sockets[idx] = k; repower(it); p.dirty = true; return null;
}
export function unsocket(p, src, ref, idx) {
  const it = itemRef(p, src, ref); const k = it?.sockets?.[idx]; if (!k) return 'Nothing to remove.';
  const cost = 20 * parseGem(k).tier;
  if (p.prof.gold < cost) return `Removing it costs ${cost} gold.`;
  p.prof.gold -= cost; it.sockets[idx] = null; const g = (p.prof.gems ||= {}); g[k] = (g[k] || 0) + 1; repower(it); p.dirty = true; return null;
}
export function combineGem(p, k) {
  const g = (p.prof.gems ||= {}), { type, tier } = parseGem(k);
  if (!GEMS[type] || tier >= 5) return 'That gem cannot be improved.';
  if ((g[k] || 0) < 3) return 'You need 3 of that gem.';
  const cost = 30 * tier; if (p.prof.gold < cost) return `Combining costs ${cost} gold.`;
  g[k] -= 3; if (!g[k]) delete g[k]; const n = gemKey(type, tier + 1); g[n] = (g[n] || 0) + 1; p.prof.gold -= cost; p.dirty = true; return null;
}
// ---- wardrobe ----
const DYES = /^#[0-9a-f]{6}$/i;
export function setLook(p, look) {
  const l = { dye: DYES.test(look.dye || '') ? look.dye : null, hideHelm: !!look.hideHelm, ap: Math.max(-1, Math.min(4, look.ap | 0)) };
  p.char.look = l; p.dirty = true; return null;
}
export function saveLook(p, slot) { const L = (p.prof.looks ||= []); if (slot < 0 || slot > 2) return 'Invalid slot.'; L[slot] = { ...(p.char.look || {}) }; p.dirty = true; return null; }
