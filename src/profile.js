// Persistent player profile: gems, unlocked characters and outfits, the
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
  checkpoint: null, // { wave, build, rerolls, arena } saved after beating a boss
  tips: {},
  savedAt: 0,
});

export const profile = fresh();

/** Where progress is being kept, for the trophy board to show. */
export const saveStatus = { local: true, cloud: 'off' }; // cloud: off | connecting | on | error

// Records only ever go up, so a merge keeps the best of both copies; spendable
// gems and selections come from the copy that is further along (see merge).
function better(a, b) {
  a = a || { wave: 0, kills: 0 };
  b = b || { wave: 0, kills: 0 };
  return b.wave > a.wave || (b.wave === a.wave && b.kills > a.kills) ? { ...b } : { ...a };
}

function merge(a, b) {
  // The copy that has earned more gems is further along (a fresh device may have
  // saved a tip a moment ago, which mustn't wipe real progress); if both earned
  // the same, the one saved last has the latest spending and selections.
  const ta = a.totalGems || 0;
  const tb = b.totalGems || 0;
  const bFirst = tb !== ta ? tb > ta : (b.savedAt || 0) >= (a.savedAt || 0);
  const [newer, older] = bFirst ? [b, a] : [a, b];
  const m = { ...fresh(), ...older, ...newer };
  m.owned = { ...older.owned, ...newer.owned };
  m.outfit = { ...older.outfit, ...newer.outfit };
  m.tips = { ...older.tips, ...newer.tips };
  m.best = better(older.best, newer.best);
  for (const k of ['totalGems', 'runs', 'bosses', 'xp']) m[k] = Math.max(older[k] || 0, newer[k] || 0);
  return m;
}

function replaceProfile(next) {
  // A deep, editable copy: data from the account save arrives read-only (frozen),
  // and the game edits its records in place (tempering an item, today's trial...).
  next = JSON.parse(JSON.stringify(next));
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, next);
  repairRecords();
}

/**
 * Older builds only updated records when you died, so a run that ended any other
 * way left them at zero. A save point proves how far you got: a checkpoint after
 * wave N means you reached wave N and beat a boss every 5 waves on the way.
 */
function repairRecords() {
  const cp = profile.checkpoint;
  if (!cp?.wave) return;
  if (profile.best.wave < cp.wave) profile.best = { wave: cp.wave, kills: profile.best.kills };
  profile.bosses = Math.max(profile.bosses, Math.floor(cp.wave / 5));
  profile.runs = Math.max(profile.runs, 1);
}

export function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') replaceProfile({ ...fresh(), ...saved });
    // Older builds kept the best run under its own key: fold it in.
    const legacy = JSON.parse(localStorage.getItem('draw-release.best.v1') || 'null');
    if (legacy && typeof legacy.wave === 'number') profile.best = better(profile.best, legacy);
  } catch {
    saveStatus.local = false;
  }
}

function writeLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
    saveStatus.local = true;
  } catch {
    saveStatus.local = false; // storage unavailable: progress lasts for this session
  }
}

export function saveProfile() {
  profile.savedAt = Date.now();
  writeLocal();
  queueCloud();
}

// ------------------------------------------------------------ account save
// When the game runs as a claude.ai page, progress is also kept in the page's
// database under the viewer's own private folder, so it survives cleared or
// blocked browser storage and follows them to other devices.

let cloud = null;
/** The page's db, user namespaces and the viewer's id once connected (for the daily leaderboard). */
export const cloudCtx = { db: null, user: null, id: null };
let writing = false;
let dirty = false;
let timer = 0;

function queueCloud(delay = 1200) {
  if (!cloud) return;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flushCloud, delay);
}

async function flushCloud() {
  if (!cloud || writing || !dirty) return;
  writing = true;
  dirty = false;
  try {
    await cloud.set(JSON.parse(JSON.stringify(profile)));
    saveStatus.cloud = 'on';
  } catch (e) {
    saveStatus.cloud = 'error';
    if (e?.code === 'unavailable') dirty = true; // retried below, once
  }
  writing = false;
  if (dirty) queueCloud(3000);
}

/** Connect the account save. Calls `onChange` if the saved copy changed the profile. */
export async function connectCloudSave(onChange) {
  // Inside the viewer `window.claude` is there before our script; give it a moment anyway.
  for (let i = 0; i < 10 && !window.claude?.use; i++) await new Promise((r) => setTimeout(r, 300));
  if (!window.claude?.use) return;
  saveStatus.cloud = 'connecting';
  try {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const id = db && user ? await user.id() : null;
    if (!id) {
      saveStatus.cloud = 'off';
      return;
    }
    Object.assign(cloudCtx, { db, user, id });
    const ref = db.collection(`data/users/${id}`).doc('profile');
    const snap = await ref.get();
    const remote = snap.exists ? JSON.parse(JSON.stringify(snap.data())) : null;
    const before = JSON.stringify(profile);
    if (remote) replaceProfile(merge(profile, remote));
    cloud = ref;
    saveStatus.cloud = 'on';
    writeLocal();
    if (!remote || JSON.stringify(remote) !== JSON.stringify(profile)) queueCloud(0);
    if (JSON.stringify(profile) !== before) onChange?.();
  } catch {
    saveStatus.cloud = 'error';
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

const available = () => new Set([...CHARACTERS, ...OUTFITS].filter((x) => requirementMet(x.requires)).map((x) => x.name));

/** Record progress as it happens (wave cleared, boss slain). Returns unlocks that just became available. */
export function noteProgress({ wave = 0, kills = 0, bosses = 0, gems = 0 }) {
  const before = available();
  profile.gems += gems;
  profile.totalGems += gems;
  profile.bosses += bosses;
  profile.best = better(profile.best, { wave, kills });
  saveProfile();
  return [...available()].filter((n) => !before.has(n));
}

/** A run began: count it now, so runs that end in a closed tab still count. */
export function noteRunStart() {
  profile.runs++;
  saveProfile();
}

/** Bank a run's results: gems, records, and which unlocks became available. */
export function bankRun({ gems, wave, kills }) {
  return noteProgress({ gems, wave, kills });
}

export function currentCharacter() {
  return CHARACTERS.find((c) => c.id === profile.character) || CHARACTERS[0];
}
