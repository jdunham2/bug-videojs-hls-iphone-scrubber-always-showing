// Endgame rules shared by server and client: Nightmare difficulty, weekly Rift Trials, crafting 2.0 costs,
// and the DPS / toughness math used by item comparison tooltips.
import { RNG } from './rng.js';
import { RIFT_MOD_KEYS } from './rifts.js';
import { weekKey } from './social.js';
import { LEGENDARIES, SETS, AFFIXES, WEAPON_CLASSES } from './items.js';
import { computeStats } from './stats.js';

export const DIFFICULTY = [
  { name: 'Normal', hp: 1, dmg: 1, luck: 1, gold: 1, minLevel: 1, color: '#d8d0c0' },
  { name: 'Nightmare I', hp: 2.2, dmg: 1.6, luck: 1.6, gold: 1.5, minLevel: 12, color: '#ff8a5a', essence: 1 },
  { name: 'Nightmare II', hp: 4, dmg: 2.3, luck: 2.2, gold: 2, minLevel: 20, color: '#ff4a4a', essence: 2 },
  { name: 'Nightmare III', hp: 7, dmg: 3.2, luck: 3, gold: 3, minLevel: 28, color: '#c83aff', essence: 4 },
];
export const NIGHTMARE_LEGS = Object.keys(LEGENDARIES).filter((k) => LEGENDARIES[k].nightmare);
export const NIGHTMARE_DROP = [0, 0.25, 0.4, 0.6]; // chance a legendary from a Nightmare boss carries a Nightmare power

// ---- weekly Rift Trial: everyone runs the same seed, keystone and modifiers ----
export const TRIAL_K = 10, TRIAL_LEVEL = 16, TRIAL_LIMIT = 420;
export function trialOf(week = weekKey()) {
  const rng = new RNG(week * 2654435761 >>> 0);
  const mods = RIFT_MOD_KEYS.slice().sort(() => rng.next() - 0.5).slice(0, 2);
  return { week, seed: (rng.next() * 1e9) | 0, mods, k: TRIAL_K, level: TRIAL_LEVEL, limit: TRIAL_LIMIT };
}

// ---- crafting 2.0 ----
export const CRAFT = {
  recipe: { cores: 3, shards: 250, gold: 2500 },
  recipeNightmare: { cores: 3, shards: 250, gold: 4000, essence: 5 },
  enchant: (n) => ({ shards: 40 + 30 * n, gold: 300 * (n + 1) }), // n = enchants already done on the item
  transmute: { cores: 2, gold: 1500 },
};
/** legendary powers a class can craft (its own + generic; Nightmare ones need essence) */
export const recipesFor = (cls) => Object.entries(LEGENDARIES).filter(([, L]) => L.cls === null || L.cls === cls).map(([k, L]) => ({ key: k, ...L }));
/** sets a class can transmute between */
export const setsFor = (cls) => Object.entries(SETS).filter(([, S]) => S.cls === cls).map(([k]) => k);
export const ENCHANT_KEYS = (slot) => Object.keys(AFFIXES).filter((k) => !(slot !== 'weapon' && k === 'leech'));
export const canWield = (cls, type) => (WEAPON_CLASSES[type] || []).includes(cls);

// ---- comparison math ----
export const dpsOf = (s) => s.dmg * s.atkSpeed * (1 + s.crit * (s.critDmg - 1)) * (1 + (s.skillDmg || 0) * 0.35);
export const ehpOf = (s) => s.maxHp * (1 + s.armor / 100);
/** stat deltas if `item` replaced whatever is equipped in its slot */
export function compareItem(char, cls, item) {
  const cur = computeStats(char, cls);
  const swapped = { ...char, equipped: { ...char.equipped, [item.slot]: item } };
  const next = computeStats(swapped, cls);
  return { dps: dpsOf(next) - dpsOf(cur), dpsPct: dpsOf(next) / Math.max(1e-6, dpsOf(cur)) - 1, ehp: ehpOf(next) - ehpOf(cur), ehpPct: ehpOf(next) / Math.max(1e-6, ehpOf(cur)) - 1, cur, next };
}
