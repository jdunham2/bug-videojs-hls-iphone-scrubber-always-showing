// Loot generation: weapons + armor with rarities, affixes and level scaling.
import { RNG, uid } from './rng.js';

export const RARITIES = [
  { key: 'common', name: 'Common', color: '#cfd3d8', mult: 1.0, affixes: 0 },
  { key: 'uncommon', name: 'Uncommon', color: '#5eea8a', mult: 1.15, affixes: 1 },
  { key: 'rare', name: 'Rare', color: '#5ab0ff', mult: 1.35, affixes: 2 },
  { key: 'epic', name: 'Epic', color: '#c77dff', mult: 1.62, affixes: 3 },
  { key: 'legendary', name: 'Legendary', color: '#ff9a3c', mult: 2.0, affixes: 4 },
];

export const WEAPONS = {
  sword: { name: 'Sword', dmg: 12, speed: 1.0, range: 2.7, arc: 2.0 },
  axe: { name: 'Axe', dmg: 17, speed: 0.82, range: 2.8, arc: 2.2 },
  hammer: { name: 'Warhammer', dmg: 25, speed: 0.62, range: 3.0, arc: 2.6, cleave: true },
  dagger: { name: 'Twin Daggers', dmg: 8, speed: 1.6, range: 2.2, arc: 1.6, crit: 0.1 },
};

export const ARMOR = {
  helm: { name: 'Helm', armor: 4, hp: 10, names: ['Helm', 'Visage', 'Crown', 'Hood'] },
  chest: { name: 'Chestplate', armor: 9, hp: 22, names: ['Chestplate', 'Hauberk', 'Cuirass', 'Vestments'] },
  boots: { name: 'Boots', armor: 3, hp: 6, names: ['Boots', 'Greaves', 'Treads', 'Sabatons'] },
};

const PREFIX = [
  ['Worn', 'Rusty', 'Plain', 'Militia'],
  ['Sturdy', 'Honed', 'Keen', 'Polished'],
  ['Gleaming', 'Runed', 'Tempered', 'Moonlit'],
  ['Emberforged', 'Voidtouched', 'Stormbound', 'Bloodsworn'],
  ["Dawnbreaker's", "Ashen King's", 'Eternal', 'Starfallen'],
];

const AFFIXES = {
  dmgPct: { label: 'Damage', fmt: (v) => `+${Math.round(v * 100)}% Damage`, suffix: 'of Fury', roll: (r, l) => r.range(0.05, 0.12) + l * 0.004 },
  hp: { label: 'Health', fmt: (v) => `+${Math.round(v)} Health`, suffix: 'of Vigor', roll: (r, l) => r.range(10, 22) * (1 + l * 0.15) },
  crit: { label: 'Crit', fmt: (v) => `+${(v * 100).toFixed(1)}% Crit Chance`, suffix: 'of Precision', roll: (r) => r.range(0.02, 0.06) },
  speed: { label: 'Speed', fmt: (v) => `+${Math.round(v * 100)}% Move Speed`, suffix: 'of Haste', roll: (r) => r.range(0.03, 0.07) },
  gold: { label: 'Gold', fmt: (v) => `+${Math.round(v * 100)}% Gold Find`, suffix: 'of Fortune', roll: (r) => r.range(0.08, 0.2) },
  leech: { label: 'Lifesteal', fmt: (v) => `${(v * 100).toFixed(1)}% Lifesteal`, suffix: 'of the Leech', roll: (r) => r.range(0.01, 0.03) },
};

export function rollRarity(rng, level, luck = 1, min = 0) {
  const w = [
    [0, 62],
    [1, 26],
    [2, (9 + level * 1.2) * luck],
    [3, (2.5 + level * 0.7) * luck],
    [4, (0.6 + level * 0.25) * luck],
  ].filter((e) => e[0] >= min);
  return rng.weighted(w);
}

export function generateItem(rng, level, opts = {}) {
  rng = rng || new RNG((Math.random() * 1e9) | 0);
  const slot = opts.slot || rng.weighted([['weapon', 4], ['helm', 2], ['chest', 2], ['boots', 2]]);
  const rarity = opts.rarity ?? rollRarity(rng, level, opts.luck || 1, opts.minRarity || 0);
  const R = RARITIES[rarity];
  const scale = (1 + 0.2 * (level - 1)) * R.mult;
  const item = { id: uid(), slot, rarity, level, affixes: {} };
  let base;
  if (slot === 'weapon') {
    const type = opts.type || rng.pick(Object.keys(WEAPONS));
    const W = WEAPONS[type];
    item.type = type;
    item.dmg = Math.round(W.dmg * scale * rng.range(0.92, 1.08));
    item.speed = W.speed;
    base = W.name;
  } else {
    const A = ARMOR[slot];
    item.type = slot;
    item.armor = Math.round(A.armor * scale * rng.range(0.9, 1.1));
    item.hp = Math.round(A.hp * scale * rng.range(0.9, 1.1));
    base = rng.pick(A.names);
  }
  const keys = Object.keys(AFFIXES).filter((k) => !(slot !== 'weapon' && k === 'leech'));
  let mainAffix = null;
  for (let i = 0; i < R.affixes; i++) {
    const k = rng.pick(keys);
    const v = AFFIXES[k].roll(rng, level);
    item.affixes[k] = (item.affixes[k] || 0) + v;
    if (!mainAffix) mainAffix = k;
  }
  item.name = `${rng.pick(PREFIX[rarity])} ${base}${mainAffix && rarity >= 2 ? ' ' + AFFIXES[mainAffix].suffix : ''}`;
  item.power = itemPower(item);
  item.price = Math.round(item.power * (rarity + 1) * 0.4 + 3); // sell value
  return item;
}

export function itemPower(it) {
  let p = (it.dmg || 0) * (it.speed || 1) * 2.2 + (it.armor || 0) * 2 + (it.hp || 0) * 0.5;
  const a = it.affixes || {};
  p += (a.dmgPct || 0) * 120 + (a.hp || 0) * 0.5 + (a.crit || 0) * 300 + (a.speed || 0) * 200 + (a.gold || 0) * 60 + (a.leech || 0) * 500;
  return Math.round(p);
}

export function affixLines(it) {
  return Object.entries(it.affixes || {}).map(([k, v]) => AFFIXES[k].fmt(v));
}
