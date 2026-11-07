import { config } from './config.js';
import { currentCharacter } from './profile.js';

// Skill catalogue. `desc(level)` describes the total effect at that level, so a
// card can show exactly what you'd have after picking it.
export const SKILLS = [
  {
    id: 'heavyDraw',
    name: 'Heavy Draw',
    type: 'bow',
    rarity: 'common',
    max: 3,
    desc: (l) => `Fully drawn shots deal +${20 * l}% damage.`,
  },
  {
    id: 'quickHands',
    name: 'Quick Hands',
    type: 'bow',
    rarity: 'common',
    max: 3,
    desc: (l) => `Draw your bow ${Math.round((1 - 0.85 ** l) * 100)}% faster.`,
  },
  {
    id: 'steadyAim',
    name: 'Steady Aim',
    type: 'bow',
    rarity: 'common',
    max: 3,
    desc: (l) => `The perfect window is ${40 * l}% wider.`,
  },
  {
    id: 'ricochet',
    name: 'Ricochet',
    type: 'bow',
    rarity: 'rare',
    max: 3,
    desc: (l) => `Arrows bounce to ${l} more ${l > 1 ? 'enemies' : 'enemy'} after a hit.`,
  },
  {
    id: 'splitShot',
    name: 'Split Shot',
    type: 'bow',
    rarity: 'rare',
    max: 3,
    desc: (l) =>
      l === 1
        ? 'Full-draw shots fire 2 extra arrows at 50% damage.'
        : l === 2
          ? 'Full-draw shots fire 2 extra arrows at full damage.'
          : 'Full-draw shots fire 4 extra arrows at full damage.',
  },
  {
    id: 'blasting',
    name: 'Blasting Arrows',
    type: 'perfect',
    rarity: 'rare',
    max: 3,
    desc: (l) => `Powder-tipped arrows: perfect hits burst, hitting ${l + 1} nearby enemies for 60% damage.`,
  },
  {
    id: 'refresh',
    name: 'Refresh',
    type: 'perfect',
    rarity: 'common',
    max: 1,
    desc: () => 'Perfect shots instantly refill all your dodge charges.',
  },
  {
    id: 'fire',
    name: 'Fire Arrows',
    type: 'element',
    rarity: 'rare',
    max: 3,
    desc: (l) => `Pitch-soaked arrows set enemies burning for ${1 + 3 * l} damage per second over 3s.`,
  },
  {
    id: 'frost',
    name: 'Pinning Arrows',
    type: 'element',
    rarity: 'rare',
    max: 3,
    desc: (l) => `Barbed heads hobble enemies: ${20 + 10 * l}% slower for 2s. Every 3rd hit pins them in place for 1.5s.`,
  },
  {
    id: 'secondWind',
    name: 'Second Wind',
    type: 'dodge',
    rarity: 'rare',
    max: 2,
    desc: (l) => `+${l} dodge ${l > 1 ? 'charges' : 'charge'}: roll up to ${l + 1} times in a row.`,
  },
  {
    id: 'vitality',
    name: 'Vitality',
    type: 'survival',
    rarity: 'common',
    max: 3,
    desc: (l) => `+${25 * l} max HP in total, and heal to full now.`,
  },
  {
    id: 'overdraw',
    name: 'Overdraw',
    type: 'bow',
    rarity: 'legendary',
    max: 1,
    desc: () => 'Keep holding past the perfect window to charge a mega-shot: 3× damage that pierces everything.',
  },
];

// Offered when every skill is maxed (or the pool runs short).
const PATCH_UP = {
  id: 'patchUp',
  name: 'Patch Up',
  type: 'survival',
  rarity: 'common',
  max: Infinity,
  desc: () => 'Heal 40 HP.',
};

export const TYPE_LABEL = {
  bow: 'Bow',
  perfect: 'Perfect shot',
  element: 'Arrowheads',
  dodge: 'Dodge',
  survival: 'Survival',
};

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** The current run's picks. */
export const build = {
  levels: {},
  rerolls: 1,
  reset() {
    this.levels = {};
    this.rerolls = 1;
  },
  lv(id) {
    return this.levels[id] || 0;
  },
  add(id) {
    if (id === 'patchUp') return;
    // You hold one element at a time.
    if (id === 'fire') delete this.levels.frost;
    if (id === 'frost') delete this.levels.fire;
    this.levels[id] = this.lv(id) + 1;
  },
  owned() {
    return SKILLS.filter((s) => this.lv(s.id) > 0).map((s) => ({ ...s, level: this.lv(s.id) }));
  },
};

export const lv = (id) => build.lv(id);

/** Stats after skills are applied. */
const perk = (k) => currentCharacter().stats[k] ?? 1;

/** Temporary effects from the arena (haste runes, ice patches). */
export const buffs = { haste: 0, slippery: false, chill: 0 };

export const stat = {
  drawTime: () => config.bow.drawTime * 0.85 ** lv('quickHands') * perk('drawTime') * (buffs.haste > 0 ? 0.8 : 1),
  perfectWindow: () => config.bow.perfectWindow * (1 + 0.4 * lv('steadyAim')),
  maxHp: () => Math.round((config.player.maxHp + 25 * lv('vitality')) * perk('maxHp')),
  dodgeCharges: () => 1 + lv('secondWind'),
  damage: () => perk('damage'),
  moveSpeed: () => config.player.moveSpeed * perk('moveSpeed') * (buffs.haste > 0 ? 1.4 : 1) * (buffs.chill > 0 ? 0.6 : 1),
};

export const OVERDRAW_TIME = 0.9; // extra seconds past the perfect window to reach a mega-shot

const WEIGHT = { common: 10, rare: 6 };

/** Pick `n` distinct cards, weighted by rarity. Legendaries get likelier later. */
export function rollCards(n, wave) {
  const pool = SKILLS.filter((s) => build.lv(s.id) < s.max);
  const weightOf = (s) => (s.rarity === 'legendary' ? (wave >= 3 ? 2 + 0.5 * (wave - 3) : 0.6) : WEIGHT[s.rarity]);
  const picks = [];
  while (picks.length < n && pool.length) {
    const total = pool.reduce((sum, s) => sum + weightOf(s), 0);
    let r = Math.random() * total;
    let i = 0;
    while (i < pool.length - 1 && (r -= weightOf(pool[i])) > 0) i++;
    picks.push(pool.splice(i, 1)[0]);
  }
  while (picks.length < n) picks.push(PATCH_UP);
  return picks.map((s) => {
    const next = s.id === 'patchUp' ? 1 : build.lv(s.id) + 1;
    let note = '';
    if (s.id === 'fire' && build.lv('frost')) note = 'Replaces Frost Arrows';
    if (s.id === 'frost' && build.lv('fire')) note = 'Replaces Fire Arrows';
    return { ...s, next, text: s.desc(next), note };
  });
}
