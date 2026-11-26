// Derived hero stats from class + level + gear + talents + temporary buffs. Shared by server and client.
import { WEAPONS, LEGENDARIES, SETS } from './items.js';
import { CLASSES, talentTotals } from './classes.js';
import { PARAGON } from './rifts.js';

export const xpForLevel = (l) => Math.round(100 * Math.pow(l, 1.5));

export function computeStats(char, cls, buffs = {}) {
  const C = CLASSES[cls] || CLASSES.warden;
  const eq = char.equipped || {}, w = eq.weapon, W = w ? WEAPONS[w.type] : null;
  const T = talentTotals(cls, char.talents);
  // legendary powers + set bonuses fold into the talent totals (T) and flags
  const setCount = {};
  for (const it of Object.values(eq)) {
    if (!it) continue;
    if (it.leg && LEGENDARIES[it.leg]) { T.flags[it.leg] = true; for (const [k, v] of Object.entries(LEGENDARIES[it.leg].stats || {})) T[k] = (T[k] || 0) + v; }
    if (it.set) setCount[it.set] = (setCount[it.set] || 0) + 1;
  }
  for (const [k, n] of Object.entries(char.paragon?.alloc || {})) {
    const D = PARAGON[k]; if (!D) continue;
    const v = Math.min(n, D.max ?? 1e9) * D.per;
    const key = { dmg: 'dmgPct', hp: 'hpPct', armor: 'armor', crit: 'crit', cdr: 'cdr', gold: 'goldFind' }[k];
    T[key] = (T[key] || 0) + v;
  }
  const sets = [];
  for (const [id, n] of Object.entries(setCount)) {
    const S = SETS[id]; if (!S) continue;
    sets.push({ id, n });
    for (const b of [n >= 2 ? S.b2 : null, n >= 4 ? S.b4 : null]) if (b) for (const [k, v] of Object.entries(b)) { if (k === 'flag') T.flags[v] = true; else T[k] = (T[k] || 0) + v; }
  }
  let hp = C.baseHp + (char.level - 1) * C.hpPerLevel, armor = C.armor, dmgPct = 0, crit = 0.05 + (W?.crit || 0), speed = 0, gold = 0, leech = 0;
  for (const it of Object.values(eq)) {
    if (!it) continue;
    hp += it.hp || 0; armor += it.armor || 0;
    const a = it.affixes || {};
    dmgPct += a.dmgPct || 0; hp += a.hp || 0; crit += a.crit || 0; speed += a.speed || 0; gold += a.gold || 0; leech += a.leech || 0;
  }
  hp *= 1 + (T.hpPct || 0);
  armor = (armor + (T.armor || 0)) * (1 + (T.armorPct || 0)) * (buffs.warding ? 1.5 : 1);
  const dmg = (w ? w.dmg : 5) * (1 + dmgPct + (T.dmgPct || 0) + (buffs.fury ? 0.5 : 0)) * (1 + (char.level - 1) * 0.05);
  return {
    maxHp: Math.round(hp), armor: Math.round(armor), dmg,
    crit: Math.min(0.8, crit + (T.crit || 0)), critDmg: 2 + (T.critDmg || 0),
    moveSpeed: 1 + speed + (T.moveSpeed || 0) + (buffs.swift ? 0.3 : 0),
    goldFind: gold + (T.goldFind || 0) + (buffs.fortune ? 1 : 0), leech: leech + (T.leech || 0),
    atkSpeed: (W ? W.speed : 1) * (1 + (T.atkSpeed || 0)), range: W ? W.range : 2.2, arc: W ? W.arc : 1.8,
    weaponType: w ? w.type : C.starter, cleave: !!W?.cleave, ranged: !!W?.ranged,
    cdr: Math.min(0.5, (T.cdr || 0) + (buffs.swift ? 0.25 : 0)),
    resMax: C.resource.max + (T.resMax || 0), resRegen: C.resource.regen * (C.resource.regen > 0 ? 1 + (T.resRegen || 0) : 1),
    skillDmg: T.skillDmg || 0, costMul: Math.max(0.3, 1 + (T.costMul || 0)), sets,
    T, flags: T.flags,
  };
}
