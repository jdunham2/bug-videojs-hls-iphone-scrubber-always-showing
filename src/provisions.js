// The newer camp shops:
//   Apothecary and Tavern sell provisions: packed in camp (up to three), used
//   up on the next run (stew, sharpening oil, tea, a lucky coin, a scout who
//   marks the hidden chest, a rallying song that starts you with the Volley).
//   The Tavern also has a gift on the house once a day.
//   The Falconer's Mews sells plumage for your falcon.
//   The Fletcher (in shops.js) sells bows and restrings their perks.

import { profile, saveProfile } from './profile.js';
import { today } from './daily.js';
import { rollItem, addToStash, heroPower } from './gear.js';

export const PROVISIONS = {
  stew: { shop: 'apothecary', name: 'Hearty Stew', text: '+25 max health', cost: 20, icon: '♨' },
  oil: { shop: 'apothecary', name: 'Sharpening Oil', text: '+12% damage', cost: 30, icon: '⚔' },
  tea: { shop: 'apothecary', name: 'Swiftfoot Tea', text: '+10% move speed', cost: 20, icon: '»' },
  focus: { shop: 'apothecary', name: 'Focus Draught', text: 'Perfect window 30% wider', cost: 25, icon: '◎' },
  coin: { shop: 'apothecary', name: 'Lucky Coin', text: '+25% gems', cost: 35, icon: '◆' },
  scout: { shop: 'tavern', name: 'Hire a Scout', text: 'A beacon marks the hidden treasure chest (missions)', cost: 25, icon: '⚑' },
  rested: { shop: 'home', name: 'Well Rested', text: '+30 max health (slept in your cottage)', cost: 0, icon: '☾' },
  song: { shop: 'tavern', name: 'Rallying Song', text: 'Start the run with the Arrow Volley ready', cost: 30, icon: '♪' },
};
export const MAX_PACK = 3;

export const pack = () => (profile.pack ||= []);

export function buyProvision(id) {
  const p = PROVISIONS[id];
  const list = pack();
  if (!p || list.includes(id) || list.length >= MAX_PACK || profile.gems < p.cost) return false;
  profile.gems -= p.cost;
  list.push(id);
  saveProfile();
  return true;
}

/** Take a provision back out of the pack (refunded). */
export function unpack(id) {
  const list = pack();
  const i = list.indexOf(id);
  if (i < 0) return false;
  list.splice(i, 1);
  profile.gems += PROVISIONS[id].cost;
  saveProfile();
  return true;
}

let active = new Set();
/** A run is starting: open the pack. Returns the provisions now in effect. */
export function startProvisions() {
  active = new Set(pack());
  profile.pack = [];
  // A night in your own cottage counts too.
  if (profile.rested) active.add('rested');
  profile.rested = false;
  saveProfile();
  return [...active];
}
export function endProvisions() {
  active = new Set();
}

/** What the game reads while a run is on. */
export const prov = {
  has: (id) => active.has(id),
  hpAdd: () => (active.has('stew') ? 25 : 0) + (active.has('rested') ? 30 : 0),
  damage: () => (active.has('oil') ? 1.12 : 1),
  speed: () => (active.has('tea') ? 1.1 : 1),
  window: () => (active.has('focus') ? 1.3 : 1),
  gems: () => (active.has('coin') ? 1.25 : 1),
};

// ------------------------------------------------------------ tavern gift

export const giftReady = () => profile.tavernDay !== today();

/** A drink on the house: gems every day, sometimes a piece of gear. */
export function claimGift(level) {
  if (!giftReady()) return null;
  profile.tavernDay = today();
  const gems = 15 + level * 2;
  profile.gems += gems;
  profile.totalGems = (profile.totalGems || 0) + gems;
  let item = null;
  if (Math.random() < 0.3) {
    item = rollItem(['bow', 'armor', 'gadget'][Math.floor(Math.random() * 3)], heroPower() + 1, Math.random() < 0.15 ? 'unique' : 'rare');
    addToStash(item);
  }
  saveProfile();
  return { gems, item };
}

export const RUMORS = [
  'They say the Shieldbearers can’t turn fast. Get round his side.',
  'A Sapper’s keg goes off where he falls. Shoot him in a crowd.',
  'Watch the ground for mud ripples in the Marsh. That’s a Lurker, coming up under you.',
  'The Lancers charge in a straight line. One step aside is enough.',
  'Automatons shrug off light shots. Draw fully, or wait for the gold flash.',
  'Thieves never fight back, and they always carry something worth having.',
  'Champions drop good gear. Every time.',
  'A Golden Wave doubles every gem. Don’t waste it.',
  'Old Brannoc has never let anyone through the high pass.',
  'Captain Blackhook fires his cannons in volleys of four. Count them.',
];

// ------------------------------------------------------------ falcon plumage

export const PLUMAGE = {
  peregrine: { name: 'Peregrine', tint: null, cost: 0, swatch: '#5a6a7a' },
  gyr: { name: 'Gyrfalcon White', tint: [0.95, 0.95, 0.97], cost: 60, swatch: '#eef0f4' },
  ember: { name: 'Ember Hawk', tint: [0.95, 0.45, 0.2], cost: 80, swatch: '#e07038' },
  night: { name: 'Night Raptor', tint: [0.22, 0.22, 0.32], cost: 80, swatch: '#3a3a52' },
  golden: { name: 'Golden Eagle', tint: [0.9, 0.68, 0.3], cost: 120, swatch: '#d8a84a' },
};
export const ownsPlumage = (id) => id === 'peregrine' || !!(profile.plumageOwned || {})[id];
export const currentPlumage = () => (ownsPlumage(profile.plumage) ? profile.plumage : 'peregrine') || 'peregrine';

export function buyPlumage(id) {
  const p = PLUMAGE[id];
  if (!p) return false;
  if (!ownsPlumage(id)) {
    if (profile.gems < p.cost) return false;
    profile.gems -= p.cost;
    (profile.plumageOwned ||= {})[id] = true;
  }
  profile.plumage = id;
  saveProfile();
  return true;
}
