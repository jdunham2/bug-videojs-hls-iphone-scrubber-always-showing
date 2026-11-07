// Gear: bows, armor and gadgets that drop as loot. Each item has a base type
// (how it plays), a rarity (how many perks it rolls), a power level (raw
// strength) and perks. Found gear goes straight into the stash in the profile;
// one bow, one armor and two gadgets are equipped at a time.

import { profile, saveProfile } from './profile.js';

export const RARITIES = {
  common: { name: 'Common', color: '#c9c4b8', perks: 1, tiers: [1, 1] },
  rare: { name: 'Rare', color: '#5fb4ff', perks: 2, tiers: [1, 2] },
  unique: { name: 'Unique', color: '#ffb340', perks: 3, tiers: [2, 3] },
};
export const RARITY_ORDER = ['common', 'rare', 'unique'];

/** How each bow plays. Multipliers on the hero's base values. */
export const BOWS = {
  longbow: { name: 'Longbow', blurb: 'Reliable all-rounder.', damage: 1, drawTime: 1, window: 1, arrowSpeed: 1, drawMove: 1, color: 0x6b3f1d, scale: 1 },
  shortbow: { name: 'Shortbow', blurb: 'Quick to draw, lighter hits.', damage: 0.8, drawTime: 0.75, window: 1, arrowSpeed: 0.95, drawMove: 1.15, color: 0x8a5a2b, scale: 0.85 },
  warbow: { name: 'War Bow', blurb: 'Slow, heavy, hits like a hammer.', damage: 1.4, drawTime: 1.3, window: 0.9, arrowSpeed: 1.15, drawMove: 0.85, color: 0x3a2618, scale: 1.15 },
  huntingBow: { name: 'Hunting Bow', blurb: 'A forgiving perfect window.', damage: 0.95, drawTime: 0.95, window: 1.45, arrowSpeed: 1, drawMove: 1, color: 0x7d6a3c, scale: 0.95 },
  horseBow: { name: 'Horse Bow', blurb: 'Draw at nearly full speed on the move.', damage: 0.9, drawTime: 0.85, window: 1, arrowSpeed: 1, drawMove: 1.6, color: 0x5a2f2a, scale: 0.8 },
};

/** How each armor plays. */
export const ARMORS = {
  jerkin: { name: 'Leather Jerkin', blurb: 'Light and quick.', hp: 1, speed: 1.06, dr: 0, dodge: 1 },
  cloak: { name: "Ranger's Cloak", blurb: 'Faster dodge recovery.', hp: 1.05, speed: 1.03, dr: 0, dodge: 0.8 },
  chainmail: { name: 'Chainmail', blurb: 'Solid protection.', hp: 1.25, speed: 0.97, dr: 0.06, dodge: 1 },
  plate: { name: 'Plate Armor', blurb: 'Very tough, a little slow.', hp: 1.45, speed: 0.9, dr: 0.12, dodge: 1.1 },
};

/** Gadgets: used on a cooldown (keys 1 and 2). Effects live in gadgets.js. */
export const GADGETS = {
  bearTrap: { name: 'Bear Trap', blurb: 'Set at your feet. Snaps shut on the first enemy, holding it fast.', cooldown: 11 },
  smokeBomb: { name: 'Smoke Bomb', blurb: 'A thick cloud: enemies inside stumble about and cannot attack.', cooldown: 18 },
  flask: { name: 'Healing Tonic', blurb: 'Drink to recover a big chunk of health over two seconds.', cooldown: 24 },
  net: { name: 'Throwing Net', blurb: 'Hurled at the cursor, tangling every enemy it lands on.', cooldown: 14 },
  powderKeg: { name: 'Powder Keg', blurb: 'Lobbed at the cursor. A short fuse, then a very big bang.', cooldown: 15 },
  warHorn: { name: 'War Horn', blurb: 'A rallying blast: knocks enemies back and quickens you.', cooldown: 22 },
};

const per = (values) => (tier) => values[tier - 1];

