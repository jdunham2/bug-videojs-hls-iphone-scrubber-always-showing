// Playable classes: resources, skills (1-4) and 12-node talent trees. Shared by server + client.
export const CLASSES = {
  warden: {
    name: 'Warden', role: 'Tank · Sword & Shield', color: '#5ab0ff',
    desc: 'An unbreakable bulwark. Bash foes senseless, taunt the horde onto your shield and shatter the earth.',
    weapons: ['sword', 'axe', 'hammer'], starter: 'sword',
    baseHp: 140, hpPerLevel: 15, armor: 12,
    resource: { name: 'Rage', color: '#e0453a', max: 100, regen: -3, start: 0, onHit: 5, onHurt: 9 },
    skills: [
      { id: 'bash', name: 'Shield Bash', icon: '🛡️', cost: 20, cd: 5, desc: 'Charge forward and slam your shield into enemies, stunning them.' },
      { id: 'taunt', name: 'War Cry', icon: '📯', cost: 0, cd: 12, desc: 'Force nearby enemies to attack you. +40% armor for 6s. Generates Rage.' },
      { id: 'block', name: 'Block', icon: '🧱', cost: 0, cd: 0, hold: true, desc: 'Hold to raise your shield: −75% frontal damage. A perfect block stuns the attacker.' },
      { id: 'quake', name: 'Earthshatter', icon: '💥', cost: 40, cd: 8, desc: 'Leap and shatter the ground, damaging everything around you.' },
    ],
    talents: [
      { id: 'w_skin', tier: 0, name: 'Iron Skin', icon: '🪨', max: 3, eff: { armor: 8 }, desc: '+8 Armor per rank' },
      { id: 'w_vigor', tier: 0, name: 'Vigor', icon: '❤️', max: 3, eff: { hpPct: 0.06 }, desc: '+6% Health per rank' },
      { id: 'w_hands', tier: 0, name: 'Heavy Hands', icon: '✊', max: 3, eff: { dmgPct: 0.05 }, desc: '+5% Damage per rank' },
      { id: 'w_bash', tier: 1, name: 'Concussive Bash', icon: '🛡️', max: 2, eff: { s0: 0.2, stun: 0.5 }, desc: 'Shield Bash +20% damage, +0.5s stun per rank' },
      { id: 'w_cry', tier: 1, name: 'Rallying Cry', icon: '📯', max: 2, eff: { cryHeal: 0.08 }, desc: 'War Cry heals you for 8% max health per rank' },
      { id: 'w_bulwark', tier: 1, name: 'Bulwark', icon: '🧱', max: 2, eff: { block: 0.1 }, desc: 'Block reduces +10% more damage per rank' },
      { id: 'w_quake', tier: 2, name: 'Aftershock', icon: '💥', max: 2, eff: { s3: 0.25, quakeR: 1 }, desc: 'Earthshatter +25% damage and +1 radius per rank' },
      { id: 'w_blood', tier: 2, name: 'Bloodrage', icon: '🩸', max: 2, eff: { leech: 0.02 }, desc: '+2% Lifesteal per rank' },
      { id: 'w_jugg', tier: 2, name: 'Juggernaut', icon: '🐂', max: 2, eff: { moveSpeed: 0.05, armorPct: 0.05 }, desc: '+5% move speed and +5% armor per rank' },
      { id: 'w_aegis', tier: 3, name: 'Aegis Wave', icon: '🌊', max: 1, flag: 'aegis', desc: 'Perfect blocks release a damaging shockwave' },
      { id: 'w_unbreak', tier: 3, name: 'Unbreakable', icon: '⛰️', max: 1, flag: 'unbreakable', desc: 'Lethal damage leaves you at 1 HP instead (once per 90s)' },
      { id: 'w_lord', tier: 3, name: 'Warlord', icon: '👑', max: 1, eff: { cdr: 0.15, resMax: 30 }, desc: '15% cooldown reduction, +30 max Rage' },
    ],
  },
  emberblade: {
    name: 'Emberblade', role: 'Assassin · Dual Blades', color: '#ff9a3c',
    desc: 'A blur of flame and steel. Blink behind targets, spin into a fire whirl and execute the weakened.',
    weapons: ['dagger', 'sword'], starter: 'dagger',
    baseHp: 105, hpPerLevel: 11, armor: 4,
    resource: { name: 'Focus', color: '#ffd23a', max: 100, regen: 14, start: 100 },
    skills: [
      { id: 'blink', name: 'Blink Strike', icon: '⚡', cost: 30, cd: 4, desc: 'Teleport behind a target and strike for a guaranteed critical hit.' },
      { id: 'whirl', name: 'Fire Whirl', icon: '🌪️', cost: 45, cd: 7, desc: 'Spin into a blazing whirlwind, shredding everything around you.' },
      { id: 'flurry', name: 'Blade Flurry', icon: '🗡️', cost: 25, cd: 3, desc: 'Unleash six rapid stabs in front of you.' },
      { id: 'execute', name: 'Execution', icon: '☠️', cost: 60, cd: 10, desc: 'A devastating finisher. Double damage on enemies below 35% health.' },
    ],
    talents: [
      { id: 'e_edge', tier: 0, name: 'Keen Edge', icon: '🔪', max: 3, eff: { crit: 0.03 }, desc: '+3% Crit chance per rank' },
      { id: 'e_swift', tier: 0, name: 'Swiftness', icon: '💨', max: 3, eff: { atkSpeed: 0.06 }, desc: '+6% Attack speed per rank' },
      { id: 'e_agile', tier: 0, name: 'Agility', icon: '🦊', max: 3, eff: { moveSpeed: 0.04 }, desc: '+4% Move speed per rank' },
      { id: 'e_blink', tier: 1, name: 'Shadow Blink', icon: '⚡', max: 2, eff: { s0: 0.25 }, desc: 'Blink Strike +25% damage per rank' },
      { id: 'e_inferno', tier: 1, name: 'Inferno', icon: '🔥', max: 2, eff: { s1: 0.2 }, desc: 'Fire Whirl +20% damage per rank' },
      { id: 'e_flurry', tier: 1, name: 'Flurry Mastery', icon: '🗡️', max: 2, eff: { flurry: 2 }, desc: 'Blade Flurry +2 stabs per rank' },
      { id: 'e_exec', tier: 2, name: 'Executioner', icon: '☠️', max: 2, eff: { s3: 0.3 }, desc: 'Execution +30% damage per rank' },
      { id: 'e_focus', tier: 2, name: 'Focused Mind', icon: '🧘', max: 2, eff: { resRegen: 0.2 }, desc: '+20% Focus regeneration per rank' },
      { id: 'e_lethal', tier: 2, name: 'Lethality', icon: '🎯', max: 2, eff: { critDmg: 0.3 }, desc: '+30% Critical damage per rank' },
      { id: 'e_dance', tier: 3, name: 'Ember Dance', icon: '💃', max: 1, flag: 'dance', desc: 'Perfect dodges reset all skill cooldowns' },
      { id: 'e_after', tier: 3, name: 'Afterimage', icon: '👥', max: 1, flag: 'afterimage', desc: 'Dodge rolls explode in flame where you started' },
      { id: 'e_storm', tier: 3, name: 'Bladestorm', icon: '🌀', max: 1, eff: { cdr: 0.15, whirlDur: 1 }, desc: 'Fire Whirl lasts 1s longer, 15% cooldown reduction' },
    ],
  },
  hexcaller: {
    name: 'Hexcaller', role: 'Caster · Staff', color: '#c77dff',
    desc: 'Master of ember and storm. Hurl fire bolts, chain lightning through packs and summon a spirit ally.',
    weapons: ['staff'], starter: 'staff',
    baseHp: 90, hpPerLevel: 10, armor: 2,
    resource: { name: 'Mana', color: '#4a8cff', max: 120, regen: 9, start: 120 },
    skills: [
      { id: 'firebolt', name: 'Fire Bolt', icon: '☄️', cost: 20, cd: 1.2, desc: 'Hurl an exploding bolt of fire that damages an area.' },
      { id: 'chain', name: 'Chain Lightning', icon: '🌩️', cost: 35, cd: 4, desc: 'Lightning arcs between up to 5 enemies.' },
      { id: 'spirit', name: 'Ember Spirit', icon: '🦋', cost: 50, cd: 18, desc: 'Summon a spirit that fights at your side for 20s.' },
      { id: 'meteor', name: 'Meteor', icon: '🌠', cost: 60, cd: 12, desc: 'Call down a meteor on your target after a short delay.' },
    ],
    talents: [
      { id: 'h_power', tier: 0, name: 'Arcane Power', icon: '✨', max: 3, eff: { dmgPct: 0.06 }, desc: '+6% Damage per rank' },
      { id: 'h_well', tier: 0, name: 'Deep Well', icon: '🔮', max: 3, eff: { resMax: 20 }, desc: '+20 max Mana per rank' },
      { id: 'h_fort', tier: 0, name: 'Fortitude', icon: '❤️', max: 3, eff: { hpPct: 0.08 }, desc: '+8% Health per rank' },
      { id: 'h_comb', tier: 1, name: 'Combustion', icon: '☄️', max: 2, eff: { s0: 0.2, boltR: 0.8 }, desc: 'Fire Bolt +20% damage and +0.8 radius per rank' },
      { id: 'h_storm', tier: 1, name: 'Storm Conduit', icon: '🌩️', max: 2, eff: { chains: 1 }, desc: 'Chain Lightning hits +1 enemy per rank' },
      { id: 'h_bond', tier: 1, name: 'Soul Bond', icon: '🦋', max: 2, eff: { s2: 0.3, spiritDur: 8 }, desc: 'Spirit +30% damage and +8s duration per rank' },
      { id: 'h_cata', tier: 2, name: 'Cataclysm', icon: '🌠', max: 2, eff: { s3: 0.3 }, desc: 'Meteor +30% damage per rank' },
      { id: 'h_clar', tier: 2, name: 'Clarity', icon: '💧', max: 2, eff: { resRegen: 0.2 }, desc: '+20% Mana regeneration per rank' },
      { id: 'h_glass', tier: 2, name: 'Glass Cannon', icon: '🔥', max: 2, eff: { crit: 0.04 }, desc: '+4% Crit chance per rank' },
      { id: 'h_twin', tier: 3, name: 'Twin Spirits', icon: '🦋', max: 1, flag: 'twin', desc: 'Ember Spirit summons two spirits' },
      { id: 'h_over', tier: 3, name: 'Overload', icon: '⚡', max: 1, flag: 'overload', desc: 'Chain Lightning stuns every enemy it hits' },
      { id: 'h_arch', tier: 3, name: 'Archmage', icon: '🧙', max: 1, eff: { cdr: 0.2 }, desc: '20% cooldown reduction' },
    ],
  },
};

export const TIER_REQ = [0, 3, 6, 9]; // talent points spent required to unlock a tier

export const talentPoints = (level) => Math.max(0, level - 1);
export const spentPoints = (talents) => Object.values(talents || {}).reduce((a, b) => a + b, 0);

export function canLearn(cls, talents, id, level) {
  const C = CLASSES[cls]; if (!C) return false;
  const t = C.talents.find((x) => x.id === id); if (!t) return false;
  const spent = spentPoints(talents);
  if (spent >= talentPoints(level)) return false;
  if ((talents[id] || 0) >= t.max) return false;
  if (spent < TIER_REQ[t.tier]) return false;
  return true;
}

export function talentTotals(cls, talents) {
  const out = { flags: {} };
  const C = CLASSES[cls];
  if (!C) return out;
  for (const t of C.talents) {
    const r = (talents || {})[t.id] || 0;
    if (!r) continue;
    if (t.flag) out.flags[t.flag] = true;
    for (const [k, v] of Object.entries(t.eff || {})) out[k] = (out[k] || 0) + v * r;
  }
  return out;
}
