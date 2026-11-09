// Item + recipe definitions.
export const ITEMS = {
  wood:       { name: 'Wood',          icon: '🪵', stack: 200, weight: 0.5 },
  stone:      { name: 'Stone',         icon: '🪨', stack: 200, weight: 0.5 },
  fiber:      { name: 'Fiber',         icon: '🌿', stack: 300, weight: 0.1 },
  flint:      { name: 'Flint',         icon: '🔹', stack: 200, weight: 0.2 },
  berries:    { name: 'Wildberries',   icon: '🫐', stack: 100, weight: 0.1, food: 6, water: 2 },
  sleepberry: { name: 'Dozeberries',   icon: '🍇', stack: 100, weight: 0.1, food: 2, torpor: 12 },
  meat:       { name: 'Raw Meat',      icon: '🥩', stack: 40,  weight: 0.3, food: 8, sick: 6, spoil: true },
  cooked:     { name: 'Cooked Meat',   icon: '🍖', stack: 40,  weight: 0.3, food: 28, heal: 10 },
  hide:       { name: 'Hide',          icon: '🟫', stack: 200, weight: 0.3 },
  ore:        { name: 'Metal Ore',     icon: '🟠', stack: 200, weight: 1 },
  ingot:      { name: 'Metal Ingot',   icon: '🔩', stack: 200, weight: 1 },
  // tools / weapons
  hatchet:    { name: 'Stone Hatchet', icon: '🪓', tool: true, damage: 14, gather: { tree: 2.4, rock: 1.0, bush: 0.6 }, flintBonus: true, durability: 120 },
  pick:       { name: 'Stone Pick',    icon: '⛏️', tool: true, damage: 12, gather: { tree: 1.0, rock: 2.4, bush: 0.6 }, durability: 120 },
  club:       { name: 'Hardwood Club', icon: '🏏', tool: true, damage: 6, torpor: 22, gather: { tree: 0.8, rock: 0.5, bush: 0.6 }, durability: 100 },
  spear:      { name: 'Bone Spear',    icon: '🔱', tool: true, damage: 32, reach: 4.2, gather: { tree: 0.4, rock: 0.3, bush: 0.5 }, durability: 60 },
  metalpick:  { name: 'Metal Pick',    icon: '⚒️', tool: true, damage: 20, gather: { tree: 1.4, rock: 3.8, bush: 0.7 }, durability: 400 },
  metalhatchet:{ name: 'Metal Hatchet', icon: '🪓', tool: true, damage: 24, gather: { tree: 3.8, rock: 1.4, bush: 0.8 }, durability: 400, tint: 'metal' },
  sword:      { name: 'Metal Sword',   icon: '🗡️', tool: true, damage: 52, reach: 3.4, gather: { tree: 0.5, rock: 0.3, bush: 0.6 }, durability: 300 },
  hidearmor:  { name: 'Hide Armor',    icon: '🦺', armor: 0.25, insul: 12, durability: 160, stack: 1 },
  furarmor:   { name: 'Fur Armor',     icon: '🧥', armor: 0.3, insul: 24, durability: 260, stack: 1 },
  pelt:       { name: 'Thick Pelt',    icon: '🐑', stack: 100, weight: 0.4 },
  herb:       { name: 'Marsh Herb',    icon: '🌱', stack: 100, weight: 0.05 },
  salve:      { name: 'Healing Salve', icon: '🧪', stack: 20, weight: 0.1, food: 1, heal: 45 },
  metalarmor: { name: 'Metal Armor',   icon: '🛡️', armor: 0.5, durability: 400, stack: 1 },
  bow:        { name: 'Hunter Bow',    icon: '🏹', tool: true, ranged: true, damage: 4, gather: { tree: 0.3, rock: 0.2, bush: 0.3 }, durability: 200 },
  arrow:      { name: 'Tranq Arrow',   icon: '➶', stack: 100, weight: 0.05, ammo: true },
  // placeables
  campfire:   { name: 'Campfire',      icon: '🔥', place: 'campfire', stack: 5 },
  foundation: { name: 'Timber Floor',  icon: '⬜', place: 'foundation', stack: 50 },
  wall:       { name: 'Timber Wall',   icon: '🧱', place: 'wall', stack: 50 },
  doorway:    { name: 'Timber Doorway',icon: '🚪', place: 'doorway', stack: 50 },
  sfoundation:{ name: 'Stone Floor',   icon: '⬛', place: 'sfoundation', stack: 50 },
  swall:      { name: 'Stone Wall',    icon: '🪨', place: 'swall', stack: 50 },
  sdoorway:   { name: 'Stone Doorway', icon: '⛩️', place: 'sdoorway', stack: 50 },
  forge:      { name: 'Forge',         icon: '🏭', place: 'forge', stack: 3 },
  storage:    { name: 'Storage Box',   icon: '📦', place: 'storage', stack: 10 },
  bed:        { name: 'Sleeping Bag',  icon: '🛏️', place: 'bed', stack: 5 },
  seed:       { name: 'Wildberry Seed', icon: '🌰', stack: 100, weight: 0.05, crop: 'berries' },
  dozeseed:   { name: 'Dozeberry Seed', icon: '🟣', stack: 100, weight: 0.05, crop: 'sleepberry' },
  plot:       { name: 'Crop Plot',     icon: '🌱', place: 'plot', stack: 10 },
  obsidian:   { name: 'Obsidian',      icon: '🖤', stack: 200, weight: 0.6 },
  crystal:    { name: 'Glimmer Crystal', icon: '💎', stack: 200, weight: 0.3 },
  lantern:    { name: 'Crystal Lantern', icon: '🏮', tool: true, damage: 4, gather: { tree: 0.4, rock: 0.3, bush: 0.6 }, durability: 600 },
  obsidianspear: { name: 'Obsidian Spear', icon: '🗡', tool: true, damage: 72, reach: 4.6, gather: { tree: 0.5, rock: 0.4, bush: 0.6 }, durability: 260 },
  ashguard:   { name: 'Ashguard Armor', icon: '🔥', armor: 0.4, insul: 9, fireproof: 0.8, durability: 350, stack: 1 },
  core:       { name: 'Molten Core',   icon: '🔶', stack: 5, weight: 1 },
  pearl:      { name: 'Abyssal Pearl', icon: '🫧', stack: 5, weight: 0.5 },
  eye:        { name: "Queen's Eye",   icon: '👁️', stack: 5, weight: 0.3 },
  magmaplate: { name: 'Magmaplate Armor', icon: '🧯', armor: 0.6, insul: 9, fireproof: 1, durability: 700, stack: 1 },
  trident:    { name: 'Tidecaller Trident', icon: '⚓', tool: true, damage: 95, reach: 4.4, gather: { tree: 0.6, rock: 0.5, bush: 0.8 }, durability: 700 },
  huntressbow:{ name: 'Huntress Bow',  icon: '🎯', tool: true, ranged: true, damage: 6, gather: { tree: 0.3, rock: 0.2, bush: 0.3 }, durability: 500 },
  trophy:     { name: 'Alpha Trophy',  icon: '🏆', stack: 20, weight: 0.5 },
  fang:       { name: 'Tyrant Fang',   icon: '🦷', stack: 5, weight: 0.5 },
  sigil:      { name: 'Boss Sigil',    icon: '🔯', stack: 20, weight: 0.2 },
  frostheart: { name: 'Frost Heart',   icon: '🧊', stack: 5, weight: 0.5 },
  miretooth:  { name: 'Mire Tooth',    icon: '🪨', stack: 5, weight: 0.5 },
  titanheart: { name: 'Titan Heart',   icon: '💛', stack: 5, weight: 2 },
  frostbrand: { name: 'Frostbrand Sword', icon: '⚔️', tool: true, damage: 92, reach: 3.7, gather: { tree: 0.6, rock: 0.4, bush: 0.8 }, durability: 800 },
  mirehide:   { name: 'Mirehide Armor', icon: '🥋', armor: 0.45, insul: 8, regen: 1.2, durability: 500, stack: 1 },
  primeval:   { name: 'Primeval Armor', icon: '👑', armor: 0.7, insul: 16, fireproof: 0.6, regen: 0.8, durability: 1200, stack: 1 },
  stormfeather:{ name: 'Storm Feather', icon: '🪶', stack: 5, weight: 0.2 },
  venomgland: { name: 'Venom Gland',   icon: '🧫', stack: 5, weight: 0.3 },
  glider:     { name: 'Skyward Wings', icon: '🪁', tool: true, damage: 4, gather: { tree: 0.3, rock: 0.2, bush: 0.5 }, durability: 999 },
  venomblade: { name: 'Venom Blade',   icon: '🐍', tool: true, damage: 70, poison: 14, reach: 3.5, gather: { tree: 0.6, rock: 0.4, bush: 0.8 }, durability: 700 },
  primalblade:{ name: 'Primal Blade',  icon: '🔥', tool: true, damage: 115, reach: 3.8, gather: { tree: 1.5, rock: 1.0, bush: 1.0 }, durability: 900 },
  saddle:     { name: 'Rough Saddle',  icon: '🐎', stack: 3, weight: 2 },
};

