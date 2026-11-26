// Static world layout for Emberhold (town), the Dark World, and defense structures.
import { RNG, fbm, smoothstep } from './rng.js';

export const TOWN = {
  wallR: 48,
  gateHalf: 0.095,          // radians
  bound: 122,
  core: { x: 0, z: 0, r: 2.6 },
  bell: { x: 6.5, z: -5 },
  trainer: { x: -7, z: 6 },
  wartable: { x: 9.5, z: -2 },
  stash: { x: 7.5, z: 6.5 },
  smith: { x: -9, z: -4 },
  obelisk: { x: -13, z: 4 },
  board: { x: 13, z: 5 },
  spawn: { x: 0, z: 13 },
  dungeonPortal: { x: -23, z: -25 },
  darkPortal: { x: 23, z: -25 },
  gates: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
  lanes: [0, Math.PI / 2, Math.PI],   // enemy lanes during night defense: E, S, W
  lake: { x: 80, z: 62, r: 22 },
};

export const DARK = {
  bound: 75,
  spawn: { x: 0, z: 18 },
  portal: { x: 0, z: 33 },
  merchant: { x: 0, z: -4 },
  throne: { x: 0, z: -44 },
  arenas: [{ x: 0, z: -36 }, { x: 38, z: 14 }, { x: -38, z: 14 }],
};

export const MUTATORS = {
  bloodmoon: { name: 'Blood Moon', desc: 'Enemies hit 30% harder and move 25% faster', color: '#ff3a3a' },
  fog: { name: 'Choking Fog', desc: 'Thick fog hides the approaching horde', color: '#9aa8b8' },
  siege: { name: 'Siege Night', desc: 'Ogres arrive on waves 3 and 5 (two on wave 5)', color: '#ff9a3c' },
};
export const RESEARCH = {
  arrows: { name: 'Sharpened Arrows', desc: '+20% tower damage per rank', icon: '🏹' },
  masonry: { name: 'Stonemasonry', desc: '+25% wall & barricade health per rank', icon: '🧱' },
  hellfire: { name: 'Hellfire Coals', desc: '+25% brazier damage per rank', icon: '🔥' },
  deepfrost: { name: 'Deep Frost', desc: '+1 frost radius and stronger slow per rank', icon: '❄' },
  heartstone: { name: 'Heartstone', desc: '+20% Ember Heart health per rank', icon: '💠' },
};
export const researchCost = (r) => ({ shards: 15 * (r + 1), gold: 120 * (r + 1) });

export const STRUCTURES = {
  barricade: { name: 'Barricade', cost: 20, hp: 380, key: '1', icon: '🛡', desc: 'Blocks the horde. Enemies must smash through.' },
  tower: { name: 'Arrow Tower', cost: 60, hp: 260, key: '2', icon: '🏹', range: 17, dmg: 16, rate: 0.85, desc: 'Fires homing arrows at enemies in range.' },
  brazier: { name: 'Ember Brazier', cost: 45, hp: 220, key: '3', icon: '🔥', radius: 3.8, dps: 24, desc: 'Burns everything that walks near it.' },
  frost: { name: 'Frost Totem', cost: 50, hp: 220, key: '4', icon: '❄', radius: 6, slow: 0.5, desc: 'Slows enemies in a wide aura.' },
  wall: { name: 'Stone Wall', cost: 12, hp: 520, key: '5', icon: '🧱', snap: true, desc: 'Snaps to a grid and links up. Reroutes the horde.' },
};

export const MAX_TIER = 3;
export const tierHp = (t) => Math.pow(1.7, t - 1);
export const tierDmg = (t) => Math.pow(1.6, t - 1);
export const upgradeCost = (kind, tier) => STRUCTURES[kind].cost * tier;
export const repairCost = (s) => Math.ceil(Math.max(0, s.maxHp - s.hp) / 12);

export function townHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.06, z * 0.06, 3) - 0.5) * 0.5;
  const out = smoothstep(47, 66, r);
  h += out * ((r - 47) * 0.12 + (fbm(x * 0.018 + 10, z * 0.018 - 5, 4) - 0.35) * 16 + fbm(x * 0.08, z * 0.08, 2) * 2.2);
  h *= smoothstep(17, 24, r) * 0.85 + 0.15;
  const L = TOWN.lake;
  const dl = Math.hypot(x - L.x, z - L.z);
  h -= smoothstep(L.r + 6, L.r * 0.2, dl) * (h + 3.5);
  // keep lanes outside the gates walkable & gentle
  for (const a of TOWN.lanes.concat([-Math.PI / 2])) {
    const px = Math.cos(a), pz = Math.sin(a);
    const along = x * px + z * pz;
    if (along > 40) {
      const perp = Math.abs(-x * pz + z * px);
      const f = smoothstep(9, 3, perp) * smoothstep(40, 52, along);
      h = h * (1 - f * 0.7) + f * 0.7 * (along - 47) * 0.06;
    }
  }
  return h;
}

export function darkHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.07 + 40, z * 0.07, 3) - 0.5) * 1.2;
  h += smoothstep(40, 75, r) * (fbm(x * 0.04, z * 0.04 + 9, 4) * 22 + (r - 40) * 0.3);
  h *= smoothstep(4, 14, Math.hypot(x - DARK.merchant.x, z - DARK.merchant.z)) * 0.8 + 0.2;
  return h;
}

