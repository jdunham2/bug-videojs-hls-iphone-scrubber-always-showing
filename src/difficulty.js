// Difficulty tiers. Harder tiers make enemies tougher and hit harder, but drop
// stronger gear, more Rares and Uniques, and more gems. Each tier unlocks by
// beating a boss on the one before it.

import { profile, saveProfile } from './profile.js';
import { heroPower } from './gear.js';

export const DIFFICULTIES = [
  {
    id: 'adventurer',
    name: 'Adventurer',
    blurb: 'The ruins as they are.',
    enemyHp: 1,
    enemyDamage: 1,
    lootPower: 0,
    rarityBoost: 0,
    gems: 1,
    power: 1,
    color: '#9fd27a',
  },
  {
    id: 'veteran',
    name: 'Veteran',
    blurb: 'Tougher foes. Better gear, more Uniques.',
    enemyHp: 1.7,
    enemyDamage: 1.35,
    lootPower: 6,
    rarityBoost: 0.15,
    gems: 1.5,
    power: 8,
    color: '#5fb4ff',
    unlock: 'adventurer',
  },
  {
    id: 'legend',
    name: 'Legend',
    blurb: 'Only for heroes in their prime. The best loot there is.',
    enemyHp: 2.7,
    enemyDamage: 1.8,
    lootPower: 14,
    rarityBoost: 0.3,
    gems: 2.2,
    power: 16,
    color: '#ffb340',
    unlock: 'veteran',
  },
];

export const difficultyById = (id) => DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[0];

/** Tiers you've beaten a boss on. */
const beaten = () => (profile.beaten ||= {});

export function isUnlocked(d) {
  return !d.unlock || !!beaten()[d.unlock];
}

/** Mark a boss kill on this tier (unlocks the next). Returns the newly unlocked tier, if any. */
export function noteBossOnTier(id) {
  if (beaten()[id]) return null;
  beaten()[id] = true;
  saveProfile();
  return DIFFICULTIES.find((d) => d.unlock === id) || null;
}

/** The tier the next run uses. */
export function selectedDifficulty() {
  const d = difficultyById(profile.difficulty);
  return isUnlocked(d) ? d : DIFFICULTIES[0];
}

export function selectDifficulty(id) {
  const d = difficultyById(id);
  if (!isUnlocked(d)) return false;
  profile.difficulty = d.id;
  saveProfile();
  return true;
}

/** "Under-powered" warning for the tier picker. */
export const underPowered = (d) => heroPower() < d.power - 2;