export const RECIPES = [
  { id: 'hatchet',    cost: { wood: 3, stone: 2, fiber: 6 },  desc: 'Fells trees fast. Yields bonus wood.' },
  { id: 'pick',       cost: { wood: 3, stone: 3, fiber: 6 },  desc: 'Mines rock efficiently. Yields flint.' },
  { id: 'club',       cost: { wood: 8, fiber: 8 },            desc: 'Blunt weapon. Knocks creatures out.' },
  { id: 'spear',      cost: { wood: 6, flint: 4, fiber: 10 }, desc: 'Long reach, high damage.' },
  { id: 'campfire',   cost: { wood: 10, stone: 12, flint: 1 },desc: 'Light, warmth. Cooks raw meat.' },
  { id: 'bow',        cost: { wood: 12, fiber: 30, hide: 2 }, desc: 'Ranged weapon. Fires tranq arrows.' },
  { id: 'arrow',      cost: { wood: 2, flint: 2, sleepberry: 4 }, yield: 3, desc: 'Narcotic arrows that build torpor.' },
  { id: 'saddle',     cost: { hide: 10, fiber: 20, wood: 6 }, desc: 'Lets you ride a tamed creature.' },
  { id: 'salve',      cost: { herb: 3, berries: 2 },          desc: 'Marsh herbs from Murkmire Swamp. Heals 45 health.' },
  { id: 'furarmor',   cost: { pelt: 10, hide: 6, fiber: 20 }, desc: 'Frosthorn and Rimeclaw pelts. Very warm, blocks 30%.' },
  { id: 'hidearmor',  cost: { hide: 14, fiber: 20 },          desc: 'Wear it (tap it twice). Blocks 25% damage and keeps you warm.' },
  { id: 'plot',       cost: { wood: 10, stone: 10, fiber: 15 }, desc: 'Plant seeds from berry bushes. Grows faster in rain.' },
  { id: 'storage',    cost: { wood: 30, fiber: 10 },          desc: 'Stores 24 stacks. Survives death.' },
  { id: 'bed',        cost: { hide: 6, fiber: 20, wood: 4 },  desc: 'Respawn here. Sleep through the night.' },
  { id: 'forge',      cost: { stone: 40, wood: 15, flint: 8 },desc: 'Light it to smelt ore into ingots. Unlocks metal crafting.' },
  { id: 'metalpick',  cost: { ingot: 4, wood: 4, hide: 2 },   station: 'forge', desc: 'Mines rock and ore far faster.' },
  { id: 'metalhatchet', cost: { ingot: 4, wood: 4, hide: 2 }, station: 'forge', desc: 'Fells trees far faster.' },
  { id: 'sword',      cost: { ingot: 8, hide: 3 },            station: 'forge', desc: 'Heavy damage with good reach.' },
  { id: 'metalarmor', cost: { ingot: 16, hide: 6 },           station: 'forge', desc: 'Blocks 50% damage. Very durable, but cold.' },
  { id: 'frostbrand', cost: { frostheart: 1, ingot: 15, pelt: 5 }, station: 'forge', desc: 'From Rimefang\'s heart: an ice-cold blade, 92 damage.' },
  { id: 'mirehide',   cost: { miretooth: 1, hide: 15, herb: 10 }, desc: 'From the Mirelord: blocks 45% and slowly heals you.' },
  { id: 'primeval',   cost: { titanheart: 1, ingot: 30, obsidian: 10, pelt: 10 }, station: 'forge', desc: 'From the Titan: blocks 70%, warm, resists lava, heals.' },
  { id: 'glider',     cost: { stormfeather: 1, hide: 10, fiber: 30, wood: 10 }, desc: 'From Stormwing: hold it while falling to glide (no fall damage).' },
  { id: 'venomblade', cost: { venomgland: 1, ingot: 15, obsidian: 4 }, station: 'forge', desc: 'From the Broodmother: 70 damage plus poison over time.' },
  { id: 'primalblade',cost: { fang: 1, ingot: 20, hide: 10 }, station: 'forge', desc: 'Forged from the Tyrant\'s fang. Devastating.' },
  { id: 'lantern',    cost: { crystal: 5, ingot: 2, fiber: 10 }, desc: 'Hold it to light up caves and nights.' },
  { id: 'obsidianspear', cost: { obsidian: 8, wood: 6, ingot: 2 }, station: 'forge', desc: 'Volcanic glass spear. Huge damage and reach.' },
  { id: 'ashguard',   cost: { obsidian: 12, hide: 10, ingot: 4 }, station: 'forge', desc: 'Blocks 40% damage and 80% of lava burns. Warm.' },
  { id: 'magmaplate', cost: { core: 1, obsidian: 20, ingot: 15 }, station: 'forge', desc: 'From Magmaroth\'s core: blocks 60% damage, lava-proof, warm.' },
  { id: 'trident',    cost: { pearl: 1, ingot: 15, wood: 10 }, station: 'forge', desc: 'From the Deep Mother\'s pearl: a devastating long weapon.' },
  { id: 'huntressbow',cost: { eye: 1, wood: 20, fiber: 40, hide: 10 }, desc: 'From the Hollow Queen\'s eye: rapid, powerful tranq shots.' },
  { id: 'foundation', cost: { wood: 14, fiber: 6 },           desc: 'Base building floor. Snaps to grid.' },
  { id: 'wall',       cost: { wood: 10, fiber: 4 },           desc: 'Snaps to floor edges. [R] to rotate.' },
  { id: 'doorway',    cost: { wood: 9, fiber: 4 },            desc: 'A wall with an opening.' },
  { id: 'sfoundation',cost: { stone: 30, wood: 4 },           desc: 'Sturdy stone floor. Snaps like timber.' },
  { id: 'swall',      cost: { stone: 22 },                    desc: 'Stone wall. Snaps to floor edges.' },
  { id: 'sdoorway',   cost: { stone: 20 },                    desc: 'Stone wall with an opening.' },
];

