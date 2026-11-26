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
  staff: { name: 'Staff', dmg: 13, speed: 1.1, range: 16, arc: 0.6, ranged: true },
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
  const slot = opts.slot || rng.weighted([['weapon', 3.5], ['helm', 2], ['chest', 2], ['boots', 2]]);
  const rarity = opts.rarity ?? rollRarity(rng, level, opts.luck || 1, opts.minRarity || 0);
  const R = RARITIES[rarity];
  const scale = (1 + 0.2 * (level - 1)) * R.mult;
  const item = { id: uid(), slot, rarity, level, affixes: {} };
  let base;
  if (slot === 'weapon') {
    const type = opts.type || rng.pick(opts.types && opts.types.length ? opts.types : Object.keys(WEAPONS));
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
  return decorateItem(item, rng);
}

export function itemPower(it) {
  let p = (it.dmg || 0) * (it.speed || 1) * 2.2 + (it.armor || 0) * 2 + (it.hp || 0) * 0.5;
  const a = it.affixes || {};
  if (it.leg) p += 60;
  if (it.set) p += 25;
  p += (a.dmgPct || 0) * 120 + (a.hp || 0) * 0.5 + (a.crit || 0) * 300 + (a.speed || 0) * 200 + (a.gold || 0) * 60 + (a.leech || 0) * 500;
  return Math.round(p);
}

export function affixLines(it) {
  return Object.entries(it.affixes || {}).map(([k, v]) => AFFIXES[k].fmt(v));
}

// ---------- Legendary powers & item sets ----------
export const LEGENDARIES = {
  // Warden
  w_shockbash: { cls: 'warden', name: 'Shockwave Bash', desc: 'Shield Bash releases a shockwave that hits everything in a wide cone ahead.' },
  w_furycry: { cls: 'warden', name: 'Battle Fury', desc: 'War Cry grants +30% damage for 6 seconds.' },
  w_aftershock: { cls: 'warden', name: 'Aftershock', desc: 'Earthshatter strikes again 0.8s later for 60% damage.' },
  w_reflect: { cls: 'warden', name: 'Mirror Shield', desc: 'Blocking reflects 50% of the blocked damage back at the attacker.' },
  // Emberblade
  e_twinblink: { cls: 'emberblade', name: 'Twin Shadows', desc: 'Blink Strike also hits a second nearby enemy.' },
  e_vortex: { cls: 'emberblade', name: 'Ember Vortex', desc: 'Fire Whirl pulls enemies toward you.' },
  e_cinderflurry: { cls: 'emberblade', name: 'Cinder Flurry', desc: 'Blade Flurry stabs set enemies ablaze for 40% extra damage over time.' },
  e_reaper: { cls: 'emberblade', name: 'Reaper', desc: 'Kills with Execution reset its cooldown.' },
  // Hexcaller
  h_fork: { cls: 'hexcaller', name: 'Forked Storm', desc: 'Chain Lightning forks, striking two targets per jump.' },
  h_trinity: { cls: 'hexcaller', name: 'Trinity Bolt', desc: 'Fire Bolt launches three bolts in a fan.' },
  h_martyr: { cls: 'hexcaller', name: 'Martyr Spirits', desc: 'Ember Spirits explode for 300% damage when they expire.' },
  h_shower: { cls: 'hexcaller', name: 'Starfall', desc: 'Meteor calls three smaller meteors around the target.' },
  // Generic
  g_bloodcrit: { cls: null, name: 'Sanguine Edge', desc: 'Critical hits heal you for 1.5% of your maximum health.' },
  g_thunder: { cls: null, name: 'Thunderlord', desc: 'Every 10th hit calls down lightning for 250% damage.' },
  g_phoenix: { cls: null, name: 'Phoenix Heart', desc: 'Once every 120s, lethal damage revives you at 40% health.' },
  g_tailwind: { cls: null, name: 'Tailwind', desc: 'Dodge rolls grant +35% move speed for 2 seconds.' },
  g_combust: { cls: null, name: 'Combustion', desc: 'Enemies you kill explode for 60% damage around them.' },
  g_greed: { cls: null, name: "Goblin's Greed", desc: '+50% gold find.', stats: { goldFind: 0.5 } },
};

