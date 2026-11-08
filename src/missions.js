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
];

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
