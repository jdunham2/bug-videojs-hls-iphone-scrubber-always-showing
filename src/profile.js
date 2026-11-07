// Persistent player profile: soul gems, unlocked characters and outfits, the
// current selection, records and the boss checkpoint (save point).
// Stored in localStorage; every access is guarded so private/blocked storage
// just means progress lasts for the session.

const KEY = 'draw-release.profile.v1';

/** Playable characters. `perk` tweaks a few stats to make each one feel different. */
export const CHARACTERS = [
  {
    id: 'hero',
    name: 'Rowan the Ranger',
    blurb: 'Steady and reliable. The ranger who started it all.',
    perk: 'Balanced',
    stats: {},
    cost: 0,
    requires: null,
  },
  {
    id: 'huntress',
    name: 'Sylva the Huntress',
    blurb: 'An elven archer with a lightning-fast draw.',
    perk: 'Draws 15% faster, 10% less max HP',
    stats: { drawTime: 0.85, maxHp: 0.9 },
    cost: 60,
    requires: { bosses: 1, label: 'Defeat Gorvak once' },
  },
  {
    id: 'dwarf',
    name: 'Brom Ironbeard',
    blurb: 'Short, stubborn and very hard to knock down.',
    perk: '+30% max HP and damage, 10% slower',
    stats: { maxHp: 1.3, damage: 1.3, moveSpeed: 0.9 },
    cost: 90,
    requires: { wave: 8, label: 'Reach wave 8' },
  },
];

/** Outfits re-paint a character (same model and animations, new texture). */
export const OUTFITS = [
  { id: 'default', base: 'hero', name: 'Forest Ranger', cost: 0, requires: null },
  { id: 'heroCrimson', base: 'hero', name: 'Crimson Hunter', cost: 40, requires: null },
  { id: 'heroFrost', base: 'hero', name: 'Frost Warden', cost: 60, requires: { wave: 4, label: 'Reach wave 4' } },
  { id: 'heroShadow', base: 'hero', name: 'Shadow Stalker', cost: 80, requires: { bosses: 1, label: 'Defeat Gorvak once' } },
  { id: 'heroGold', base: 'hero', name: 'Golden Champion', cost: 150, requires: { wave: 10, label: 'Reach wave 10' } },
];

const fresh = () => ({
  gems: 0,
  totalGems: 0,
  owned: { hero: true, 'hero:default': true },
  character: 'hero',
  outfit: { hero: 'default' },
  best: { wave: 0, kills: 0 },
  bosses: 0,
  runs: 0,
  checkpoint: null, // { wave, build, hp } saved after beating a boss
});

export const profile = fresh();

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') Object.assign(profile, fresh(), saved);
  } catch {
    /* keep defaults */
  }
}

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* storage unavailable: progress lasts for this session */
  }
}

export function requirementMet(req) {
  if (!req) return true;
  if (req.bosses && profile.bosses < req.bosses) return false;
  if (req.wave && profile.best.wave < req.wave) return false;
  return true;
}

export const outfitKey = (o) => `${o.base}:${o.id}`;

/** Try to buy a character or outfit. Returns '' on success or a reason it failed. */
export function purchase(key, cost, req) {
  if (profile.owned[key]) return '';
  if (!requirementMet(req)) return `Locked: ${req.label}`;
  if (profile.gems < cost) return `Needs ◆ ${cost - profile.gems} more`;
  profile.gems -= cost;
  profile.owned[key] = true;
  saveProfile();
  return '';
}

/** Bank a run's results: gems, records, and which unlocks became available. */
export function bankRun({ gems, wave, kills, bosses }) {
  const before = new Set([...CHARACTERS, ...OUTFITS].filter((x) => requirementMet(x.requires)).map((x) => x.name));
  profile.gems += gems;
  profile.totalGems += gems;
  profile.runs++;
  profile.bosses += bosses;
  if (wave > profile.best.wave || (wave === profile.best.wave && kills > profile.best.kills)) profile.best = { wave, kills };
  saveProfile();
  return [...CHARACTERS, ...OUTFITS].filter((x) => requirementMet(x.requires) && !before.has(x.name)).map((x) => x.name);
}

export function currentCharacter() {
  return CHARACTERS.find((c) => c.id === profile.character) || CHARACTERS[0];
}
