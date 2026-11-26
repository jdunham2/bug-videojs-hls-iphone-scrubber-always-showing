// Server-authoritative hero profiles: characters per class, gold, bag, stash, talents, shop, trades.
import { CLASSES, canLearn } from '../public/shared/classes.js';
import { computeStats, xpForLevel } from '../public/shared/stats.js';
import { generateItem, WEAPONS } from '../public/shared/items.js';
import { RNG } from '../public/shared/rng.js';

export const BAG_SIZE = 24, STASH_SIZE = 48, MAX_POTIONS = 9;

export function newProfile(token) {
  return { token, name: 'Hero', color: '#e8a33d', gold: 60, stash: [], chests: {}, chars: {}, created: Date.now() };
}

export function starterChar(cls) {
  const C = CLASSES[cls];
  const w = generateItem(new RNG(7), 1, { slot: 'weapon', type: C.starter, rarity: 0 });
  w.name = { sword: 'Worn Sword', dagger: 'Worn Daggers', staff: 'Worn Staff' }[C.starter];
  return { level: 1, xp: 0, potions: 3, equipped: { weapon: w, helm: null, chest: null, boots: null }, bag: [], talents: {} };
}

export const getChar = (prof, cls) => (prof.chars[cls] ||= starterChar(cls));

export function profileView(p) {
  const pr = p.prof;
  return { t: 'profile', name: pr.name, color: pr.color, gold: pr.gold, stash: pr.stash, cls: p.cls, char: p.char, buffs: activeBuffs(p) };
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
  c.xp += n;
  let up = false;
  while (c.xp >= xpForLevel(c.level)) { c.xp -= xpForLevel(c.level); c.level++; up = true; }
  if (up) send({ t: 'levelUp', level: c.level });
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