let _layout = null;
export function townLayout() {
  if (_layout) return _layout;
  const rng = new RNG(1337);
  const houses = [], stalls = [], trees = [], rocks = [], chests = [], lamps = [], ruins = [], colliders = [];
  const nearLane = (a, r, w) => TOWN.gates.some((g) => {
    let d = Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return d * r < w;
  });
  const nearPortal = (x, z, d) =>
    Math.hypot(x - TOWN.dungeonPortal.x, z - TOWN.dungeonPortal.z) < d ||
    Math.hypot(x - TOWN.darkPortal.x, z - TOWN.darkPortal.z) < d;

  for (let i = 0; i < 600 && houses.length < 24; i++) {
    const a = rng.range(-Math.PI, Math.PI), r = rng.range(19, 41);
    if (nearLane(a, r, 7.5)) continue;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (nearPortal(x, z, 11)) continue;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < 9.5)) continue;
    const w = rng.range(4.6, 6.4), d = rng.range(4.4, 6), hh = rng.range(3.2, 4.4);
    houses.push({ x, z, rot: -a + Math.PI / 2, w, d, h: hh, roof: rng.int(0, 3), two: rng.chance(0.3), chimney: rng.chance(0.6) });
    colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
  }
  for (let i = 0; i < 200 && stalls.length < 6; i++) {
    const a = rng.range(-Math.PI, Math.PI), r = rng.range(11, 13.5);
    if (nearLane(a, r, 4.5)) continue;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - TOWN.bell.x, z - TOWN.bell.z) < 4) continue;
    if (stalls.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
    stalls.push({ x, z, rot: -a - Math.PI / 2, color: rng.int(0, 4) });
    colliders.push({ x, z, r: 1.5 });
  }
  const L = TOWN.lake;
  for (let i = 0; i < 2000 && trees.length < 340; i++) {
    const a = rng.range(-Math.PI, Math.PI), r = rng.range(53, 120);
    if (nearLane(a, r, r < 85 ? 6 : 3)) continue;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - L.x, z - L.z) < L.r + 3) continue;
    const s = rng.range(0.8, 1.6);
    trees.push({ x, z, s, kind: rng.chance(0.65) ? 0 : 1, rot: rng.range(0, 6.28) });
    colliders.push({ x, z, r: 0.55 * s });
  }
  for (let i = 0; i < 400 && rocks.length < 90; i++) {
    const a = rng.range(-Math.PI, Math.PI), r = rng.range(50, 118);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (nearLane(a, r, 5)) continue;
    const s = rng.range(0.5, 2.4);
    rocks.push({ x, z, s, rot: rng.range(0, 6.28) });
    if (s > 0.9) colliders.push({ x, z, r: s * 0.8 });
  }
  const chestSpots = [[-70, -60], [95, -20], [-100, 30], [20, 100], [-40, 95], [60, -95]];
  for (const [x, z] of chestSpots) chests.push({ x, z, id: 'c' + x + '_' + z });
  const ruinSpots = [[-82, -20], [40, -85]];
  for (const [cx, cz] of ruinSpots) {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const x = cx + Math.cos(a) * 7, z = cz + Math.sin(a) * 7;
      ruins.push({ x, z, h: rng.range(1.5, 6), broken: rng.chance(0.5) });
      colliders.push({ x, z, r: 0.9 });
    }
  }
  for (const a of TOWN.gates) {
    for (const r of [15, 25, 35, 44]) {
      for (const s of [-1, 1]) {
        const px = Math.cos(a) * r - Math.sin(a) * 5.2 * s;
        const pz = Math.sin(a) * r + Math.cos(a) * 5.2 * s;
        lamps.push({ x: px, z: pz });
        colliders.push({ x: px, z: pz, r: 0.3 });
      }
    }
  }
  colliders.push({ x: TOWN.core.x, z: TOWN.core.z, r: TOWN.core.r });
  colliders.push({ x: TOWN.bell.x, z: TOWN.bell.z, r: 1.3 });
  colliders.push({ x: TOWN.stash.x, z: TOWN.stash.z, r: 0.9 }, { x: TOWN.smith.x - 1.2, z: TOWN.smith.z, r: 1.1 }, { x: TOWN.obelisk.x, z: TOWN.obelisk.z, r: 1.2 }, { x: TOWN.board.x, z: TOWN.board.z, r: 1 });
  for (const p of [TOWN.dungeonPortal, TOWN.darkPortal]) {
    const l = Math.hypot(p.x, p.z), fx = -p.x / l, fz = -p.z / l; // portal faces the town centre
    colliders.push({ x: p.x + fz * 2.8, z: p.z - fx * 2.8, r: 0.9 }, { x: p.x - fz * 2.8, z: p.z + fx * 2.8, r: 0.9 });
  }
  _layout = { houses, stalls, trees, rocks, chests, lamps, ruins, colliders };
  return _layout;
}

// Wall collision: ring at TOWN.wallR with gaps at the gates.
export function inGate(x, z) {
  const a = Math.atan2(z, x);
  return TOWN.gates.some((g) => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < TOWN.gateHalf);
}
