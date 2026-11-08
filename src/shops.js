// Camp shops.
//   Merchant   – three pieces of gear for sale (new stock after every run), a
//                paid restock, and mystery bundles by slot.
//   Blacksmith – temper an item (+1 power) or hone its weakest perk (+1 tier).

import { profile, saveProfile } from './profile.js';
import { rollItem, addToStash, heroPower, RARITY_ORDER, gearChanged, PERKS } from './gear.js';

const SLOTS = ['bow', 'armor', 'gadget'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function rollStockRarity() {
  const r = Math.random();
  return r < 0.12 ? 'unique' : r < 0.5 ? 'rare' : 'common';
}

/** What a piece of gear costs at the merchant. */
export const price = (item) => Math.round([30, 75, 170][RARITY_ORDER.indexOf(item.rarity)] + item.power * 3);

const shop = () => (profile.shop ||= { stamp: -1, items: [] });

/** The merchant's current stock (restocked after each run). */
export function merchantStock() {
  const s = shop();
  if (s.stamp !== profile.runs || !s.items.length) restock(false);
  return s.items;
}

function restock(paid) {
  const s = shop();
  const power = heroPower();
  s.items = [0, 1, 2].map((i) => rollItem(SLOTS[i], power + Math.floor(Math.random() * 3), rollStockRarity()));
  s.stamp = profile.runs;
  if (paid) profile.gems -= RESTOCK_COST;
  saveProfile();
}

export const RESTOCK_COST = 12;

export function payRestock() {
  if (profile.gems < RESTOCK_COST) return false;
  restock(true);
  return true;
}

/** Buy stock item i. Returns the item, or null if not affordable/sold. */
export function buy(i) {
  const s = shop();
  const item = s.items[i];
  if (!item || item.sold || profile.gems < price(item)) return null;
  profile.gems -= price(item);
  const bought = { ...item };
  delete bought.sold;
  addToStash(bought);
  item.sold = true;
  saveProfile();
  return bought;
}

export const MYSTERY_COST = 45;

/** A random item of a slot: mostly Common, sometimes better. */
export function buyMystery(slot) {
  if (profile.gems < MYSTERY_COST) return null;
  profile.gems -= MYSTERY_COST;
  const r = Math.random();
  const rarity = r < 0.07 ? 'unique' : r < 0.4 ? 'rare' : 'common';
  const item = rollItem(slot || pick(SLOTS), heroPower() + Math.floor(Math.random() * 3) - 1, rarity);
  addToStash(item);
  return item;
}

// ------------------------------------------------------------ blacksmith

export const MAX_POWER = 40;
export const temperCost = (item) => 10 + item.power * 4;

export function temper(item) {
  if (item.power >= MAX_POWER || profile.gems < temperCost(item)) return false;
  profile.gems -= temperCost(item);
  item.power += 1;
  gearChanged();
  return true;
}

/** The perk honing would improve (lowest tier below III), or null. */
export const honeTarget = (item) => [...item.perks].filter(([, t]) => t < 3).sort((a, b) => a[1] - b[1])[0] || null;
export const honeCost = (item) => 30 + RARITY_ORDER.indexOf(item.rarity) * 25 + item.power * 2;

export function hone(item) {
  const target = honeTarget(item);
  if (!target || profile.gems < honeCost(item)) return null;
  profile.gems -= honeCost(item);
  target[1] += 1;
  gearChanged();
  return PERKS[target[0]].name;
}

// ------------------------------------------------------------ fletcher

// The Fletcher only makes bows, and better ones than the merchant usually has.
const fletch = () => (profile.fletch ||= { stamp: -1, items: [] });
export const FLETCH_RESTOCK = 15;

export function fletcherStock() {
  const s = fletch();
  if (s.stamp !== profile.runs || !s.items.length) restockFletch(false);
  return s.items;
}

function restockFletch(paid) {
  const s = fletch();
  const power = heroPower();
  s.items = [0, 1, 2].map(() => {
    const r = Math.random();
    return rollItem('bow', power + 1 + Math.floor(Math.random() * 3), r < 0.2 ? 'unique' : r < 0.75 ? 'rare' : 'common');
  });
  s.stamp = profile.runs;
  if (paid) profile.gems -= FLETCH_RESTOCK;
  saveProfile();
}

export function payFletchRestock() {
  if (profile.gems < FLETCH_RESTOCK) return false;
  restockFletch(true);
  return true;
}

export function buyFletch(i) {
  const item = fletch().items[i];
  if (!item || item.sold || profile.gems < price(item)) return null;
  profile.gems -= price(item);
  const bought = { ...item };
  delete bought.sold;
  addToStash(bought);
  item.sold = true;
  saveProfile();
  return bought;
}

/** Restring: swap a bow's weakest perk for a different bow perk at the same tier. */
export const restringCost = (item) => 20 + RARITY_ORDER.indexOf(item.rarity) * 20 + item.power * 2;
export function restring(item) {
  if (!item || item.slot !== 'bow' || !item.perks?.length || profile.gems < restringCost(item)) return null;
  const have = new Set(item.perks.map(([k]) => k));
  const options = Object.keys(PERKS).filter((k) => PERKS[k].slot === 'bow' && !have.has(k));
  if (!options.length) return null;
  const target = [...item.perks].sort((a, b) => a[1] - b[1])[0];
  const was = target[0];
  target[0] = pick(options);
  profile.gems -= restringCost(item);
  gearChanged();
  return { was: PERKS[was].name, now: PERKS[target[0]].name };
}
