// Hero talents: one point per hero level, spent in the Hall of Heroes on small
// lasting upgrades. Points can be taken back and re-spent for free.

import { profile, saveProfile } from './profile.js';

export const TALENTS = [
  { id: 'might', name: 'Might', text: '+4% damage', max: 5, icon: '⚔' },
  { id: 'vigor', name: 'Vigor', text: '+8 max health', max: 5, icon: '♥' },
  { id: 'nimble', name: 'Nimble Fingers', text: '4% faster draw', max: 5, icon: '➶' },
  { id: 'fleet', name: 'Fleet-footed', text: '+3% move speed', max: 5, icon: '»' },
  { id: 'hide', name: 'Thick Hide', text: '3% less damage taken', max: 5, icon: '⛨' },
  { id: 'falconer', name: 'Falconer', text: 'Falcon dives 12% more often, hits 15% harder', max: 3, icon: '🜲' },
  { id: 'fortune', name: 'Fortune', text: '+6% gems', max: 3, icon: '◆' },
];

export const rank = (id) => (profile.talents || {})[id] || 0;

/** Points earned (one per level after the first) minus points spent. */
export function talentPoints(level) {
  const spent = Object.values(profile.talents || {}).reduce((a, b) => a + b, 0);
  return { earned: Math.max(0, level - 1), spent, free: Math.max(0, level - 1 - spent) };
}

export function learn(id, level) {
  const t = TALENTS.find((x) => x.id === id);
  if (!t || rank(id) >= t.max || talentPoints(level).free <= 0) return false;
  (profile.talents ||= {})[id] = rank(id) + 1;
  saveProfile();
  return true;
}

export function resetTalents() {
  profile.talents = {};
  saveProfile();
}

/** Multipliers and additions the game reads. */
export const talent = {
  damage: () => 1 + 0.04 * rank('might'),
  hpAdd: () => 8 * rank('vigor'),
  drawTime: () => 0.96 ** rank('nimble'),
  speed: () => 1 + 0.03 * rank('fleet'),
  taken: () => 1 - 0.03 * rank('hide'),
  falconCool: () => 1 / (1 + 0.12 * rank('falconer')),
  falconDmg: () => 1 + 0.15 * rank('falconer'),
  gems: () => 1 + 0.06 * rank('fortune'),
};
