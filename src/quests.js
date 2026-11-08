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
  {
    id: 'bard',
    name: 'Jasper the Bard',
    title: 'Sings for his supper',
    home: [-7, -10],
    hello: 'Ah, a hero! Every song needs one. Mine especially. Mine most of all.',
    tasks: [
      { kind: 'event', key: 'champion', n: 2, text: 'Defeat 2 named Champions', intro: 'Give me something to sing about! Two Champions, felled by your bow. Names and all.', done: '“And lo, the archer drew…” Yes. YES. This will be a hit.', reward: { gems: 70, xp: 120 } },
      { kind: 'event', key: 'perfect', n: 60, text: 'Land 60 perfect shots', intro: 'For the final verse I need precision. Sixty perfect shots. I will count every one. In song.', done: 'Sixty! The chorus writes itself. Here, a share of the takings.', reward: { gems: 110, xp: 180, item: 'unique' } },
    ],
  },
  // --- Millbrook, the farming village to the east ---
  {
    id: 'miller',
    village: 'millbrook',
    name: 'Bram the Miller',
    title: 'Grinds the grain',
    home: [3, -4],
    hello: 'Mind the flour, friend. It gets everywhere. EVERYWHERE.',
    tasks: [
      { kind: 'mission', mission: 'hollow', text: 'Clear Autumn Hollow', intro: 'Raiders from the Hollow steal our grain carts. Clear them out and the mill can turn again.', done: 'The carts made it through! The mill is singing.', reward: { gems: 70, xp: 110 } },
      { kind: 'donate', gems: 60, text: 'Donate ◆ 60 for a new millstone', intro: 'The old millstone has a crack you could lose a cat in. Sixty gems would buy a new one.', done: 'Hear that? That is a proper grind. Flour for the whole valley.', reward: { xp: 120, item: 'rare' }, unlock: 'mill' },
    ],
  },
  {
    id: 'shepherdess',
    village: 'millbrook',
    name: 'Elsie the Shepherdess',
    title: 'Counts sheep for a living',
    home: [-4, 6],
    hello: 'Oh! Hello. Have you seen a sheep? About so big? Woolly?',
    tasks: [
      { kind: 'event', key: 'kill:raider', n: 15, text: 'Defeat 15 frost raiders', intro: 'Raiders from the north took three of my flock last winter. Fifteen of them, and we will call it even.', done: 'My sheep are safe. They do not know it, but they are grateful.', reward: { gems: 75, xp: 120 } },
      { kind: 'event', key: 'thief', n: 2, text: 'Catch 2 loot thieves', intro: 'Thieves keep snatching wool from the drying racks. Catch two and they will think twice.', done: 'Two thieves! Here, this was my grandmother’s. She would want a hero to have it.', reward: { gems: 90, xp: 150, item: 'unique' } },
    ],
  },
  {
    id: 'beekeeper',
    village: 'millbrook',
    name: 'Wendel the Beekeeper',
    title: 'Keeper of the hives',
    home: [8, 3],
    hello: 'Slowly, slowly… the bees are calm today. Let us keep it that way.',
    tasks: [
      { kind: 'fetch', slot: 'gadget', minRarity: 'common', text: 'Bring Wendel a gadget', intro: 'A good smoke bomb would calm the hives better than my old smoker. Any gadget, really. I will figure it out.', done: 'Hmm, yes, this will do nicely. Here, have a jar of honey. And this.', reward: { gems: 45, xp: 80, item: 'rare' } },
      { kind: 'event', key: 'kill:sapper', n: 6, text: 'Defeat 6 Sappers', intro: 'Those Sappers and their bangs! Every blast for miles and my bees sulk for a week. Six fewer would help.', done: 'Quiet at last. The bees are making the best honey of the year.', reward: { gems: 100, xp: 160 } },
    ],
  },
  // --- Saltmere, the fishing village by the lake to the west ---
  {
    id: 'fisherman',
    village: 'saltmere',
    name: 'Old Gus',
    title: 'Fisherman, storyteller',
    home: [-6, -3],
    hello: 'Caught a pike this long once. Longer. Sit down, I will tell you about it.',
    tasks: [
      { kind: 'mission', mission: 'harbor', text: 'Clear Stormwatch Harbor', intro: 'Raiders hold the harbor down the coast, so nobody buys our fish. Clear it and trade comes back.', done: 'Carts full of fish heading to market. You have saved Saltmere.', reward: { gems: 80, xp: 130 } },
      { kind: 'event', key: 'kill:deckhand', n: 10, text: 'Defeat 10 pirate Deckhands', intro: 'Pirates raid our boats on the open water. Ten of their deckhands, and the lake is ours again.', done: 'Not a pirate sail in sight. Here, I found this in a net.', reward: { gems: 110, xp: 170, item: 'unique' } },
    ],
  },
  {
    id: 'netmender',
    village: 'saltmere',
    name: 'Granny Wynn',
    title: 'Mends the nets',
    home: [3, 5],
    hello: 'Come closer, dear, my eyes are not what they were. Ah, an archer. Good.',
    tasks: [
      { kind: 'event', key: 'kill:netcaster', n: 8, text: 'Defeat 8 Netcasters', intro: 'Those Netcasters steal my nets to throw at people! Eight of them, and bring my nets home.', done: 'My nets, back where they belong. You are a dear.', reward: { gems: 70, xp: 120 } },
      { kind: 'donate', gems: 50, text: 'Donate ◆ 50 for new boats', intro: 'Half our boats have holes. Fifty gems would buy timber for two new ones.', done: 'Two new boats on the water! The young ones are already racing them.', reward: { xp: 120, item: 'rare' }, unlock: 'boats' },
    ],
  },
  {
    id: 'sailorBoy',
    village: 'saltmere',
    name: 'Finn',
    title: 'Wants to be a sailor',
    home: [-12, 4],
    hello: 'Are you a real hero? Have you seen the sea? The REAL sea?',
    tasks: [
      { kind: 'event', key: 'chest', n: 2, text: 'Find 2 hidden treasure chests', intro: 'Every good sailor has a treasure map. I do not have one. Find two hidden chests and tell me everything!', done: 'Two chests! Was there gold? Were there maps? I am going to be a pirate. A good one.', reward: { gems: 60, xp: 100 } },
      { kind: 'mission', mission: 'cove', text: 'Clear Shipwreck Cove', intro: 'There is a real shipwreck in the Far Reaches with a real pirate captain. Please beat him. Please.', done: 'You beat Blackhook?! I am telling EVERYONE.', reward: { gems: 150, xp: 240, item: 'unique' } },
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
