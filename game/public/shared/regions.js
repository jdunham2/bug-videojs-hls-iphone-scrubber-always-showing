// Open-world regions beyond Emberhold, world events and the Act I questline. Shared by server + client.
import { fbm, smoothstep } from './rng.js';

export const REGIONS = {
  marsh: {
    name: 'Ashen Marsh', sub: 'Where drowned fires still smoulder', bound: 88,
    spawn: { x: 0, z: 62 }, waypoint: { x: 4, z: 68 }, altar: { x: 0, z: -52 }, water: -0.6,
    spawns: [['burrower', 3], ['healer', 2], ['wraith', 3], ['spiderling', 3], ['bomber', 1.5], ['skeleton', 2]],
    height: (x, z) => { const r = Math.hypot(x, z); return (fbm(x * 0.035 + 7, z * 0.035, 4) - 0.5) * 5 + smoothstep(60, 90, r) * (r - 60) * 0.5 - smoothstep(0.55, 0.75, fbm(x * 0.02, z * 0.02 + 3, 3)) * 2.2; },
  },
  peaks: {
    name: 'Stormspire Peaks', sub: 'The roof of the world', bound: 88,
    spawn: { x: 0, z: 62 }, waypoint: { x: 4, z: 68 }, altar: { x: 0, z: -50 }, water: -99,
    spawns: [['shieldbearer', 3], ['brute', 2], ['imp', 3], ['bomber', 2], ['wraith', 1.5], ['cultist', 2]],
    camp: { x: 9, z: 56 }, summit: { x: 26, z: -2 }, relics: [{ x: -42, z: 18 }, { x: 46, z: 30 }, { x: -20, z: -40 }],
    height: (x, z) => { const r = Math.hypot(x, z); return fbm(x * 0.03, z * 0.03 + 11, 5) * 9 + smoothstep(45, 85, r) * Math.pow(Math.max(0, r - 45), 1.25) * 0.55 + Math.abs(fbm(x * 0.08, z * 0.08, 2) - 0.5) * 3; },
  },
  citadel: {
    name: 'Sunken Citadel', sub: 'A drowned city that breathes with the tide', bound: 88,
    spawn: { x: 0, z: 66 }, waypoint: { x: 5, z: 70 }, altar: { x: 0, z: 22 }, water: -99, tidal: true,
    spawns: [['drowned', 4], ['siren', 2.5], ['shieldbearer', 1.5], ['healer', 1], ['wraith', 1.5]],
    gate: { x: -7, z: 60 }, throne: { x: 0, z: -48 }, bells: [{ x: -38, z: 14 }, { x: 42, z: -12 }, { x: -14, z: -26 }],
    height: (x, z) => citadelHeight(x, z),
  },
};

// The Sunken Citadel: a grid of drowned streets (low, they flood at high tide) between raised plazas and ruined blocks.
export const CITY_CELL = 14;
const cellHash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function cityBlock(x, z) { // 0 street, 1 plaza, 2 ruined block
  const i = Math.floor(x / CITY_CELL), j = Math.floor(z / CITY_CELL);
  const lx = x - i * CITY_CELL, lz = z - j * CITY_CELL;
  if (Math.hypot(x, z - 22) < 16 || Math.hypot(x, z + 48) < 16 || Math.hypot(x, z - 64) < 12) return 1; // cathedral, throne, gate
  if (lx < 4 || lz < 4) return 0; // streets run along the cell edges
  return cellHash(i, j) < 0.42 ? 2 : 1;
}
export function citadelHeight(x, z) {
  const r = Math.hypot(x, z), b = cityBlock(x, z);
  const base = b === 0 ? -0.9 : b === 1 ? 1.3 : 1.6;
  return base + (fbm(x * 0.05 + 3, z * 0.05, 3) - 0.5) * 0.6 + smoothstep(70, 90, r) * (r - 70) * 0.6;
}
/** shared tide level (same on server and client): low -1.7 .. high +0.7 over a 2-minute cycle */
export const TIDE_PERIOD = 120;
export const tideAt = (sec) => -0.5 + 1.2 * Math.sin((sec / TIDE_PERIOD) * Math.PI * 2);
export const LOW_TIDE = -1.15; // the Tide Bells sit in the deepest streets and can only be rung below this

export const TOWN_WAYPOINT = { x: -3.5, z: 20 };
export const CAPTAIN = { x: 3.5, z: 20.5 };

