// Long-term progress between runs: hero levels and bounties.
//
// Hero level: every run earns XP (kills, waves, bosses, missions, perfect
// shots). Each level pays gems, and every third level a piece of gear.
//
// Bounties: three standing jobs on the Trophy Board ("Defeat 5 elites",
// "Land 30 perfect shots"...). Progress carries across runs; a finished
// bounty is claimed at the board for gems and XP, and a new one takes its place.

import { profile, saveProfile } from './profile.js';
import { rollItem, addToStash, heroPower } from './gear.js';

// ------------------------------------------------------------ levels

/** XP needed to go from `level` to the next one. */
export const xpToNext = (level) => 80 + 45 * (level - 1);

/** Level and progress through it for a total XP. */
export function levelFor(xp = 0) {
  let level = 1;
  let left = xp;
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return { level, into: left, need: xpToNext(level), frac: left / xpToNext(level) };
}

/** The level at which the falcon companion joins you. */
export const FALCON_LEVEL = 4;

export const heroLevel = () => levelFor(profile.xp || 0).level;

/** XP for a finished run, itemised for the results screen. */
export function runXp(stats, { wave = 0, bosses = 0, cleared = false, tierMult = 1 } = {}) {
  const parts = [
    ['Enemies defeated', stats.kills * 2],
    ['Waves survived', wave * 8],
    ['Perfect shots', stats.perfects],
    ['Bosses', bosses * 60],
    ['Mission cleared', cleared ? 120 : 0],
  ].filter(([, v]) => v > 0);
  const total = Math.round(parts.reduce((a, [, v]) => a + v, 0) * tierMult);
  return { parts, total };
}

/** Add XP; returns the before/after state and the rewards for each new level. */
export function addXp(amount) {
  const before = levelFor(profile.xp || 0);
  profile.xp = (profile.xp || 0) + Math.max(0, Math.round(amount));
  const after = levelFor(profile.xp);
  const rewards = [];
  for (let l = before.level + 1; l <= after.level; l++) {
    const gems = 20 + 5 * l;
    profile.gems += gems;
    profile.totalGems = (profile.totalGems || 0) + gems;
    const r = { level: l, gems };
    if (l === FALCON_LEVEL) r.unlock = 'Falcon companion: it circles above you and dives at enemies';
    if (l % 3 === 0) {
      const slot = ['bow', 'armor', 'gadget'][l % 9 === 0 ? 0 : (l / 3) % 3];
      r.item = rollItem(slot, Math.max(1, heroPower() + 1), l % 9 === 0 ? 'unique' : 'rare');
      addToStash(r.item);
    }
    rewards.push(r);
  }
  saveProfile();
  return { before, after, gained: Math.round(amount), rewards };
}

// ------------------------------------------------------------ bounties

const POOL = [
  { id: 'kills', text: 'Defeat {n} enemies', n: [60, 90, 130], key: 'kill', gems: 30, xp: 60 },
  { id: 'elites', text: 'Defeat {n} elite enemies', n: [4, 6, 9], key: 'elite', gems: 45, xp: 90 },
  { id: 'archers', text: 'Defeat {n} archers', n: [12, 20, 30], key: 'archer', gems: 35, xp: 70 },
  { id: 'bombers', text: 'Defeat {n} bombers', n: [8, 14, 20], key: 'bomber', gems: 35, xp: 70 },
  { id: 'perfects', text: 'Land {n} perfect shots', n: [30, 50, 80], key: 'perfect', gems: 40, xp: 80 },
  { id: 'dodges', text: 'Make {n} perfect dodges', n: [8, 14, 20], key: 'perfectDodge', gems: 40, xp: 80 },
  { id: 'bosses', text: 'Defeat {n} bosses', one: 'Defeat a boss', n: [1, 2, 3], key: 'boss', gems: 60, xp: 120 },
  { id: 'chests', text: 'Find {n} hidden treasure chests', one: 'Find a hidden treasure chest', n: [1, 2, 3], key: 'chest', gems: 50, xp: 100 },
  { id: 'gadgets', text: 'Use gadgets {n} times', n: [10, 18, 28], key: 'gadget', gems: 30, xp: 60 },
  { id: 'missions', text: 'Clear {n} missions', one: 'Clear a mission', n: [1, 2, 3], key: 'mission', gems: 60, xp: 140 },
  { id: 'thieves', text: 'Catch {n} loot thieves', one: 'Catch a loot thief', n: [1, 2, 3], key: 'thief', gems: 50, xp: 100 },
  { id: 'waves', text: 'Survive {n} waves', n: [15, 25, 40], key: 'wave', gems: 40, xp: 80 },
];

function newBounty(exclude = []) {
  const options = POOL.filter((b) => !exclude.includes(b.id));
  const b = options[Math.floor(Math.random() * options.length)];
  const tier = Math.min(2, Math.floor(Math.random() * (1 + Math.min(2, heroLevelSafe() / 4))));
  return { id: b.id, target: b.n[tier], tier, progress: 0 };
}
const heroLevelSafe = () => levelFor(profile.xp || 0).level;

/** The three standing bounties (filled in on first look). */
export function bounties() {
  const list = (profile.bounties ||= []);
  while (list.length < 3) list.push(newBounty(list.map((b) => b.id)));
  return list;
}

export function bountyInfo(b) {
  const def = POOL.find((p) => p.id === b.id) || POOL[0];
  const mult = 1 + b.tier * 0.6;
  return { text: b.target === 1 && def.one ? def.one : def.text.replace('{n}', b.target), gems: Math.round(def.gems * mult), xp: Math.round(def.xp * mult), done: b.progress >= b.target };
}

/** Count something toward the bounties. Returns the bounties that just finished. */
export function noteBounty(key, n = 1) {
  const finished = [];
  for (const b of bounties()) {
    const def = POOL.find((p) => p.id === b.id);
    if (!def || def.key !== key || b.progress >= b.target) continue;
    b.progress = Math.min(b.target, b.progress + n);
    if (b.progress >= b.target) finished.push(bountyInfo(b));
  }
  return finished;
}

/** Hand in a finished bounty: gems and XP now, a fresh bounty in its place. */
export function claimBounty(i) {
  const list = bounties();
  const b = list[i];
  if (!b) return null;
  const info = bountyInfo(b);
  if (!info.done) return null;
  profile.gems += info.gems;
  profile.totalGems = (profile.totalGems || 0) + info.gems;
  const xp = addXp(info.xp);
  list[i] = newBounty(list.map((x) => x.id));
  saveProfile();
  return { ...info, xpResult: xp };
}

export const bountiesReady = () => bounties().filter((b) => b.progress >= b.target).length;