export const SETS = {
  bastion: { cls: 'warden', name: 'Bastion of the Unbroken', pieces: ['Blade', 'Greathelm', 'Bulwark Plate', 'Ironshod Boots'], b2: { armorPct: 0.25 }, b4: { block: 0.15, flag: 'bastion4' }, d2: '+25% armor', d4: 'Block −15% more damage; War Cry cooldown halved' },
  warlord: { cls: 'warden', name: "Warlord's Regalia", pieces: ['Cleaver', 'Crown', 'Warplate', 'Marching Greaves'], b2: { dmgPct: 0.12 }, b4: { skillDmg: 0.4 }, d2: '+12% damage', d4: '+40% skill damage' },
  earthshaker: { cls: 'warden', name: "Earthshaker's Mantle", pieces: ['Maul', 'Horned Helm', 'Stonehide', 'Quakestompers'], b2: { cdr: 0.15 }, b4: { flag: 'quakeFree' }, d2: '15% cooldown reduction', d4: 'Earthshatter costs no Rage' },
  ashdancer: { cls: 'emberblade', name: "Ashdancer's Garb", pieces: ['Fang', 'Hood', 'Silk Jerkin', 'Soft Boots'], b2: { crit: 0.08 }, b4: { flag: 'dodgeHeal' }, d2: '+8% crit chance', d4: 'Perfect dodges heal 25% health' },
  cinder: { cls: 'emberblade', name: 'Cinderstorm', pieces: ['Kris', 'Mask', 'Ember Coat', 'Ash Treads'], b2: { moveSpeed: 0.12 }, b4: { skillDmg: 0.4 }, d2: '+12% move speed', d4: '+40% skill damage' },
  nightblade: { cls: 'emberblade', name: "Nightblade's Edge", pieces: ['Edge', 'Cowl', 'Shadowmail', 'Stalkers'], b2: { critDmg: 0.5 }, b4: { costMul: -0.35 }, d2: '+50% crit damage', d4: 'Skills cost 35% less Focus' },
  stormcaller: { cls: 'hexcaller', name: "Stormcaller's Vestments", pieces: ['Rod', 'Circlet', 'Stormrobe', 'Sandals'], b2: { resRegen: 0.25 }, b4: { skillDmg: 0.4 }, d2: '+25% Mana regeneration', d4: '+40% skill damage' },
  pyromancer: { cls: 'hexcaller', name: "Pyromancer's Robes", pieces: ['Brand', 'Cowl', 'Firerobe', 'Cinderslippers'], b2: { dmgPct: 0.12 }, b4: { costMul: -0.35 }, d2: '+12% damage', d4: 'Skills cost 35% less Mana' },
  soulbinder: { cls: 'hexcaller', name: "Soulbinder's Wraps", pieces: ['Spiritstaff', 'Veil', 'Wraps', 'Footwraps'], b2: { hpPct: 0.15 }, b4: { flag: 'spiritPerm' }, d2: '+15% health', d4: 'Ember Spirits never expire' },
};
const SLOT_IDX = { weapon: 0, helm: 1, chest: 2, boots: 3 };
export const WEAPON_CLASSES = { sword: ['warden', 'emberblade'], axe: ['warden'], hammer: ['warden'], dagger: ['emberblade'], staff: ['hexcaller'] };

export function decorateItem(item, rng) {
  if (item.rarity === 4) {
    const pool = Object.entries(LEGENDARIES).filter(([, L]) => item.slot === 'weapon' ? (L.cls === null ? rng.chance(0.3) : WEAPON_CLASSES[item.type].includes(L.cls)) : (L.cls === null || rng.chance(0.4)));
    if (pool.length) item.leg = rng.pick(pool)[0];
  } else if (item.rarity >= 3 && rng.chance(0.2)) {
    const sets = Object.entries(SETS).filter(([, S]) => item.slot !== 'weapon' || WEAPON_CLASSES[item.type].includes(S.cls));
    if (sets.length) {
      const [id, S] = rng.pick(sets);
      item.set = id; item.name = `${S.name.replace(/^(The )/, '')} ${S.pieces[SLOT_IDX[item.slot]]}`;
    }
  }
  item.power = itemPower(item); item.price = Math.round(item.power * (item.rarity + 1) * 0.4 + 3);
  return item;
}

// raise an item's level by one, rescaling its base stats
export function levelUpItem(it) {
  const k = (1 + 0.2 * it.level) / (1 + 0.2 * (it.level - 1));
  for (const s of ['dmg', 'armor', 'hp']) if (it[s]) it[s] = Math.round(it[s] * k);
  for (const [a, v] of Object.entries(it.affixes || {})) if (a === 'hp' || a === 'dmgPct') it.affixes[a] = v * (a === 'hp' ? k : 1.03);
  it.level++;
  it.power = itemPower(it); it.price = Math.round(it.power * (it.rarity + 1) * 0.4 + 3);
}
export function rerollAffix(it, key, rng, level) {
  if (!it.affixes || !(key in it.affixes)) return false;
  delete it.affixes[key];
  const keys = Object.keys(AFFIXES).filter((k) => !(it.slot !== 'weapon' && k === 'leech'));
  const k = rng.pick(keys);
  it.affixes[k] = (it.affixes[k] || 0) + AFFIXES[k].roll(rng, level);
  it.power = itemPower(it); it.price = Math.round(it.power * (it.rarity + 1) * 0.4 + 3);
  return true;
}
export const SALVAGE = [1, 3, 8, 20, 45];
