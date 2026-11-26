// Enemy archetypes + elite affixes. Stats scale with the party's dungeon depth.
export const ENEMIES = {
  skeleton: { name: 'Skeleton', hp: 45, dmg: 7, speed: 3.4, range: 1.7, cd: 1.3, windup: 0.45, gold: 4, xp: 10, radius: 0.5, aggro: 13, poise: 1 },
  brute: { name: 'Bone Brute', hp: 150, dmg: 16, speed: 2.5, range: 2.3, cd: 2.0, windup: 0.7, gold: 12, xp: 28, radius: 0.95, aggro: 12, poise: 0.4 },
  cultist: { name: 'Ash Cultist', hp: 38, dmg: 9, speed: 3.0, range: 11, cd: 2.4, windup: 0.6, gold: 7, xp: 14, radius: 0.5, aggro: 15, ranged: true, poise: 1 },
  imp: { name: 'Ember Imp', hp: 26, dmg: 5, speed: 5.4, range: 1.4, cd: 0.9, windup: 0.3, gold: 3, xp: 7, radius: 0.4, aggro: 16, poise: 1.3 },
  wraith: { name: 'Hollow Wraith', hp: 85, dmg: 12, speed: 4.0, range: 1.9, cd: 1.4, windup: 0.5, gold: 11, xp: 22, radius: 0.6, aggro: 18, poise: 0.8 },
  spiderling: { name: 'Ashling', hp: 22, dmg: 5, speed: 5.0, range: 1.3, cd: 0.8, windup: 0.25, gold: 2, xp: 5, radius: 0.45, aggro: 18, poise: 1.4 },
  goblin: { name: 'Treasure Goblin', hp: 220, dmg: 0, speed: 5.6, range: 0, cd: 99, windup: 0, gold: 90, xp: 60, radius: 0.5, aggro: 13, poise: 1, flee: true },
  ogre: { name: 'Siege Ogre', hp: 2600, dmg: 38, speed: 1.9, range: 3.4, cd: 2.6, windup: 0.9, gold: 200, xp: 400, radius: 1.8, aggro: 7, poise: 0, boss: true, siege: true },
  boss: { name: 'The Bone Tyrant', hp: 1300, dmg: 24, speed: 2.7, range: 3.3, cd: 2.2, windup: 0.8, gold: 150, xp: 320, radius: 1.6, aggro: 22, boss: true, poise: 0 },
  matriarch: { name: 'The Ash Matriarch', hp: 1150, dmg: 20, speed: 3.6, range: 3.0, cd: 1.8, windup: 0.6, gold: 160, xp: 340, radius: 2.0, aggro: 22, boss: true, poise: 0 },
};

export const AFFIXES = {
  molten: { name: 'Molten', color: '#ff6a1a' },
  frozen: { name: 'Frozen', color: '#7ad8ff' },
  vampiric: { name: 'Vampiric', color: '#ff2a4a' },
  shielded: { name: 'Shielded', color: '#6a8cff' },
};
export const AFFIX_KEYS = Object.keys(AFFIXES);

export function levelMul(level) {
  const l = level - 1;
  return { hp: 1 + 0.32 * l + 0.03 * l * l, dmg: 1 + 0.22 * l, gold: 1 + 0.25 * l };
}
