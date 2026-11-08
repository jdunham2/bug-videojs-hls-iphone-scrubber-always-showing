// The town's people and the tasks they give. Each villager has a short chain
// of tasks; finish one and the next opens. Kinds of task:
//   event   count something that happens in runs (kills, chests, bosses...)
//           from the moment you accept
//   fetch   hand over a piece of gear from your stash that fits the ask
//   donate  give gems toward something for the town
//   mission clear a particular mission
// Rewards: gems, XP and sometimes gear.

import { profile, saveProfile } from './profile.js';
import { stash, RARITY_ORDER, salvage, isEquipped, rollItem, addToStash, heroPower, gearChanged } from './gear.js';
import { addXp } from './progression.js';
import { missionStars } from './missions.js';

export const VILLAGERS = [
  {
    id: 'elder',
    name: 'Elder Aldric',
    title: 'Keeper of the town',
    home: [-5, -6],
    hello: 'Welcome, archer. Since your camp went up by the road, folk here sleep a little easier.',
    tasks: [
      { kind: 'mission', mission: 'ruins', text: 'Clear the Sunken Ruins', intro: 'Bandits in the old ruins raid our carts. Drive them out, and the road will be safe again.', done: 'The carts came through untouched this morning. Thank you.', reward: { gems: 50, xp: 80 } },
      { kind: 'event', key: 'chest', n: 3, text: 'Find 3 hidden treasure chests', intro: 'Old maps speak of chests hidden in every ruin. Find three and the town archive would be grateful.', done: 'Three! The archivist nearly fell off her stool.', reward: { gems: 70, xp: 120, item: 'rare' } },
      { kind: 'event', key: 'boss', n: 3, text: 'Defeat 3 bosses', intro: 'The warlords keep coming back. Beat three of them and the people will sing about it.', done: 'They are already writing the song. It is not very good, but it is loud.', reward: { gems: 120, xp: 200, item: 'unique' } },
    ],
  },
  {
    id: 'baker',
    name: 'Mara the Baker',
    title: 'Best bread on the road',
    home: [8, -2],
    hello: 'Fresh loaves, still warm! You look like you skipped breakfast.',
    tasks: [
      { kind: 'donate', gems: 40, text: 'Donate ◆ 40 for a new oven', intro: 'My old oven cracked in the frost. Forty gems would buy a new one, and you would eat free for life.', done: 'Smell that? That is the new oven. Here, take this for the road.', reward: { xp: 90, item: 'rare' }, unlock: 'oven' },
      { kind: 'event', key: 'kill:bomber', n: 10, text: 'Defeat 10 fire-pot bombers', intro: 'Those bombers set the wheat field alight last summer. Ten of them, and I will bake you something special.', done: 'Something special, as promised. Do not tell the elder.', reward: { gems: 80, xp: 120 } },
    ],
  },
  {
    id: 'farmer',
    name: 'Old Tobin',
    title: 'Farmer, grumbler',
    home: [-10, 8],
    hello: 'Hmph. Another hero. Fine. Mind the cabbages.',
    tasks: [
      { kind: 'fetch', slot: 'armor', minRarity: 'common', text: 'Bring Tobin a set of armor', intro: 'The scarecrow needs armor. Do not laugh. The crows respect armor.', done: 'There. Look at him. The crows will not dare.', reward: { gems: 45, xp: 70 } },
      { kind: 'event', key: 'kill:lurker', n: 8, text: 'Defeat 8 Bog Lurkers', intro: 'Something tunnels under my fields at night. Mud everywhere. Those Lurkers from the marsh. Deal with them.', done: 'No mud this morning. Hmph. Thank you.', reward: { gems: 90, xp: 140, item: 'rare' } },
    ],
  },
  {
    id: 'guardCaptain',
    name: 'Captain Hale',
    title: 'Town guard',
    home: [2, 9],
    hello: 'At ease. The guard could use a sharp bow like yours.',
    tasks: [
      { kind: 'fetch', slot: 'bow', minRarity: 'rare', text: 'Bring Hale a Rare (or better) bow', intro: 'My lads are using hunting bows against raiders. One proper bow, Rare or better, and I can copy it for the armory.', done: 'Fine work. The smith is already taking it apart.', reward: { gems: 80, xp: 120 } },
      { kind: 'event', key: 'elite', n: 12, text: 'Defeat 12 elite enemies', intro: 'Elites lead the raids. Twelve of them, and the raids will falter.', done: 'Reports are in. The raids have slowed. The town owes you.', reward: { gems: 120, xp: 180, item: 'unique' } },
      { kind: 'donate', gems: 100, text: 'Donate ◆ 100 for a watchtower', intro: 'With a watchtower on the road we would see them coming. A hundred gems would build it.', done: 'The tower is going up as we speak. Look for it by the gate.', reward: { xp: 150 }, unlock: 'tower' },
    ],
  },
  {
    id: 'tinker',
    name: 'Pip the Tinker',
    title: 'Fixes anything',
    home: [11, 8],
    hello: 'Oh! A visitor! Do not touch that, it bites. Mostly.',
    tasks: [
      { kind: 'fetch', slot: 'gadget', minRarity: 'common', text: 'Bring Pip a gadget', intro: 'I want to see how your gadgets work. Bring me one, any one, and I will make it worth your while.', done: 'Fascinating! The spring goes THERE? Here, a little something.', reward: { gems: 40, xp: 70, item: 'rare' } },
      { kind: 'event', key: 'kill:automaton', n: 6, text: 'Defeat 6 Clockwork Automatons', intro: 'Somebody built automatons in the Far Reaches. Bring them down and I will study the pieces.', done: 'Gears! Springs! A tiny boiler! This is the best day of my life.', reward: { gems: 140, xp: 220, item: 'unique' } },
    ],
  },
];

