// Enemy archetypes. Stats scale with the party's dungeon level.
export const ENEMIES = {
  skeleton: { name: 'Skeleton', hp: 45, dmg: 7, speed: 3.4, range: 1.7, cd: 1.3, windup: 0.45, gold: 4, xp: 10, radius: 0.5, aggro: 13 },
  brute: { name: 'Bone Brute', hp: 150, dmg: 16, speed: 2.5, range: 2.3, cd: 2.0, windup: 0.7, gold: 12, xp: 28, radius: 0.95, aggro: 12 },
  cultist: { name: 'Ash Cultist', hp: 38, dmg: 9, speed: 3.0, range: 11, cd: 2.4, windup: 0.6, gold: 7, xp: 14, radius: 0.5, aggro: 15, ranged: true },
  imp: { name: 'Ember Imp', hp: 26, dmg: 5, speed: 5.4, range: 1.4, cd: 0.9, windup: 0.3, gold: 3, xp: 7, radius: 0.4, aggro: 16 },
  wraith: { name: 'Hollow Wraith', hp: 85, dmg: 12, speed: 4.0, range: 1.9, cd: 1.4, windup: 0.5, gold: 11, xp: 22, radius: 0.6, aggro: 18 },
  boss: { name: 'The Bone Tyrant', hp: 1200, dmg: 24, speed: 2.7, range: 3.3, cd: 2.2, windup: 0.8, gold: 150, xp: 320, radius: 1.6, aggro: 24, boss: true },
};

export function levelMul(level) {
  const l = level - 1;
  return { hp: 1 + 0.32 * l + 0.03 * l * l, dmg: 1 + 0.22 * l, gold: 1 + 0.25 * l };
}
