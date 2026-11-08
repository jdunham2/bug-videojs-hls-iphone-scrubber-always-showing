// Missions on the world map. Each is a run of waves in one arena that ends in
// a boss fight, with a hidden treasure chest and a bonus challenge: up to three
// stars. Clearing one opens the next. The Endless Siege is the open-ended run
// (arena after arena, with save points) and is always available.

import { profile, saveProfile } from './profile.js';
import { dailyMission } from './daily.js';

export const MISSIONS = [
  {
    id: 'ruins',
    name: 'The Sunken Ruins',
    theme: 0,
    waves: 5,
    level: 0,
    blurb: 'Bandits have dug into the old ruins. Clear them out and face their warlord.',
    challenge: { text: 'Land 15 perfect shots', check: (g) => g.stats.perfects >= 15, progress: (g) => `${Math.min(15, g.stats.perfects)}/15` },
    map: { x: 22, y: 64 },
  },
  {
    id: 'keep',
    name: 'Frostpeak Keep',
    theme: 1,
    waves: 6,
    level: 3,
    blurb: 'Northern raiders hold the mountain keep. Gorvak has come to lead them.',
    requires: 'ruins',
    challenge: { text: 'Take fewer than 8 hits', check: (g) => (g.stats.hitsTaken || 0) < 8, progress: (g) => `${g.stats.hitsTaken || 0} hits` },
    map: { x: 50, y: 30 },
  },
  {
    id: 'forge',
    name: 'The Molten Forge',
    theme: 2,
    waves: 7,
    level: 6,
    blurb: 'Deep in the mountain the forges never cool. Bombers guard the way to the Forgemaster.',
    requires: 'keep',
    challenge: { text: 'Finish in under 6 minutes', check: (g) => g.elapsed < 360, progress: (g) => fmtTime(g.elapsed) },
    map: { x: 78, y: 58 },
  },
  {
    id: 'marsh',
    name: 'The Whispering Marsh',
    theme: 3,
    waves: 7,
    level: 8,
    blurb: 'Fog rolls over the drowned causeways. Brogg the Bog-Lord rules the reeds, and his archers hide in them.',
    requires: 'forge',
    challenge: { text: 'Make 8 perfect dodges', check: (g) => g.stats.perfectDodges >= 8, progress: (g) => `${Math.min(8, g.stats.perfectDodges)}/8` },
    map: { x: 12, y: 44 },
  },
  {
    id: 'hollow',
    name: 'Autumn Hollow',
    theme: 4,
    waves: 7,
    level: 10,
    blurb: 'Leaves fall over an old hunting lodge. Thorne the Huntmaster has turned the hollow into his hunting ground.',
    requires: 'marsh',
    challenge: { text: 'Hit 70% of your shots', check: (g) => g.stats.shots >= 20 && g.stats.hits / g.stats.shots >= 0.7, progress: (g) => `${g.stats.shots ? Math.round((100 * g.stats.hits) / g.stats.shots) : 0}%` },
    map: { x: 36, y: 47 },
  },
  {
    id: 'mines',
    name: 'Deepdelve Mines',
    theme: 5,
    waves: 8,
    level: 12,
    blurb: 'Lanterns, powder kegs and long dark tunnels. Mind the barrels, and the foreman who brings the ceiling down.',
    requires: 'hollow',
    challenge: { text: 'Stagger 10 enemies', check: (g) => g.stats.staggers >= 10, progress: (g) => `${Math.min(10, g.stats.staggers)}/10` },
    map: { x: 66, y: 13 },
  },
  {
    id: 'harbor',
    name: 'Stormwatch Harbor',
    theme: 6,
    waves: 8,
    level: 14,
    blurb: 'Rain lashes the docks as raiders pour off their longships. Captain Saltjaw throws burning oil at anyone in his way.',
    requires: 'mines',
    challenge: { text: 'Defeat 6 elites', check: (g) => (g.stats.elites || 0) >= 6, progress: (g) => `${Math.min(6, g.stats.elites || 0)}/6` },
    map: { x: 29, y: 88 },
  },
  {
    id: 'canyon',
    name: 'Sunscorch Canyon',
    theme: 7,
    waves: 8,
    level: 16,
    blurb: 'Blinding sun, hot vents and nowhere to hide. Khazrak the Sand-King waits at the canyon floor.',
    requires: 'harbor',
    challenge: { text: 'Reach a perfect-shot streak of 8', check: (g) => g.stats.bestStreak >= 8, progress: (g) => `best ${g.stats.bestStreak}` },
    map: { x: 73, y: 86 },
  },
  {
    id: 'caldera',
    name: 'Emberfall Caldera',
    theme: 8,
    waves: 9,
    level: 18,
    blurb: 'The mountain is waking up. Gorvak has come back for one last fight, at the edge of the burning crater.',
    requires: 'canyon',
    challenge: { text: 'Win without using a gadget', check: (g) => !(g.stats.gadgets > 0), progress: (g) => `${g.stats.gadgets || 0} used` },
    map: { x: 89, y: 27 },
  },
  // --- The Far Reaches: past the caldera, over the mountains ---
  {
    id: 'temple',
    region: 2,
    name: 'The Verdant Temple',
    theme: 9,
    waves: 8,
    level: 20,
    blurb: 'A temple swallowed by the jungle, its steps still full of old traps. Ukko the Temple Brute guards the top.',
    requires: 'caldera',
    challenge: { text: 'Take fewer than 10 hits', check: (g) => (g.stats.hitsTaken || 0) < 10, progress: (g) => `${g.stats.hitsTaken || 0} hits` },
    map: { x: 24, y: 30 },
  },
  {
    id: 'grove',
    region: 2,
    name: 'Glowcap Grove',
    theme: 11,
    waves: 8,
    level: 22,
    blurb: 'Night in a forest of giant glowing mushrooms. Something big has made its nest in the middle.',
    requires: 'temple',
    challenge: { text: 'Land 40 perfect shots', check: (g) => g.stats.perfects >= 40, progress: (g) => `${Math.min(40, g.stats.perfects)}/40` },
    map: { x: 14, y: 62 },
  },
  {
    id: 'oasis',
    region: 2,
    name: 'Sandsea Oasis',
    theme: 12,
    waves: 9,
    level: 24,
    blurb: 'The last water before the dunes, and every warband wants it. Vulgra the Dune-Breaker holds it now.',
    requires: 'grove',
    challenge: { text: 'Finish in under 8 minutes', check: (g) => g.elapsed < 480, progress: (g) => fmtTime(g.elapsed) },
    map: { x: 44, y: 78 },
  },
  {
    id: 'cove',
    region: 2,
    name: 'Shipwreck Cove',
    theme: 10,
    waves: 9,
    level: 26,
    blurb: 'A wrecked galleon, a beach full of powder kegs, and Captain Blackhook firing his cannons at anything that moves.',
    requires: 'oasis',
    challenge: { text: 'Make 12 perfect dodges', check: (g) => g.stats.perfectDodges >= 12, progress: (g) => `${Math.min(12, g.stats.perfectDodges)}/12` },
    map: { x: 80, y: 74 },
  },
  {
    id: 'foundry',
    region: 2,
    name: 'Clockwork Foundry',
    theme: 13,
    waves: 10,
    level: 28,
    blurb: 'Gears turn, steam hisses and the furnaces never stop. Ironjaw the Machinist has built himself cannons.',
    requires: 'cove',
    challenge: { text: 'Defeat 10 elites', check: (g) => (g.stats.elites || 0) >= 10, progress: (g) => `${Math.min(10, g.stats.elites || 0)}/10` },
    map: { x: 52, y: 42 },
  },
  {
    id: 'highlands',
    region: 2,
    name: 'The Misty Highlands',
    theme: 14,
    waves: 10,
    level: 30,
    blurb: 'Bamboo, blossom and cold mist on the high pass. Old Brannoc has never let anyone through. Be the first.',
    requires: 'foundry',
    challenge: { text: 'Reach a perfect-shot streak of 12', check: (g) => g.stats.bestStreak >= 12, progress: (g) => `best ${g.stats.bestStreak}` },
    map: { x: 76, y: 22 },
  },
  // --- The Northern Wilds: over the high pass ---
  {
    id: 'glacier',
    region: 3,
    name: 'Glacier Lake',
    theme: 15,
    waves: 10,
    level: 32,
    blurb: 'A frozen lake under a white sky, slick ice underfoot. Jarl Frostbeard holds the far shore.',
    requires: 'highlands',
    challenge: { text: 'Make 15 perfect dodges', check: (g) => g.stats.perfectDodges >= 15, progress: (g) => `${Math.min(15, g.stats.perfectDodges)}/15` },
    map: { x: 22, y: 30 },
  },
  {
    id: 'pines',
    region: 3,
    name: 'Whisperpine Woods',
    theme: 16,
    waves: 10,
    level: 34,
    blurb: 'Tall pines and hunters’ traps. Something old and gnarled moves between the trees.',
    requires: 'glacier',
    challenge: { text: 'Take fewer than 12 hits', check: (g) => (g.stats.hitsTaken || 0) < 12, progress: (g) => `${g.stats.hitsTaken || 0} hits` },
    map: { x: 16, y: 66 },
  },
  {
    id: 'banners',
    region: 3,
    name: 'Field of Banners',
    theme: 17,
    waves: 11,
    level: 36,
    blurb: 'An old battlefield where the war never ended. The Warchief still calls his host to arms.',
    requires: 'pines',
    challenge: { text: 'Defeat 15 elites', check: (g) => (g.stats.elites || 0) >= 15, progress: (g) => `${Math.min(15, g.stats.elites || 0)}/15` },
    map: { x: 46, y: 52 },
  },
  {
    id: 'caverns',
    region: 3,
    name: 'Glimmer Caverns',
    theme: 18,
    waves: 11,
    level: 38,
    blurb: 'Caves full of glittering crystal and things that tunnel. Mind the ground under your feet.',
    requires: 'banners',
    challenge: { text: 'Land 80 perfect shots', check: (g) => g.stats.perfects >= 80, progress: (g) => `${Math.min(80, g.stats.perfects)}/80` },
    map: { x: 42, y: 84 },
  },
  {
    id: 'ironhold',
    region: 3,
    name: 'Ironhold',
    theme: 19,
    waves: 12,
    level: 40,
    blurb: 'A dwarven hall of forges and machines, taken by Thane Ironhold and his automatons.',
    requires: 'caverns',
    challenge: { text: 'Finish in under 10 minutes', check: (g) => g.elapsed < 600, progress: (g) => fmtTime(g.elapsed) },
    map: { x: 74, y: 70 },
  },
  {
    id: 'redcliff',
    region: 3,
    name: 'Redcliff Fort',
    theme: 20,
    waves: 12,
    level: 42,
    blurb: 'The bandit fortress on the red cliffs, the last stronghold in the north. Redcap Vorn awaits.',
    requires: 'ironhold',
    challenge: { text: 'Reach a perfect-shot streak of 15', check: (g) => g.stats.bestStreak >= 15, progress: (g) => `best ${g.stats.bestStreak}` },
    map: { x: 78, y: 26 },
  },
];

