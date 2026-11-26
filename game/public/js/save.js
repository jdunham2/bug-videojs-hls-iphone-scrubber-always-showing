// Local persistence of the hero: gold, xp, gear. Stats derived from gear.
import { generateItem, WEAPONS } from '../shared/items.js';
import { RNG } from '../shared/rng.js';

const KEY = 'emberfall_save_v1';
export const BAG_SIZE = 24;

export function defaultSave() {
  const sword = generateItem(new RNG(7), 1, { slot: 'weapon', type: 'sword', rarity: 0 });
  sword.name = 'Worn Sword';
  return { name: '', color: '#e8a33d', gold: 60, xp: 0, level: 1, potions: 3, equipped: { weapon: sword, helm: null, chest: null, boots: null }, bag: [], chests: {} };
}

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.equipped) return { ...defaultSave(), ...s };
  } catch (e) { /* storage unavailable */ }
  return defaultSave();
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export const xpForLevel = (l) => Math.round(100 * Math.pow(l, 1.5));

export function computeStats(s) {
  const eq = s.equipped, w = eq.weapon, W = w ? WEAPONS[w.type] : null;
  let hp = 100 + (s.level - 1) * 12, armor = 0, dmgPct = 0, crit = 0.05 + (W?.crit || 0), speed = 0, gold = 0, leech = 0;
  for (const it of Object.values(eq)) {
    if (!it) continue;
    hp += it.hp || 0; armor += it.armor || 0;
    const a = it.affixes || {};
    dmgPct += a.dmgPct || 0; hp += a.hp || 0; crit += a.crit || 0; speed += a.speed || 0; gold += a.gold || 0; leech += a.leech || 0;
  }
  return {
    maxHp: Math.round(hp), armor,
    dmg: (w ? w.dmg : 5) * (1 + dmgPct) * (1 + (s.level - 1) * 0.05),
    crit: Math.min(0.75, crit), moveSpeed: 1 + speed, goldFind: gold, leech,
    atkSpeed: W ? W.speed : 1, range: W ? W.range : 2.2, arc: W ? W.arc : 1.8,
    weaponType: w ? w.type : 'sword', cleave: !!W?.cleave,
  };
}

export function gearVisual(s) {
  const e = s.equipped;
  return { w: e.weapon?.type || 'sword', wr: e.weapon?.rarity ?? 0, h: e.helm ? e.helm.rarity : -1, c: e.chest ? e.chest.rarity : -1, b: e.boots ? e.boots.rarity : -1 };
}