export class Inventory {
  constructor(onChange) {
    this.slots = new Array(24).fill(null);  // first 8 are hotbar
    this.onChange = onChange;
  }
  count(id) { return this.slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0); }
  has(cost) { return Object.entries(cost).every(([id, q]) => this.count(id) >= q); }
  add(id, qty = 1) {
    const def = ITEMS[id];
    let left = qty;
    if (def.tool || def.armor) {
      for (let k = 0; k < qty; k++) {
        const i = this.freeSlot();
        if (i < 0) return qty - k;
        this.slots[i] = { id, qty: 1, dur: def.durability };
      }
      this.onChange?.(); return 0;
    }
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < def.stack) { const add = Math.min(def.stack - s.qty, left); s.qty += add; left -= add; }
    }
    while (left > 0) {
      const i = this.freeSlot(); if (i < 0) break;
      const add = Math.min(def.stack, left);
      this.slots[i] = { id, qty: add }; left -= add;
    }
    this.onChange?.();
    return left;
  }
  freeSlot() {
    // prefer hotbar for tools/placeables, backpack otherwise
    return this.slots.findIndex((s) => !s);
  }
  remove(id, qty = 1) {
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.qty, left);
        s.qty -= take; left -= take;
        if (s.qty <= 0) this.slots[i] = null;
      }
    }
    this.onChange?.();
    return qty - left;
  }
  pay(cost) { for (const [id, q] of Object.entries(cost)) this.remove(id, q); }
  swap(a, b) { [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]]; this.onChange?.(); }
}
