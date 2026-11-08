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
  // tools / weapons
  hatchet:    { name: 'Stone Hatchet', icon: '🪓', tool: true, damage: 14, gather: { tree: 2.4, rock: 1.0, bush: 0.6 }, flintBonus: true, durability: 120 },
  pick:       { name: 'Stone Pick',    icon: '⛏️', tool: true, damage: 12, gather: { tree: 1.0, rock: 2.4, bush: 0.6 }, durability: 120 },
  club:       { name: 'Hardwood Club', icon: '🏏', tool: true, damage: 6, torpor: 22, gather: { tree: 0.8, rock: 0.5, bush: 0.6 }, durability: 100 },
  spear:      { name: 'Bone Spear',    icon: '🔱', tool: true, damage: 32, reach: 4.2, gather: { tree: 0.4, rock: 0.3, bush: 0.5 }, durability: 60 },
  bow:        { name: 'Hunter Bow',    icon: '🏹', tool: true, ranged: true, damage: 4, gather: { tree: 0.3, rock: 0.2, bush: 0.3 }, durability: 200 },
  arrow:      { name: 'Tranq Arrow',   icon: '➶', stack: 100, weight: 0.05, ammo: true },
  // placeables
  campfire:   { name: 'Campfire',      icon: '🔥', place: 'campfire', stack: 5 },
  foundation: { name: 'Timber Floor',  icon: '⬜', place: 'foundation', stack: 50 },
  wall:       { name: 'Timber Wall',   icon: '🧱', place: 'wall', stack: 50 },
  doorway:    { name: 'Timber Doorway',icon: '🚪', place: 'doorway', stack: 50 },
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
  { id: 'foundation', cost: { wood: 14, fiber: 6 },           desc: 'Base building floor. Snaps to grid.' },
  { id: 'wall',       cost: { wood: 10, fiber: 4 },           desc: 'Snaps to floor edges. [R] to rotate.' },
  { id: 'doorway',    cost: { wood: 9, fiber: 4 },            desc: 'A wall with an opening.' },
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
    if (def.tool) {
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