/** Missions on a world-map region (1 = the Borderlands, 2 = the Far Reaches). */
export const missionsIn = (region) => MISSIONS.filter((m) => (m.region || 1) === region);
export const farReachesOpen = () => !!missionStars('caldera').clear;
/** Is a world-map region open? (1 always; 2 after the Caldera; 3 after the Misty Highlands.) */
export const regionOpen = (region) => region === 1 || (region === 2 ? farReachesOpen() : !!missionStars('highlands').clear);

export const ENDLESS = {
  id: 'endless',
  name: 'Endless Siege',
  blurb: 'Wave after wave, arena after arena. A boss every five waves, with a save point after each.',
  map: { x: 50, y: 82 },
};

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export const missionById = (id) => MISSIONS.find((m) => m.id === id) || null;

/** Progress per mission: { clear, secret, challenge } stars (best across tiers). */
export function missionStars(id) {
  return (profile.missions ||= {})[id] || { clear: false, secret: false, challenge: false };
}

export const starCount = (id) => {
  const s = missionStars(id);
  return (s.clear ? 1 : 0) + (s.secret ? 1 : 0) + (s.challenge ? 1 : 0);
};

export const totalStars = () => MISSIONS.reduce((n, m) => n + starCount(m.id), 0);

export const missionUnlocked = (m) => !m.requires || missionStars(m.requires).clear;

/** Record a finished mission. Returns which stars are new. */
export function recordMission(id, got) {
  const cur = missionStars(id);
  const fresh = { clear: got.clear && !cur.clear, secret: got.secret && !cur.secret, challenge: got.challenge && !cur.challenge };
  profile.missions[id] = { clear: cur.clear || got.clear, secret: cur.secret || got.secret, challenge: cur.challenge || got.challenge };
  saveProfile();
  return fresh;
}

/** The mission the gate is pointing at (last picked, if still available). */
export function selectedMission() {
  if (profile.mission === 'endless') return ENDLESS;
  if (profile.mission === 'daily') return dailyMission();
  const m = missionById(profile.mission);
  return m && missionUnlocked(m) ? m : MISSIONS[0];
}

export function selectMission(id) {
  if (id !== 'endless' && id !== 'daily') {
    const m = missionById(id);
    if (!m || !missionUnlocked(m)) return false;
  }
  profile.mission = id;
  saveProfile();
  return true;
}
