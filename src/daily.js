// The Daily Trial: one run a day, the same for everyone. Today's date seeds the
// arena and two twists (modifiers); you're scored on kills, perfect shots,
// perfect dodges and a fast clear. Your best score is kept, and on the
// published page everyone's best of the day goes on a shared leaderboard.

import { profile, saveProfile, cloudCtx } from './profile.js';

export const MODIFIERS = {
  glass: { name: 'Glass Cannon', text: 'You deal 50% more damage and take 50% more.', damage: 1.5, taken: 1.5 },
  swarm: { name: 'Swarm', text: '50% more enemies, each a little weaker.', count: 1.5, hp: 0.7 },
  elites: { name: 'Elite Hunt', text: 'Elites turn up three times as often.', elites: 3 },
  frenzy: { name: 'Frenzy', text: 'Enemies move 25% faster.', speed: 1.25 },
  volley: { name: 'Volley Line', text: 'Bandit archers from the first wave, and lots of them.', archers: true },
  ironWill: { name: 'Iron Will', text: 'No healing between waves, but 50% more gems.', noHeal: true, gems: 1.5 },
};

const THEME_NAMES = ['Sunken Ruins', 'Frostpeak Keep', 'Molten Forge', 'Whispering Marsh', 'Autumn Hollow', 'Deepdelve Mines', 'Stormwatch Harbor', 'Sunscorch Canyon', 'Emberfall Caldera', 'Verdant Temple', 'Shipwreck Cove', 'Glowcap Grove', 'Sandsea Oasis', 'Clockwork Foundry', 'Misty Highlands', 'Glacier Lake', 'Whisperpine Woods', 'Field of Banners', 'Glimmer Caverns', 'Ironhold', 'Redcliff Fort'];

/** Today's date as YYYY-MM-DD (local time). */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Small seeded random generator (mulberry32). */
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's trial, as a mission the game can run. */
export function dailyMission(date = today()) {
  const rnd = seeded(date);
  const keys = Object.keys(MODIFIERS);
  const a = keys.splice(Math.floor(rnd() * keys.length), 1)[0];
  const b = keys.splice(Math.floor(rnd() * keys.length), 1)[0];
  const theme = Math.floor(rnd() * THEME_NAMES.length); // any dungeon can host the trial
  return {
    id: 'daily',
    daily: true,
    date,
    name: 'Daily Trial',
    theme,
    waves: 6,
    level: 2,
    blurb: `Today: the ${THEME_NAMES[theme]}. The same trial for everyone, until midnight.`,
    mods: [a, b],
    challenge: { text: 'Score as high as you can', check: () => false, progress: () => '' },
    map: { x: 22, y: 26 },
  };
}

/** Combined numbers for a list of modifier ids. */
export function modEffects(ids = []) {
  const m = { damage: 1, taken: 1, count: 1, hp: 1, elites: 1, speed: 1, archers: false, noHeal: false, gems: 1 };
  for (const id of ids) {
    const d = MODIFIERS[id];
    for (const k of ['damage', 'taken', 'count', 'hp', 'elites', 'speed', 'gems']) if (d[k]) m[k] *= d[k];
    if (d.archers) m.archers = true;
    if (d.noHeal) m.noHeal = true;
  }
  return m;
}

/** Score for a run. */
export function dailyScore(stats, { cleared, elapsed, wave }) {
  return Math.round(stats.kills * 10 + stats.perfects * 15 + stats.perfectDodges * 25 + (cleared ? 1500 + Math.max(0, 480 - elapsed) * 3 : wave * 120));
}

/** Today's record in the profile. */
export function dailyRecord() {
  // A new object rather than editing in place, so a read-only record can't break this.
  if (profile.daily?.date !== today()) profile.daily = { date: today(), best: 0, cleared: false, rewarded: false };
  return profile.daily;
}

/** Save a score; returns { best, isBest, firstClear }. */
export function recordDaily(score, cleared) {
  const d = dailyRecord();
  const isBest = score > d.best;
  if (isBest) d.best = score;
  const firstClear = cleared && !d.rewarded;
  if (cleared) d.cleared = true;
  if (firstClear) d.rewarded = true;
  saveProfile();
  if (isBest) submitScore(score);
  return { best: d.best, isBest, firstClear };
}

// ------------------------------------------------------------ leaderboard

/** Post today's best to the shared board (one document per player). */
async function submitScore(score) {
  const { db, id } = cloudCtx;
  if (!db || !id) return;
  try {
    await db.collection('scores').doc(id).set({ date: today(), score, at: Date.now() });
  } catch {
    /* read-only viewer or offline: the local best still counts */
  }
}

/** Today's top scores: [{ id, score, name, me }], or null when there's no shared board here. */
export async function leaderboard(n = 10) {
  const { db, user, id } = cloudCtx;
  if (!db) return null;
  try {
    const snap = await db.collection('scores').where('date', '==', today()).limit(200).get();
    const rows = snap.docs.map((d) => ({ id: d.id, score: d.data().score || 0 })).sort((a, b) => b.score - a.score);
    const top = rows.slice(0, n);
    const ps = user?.profiles ? await user.profiles(top.map((r) => r.id)).catch(() => ({})) : {};
    const rank = rows.findIndex((r) => r.id === id);
    return { top: top.map((r) => ({ ...r, name: ps?.[r.id]?.name || 'Archer', me: r.id === id })), rank: rank >= 0 ? rank + 1 : null, total: rows.length };
  } catch {
    return null;
  }
}