/** Perks: `slot` says which gear can roll them; `value(tier)` and `text(v)` describe them. */
export const PERKS = {
  // Bow perks
  keenEye: { slot: 'bow', name: 'Keen Eye', adj: 'Keen', value: per([0.15, 0.3, 0.45]), text: (v) => `Perfect shots deal +${pct(v)} damage` },
  quickNock: { slot: 'bow', name: 'Quick Nock', adj: 'Swift', value: per([0.07, 0.14, 0.21]), text: (v) => `Draw ${pct(v)} faster` },
  broadheads: { slot: 'bow', name: 'Broadheads', adj: 'Brutal', value: per([0.15, 0.3, 0.45]), text: (v) => `+${pct(v)} damage to elites and bosses` },
  barbed: { slot: 'bow', name: 'Barbed Heads', adj: 'Barbed', value: per([3, 6, 9]), text: (v) => `Hits make enemies bleed for ${v} damage per second` },
  steadyHands: { slot: 'bow', name: 'Steady Hands', adj: 'Steady', value: per([0.2, 0.4, 0.6]), text: (v) => `Perfect window ${pct(v)} wider` },
  momentum: { slot: 'bow', name: 'Momentum', adj: 'Daring', value: per([0.4, 0.8, 1.2]), text: (v) => `The first shot after a dodge deals +${pct(v)} damage` },
  // Armor perks
  padded: { slot: 'armor', name: 'Padded', adj: 'Padded', value: per([0.05, 0.1, 0.15]), text: (v) => `Take ${pct(v)} less damage` },
  lightStep: { slot: 'armor', name: 'Light Step', adj: 'Nimble', value: per([0.05, 0.1, 0.15]), text: (v) => `+${pct(v)} move speed` },
  tumbler: { slot: 'armor', name: 'Tumbler', adj: 'Agile', value: per([0.1, 0.2, 0.3]), text: (v) => `Dodge recharges ${pct(v)} faster` },
  scavenger: { slot: 'armor', name: 'Scavenger', adj: "Scavenger's", value: per([0.2, 0.4, 0.6]), text: (v) => `${pct(v)} chance for an extra gem` },
  fieldDressing: { slot: 'armor', name: 'Field Dressing', adj: "Medic's", value: per([2, 4, 6]), text: (v) => `Heal ${v} HP on each kill` },
  vigor: { slot: 'armor', name: 'Vigor', adj: 'Hardy', value: per([10, 20, 30]), text: (v) => `+${v} max HP` },
  // Gadget perks
  quickReload: { slot: 'gadget', name: 'Quick Reload', adj: 'Ready', value: per([0.1, 0.2, 0.3]), text: (v) => `Cooldown ${pct(v)} shorter` },
  heavyCharge: { slot: 'gadget', name: 'Heavy Charge', adj: 'Potent', value: per([0.15, 0.3, 0.45]), text: (v) => `Effect ${pct(v)} stronger` },
  lingering: { slot: 'gadget', name: 'Lingering', adj: 'Lasting', value: per([0.2, 0.4, 0.6]), text: (v) => `Lasts ${pct(v)} longer` },
};

const pct = (v) => `${Math.round(v * 100)}%`;

/** Named uniques: a fixed name per base, so finding one feels special. */
const UNIQUE_NAMES = {
  longbow: 'Wolfsong',
  shortbow: 'Sparrowhawk',
  warbow: 'Oakheart',
  huntingBow: 'The Stalker',
  horseBow: 'Galeriders',
  jerkin: "Fox's Hide",
  cloak: "Warden's Mantle",
  chainmail: 'Ironbark Hauberk',
  plate: "Gorvak's Bane",
  bearTrap: 'The Iron Jaw',
  smokeBomb: "Night's Veil",
  flask: "Grandmother's Remedy",
  net: "The Fisher King's Net",
  powderKeg: 'Thunderbarrel',
  warHorn: 'Horn of the Wolf Clan',
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);

export const basesFor = (slot) => (slot === 'bow' ? BOWS : slot === 'gadget' ? GADGETS : ARMORS);
export const baseOf = (item) => basesFor(item.slot)[item.base];

/** Drop odds by source. */
const ODDS = {
  enemy: { common: 0.75, rare: 0.22, unique: 0.03 },
  elite: { common: 0.4, rare: 0.48, unique: 0.12 },
  boss: { common: 0, rare: 0.6, unique: 0.4 },
};

