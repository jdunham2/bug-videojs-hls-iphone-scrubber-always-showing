// Houses you can buy in the villages. Each has its own room; sleep in its bed
// and the next dungeon starts with that house's rest bonus (one at a time:
// the last bed you slept in).

import { profile, saveProfile } from './profile.js';

export const HOMES = {
  cottage: {
    name: 'Oakvale Cottage',
    village: 'oakvale',
    at: [-13, -3],
    model: 'cottage',
    size: 5.2,
    col: 2.8,
    cost: 150,
    rest: 'Well Rested',
    bonus: '+30 max health',
    blurb: 'Stone walls, a thatched roof, a warm fire and a proper bed.',
    style: { rug: '#6a2a1e', banner: '#2a5a2a', blanket: 0x7a2a24 },
  },
  farmstead: {
    name: 'Millbrook Farmstead',
    village: 'millbrook',
    at: [9, 8],
    model: 'farmhouse',
    size: 6.5,
    col: 3,
    cost: 260,
    rest: 'Hearty Breakfast',
    bonus: '+15% damage',
    blurb: 'A farmhouse with a porch, a big kitchen and fresh eggs every morning.',
    style: { rug: '#3a5a2a', banner: '#c8a03a', blanket: 0x3a6a3a },
  },
  lakehouse: {
    name: 'Saltmere Lake House',
    village: 'saltmere',
    at: [-8, 9],
    model: 'fishingHut',
    size: 4.6,
    col: 2.3,
    cost: 220,
    rest: 'Calm Waters',
    bonus: 'Perfect window 35% wider',
    blurb: 'A snug hut on stilts by the water. You sleep to the sound of the lake.',
    style: { rug: '#2a4a6a', banner: '#2a6a8a', blanket: 0x2a4a7a },
  },
};

export const ownsHome = (id) => !!(profile.homes || {})[id] || (id === 'cottage' && !!profile.house);

export function buyHome(id) {
  const h = HOMES[id];
  if (!h || ownsHome(id) || profile.gems < h.cost) return false;
  profile.gems -= h.cost;
  (profile.homes ||= {})[id] = true;
  if (id === 'cottage') profile.house = true;
  saveProfile();
  return true;
}

/** The bed you last slept in (its bonus applies to the next run), or null. */
export const restingAt = () => profile.rest || (profile.rested ? 'cottage' : null);

export function sleepAt(id) {
  profile.rest = id;
  profile.rested = false;
  saveProfile();
}