export const QUESTS = [
  { kind: 'talk', need: 1, title: 'A Spark in the Dark', goal: 'Speak with Captain Bryn by the south road',
    intro: 'You made it through the gate. Good. Emberhold needs every blade it can get — the dark is pressing in from every side.',
    done: "Name's Bryn, captain of what's left of the watch. First things first: there's a crypt beneath the hill, and something down there is raising the dead. Go put it back to sleep." },
  { kind: 'dungeon', need: 1, title: 'Into the Depths', goal: 'Defeat a dungeon boss',
    done: "You actually came back. The crypt's quiet — for now. But every night the horde grows bolder at our walls." },
  { kind: 'wave', need: 2, title: 'Hold the Line', goal: 'Repel 2 waves in Defend the City (ring the Night Bell)',
    done: 'Two waves broken! The townsfolk are singing your name. But the Hollow Merchant whispers of rifts tearing open beneath us…' },
  { kind: 'rift', need: 1, title: 'Wounds in the World', goal: 'Complete an Ember Rift (Rift Obelisk)',
    done: "Rifts closing behind you like doors slamming shut. The marsh to the south is where they first bled through. Take the waypoint — it's time we pushed back." },
  { kind: 'event', need: 1, title: 'The Ashen Marsh', goal: 'Travel to the Ashen Marsh and complete a world event',
    done: "Scouts saw it — something huge wading through the bog toward the old altar. They call it the Bog Colossus. It's coming for Emberhold." },
  { kind: 'actboss', need: 1, title: 'The Marsh Horror', goal: 'Slay the Bog Colossus at the marsh altar',
    done: "It's dead? Then the pass to Stormspire Peaks is open. Whatever's calling the storms up there… it knows your name now, hero. Act I complete." },
];
export const ACT1_END = QUESTS.length;
QUESTS.push(
  { act: 2, kind: 'talk2', need: 1, title: 'The Storm Crown', goal: 'Find Scout Ilsa at the Stormspire camp',
    intro: "You're the one who killed the Colossus? Good. I've watched the storms up here for weeks — they're not natural. Something on the summit is wearing a crown made of lightning.",
    done: "I'm coming with you. Two bows are better than one, and I know these passes. First, we thin the herds — the Herald's creatures are everywhere." },
  { act: 2, kind: 'kill_peaks', need: 15, title: 'Thinning the Herd', goal: 'Slay 15 creatures in Stormspire Peaks',
    done: 'The beasts are scattering. The storm is calling for help — watch for rifts and falling stars.' },
  { act: 2, kind: 'event', need: 1, title: 'Eye of the Storm', goal: 'Complete a world event in Stormspire Peaks',
    done: "There. Did you feel the air change? The Herald draws strength from three Storm Relics hidden in the peaks. We take them, it weakens." },
  { act: 2, kind: 'relic', need: 3, title: 'Storm Relics', goal: 'Recover the 3 Storm Relics (marked on the map)',
    done: 'All three. The Drake will come for them — it guards the altar to the north. Kill it, and the summit opens.' },
  { act: 2, kind: 'drake', need: 1, title: 'Wings of Thunder', goal: 'Slay the Storm Drake at the Storm Altar',
    done: "The Drake falls… and the summit answers. The Herald has shown itself. This is it, hero — the Storm Crown." },
  { act: 2, kind: 'herald', need: 1, title: 'The Storm Herald', goal: 'Defeat the Storm Herald atop the Stormspire summit',
    done: "The storms are breaking. For the first time in weeks I can see the stars from the summit. Emberhold will sing of this. Act II complete." },
);
export const ACT2_END = QUESTS.length;
QUESTS.push(
  { act: 3, kind: 'talk3', need: 1, title: 'The Hollow Crown', goal: 'Meet Sir Corvin at the Sunken Citadel gate',
    intro: "Stand fast, stranger. I held this gate when the sea came in, and I have held it every night since. The Hollow King did not die in his Dark World — he crawled here, to the Throne of Tides, and he is wearing his crown again.",
    done: "Then we go together. You strike, I hold. Mind the tide — when it rises, the streets become rivers, and the drowned walk with it." },
  { act: 3, kind: 'kill_citadel', need: 20, title: 'The Drowned Streets', goal: 'Slay 20 of the drowned in the Sunken Citadel',
    done: 'Good. The bells — three Tide Bells hang in the deepest streets. Ring them and the old wards wake.' },
  { act: 3, kind: 'bell', need: 3, title: 'Toll the Tide Bells', goal: 'Ring the 3 Tide Bells — only reachable at low tide',
    done: 'Three tolls. Hear that? The cathedral doors have opened. Something is waking at the altar.' },
  { act: 3, kind: 'event', need: 1, title: 'High Water', goal: 'Complete a world event in the Sunken Citadel',
    done: 'The tide answers to someone. A warden, chained to the cathedral. Free it — or end it.' },
  { act: 3, kind: 'warden', need: 1, title: 'The Drowned Warden', goal: 'Defeat the Drowned Warden at the cathedral altar',
    done: "The Warden is at rest. The road to the Throne of Tides is open. This is where it ends, hero — for him or for us." },
  { act: 3, kind: 'king', need: 1, title: 'The Hollow King Reborn', goal: 'Defeat the Hollow King Reborn at the Throne of Tides',
    done: "The crown is shattered and the sea is quiet. Emberhold stands, the storm is broken and the tide is ours. Act III complete — rest, hero. You have earned it." },
);
export const questDone = (q) => (q?.i || 0) >= ACT1_END;
export const COMPANION = { name: 'Scout Ilsa', color: '#3a9a6a' };
export const COMPANIONS = { ilsa: { name: 'Scout Ilsa', role: 'Archer · Piercing Volley, Mending Wind', color: '#3a9a6a', unlock: ACT1_END + 1 }, corvin: { name: 'Sir Corvin', role: 'Shieldknight · Taunt, Shield Wall', color: '#5a7ab8', unlock: ACT2_END + 1 } };

export const EVENTS = {
  meteor: { name: 'Meteor Crash', goal: 'Slay the elites at the crash site' },
  breach: { name: 'Rift Breach', goal: 'Destroy the invaders pouring from the breach' },
};