/** Pick a rarity; `boost` (harder difficulty) moves odds from Common toward Rare and Unique. */
export function rollRarity(source = 'enemy', boost = 0) {
  const base = ODDS[source];
  const shift = Math.min(base.common, boost);
  const o = { common: base.common - shift, rare: base.rare + shift * 0.65, unique: base.unique + shift * 0.35 };
  let r = Math.random();
  for (const k of RARITY_ORDER) if ((r -= o[k]) <= 0) return k;
  return 'common';
}

/** Make a new item. */
export function rollItem(slot, power, rarity = 'common') {
  const bases = basesFor(slot);
  const base = pick(Object.keys(bases));
  const R = RARITIES[rarity];
  const pool = Object.keys(PERKS).filter((k) => PERKS[k].slot === slot);
  const perks = [];
  while (perks.length < R.perks && pool.length) {
    const id = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    perks.push([id, Math.round(rand(R.tiers[0], R.tiers[1]))]);
  }
  const item = { uid: newUid(), slot, base, rarity, power: Math.max(1, Math.round(power)), perks };
  item.name = rarity === 'unique' ? UNIQUE_NAMES[base] : rarity === 'rare' && perks.length ? `${PERKS[perks[0][0]].adj} ${bases[base].name}` : bases[base].name;
  return item;
}