const state = () => (profile.quests ||= {});
export const villager = (id) => VILLAGERS.find((v) => v.id === id);

/** The villager's current task and its state: { task, step, accepted, progress, ready, finished }. */
export function questOf(id) {
  const v = villager(id);
  const s = state()[id] || { step: 0, accepted: false, progress: 0 };
  const task = v.tasks[s.step] || null;
  if (!task) return { finished: true, step: s.step };
  let progress = s.progress || 0;
  let need = task.n || 1;
  if (task.kind === 'mission') {
    progress = missionStars(task.mission).clear ? 1 : 0;
    need = 1;
  }
  if (task.kind === 'donate') {
    progress = profile.gems >= task.gems ? 1 : 0;
    need = 1;
  }
  if (task.kind === 'fetch') {
    progress = fetchable(task).length ? 1 : 0;
    need = 1;
  }
  return { task, step: s.step, accepted: !!s.accepted, progress, need, ready: !!s.accepted && progress >= need };
}

/** Items in the stash that would satisfy a fetch task (not equipped). */
export function fetchable(task) {
  const min = RARITY_ORDER.indexOf(task.minRarity || 'common');
  return stash().filter((it) => it.slot === task.slot && RARITY_ORDER.indexOf(it.rarity) >= min && !isEquipped(it));
}

export function accept(id) {
  const q = questOf(id);
  if (q.finished || q.accepted) return false;
  state()[id] = { step: q.step, accepted: true, progress: 0 };
  saveProfile();
  return true;
}

/** Hand the task in (for a fetch, give the chosen item). Returns the reward given, or null. */
export function handIn(id, itemUid) {
  const q = questOf(id);
  if (!q.ready) return null;
  const t = q.task;
  if (t.kind === 'fetch') {
    const item = fetchable(t).find((it) => it.uid === itemUid) || fetchable(t)[0];
    if (!item) return null;
    // The item leaves your stash (salvage removes it; its salvage gems are taken back).
    profile.gems -= salvage(item, false);
    gearChanged();
  }
  if (t.kind === 'donate') {
    if (profile.gems < t.gems) return null;
    profile.gems -= t.gems;
  }
  const r = t.reward || {};
  const out = { gems: r.gems || 0, xp: r.xp || 0, item: null, done: t.done, unlock: t.unlock };
  if (r.gems) {
    profile.gems += r.gems;
    profile.totalGems = (profile.totalGems || 0) + r.gems;
  }
  if (r.item) {
    out.item = rollItem(['bow', 'armor', 'gadget'][Math.floor(Math.random() * 3)], heroPower() + 2, r.item);
    addToStash(out.item);
  }
  if (t.unlock) (profile.townUnlocks ||= {})[t.unlock] = true;
  state()[id] = { step: q.step + 1, accepted: false, progress: 0 };
  if (r.xp) out.xpResult = addXp(r.xp);
  saveProfile();
  return out;
}

/** Count a run event toward accepted event tasks. */
export function noteQuest(key, n = 1) {
  let changed = false;
  for (const v of VILLAGERS) {
    const s = state()[v.id];
    if (!s?.accepted) continue;
    const t = v.tasks[s.step];
    if (t?.kind === 'event' && t.key === key && (s.progress || 0) < t.n) {
      s.progress = Math.min(t.n, (s.progress || 0) + n);
      changed = true;
    }
  }
  return changed;
}

/** '!' a task to offer, '?' ready to hand in, '' nothing. */
export function markerFor(id) {
  const q = questOf(id);
  if (q.finished) return '';
  if (q.ready) return '?';
  if (!q.accepted) return '!';
  return '';
}
