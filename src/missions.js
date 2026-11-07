// Missions on the world map. Each is a run of waves in one arena that ends in
// a boss fight, with a hidden treasure chest and a bonus challenge: up to three
// stars. Clearing one opens the next. The Endless Siege is the open-ended run
// (arena after arena, with save points) and is always available.

import { profile, saveProfile } from './profile.js';

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
  const m = missionById(profile.mission);
  return m && missionUnlocked(m) ? m : MISSIONS[0];
}

export function selectMission(id) {
  if (id !== 'endless') {
    const m = missionById(id);
    if (!m || !missionUnlocked(m)) return false;
  }
  profile.mission = id;
  saveProfile();
  return true;
}