function newUid() {
  const g = gearState();
  g.next = (g.next || 1) + 1;
  return `g${g.next}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ------------------------------------------------------------ stash

const STASH_CAP = 40;

/** The gear part of the profile, created (with starter gear) on first use. */
export function gearState() {
  if (!profile.gear || !Array.isArray(profile.gear.stash)) profile.gear = { next: 1, stash: [], equipped: {} };
  const g = profile.gear;
  g.equipped ||= {};
  if (!g.stash.length) {
    const bow = { uid: 'starter-bow', slot: 'bow', base: 'longbow', rarity: 'common', power: 1, perks: [], name: 'Longbow' };
    const armor = { uid: 'starter-armor', slot: 'armor', base: 'jerkin', rarity: 'common', power: 1, perks: [], name: 'Leather Jerkin' };
    g.stash.push(bow, armor);
    g.equipped = { bow: bow.uid, armor: armor.uid };
  }
  // Everyone starts with two gadgets (older saves get them too).
  if (!g.starterGadgets) {
    g.starterGadgets = true;
    const flask = { uid: 'starter-flask', slot: 'gadget', base: 'flask', rarity: 'common', power: 1, perks: [], name: 'Healing Tonic' };
    const trap = { uid: 'starter-trap', slot: 'gadget', base: 'bearTrap', rarity: 'common', power: 1, perks: [], name: 'Bear Trap' };
    g.stash.push(flask, trap);
    g.equipped.gadget1 ||= flask.uid;
    g.equipped.gadget2 ||= trap.uid;
  }
  return g;
}

export const stash = () => gearState().stash;
export const findItem = (uid) => stash().find((i) => i.uid === uid) || null;
export const equipped = (slot) => findItem(gearState().equipped[slot]) || stash().find((i) => i.slot === slot) || null;
/** The gadget in slot 1 or 2 (or null if empty). */
export const equippedGadget = (n) => findItem(gearState().equipped[`gadget${n}`]);
/** Which equip key holds this item ('bow', 'armor', 'gadget1', 'gadget2'), or null. */
export const equipKey = (item) => Object.entries(gearState().equipped).find(([, uid]) => uid === item.uid)?.[0] || null;
export const isEquipped = (item) => !!equipKey(item);

let cache = null;
const listeners = [];
/** Called whenever the equipped gear changes (the hero's bow look listens). */
export const onGearChange = (fn) => listeners.push(fn);
/** Call after changing an item in place (blacksmith). */
export const gearChanged = () => changed();
function changed() {
  cache = null;
  saveProfile();
  for (const fn of listeners) fn();
}

/** Add found gear to the stash (making room by salvaging the weakest common if full). */
export function addToStash(item) {
  const g = gearState();
  if (g.stash.length >= STASH_CAP) {
    const spare = g.stash.filter((i) => !isEquipped(i)).sort((a, b) => score(a) - score(b))[0];
    if (spare) salvage(spare, false);
  }
  g.stash.push(item);
  saveProfile();
}

/** Equip an item. Gadgets go in slot `key` ('gadget1'/'gadget2'), swapping if it's in the other one. */
export function equip(item, key = item.slot === 'gadget' ? 'gadget1' : item.slot) {
  const eq = gearState().equipped;
  const from = equipKey(item);
  if (item.slot === 'gadget' && from && from !== key) eq[from] = eq[key] || null;
  eq[key] = item.uid;
  changed();
}

/** Gems a salvaged item gives back. */
export const salvageValue = (item) => Math.round((item.rarity === 'unique' ? 20 : item.rarity === 'rare' ? 8 : 3) + item.power * 0.5);

export function salvage(item, notify = true) {
  if (isEquipped(item)) return 0;
  const g = gearState();
  const i = g.stash.indexOf(item);
  if (i < 0) return 0;
  g.stash.splice(i, 1);
  const gems = salvageValue(item);
  profile.gems += gems;
  if (notify) changed();
  return gems;
}

/** Rough "how good is it" number for sorting and the hero power readout. */
export function score(item) {
  return item.power * 10 + RARITY_ORDER.indexOf(item.rarity) * 8 + item.perks.reduce((s, [, t]) => s + t * 3, 0);
}

/** Average power of what's equipped. */
export const heroPower = () => Math.round(((equipped('bow')?.power || 1) + (equipped('armor')?.power || 1)) / 2);

// ------------------------------------------------------------ effects

/** What one item does, as numbers (also used to compare items). */
export function itemStats(item) {
  const b = baseOf(item);
  const s = { perks: {} };
  if (item.slot === 'bow') {
    s.damage = b.damage * (1 + 0.04 * (item.power - 1));
    s.drawTime = b.drawTime;
    s.window = b.window;
    s.arrowSpeed = b.arrowSpeed;
    s.drawMove = b.drawMove;
  } else if (item.slot === 'gadget') {
    for (const [id, tier] of item.perks) s.perks[id] = (s.perks[id] || 0) + PERKS[id].value(tier);
    s.cooldown = b.cooldown * (1 - (s.perks.quickReload || 0));
    s.potency = (1 + 0.05 * (item.power - 1)) * (1 + (s.perks.heavyCharge || 0));
    s.duration = 1 + (s.perks.lingering || 0);
    return s;
  } else {
    s.hpMult = b.hp;
    s.hpAdd = 3 * (item.power - 1);
    s.speed = b.speed;
    s.dr = b.dr;
    s.dodge = b.dodge;
  }
  for (const [id, tier] of item.perks) s.perks[id] = (s.perks[id] || 0) + PERKS[id].value(tier);
  return s;
}

/** Everything the equipped gear adds up to (cached until gear changes). */
export function gearStats() {
  if (cache) return cache;
  const bow = itemStats(equipped('bow'));
  const armor = itemStats(equipped('armor'));
  const p = { ...bow.perks };
  for (const [k, v] of Object.entries(armor.perks)) p[k] = (p[k] || 0) + v;
  cache = {
    damage: bow.damage,
    drawTime: bow.drawTime * (1 - (p.quickNock || 0)),
    window: bow.window * (1 + (p.steadyHands || 0)),
    arrowSpeed: bow.arrowSpeed,
    drawMove: bow.drawMove,
    hpMult: armor.hpMult,
    hpAdd: armor.hpAdd + (p.vigor || 0),
    speed: armor.speed * (1 + (p.lightStep || 0)),
    dr: Math.min(0.6, armor.dr + (p.padded || 0)),
    dodge: armor.dodge * (1 - (p.tumbler || 0)),
    perk: (id) => p[id] || 0,
  };
  return cache;
}

/** Text lines for an item's base stats, with ▲/▼ against another item of the same slot. */
export function statLines(item, against = null) {
  const s = itemStats(item);
  const o = against ? itemStats(against) : null;
  const line = (label, v, ov, fmt, higherIsBetter = true) => {
    let cmp = '';
    if (o && Math.abs(v - ov) > 1e-3) cmp = (v > ov) === higherIsBetter ? ' <i class="up">▲</i>' : ' <i class="down">▼</i>';
    return `<div class="st"><span>${label}</span><b>${fmt(v)}${cmp}</b></div>`;
  };
  const x = (v) => `×${v.toFixed(2)}`;
  if (item.slot === 'gadget') {
    return [
      line('Cooldown', s.cooldown, o?.cooldown, (v) => `${v.toFixed(1)}s`, false),
      line('Strength', s.potency, o?.potency, x),
      line('Duration', s.duration, o?.duration, x),
    ].join('');
  }
  if (item.slot === 'bow') {
    return [
      line('Damage', s.damage, o?.damage, x),
      line('Draw time', s.drawTime, o?.drawTime, x, false),
      line('Perfect window', s.window, o?.window, x),
      line('Move while drawing', s.drawMove, o?.drawMove, x),
    ].join('');
  }
  return [
    line('Max HP', s.hpMult, o?.hpMult, x),
    line('Bonus HP', s.hpAdd, o?.hpAdd, (v) => `+${Math.round(v)}`),
    line('Move speed', s.speed, o?.speed, x),
    line('Damage taken', 1 - s.dr, o ? 1 - o.dr : 0, x, false),
    line('Dodge recharge', s.dodge, o?.dodge, x, false),
  ].join('');
}

export const ROMAN_TIER = ['', 'I', 'II', 'III'];

export function perkLines(item) {
  return item.perks.map(([id, tier]) => `<div class="pk"><b>${PERKS[id].name} ${ROMAN_TIER[tier]}</b> ${PERKS[id].text(PERKS[id].value(tier))}</div>`).join('');
}

export const slotLabel = (slot) => (slot === 'bow' ? 'Bow' : slot === 'gadget' ? 'Gadget' : 'Armor');

/** Small line-art icons (inline SVG, drawn in the rarity colour). */
const GADGET_ICONS = {
  bearTrap: '<path d="M4 20 L 28 20" stroke-width="2.4"/><path d="M6 20 L 8 12 L 11 18 L 14 11 L 16 18 L 18 11 L 21 18 L 24 12 L 26 20" stroke-linejoin="round"/><circle cx="16" cy="24" r="3"/>',
  smokeBomb: '<circle cx="16" cy="21" r="7" fill="currentColor" fill-opacity=".25"/><path d="M16 14 L 18 9"/><path d="M19 8 C 22 4, 27 7, 25 10 C 29 11, 28 16, 24 15"/>',
  flask: '<path d="M13 4 L 19 4 M 14 4 L 14 11 L 8 22 C 7 26, 9 28, 12 28 L 20 28 C 23 28, 25 26, 24 22 L 18 11 L 18 4" stroke-linejoin="round"/><path d="M10 20 L 22 20" opacity=".7"/>',
  net: '<path d="M5 6 L 27 6 L 24 26 L 8 26 Z" stroke-linejoin="round"/><path d="M10 6 L 12 26 M 16 6 L 16 26 M 22 6 L 20 26 M 6 12 L 26 12 M 7 19 L 25 19" opacity=".75"/>',
  powderKeg: '<rect x="8" y="9" width="16" height="18" rx="5"/><path d="M8 15 L 24 15 M 8 21 L 24 21" opacity=".7"/><path d="M16 9 C 16 6, 19 5, 21 3"/><circle cx="22" cy="3" r="1.5" fill="currentColor"/>',
  warHorn: '<path d="M5 22 C 10 22, 20 18, 26 8 L 28 12 C 24 20, 14 27, 6 26 Z" stroke-linejoin="round"/><path d="M8 22 L 8 26" />',
};

export function gearIcon(item) {
  if (item.slot === 'gadget') {
    return `<svg viewBox="0 0 32 32" class="gsvg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${GADGET_ICONS[item.base] || ''}</svg>`;
  }
  if (item.slot === 'bow') {
    return '<svg viewBox="0 0 32 32" class="gsvg"><path d="M9 3 C 23 9, 23 23, 9 29" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M9 3 L 9 29" stroke="currentColor" stroke-width="1" opacity=".7"/><path d="M5 16 L 27 16 M 23 13 L 27 16 L 23 19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  return '<svg viewBox="0 0 32 32" class="gsvg"><path d="M10 5 L 4 9 L 6 16 L 9 15 L 9 27 L 23 27 L 23 15 L 26 16 L 28 9 L 22 5 C 20 8, 12 8, 10 5 Z" fill="currentColor" fill-opacity=".25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 9 L 16 27" stroke="currentColor" stroke-width="1.2" opacity=".6"/></svg>';
}
