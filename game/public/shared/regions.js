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
    height: (x, z) => { const r = Math.hypot(x, z); return fbm(x * 0.03, z * 0.03 + 11, 5) * 9 + smoothstep(45, 85, r) * Math.pow(Math.max(0, r - 45), 1.25) * 0.55 + Math.abs(fbm(x * 0.08, z * 0.08, 2) - 0.5) * 3; },
  },
};

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
export const questDone = (q) => (q?.i || 0) >= QUESTS.length;

export const EVENTS = {
  meteor: { name: 'Meteor Crash', goal: 'Slay the elites at the crash site' },
  breach: { name: 'Rift Breach', goal: 'Destroy the invaders pouring from the breach' },
};
