// Social + live-ops rules shared by server and client: bounties, seasons and cosmetics, guild limits.
import { RNG } from './rng.js';

export const DAY_MS = 86400000;
export const dayKey = (t = Date.now()) => Math.floor(t / DAY_MS);
export const weekKey = (t = Date.now()) => Math.floor((dayKey(t) + 3) / 7); // weeks start Monday (UTC)

const ZONE_NAMES = { marsh: 'the Ashen Marsh', peaks: 'Stormspire Peaks', dungeon: 'dungeons', dark: 'the Dark World' };
// [kind, label(n, z), daily n range, weekly n range, zone choices]
const TEMPLATES = [
  ['kill', (n, z) => `Slay ${n} enemies in ${ZONE_NAMES[z]}`, [25, 45], [180, 260], ['marsh', 'peaks', 'dungeon', 'dark']],
  ['elite', (n) => `Defeat ${n} elite or champion enemies`, [4, 7], [25, 35]],
  ['boss', (n) => `Defeat ${n} bosses`, [1, 2], [6, 9]],
  ['dungeon', (n) => `Clear ${n} dungeon${n > 1 ? 's' : ''}`, [1, 2], [6, 9]],
  ['rift', (n) => `Complete ${n} Ember Rift${n > 1 ? 's' : ''}`, [1, 2], [5, 7]],
  ['event', (n) => `Complete ${n} world event${n > 1 ? 's' : ''}`, [1, 2], [5, 7]],
  ['fish', (n) => `Catch ${n} fish at the Emberhold lake`, [3, 5], [15, 22]],
  ['wave', (n) => `Survive ${n} Defend-the-City waves`, [3, 5], [15, 20]],
];
function build(seed, count, weekly) {
  const rng = new RNG(seed), pool = TEMPLATES.slice(), out = [];
  for (let i = 0; i < count && pool.length; i++) {
    const [kind, label, dn, wn, zones] = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    const [a, b] = weekly ? wn : dn, n = rng.int(a, b), zone = zones ? rng.pick(zones) : null;
    out.push({ id: `${weekly ? 'w' : 'd'}${seed}-${kind}${zone ? '-' + zone : ''}`, kind, zone, n, text: label(n, zone), weekly,
      reward: weekly ? { gold: 2500, marks: 160, legendary: true } : { gold: 400, marks: 45, gems: 1 } });
  }
  return out;
}
export const dailyBounties = (d = dayKey()) => build(d * 7919 + 13, 3, false);
export const weeklyBounties = (w = weekKey()) => build(w * 104729 + 7, 2, true);
export const allBounties = (t = Date.now()) => [...dailyBounties(dayKey(t)), ...weeklyBounties(weekKey(t))];

// ---- seasons: a reward track of cosmetics bought with Season Marks (earned from bounties, rifts, bosses) ----
export const COSMETICS = {
  title_emberborn: { type: 'title', name: 'Emberborn', color: '#ffb35a' },
  aura_wisps: { type: 'aura', name: 'Ember Wisps', color: '#ff8a3a', color2: '#ffd36a' },
  steed_ash: { type: 'steed', name: 'Ashen Mare', color: '#6a6a78' },
  title_riftwalker: { type: 'title', name: 'Rift Walker', color: '#c77dff' },
  aura_storm: { type: 'aura', name: 'Storm Crown', color: '#6ad0ff', color2: '#e8f6ff' },
  steed_storm: { type: 'steed', name: 'Stormrunner', color: '#3a6ab8' },
  title_champion: { type: 'title', name: 'Season Champion', color: '#ffd34d' },
};
export const SEASON_TRACK = [
  { marks: 60, cos: 'title_emberborn' },
  { marks: 160, cos: 'aura_wisps' },
  { marks: 320, cos: 'steed_ash' },
  { marks: 520, cos: 'title_riftwalker' },
  { marks: 800, cos: 'aura_storm' },
  { marks: 1150, cos: 'steed_storm' },
  { marks: 1600, cos: 'title_champion' },
];

export const GUILD_COST = 1000, GUILD_MAX = 20, GUILD_STASH = 24;
export const validGuildName = (s) => typeof s === 'string' && /^[A-Za-z0-9' ]{3,20}$/.test(s.trim());
export const validGuildTag = (s) => typeof s === 'string' && /^[A-Z0-9]{2,4}$/.test(s);
