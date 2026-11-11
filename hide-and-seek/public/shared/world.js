// Shared world definition: used by the server (bots, validation) and the client (rendering, collision).
// Everything is generated deterministically so both sides agree without sending the map.

export const HALF = 75; // world spans -HALF..HALF on x and z
export const FLOOR_H = 3.4; // height of one storey
export const PR = 0.4; // player collision radius
export const CELL = 0.5; // nav grid cell size
export const GN = (HALF * 2) / CELL; // nav grid cells per side

export const SPEED = {
  hider: { walk: 4.2, sprint: 7.0 },
  seeker: { walk: 4.4, sprint: 7.4 },
  crouch: 2.0,
  winded: 3.0,
};
export const STAM = { drain: 22, regenMove: 12, regenIdle: 20, windedFor: 3.5 };

// Player state flags sent over the wire
export const F_SPRINT = 1, F_CROUCH = 2, F_MOVE = 4, F_USE = 8, F_WIND = 16, F_JUMP = 32;

// Power-ups: what each one is called, and who can get it
export const ITEMS = [null, { name: 'Energy drink', icon: '🥤', role: 0 }, { name: 'Shadow cloak', icon: '🫥', role: 0 }, { name: 'Radar', icon: '📡', role: 1 }, { name: 'Rocket boots', icon: '🥾', role: 1 }];

// How far each kind of noise carries (metres)
export const NOISE_RANGE = { run: 22, breath: 10, taunt: 60, rock: 35, beacon: 70, engine: 34 };

// Vehicles: top speed and handling are the same everywhere; each map just dresses them differently
export const VEHICLE = { max: 12.5, reverse: 4, accel: 9, turn: 2.1, radius: 1.0, enter: 2.8, drain: 4, regen: 2.5, idleRegen: 6, gravity: 15 };

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MODES = [
  { id: 'classic', name: 'Classic', blurb: 'Caught hiders go to jail until a teammate pulls the lever.' },
  { id: 'infection', name: 'Infection', blurb: 'Everyone a seeker catches becomes a seeker too. Be the last one standing.' },
  { id: 'freeze', name: 'Freeze Tag', blurb: 'Tagged hiders freeze where they stand. Teammates can thaw them.' },
  { id: 'props', name: 'Prop Hunt', blurb: 'Hiders are disguised as crates, barrels and bushes. A seeker who swings and misses is dazed.' },
  { id: 'blackout', name: 'Blackout', blurb: 'Classic rules in the pitch dark. Seekers have flashlights; everyone else has a faint glow.' },
  { id: 'heist', name: 'Coin Heist', blurb: 'Hiders win the moment they have collected enough coins between them.' },
  { id: 'sardines', name: 'Sardines', blurb: 'One player hides and everyone else seeks. Find the hider and you join them. Do not be last.' },
  { id: 'turbo', name: 'Turbo', blurb: 'Short, frantic rounds: everyone is faster and nobody runs out of breath.' },
  { id: 'vip', name: 'VIP Escort', blurb: 'One hider is the VIP. If the seekers catch the VIP, the round is over.' },
  { id: 'tag', name: 'Playground Tag', blurb: 'One player is "it". Tag someone and they are it instead. Do not be it when time runs out.' },
  { id: 'giants', name: 'Giants', blurb: 'Seekers are towering giants with a long reach. Hiders are tiny and hard to spot.' },
];
// Mode-specific numbers: Turbo shortens the round and speeds everyone up
export const TURBO = { speed: 1.3, hide: 15, seek: 90 };
export const GIANT = { seeker: 1.7, hider: 0.5, reach: 3.7 };
// Vehicle types. Type 0 is each map's own ride; the others are the same everywhere.
// drain is fuel per second (out of 100); quiet ones do not ping seekers.
export const VEHICLES = [
  { name: '', max: 12.5, accel: 9, turn: 2.1, radius: 1.0, drain: 4 },
  { name: 'scooter', max: 10, accel: 14, turn: 3.0, radius: 0.55, drain: 3.3 },
  { name: 'monster truck', max: 10.5, accel: 6, turn: 1.6, radius: 1.35, drain: 2 },
  { name: 'hoverboard', max: 14, accel: 12, turn: 2.8, radius: 0.5, drain: 8, quiet: true },
  { name: 'rocket car', max: 19, accel: 16, turn: 1.25, radius: 1.0, drain: 9 },
];
export const PROPS = [null, 'crate', 'barrel', 'bush', 'rock', 'traffic cone'];
export const MAPS = [
  { veh: 'go-kart', id: 'town', name: 'Dusk Hollow', blurb: 'A sleepy town at sunset: houses, a hedge maze, parked cars.' },
  { veh: 'snowmobile', id: 'camp', name: 'Frostpine Camp', blurb: 'A snowy campground in daylight: cabins, tents, thick pines.' },
  { veh: 'forklift', id: 'docks', name: 'Midnight Docks', blurb: 'A container yard at night: tight alleys, a warehouse, deep shadows.' },
  { veh: 'beach buggy', id: 'cove', name: 'Pirate Cove', blurb: 'A sunny beach: huts, palms, a shipwreck, rowboats to hide in and a lagoon.' },
  { veh: 'ghost cart', id: 'grave', name: 'Haunted Graveyard', blurb: 'A foggy graveyard at midnight: crypts, coffins, a chapel and a haunted mansion.' },
  { veh: 'moon rover', id: 'moon', name: 'Moonbase Alpha', blurb: 'A base on the Moon: habitat modules, a hangar, escape pods to hide in, and low gravity.' },
  { veh: 'cupcake car', id: 'candy', name: 'Candy Kingdom', blurb: 'A land of sweets: gingerbread houses, lollipop trees, gumdrops and a chocolate river.' },
  { veh: 'buckboard', id: 'west', name: 'Dusty Gulch', blurb: 'A wild-west town: a saloon, a barn, covered wagons, hay bales and cactus.' },
  { veh: 'safari jeep', id: 'jungle', name: 'Dino Jungle', blurb: 'A misty jungle: huts, a ruined temple, giant eggs to hide in and old bones.' },
  { veh: 'mini submarine', id: 'reef', name: 'Coral Reef', blurb: 'The sea floor: coral forests, kelp, giant clams to hide in, a sunken wreck, and floaty jumps.' },
  { veh: 'hover taxi', id: 'neon', name: 'Neon City', blurb: 'A city at night: glowing signs, shops, parked cars, back-alley dumpsters and cardboard boxes.' },
];
// What a player can look like. Indexes into these lists travel over the wire as [character, colour, hat, pattern, pet].
export const LOOKS = {
  chars: ['Blob', 'Robot', 'Cat', 'Bear', 'Penguin', 'Ghost', 'Frog', 'Alien', 'Dino', 'Bunny', 'Astronaut', 'Ninja', 'Pumpkin', 'Duck',
    'Knight', 'Wizard', 'Pirate', 'Shark', 'Mushroom', 'Snowman'],
  hats: ['No hat', 'Beanie', 'Cap', 'Top hat', 'Crown', 'Party hat', 'Headphones', 'Halo'],
  pats: ['Plain', 'Stripes', 'Dots', 'Two-tone'],
  colors: 16,
  pets: ['No pet', 'Puppy', 'Kitten', 'Bunny', 'Duckling', 'Baby dragon', 'Slime', 'Bee', 'Robo-ball',
    'Fox', 'Panda', 'Piglet', 'Unicorn', 'Turtle', 'Owl', 'Bat', 'Ghostling', 'Crab',
    'Hedgehog', 'Froglet', 'Parrot', 'Snail', 'Penguin chick', 'Mouse', 'Butterfly', 'Mini UFO',
    'Baby shark', 'Jellyfish', 'Chick', 'Lamb', 'Tiny T-rex', 'Squirrel', 'Firefly', 'Little cloud'],
};
export function cleanLook(l) {
  const v = (x, n) => (Number.isInteger(x) && x >= 0 && x < n ? x : (Math.random() * n) | 0);
  l = Array.isArray(l) ? l : [];
  return [v(l[0], LOOKS.chars.length), v(l[1], LOOKS.colors), v(l[2], LOOKS.hats.length), v(l[3], LOOKS.pats.length), v(l[4], LOOKS.pets.length)];
}

const THEMES = {
  town: { sky: [[0.03, 0.04, 0.14], [0.24, 0.13, 0.36], [1, 0.48, 0.28]], glow: 0.6, fog: [0x3a2a55, 0.011], hemi: [0x8f93e0, 0x33284a, 1.25],
    sun: [0xff9a66, 2.2], disc: 0xffd9a0, stars: 0.8, hills: 0x2a2244, outer: 0x2c4a30, roof: 0x5a3a4a, exposure: 1.2 },
  camp: { sky: [[0.2, 0.42, 0.8], [0.55, 0.74, 0.96], [0.93, 0.96, 1]], glow: 0.35, fog: [0xcfe0f2, 0.009], hemi: [0xe6efff, 0x8fa0b8, 1.7],
    sun: [0xfff0d8, 2.3], disc: 0xffffff, stars: 0, hills: 0xdde6f0, outer: 0xe6edf5, roof: 0xf2f5fa, exposure: 1.0, snow: true },
  docks: { sky: [[0.01, 0.02, 0.05], [0.03, 0.06, 0.12], [0.09, 0.17, 0.24]], glow: 0.15, fog: [0x0a1420, 0.015], hemi: [0x5a7a9a, 0x141a24, 0.85],
    sun: [0x9fb8ff, 0.9], disc: 0xdfe8ff, stars: 1, hills: 0x0c121c, outer: 0x0b1824, roof: 0x2a2f3a, exposure: 1.25 },
  cove: { sky: [[0.12, 0.42, 0.88], [0.4, 0.74, 0.97], [0.86, 0.96, 1]], glow: 0.5, fog: [0xbfe6f2, 0.006], hemi: [0xffffff, 0xd9c48a, 1.6],
    sun: [0xfff2cc, 2.6], disc: 0xffffff, stars: 0, hills: 0x5fa870, outer: 0x2f9fc4, roof: 0xc9a45a, exposure: 1.0 },
  grave: { sky: [[0.02, 0.02, 0.06], [0.1, 0.06, 0.16], [0.2, 0.28, 0.22]], glow: 0.2, fog: [0x1a2420, 0.019], hemi: [0x7a8fb0, 0x26302a, 1.25],
    sun: [0xb8c8ff, 1.0], disc: 0xf0f4ff, stars: 0.9, hills: 0x10161a, outer: 0x151d1a, roof: 0x2a2632, exposure: 1.2 },
  moon: { sky: [[0, 0, 0.01], [0.01, 0.01, 0.03], [0.06, 0.06, 0.09]], glow: 0.9, fog: [0x0a0a10, 0.0035], hemi: [0x9aa2ba, 0x44444e, 1.0],
    sun: [0xffffff, 2.9], disc: 0xffffff, stars: 1, hills: 0x7a7a84, outer: 0x6a6a72, roof: 0xd8dce6, exposure: 1.1 },
  candy: { sky: [[0.5, 0.72, 1], [0.96, 0.8, 0.95], [1, 0.93, 0.86]], glow: 0.4, fog: [0xffe6f2, 0.006], hemi: [0xffffff, 0xffc2dd, 1.6],
    sun: [0xfff5e0, 2.3], disc: 0xffffff, stars: 0, hills: 0xff9ec7, outer: 0x9be3b4, roof: 0xff6fa8, exposure: 1.0 },
  west: { sky: [[0.2, 0.42, 0.78], [0.72, 0.68, 0.7], [1, 0.72, 0.42]], glow: 0.7, fog: [0xe8c9a0, 0.006], hemi: [0xfff0dc, 0xb5744a, 1.5],
    sun: [0xffd9a0, 2.6], disc: 0xfff0c8, stars: 0, hills: 0xb5653a, outer: 0xc98a4a, roof: 0x6b4630, exposure: 1.05 },
  jungle: { sky: [[0.25, 0.5, 0.55], [0.6, 0.8, 0.66], [0.86, 0.95, 0.8]], glow: 0.3, fog: [0x9fc8a0, 0.011], hemi: [0xe6ffe0, 0x3a5a36, 1.45],
    sun: [0xfff2c2, 2.2], disc: 0xffffe0, stars: 0, hills: 0x2f6b3a, outer: 0x2a5a30, roof: 0x8a7a4a, exposure: 1.0, lush: true },
  reef: { sky: [[0, 0.12, 0.3], [0, 0.3, 0.5], [0.1, 0.55, 0.65]], glow: 0.3, fog: [0x0f5a78, 0.019], hemi: [0x9fe0ff, 0x0a3a4a, 1.45],
    sun: [0xbfefff, 1.4], disc: 0xdff8ff, stars: 0, hills: 0x0c4a5a, outer: 0x0e4a60, roof: 0xd98a6a, exposure: 1.1 },
  neon: { sky: [[0.02, 0, 0.08], [0.12, 0.02, 0.2], [0.45, 0.1, 0.4]], glow: 0.3, fog: [0x1a0a2a, 0.012], hemi: [0xb08aff, 0x1a1030, 1.05],
    sun: [0xff7ad9, 0.7], disc: 0xffc2f0, stars: 0.6, hills: 0x140a24, outer: 0x0c0816, roof: 0x1c1830, exposure: 1.25, glass: 0x66f0ff },
};

const _worlds = [];
export function getWorld(i = 0) {
  i = ((i | 0) % MAPS.length + MAPS.length) % MAPS.length;
  return _worlds[i] || (_worlds[i] = [buildTown, buildCamp, buildDocks, buildCove, buildGrave, buildMoon, buildCandy, buildWest, buildJungle, buildReef, buildNeon][i](i));
}

// Shared construction kit for every map. All maps keep the same centre: a plaza with the jail cage and its lever.
// Boxes, spots and coins carry a level: 0 is the ground, 1 is the upstairs floor of a two-storey house.
function kit(seed) {
  const R = mulberry(seed);
  const boxes = [], spots = [], houses = [], keepOut = [], lamps = [], beacons = [], stairs = [], upper = [], extraCoins = [], decks = [], pads = [];
  const add = (x, z, w, d, h, kind, o = {}) => {
    const b = { x, z, w, d, h, kind, ...o };
    boxes.push(b);
    return b;
  };
  const spot = (kind, x, z, ex, ez, lv = 0) => spots.push({ id: spots.length, kind, x, z, ex: x + ex, ez: z + ez, lv });
  const see = { see: true };
  const up = { lv: 1 };

  add(0, -HALF - 0.5, HALF * 2 + 2, 1, 4, 'wall');
  add(0, HALF + 0.5, HALF * 2 + 2, 1, 4, 'wall');
  add(-HALF - 0.5, 0, 1, HALF * 2 + 2, 4, 'wall');
  add(HALF + 0.5, 0, 1, HALF * 2 + 2, 4, 'wall');

  // Axis-aligned wall from (x1,z1) to (x2,z2) with gaps [[centre, width], ...] along its axis
  const line = (x1, z1, x2, z2, t, h, kind, gaps = [], o = {}) => {
    const horiz = z1 === z2;
    const a = horiz ? Math.min(x1, x2) : Math.min(z1, z2);
    const b = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
    const gs = gaps.map((g) => [g[0] - g[1] / 2, g[0] + g[1] / 2]).sort((p, q) => p[0] - q[0]);
    let s = a;
    const segs = [];
    for (const [g0, g1] of gs) {
      if (g0 > s) segs.push([s, g0]);
      s = Math.max(s, g1);
    }
    if (b > s) segs.push([s, b]);
    for (const [p, q] of segs) {
      const c = (p + q) / 2, len = q - p;
      if (len < 0.05) continue;
      if (horiz) add(c, z1, len, t, h, kind, o);
      else add(x1, c, t, len, h, kind, o);
    }
  };

  const walls = (cx, cz, w, d, h, doors, dw, o) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.3;
    line(x0, z0, x1, z0, t, h, 'hwall', (doors.N || []).map((v) => [cx + v, dw]), o);
    line(x0, z1, x1, z1, t, h, 'hwall', (doors.S || []).map((v) => [cx + v, dw]), o);
    line(x0, z0, x0, z1, t, h, 'hwall', (doors.W || []).map((v) => [cz + v, dw]), o);
    line(x1, z0, x1, z1, t, h, 'hwall', (doors.E || []).map((v) => [cz + v, dw]), o);
    keepOut.push([x0 - 2.5, z0 - 2.5, x1 + 2.5, z1 + 2.5]);
  };
  const locker = (x, z, ex, lv = 0) => { add(x, z, 0.8, 0.8, 2, 'locker', { lv }); spot('locker', x, z, ex, 0, lv); };

  // An empty single-storey building
  const house = (cx, cz, w, d, h, color, doors, dw = 2) => {
    walls(cx, cz, w, d, h, doors, dw, { color });
    houses.push({ x: cx, z: cz, w, d, h, color, floors: 1 });
  };
  // A furnished single-storey home: bed in the north-west corner, locker in the north-east, table by the south wall.
  // Keep doors away from those (no W door north of centre, no S door east of centre).
  const home = (cx, cz, w, d, color, doors) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    house(cx, cz, w, d, 3.2, color, doors);
    add(x0 + 1.2, z0 + 1.6, 1.4, 2.2, 0.6, 'bed');
    add(cx + 1.4, z1 - 1.3, 1.8, 1.1, 0.8, 'table');
    locker(x1 - 0.75, z0 + 0.75, -1.3);
  };
  // A two-storey house. The staircase runs along the inside of the north wall, climbing from west to east,
  // so keep doors off the north wall and put east/west doors at the centre. Upstairs has no doors: the only way up or down is the stairs.
  const manor = (cx, cz, w, d, color, doors) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, H = FLOOR_H;
    walls(cx, cz, w, d, H, doors, 2, { color });
    walls(cx, cz, w, d, H, { S: [-3] }, 2, { color, lv: 1 }); // upstairs, the only opening is the balcony door
    const st = { xa: x0 + 2.5, xb: x0 + 7.5, x0: x0 + 2.5, x1: x0 + 7.5, z0: z0 + 0.3, z1: z0 + 2.3 };
    stairs.push(st);
    upper.push([x0, z0, x1, z1]);
    houses.push({ x: cx, z: cz, w, d, h: H * 2, color, floors: 2, stair: st });
    // Downstairs the staircase is a solid block you can only walk onto from its low end
    add((st.x0 + st.x1) / 2, st.z1, 5, 0.12, H, 'stairside');
    add(st.xb, (st.z0 + st.z1) / 2, 0.12, 2, H, 'stairside');
    // Upstairs it is a hole in the floor with a railing, open at its high end
    add((st.x0 + st.x1) / 2, st.z1, 5, 0.12, 1, 'rail', { lv: 1, see: true });
    add(st.xa, (st.z0 + st.z1) / 2, 0.12, 2, 1, 'rail', { lv: 1, see: true });
    // Ground floor
    add(cx + 3.5, cz + 1, 1.8, 1.1, 0.8, 'table');
    add(x0 + 0.9, z1 - 1.6, 1, 2.2, 0.7, 'sofa', { flip: true });
    add(x1 - 0.6, z1 - 1.8, 0.6, 2.4, 2, 'shelf');
    locker(x1 - 0.75, z0 + 0.75, -1.3);
    // Upstairs
    add(x1 - 1.2, z1 - 1.6, 1.4, 2.2, 0.6, 'bed', up);
    add(cx + 1, z1 - 1.2, 1.8, 1.1, 0.8, 'table', up);
    add(x1 - 0.6, z0 + 2.2, 0.6, 2.4, 2, 'shelf', up);
    locker(x0 + 0.75, z1 - 0.75, 1.3, 1);
    extraCoins.push({ x: cx - 1.5, z: cz + 1.5, lv: 1 }, { x: x1 - 2.5, z: cz - 0.5, lv: 1 });
    // A balcony on the south side with no rail at the front: step off it to drop to the ground
    upper.push([cx - 5, z1 - 0.2, cx - 1, z1 + 2.5]);
    decks.push({ x0: cx - 5, z0: z1 + 0.15, x1: cx - 1, z1: z1 + 2.5 });
    add(cx - 5, z1 + 1.3, 0.12, 2.4, 1, 'rail', { lv: 1, see: true });
    add(cx - 1, z1 + 1.3, 0.12, 2.4, 1, 'rail', { lv: 1, see: true });
    for (const px of [cx - 4.85, cx - 1.15]) add(px, z1 + 2.35, 0.25, 0.25, H, 'post', see);
  };

  // A lookout: an open deck on stilts with stairs up its west side and a jump pad to the east.
  // Three sides have no rail, so you can run straight off the edge.
  const lookout = (cx, cz) => {
    const H = FLOOR_H, st = { xa: cx - 8, xb: cx - 3, x0: cx - 8, x1: cx - 3, z0: cz - 1, z1: cz + 1 };
    stairs.push(st);
    upper.push([cx - 3, cz - 3, cx + 3, cz + 3]);
    decks.push({ x0: cx - 3, z0: cz - 3, x1: cx + 3, z1: cz + 3, stair: st });
    for (const sz of [-1, 1]) {
      add(cx - 5.5, cz + sz, 5, 0.12, H, 'stairside');
      add(cx - 5.5, cz + sz, 5, 0.12, 1, 'rail', { lv: 1, see: true });
      add(cx - 3, cz + sz * 2, 0.12, 2, 1, 'rail', { lv: 1, see: true });
      for (const sx of [-1, 1]) add(cx + sx * 2.8, cz + sz * 2.8, 0.3, 0.3, H, 'post', see);
    }
    add(cx - 3, cz, 0.12, 2, H, 'stairside');
    add(cx - 8, cz, 0.12, 2, 1, 'rail', { lv: 1, see: true });
    pads.push({ x: cx + 5.2, z: cz });
    extraCoins.push({ x: cx + 1, z: cz, lv: 1 });
    keepOut.push([cx - 10.5, cz - 4.5, cx + 7.5, cz + 4.5]);
  };

  const jail = { x: 0, z: 13, s: 5 }, lever = { x: 4, z: 13 };
  const plaza = (centre) => {
    line(-2.5, 10.5, 2.5, 10.5, 0.2, 3, 'cage', [], see);
    line(-2.5, 15.5, 2.5, 15.5, 0.2, 3, 'cage', [], see);
    line(-2.5, 10.5, -2.5, 15.5, 0.2, 3, 'cage', [], see);
    line(2.5, 10.5, 2.5, 15.5, 0.2, 3, 'cage', [], see);
    add(lever.x, lever.z, 0.4, 0.4, 1.1, 'lever', see);
    add(0, 0, 3.6, 3.6, 0.9, centre, see);
    keepOut.push([-5.5, 8, 8, 18]);
  };
  const lamp = (x, z) => { lamps.push([x, z]); add(x, z, 0.3, 0.3, 5, 'lamp', see); };
  const dumpster = (x, z, ex) => { add(x, z, 1.2, 2.2, 1.3, 'dumpster'); spot('dumpster', x, z, ex, 0); };

  const clear = (x, z, w, d, m) => {
    if (Math.abs(x) > HALF - 2 - w / 2 || Math.abs(z) > HALF - 2 - d / 2) return false;
    if (Math.hypot(x, z) < 10) return false;
    for (const k of keepOut) if (x > k[0] - w / 2 && x < k[2] + w / 2 && z > k[1] - d / 2 && z < k[3] + d / 2) return false;
    for (const b of boxes) if (Math.abs(x - b.x) < (w + b.w) / 2 + m && Math.abs(z - b.z) < (d + b.d) / 2 + m) return false;
    for (const s of spots) if (Math.abs(x - s.x) < w / 2 + 1.6 + m && Math.abs(z - s.z) < d / 2 + 1.6 + m) return false;
    return true;
  };
  const scatter = (n, w, d, m, fn) => {
    let k = 0, tries = 0;
    while (k < n && tries++ < 12000) {
      const x = (R() * 2 - 1) * (HALF - 3), z = (R() * 2 - 1) * (HALF - 3);
      if (clear(x, z, w, d, m)) { fn(x, z); k++; }
    }
  };
  // A beacon the hiders can light. Placed at the nearest open ground to the requested point.
  const beacon = (x, z) => {
    for (let r = 0; r < 12; r++) for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a * 0.785) * r, pz = z + Math.sin(a * 0.785) * r;
      if (!clear(px, pz, 0.8, 0.8, 1.6)) continue;
      add(px, pz, 0.8, 0.8, 1.4, 'beacon', { see: true, bi: beacons.length });
      beacons.push({ id: beacons.length, x: px, z: pz });
      return;
    }
  };

  const finish = (i, extra = {}) => {
    const N = GN * GN, m = PR + 0.03;
    const bl = [boxes.filter((b) => !b.lv), boxes.filter((b) => b.lv === 1)];
    // Navigation grids, one per level: a cell is blocked if a player-sized circle at its centre would touch a box
    const blocked = [new Uint8Array(N), new Uint8Array(N).fill(1)];
    const cells = (x0, z0, x1, z1, fn) => {
      const ix0 = Math.max(0, Math.ceil((x0 + HALF) / CELL - 0.5)), ix1 = Math.min(GN - 1, Math.floor((x1 + HALF) / CELL - 0.5));
      const iz0 = Math.max(0, Math.ceil((z0 + HALF) / CELL - 0.5)), iz1 = Math.min(GN - 1, Math.floor((z1 + HALF) / CELL - 0.5));
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) fn(iz * GN + ix, -HALF + (ix + 0.5) * CELL);
    };
    for (const u of upper) cells(u[0], u[1], u[2], u[3], (c) => { blocked[1][c] = 0; });
    for (const st of stairs) cells(st.x0, st.z0, st.x1, st.z1, (c) => { blocked[1][c] = 0; });
    for (let lv = 0; lv < 2; lv++) for (const b of bl[lv]) cells(b.x - b.w / 2 - m, b.z - b.d / 2 - m, b.x + b.w / 2 + m, b.z + b.d / 2 + m, (c) => { blocked[lv][c] = 1; });
    // Stairs: the low half belongs to the ground level, the high half to upstairs, joined by portals in the middle
    const portal = new Int32Array(N * 2).fill(-1);
    for (const st of stairs) {
      const dir = Math.sign(st.xb - st.xa), tOf = (x) => (x - st.xa) / (st.xb - st.xa);
      cells(st.x0, st.z0, st.x1, st.z1, (c, x) => { blocked[tOf(x) < 0.5 ? 1 : 0][c] = 1; });
      cells(st.x0, st.z0, st.x1, st.z1, (c, x) => {
        if (tOf(x) >= 0.5 || tOf(x + dir * CELL) < 0.5 || blocked[0][c] || blocked[1][c + dir]) return;
        portal[c] = N + c + dir;
        portal[N + c + dir] = c;
      });
    }
    // Flood fill from the plaza to find everything a player can actually reach, on both levels
    const reach = new Uint8Array(N * 2);
    const q = [cellIdx(0, -5)];
    reach[q[0]] = 1;
    const visit = (n) => { if (!reach[n]) { reach[n] = 1; q.push(n); } };
    while (q.length) {
      const n = q.pop(), lv = n >= N ? 1 : 0, c = n - lv * N, ix = c % GN, iz = (c / GN) | 0, B = blocked[lv], o = lv * N;
      if (ix > 0 && !B[c - 1]) visit(o + c - 1);
      if (ix < GN - 1 && !B[c + 1]) visit(o + c + 1);
      if (iz > 0 && !B[c - GN]) visit(o + c - GN);
      if (iz < GN - 1 && !B[c + GN]) visit(o + c + GN);
      if (portal[n] >= 0) visit(portal[n]);
    }
    const list = [], list0 = [];
    for (let n = 0; n < N * 2; n++) if (reach[n]) { list.push(n); if (n < N) list0.push(n); }
    // Coins and power-up boxes on reachable ground, spread out
    const sprinkle = (n, gap, minR, avoid = []) => {
      const out = [];
      let tries = 0;
      while (out.length < n && tries++ < 12000) {
        const c = list0[(R() * list0.length) | 0];
        const x = -HALF + ((c % GN) + 0.5) * CELL, z = -HALF + (((c / GN) | 0) + 0.5) * CELL;
        if (Math.hypot(x, z) < minR) continue;
        if (out.some((o) => Math.hypot(o.x - x, o.z - z) < gap) || avoid.some((o) => Math.hypot(o.x - x, o.z - z) < 2.5)) continue;
        out.push({ id: out.length, x, z, lv: 0 });
      }
      return out;
    };
    const coins = sprinkle(44, 8.5, 7);
    for (const c of extraCoins) coins.push({ id: coins.length, ...c });
    const items = sprinkle(9, 26, 14, coins);
    // Vehicles park on open ground with room to pull away
    const roomy = (x, z) => { for (let dz = -1.5; dz <= 1.5; dz += 0.5) for (let dx = -1.5; dx <= 1.5; dx += 0.5) if (blocked[0][cellIdx(x + dx, z + dz)]) return false; return true; };
    const vehicles = [];
    const kinds = [0, 1, 3, 0, 2, 1, 0, 3, 4, 0];
    for (let tries = 0; vehicles.length < kinds.length && tries < 30000; tries++) {
      const c = list0[(R() * list0.length) | 0];
      const x = -HALF + ((c % GN) + 0.5) * CELL, z = -HALF + (((c / GN) | 0) + 0.5) * CELL;
      if (Math.hypot(x, z) < 14 || Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5 || !roomy(x, z)) continue;
      if (vehicles.some((v) => Math.hypot(v.x - x, v.z - z) < 18) || pads.some((p) => Math.hypot(p.x - x, p.z - z) < 5)) continue;
      vehicles.push({ id: vehicles.length, x, z, r: R() * 6.28, k: kinds[vehicles.length] });
    }
    return {
      i, id: MAPS[i].id, name: MAPS[i].name, vehName: MAPS[i].veh, theme: THEMES[MAPS[i].id],
      boxes, bl, spots, coins, items, beacons, houses, lamps, stairs, upper, decks, pads, vehicles, gravity: 15, jail, lever,
      los: [bl[0].filter((b) => !b.see && b.h >= 1.6), bl[1].filter((b) => !b.see && b.h >= 1.6)],
      nav: { blocked, reach, list, list0, portal },
      seekerSpawn: [0, -5], ...extra,
    };
  };
  return { R, add, spot, line, house, home, manor, lookout, locker, dumpster, plaza, lamp, clear, scatter, beacon, finish, keepOut, see };
}

function buildTown(i) {
  const K = kit(20241), { R, add, spot, line, house, home, manor, locker, dumpster, scatter } = K;
  // Inner ring of homes around the plaza
  home(-30, -27, 14, 10, 0xd9a273, { S: [-3], E: [1] });
  home(30, -27, 12, 12, 0x8fb0c9, { S: [-2], W: [2] });
  home(-30, 27, 12, 12, 0xc98f9b, { N: [0], E: [2] });
  home(30, 27, 16, 10, 0xa9c48a, { N: [0], W: [2] });
  // Outer homes
  home(57, -44, 12, 10, 0xd9c27a, { S: [-2], W: [2] });
  home(-57, 44, 12, 10, 0x9ab8d9, { S: [-2], E: [2] });
  home(-60, -13, 10, 10, 0xc9a08f, { S: [-2], E: [2] });
  home(60, 15, 10, 10, 0xb8c98f, { S: [-2], W: [2] });
  // Two-storey houses
  manor(-54, -50, 14, 10, 0xb5654a, { S: [0], E: [0] });
  manor(54, 50, 16, 11, 0x5f86a8, { S: [0], W: [0] });
  manor(0, 60, 16, 10, 0xa87fb0, { S: [0], W: [0], E: [0] });
  // Warehouse (north)
  house(0, -54, 26, 14, 4.5, 0x8a8f9c, { S: [-7, 7] }, 3);
  for (const [x, z, h] of [[-10, -58, 2.6], [-8.6, -58, 1.3], [-3, -55, 2.6], [0, -58.5, 1.3], [1.35, -58.5, 2.6], [6, -54, 1.3],
    [10.5, -59, 2.6], [10.6, -50, 1.3], [-11, -51, 1.3], [3, -50.5, 2.6], [-5, -50, 1.3], [-6.4, -60, 2.6]]) add(x, z, 1.3, 1.3, h, 'crate');
  locker(12.2, -55, -1.3); locker(-12.2, -56, 1.3);

  for (const [x, z, ex] of [[-21.5, -30, 1.4], [22.5, -31, -1.4], [-22.5, 31, 1.4], [20.5, 31, -1.4], [49.5, -45, -1.4], [-49.5, 45, 1.4], [-45.5, -52, 1.4], [44.5, 53, -1.4]]) dumpster(x, z, ex);

  // Hedge maze (south)
  const MZ = { x0: -14, z0: 26, cw: 4, cols: 7, rows: 4 };
  {
    const { x0, z0, cw, cols, rows } = MZ, t = 0.6, hh = 2.3;
    const seen = new Uint8Array(cols * rows), openE = new Uint8Array(cols * rows), openS = new Uint8Array(cols * rows);
    const stack = [0];
    seen[0] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1], c = cur % cols, r = (cur / cols) | 0;
      const nb = [];
      if (c > 0 && !seen[cur - 1]) nb.push(cur - 1);
      if (c < cols - 1 && !seen[cur + 1]) nb.push(cur + 1);
      if (r > 0 && !seen[cur - cols]) nb.push(cur - cols);
      if (r < rows - 1 && !seen[cur + cols]) nb.push(cur + cols);
      if (!nb.length) { stack.pop(); continue; }
      const n = nb[(R() * nb.length) | 0];
      if (n === cur + 1) openE[cur] = 1;
      else if (n === cur - 1) openE[n] = 1;
      else if (n === cur + cols) openS[cur] = 1;
      else openS[n] = 1;
      seen[n] = 1;
      stack.push(n);
    }
    const xe = x0 + cols * cw, ze = z0 + rows * cw;
    line(x0, z0, xe, z0, t, hh, 'hedge', [[0, 2.4]]);
    line(x0, ze, xe, ze, t, hh, 'hedge', [[-12, 2.4], [8, 2.4]]);
    line(x0, z0, x0, ze, t, hh, 'hedge', [[36, 2.4]]);
    line(xe, z0, xe, ze, t, hh, 'hedge', [[32, 2.4]]);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const j = r * cols + c;
      if (c < cols - 1 && !openE[j]) add(x0 + (c + 1) * cw, z0 + (r + 0.5) * cw, t, cw + t, hh, 'hedge');
      if (r < rows - 1 && !openS[j]) add(x0 + (c + 0.5) * cw, z0 + (r + 1) * cw, cw + t, t, hh, 'hedge');
    }
    K.keepOut.push([x0 - 3, z0 - 3, xe + 3, ze + 3]);
  }

  K.plaza('fountain');
  const carColors = [0xd94f4f, 0x4f8fd9, 0xe0b23a, 0x6fbf73, 0xc77dff, 0xf5f5f5];
  [[-18, 4.9], [16, -4.9], [-44, -4.9], [40, 4.9], [-64, 4.9], [62, -4.9]].forEach(([x, z], n) => add(x, z, 4.4, 1.9, 1.5, 'car', { color: carColors[n], see: true }));
  for (const [x, z] of [[-12, 6], [12, -6], [-30, -6], [30, 6], [-6, -20], [6, 20], [-52, 6], [52, -6], [-6, -40], [-70, -6], [70, 6], [6, -30]]) K.lamp(x, z);
  K.lookout(-42, 14); K.lookout(46, -16); K.lookout(24, 52);
  K.beacon(-67, 22); K.beacon(67, -24); K.beacon(26, 69);

  K.keepOut.push([-HALF, -3.6, HALF, 3.6], [-3.6, -46, 3.6, 24]);
  scatter(17, 1.6, 1.6, 2, (x, z) => spot('bush', x, z, 0, 0));
  scatter(100, 0.7, 0.7, 1.5, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() }));
  scatter(22, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.4 ? 2.6 : 1.3, 'crate'));
  scatter(13, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(15, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(14, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(9, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', { see: true }));
  return K.finish(i, { maze: MZ });
}

function buildCamp(i) {
  const K = kit(7771), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const logs = 0x8a5a3a, dark = 0x7a4f34;
  home(-34, -30, 10, 9, logs, { S: [-2] });
  home(34, -32, 10, 9, dark, { S: [-2], W: [1] });
  home(-32, 34, 10, 10, dark, { N: [0], E: [2] });
  home(36, 31, 12, 9, logs, { N: [0], W: [2] });
  home(-62, 4, 10, 9, logs, { S: [-2], E: [2] });
  home(60, -58, 10, 9, dark, { S: [-2], W: [2] });
  // Two-storey chalets
  manor(-56, -54, 14, 10, 0x9a6a44, { S: [0], E: [0] });
  manor(56, 54, 14, 10, 0x8a5a3a, { S: [0], W: [0] });
  manor(-58, 56, 14, 10, 0x7a4f34, { S: [0], E: [0] });
  // The lodge
  house(0, -58, 20, 12, 4.2, 0x9a6a44, { S: [-5, 5] }, 2.4);
  for (const x of [-6, 0, 6]) add(x, -59.5, 2.6, 1.1, 0.8, 'table');
  add(-9.2, -62.4, 0.6, 2.2, 2, 'shelf'); locker(9.2, -55, -1.3); locker(-9.2, -55, 1.3);

  K.plaza('campfire');
  for (const [x, z, w, d] of [[-8.6, -3, 0.6, 2], [8.6, -3, 0.6, 2], [0, -9, 2, 0.6]]) add(x, z, w, d, 0.5, 'bench', see);
  for (const [x, z] of [[-14, -10], [14, -10], [-14, 12], [16, 16], [-40, 2], [50, 0], [0, -36], [0, 40], [-44, -40], [44, 42]]) K.lamp(x, z);
  K.keepOut.push([14, -12, 46, 12]); // the frozen pond stays open
  K.lookout(-28, -2); K.lookout(22, 44); K.lookout(44, -48);
  K.beacon(-68, -24); K.beacon(67, -30); K.beacon(8, 68);

  scatter(10, 3, 3, 2, (x, z) => spot('tent', x, z, 0, 0));
  scatter(14, 1.6, 1.6, 2, (x, z) => spot('snowdrift', x, z, 0, 0));
  scatter(160, 0.7, 0.7, 1.4, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: R() * 0.54 }));
  scatter(20, 2.4, 2.4, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 2.4, 1, 1.0, 'logs', see) : add(x, z, 1, 2.4, 1.0, 'logs', see)));
  scatter(16, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(11, 0.9, 0.9, 1.2, (x, z) => add(x, z, 0.9, 0.9, 1.7, 'snowman', { v: R(), see: true }));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.3 ? 2.6 : 1.3, 'crate'));
  scatter(9, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i, { pond: [30, 0, 15, 11] });
}

function buildCove(i) {
  const K = kit(90210), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const bamboo = 0xd9b56a, drift = 0xb89a6a, teal = 0x4fb5b0, coral = 0xf08a6a;
  // Beach huts
  home(-32, -30, 10, 9, bamboo, { S: [-2], E: [1] });
  home(32, -32, 10, 9, coral, { S: [-2], W: [1] });
  home(-34, 32, 10, 10, teal, { N: [0], E: [2] });
  home(-62, -8, 10, 9, drift, { S: [-2], E: [2] });
  home(60, -56, 10, 9, bamboo, { S: [-2], W: [2] });
  home(-60, 58, 10, 9, coral, { S: [-2], E: [2] });
  // The Salty Parrot inn and the harbour master's house: two storeys each
  manor(-54, -54, 14, 10, 0xc98f5a, { S: [0], E: [0] });
  manor(56, 52, 16, 10, 0x5f9ab0, { S: [0], W: [0] });
  // The shipwreck: a long hull lying on the north beach, full of cargo
  house(2, -58, 28, 9, 4, 0x6b4a32, { S: [-9, 9] }, 2.6);
  for (const [x, z, h] of [[-10, -60.5, 2.6], [-8.6, -60.5, 1.3], [-3, -57, 1.3], [1, -60.7, 2.6], [6, -56.5, 1.3], [11, -60.5, 2.6], [12.4, -60.5, 1.3], [-12.5, -56, 1.3]]) add(x, z, 1.3, 1.3, h, 'crate');
  for (const [x, z] of [[4, -60.8], [-5.5, -60.8], [9, -56]]) add(x, z, 0.8, 0.8, 1.1, 'barrel', see);
  locker(15, -58.5, -1.3); locker(-11, -55.3, 1.3);

  K.plaza('campfire');
  for (const [x, z, w, d] of [[-8.6, -3, 0.6, 2], [8.6, -3, 0.6, 2], [0, -9, 2, 0.6]]) add(x, z, w, d, 0.5, 'bench', see);
  for (const [x, z] of [[-14, -10], [14, -10], [-14, 12], [16, 16], [-42, 0], [0, -38], [0, 40], [-44, -40], [46, -30], [-30, 52]]) K.lamp(x, z);
  K.keepOut.push([24, 2, 60, 36]); // the lagoon stays open
  K.lookout(-30, 2); K.lookout(44, -14); K.lookout(10, 54); K.lookout(-44, 26);
  K.beacon(-68, -30); K.beacon(68, -20); K.beacon(-10, 68);

  // Rowboats pulled up on the sand: climb in and lie flat
  scatter(11, 3.6, 3.6, 1.6, (x, z) => (R() < 0.5
    ? (add(x, z - 0.4, 3, 1.4, 0.8, 'boat'), spot('rowboat', x, z - 0.4, 0, 1.45))
    : (add(x - 0.4, z, 1.4, 3, 0.8, 'boat'), spot('rowboat', x - 0.4, z, 1.45, 0))));
  scatter(13, 1.6, 1.6, 2, (x, z) => spot('bush', x, z, 0, 0));
  scatter(80, 0.6, 0.6, 1.6, (x, z) => add(x, z, 0.6, 0.6, 7, 'palm', { v: R() }));
  scatter(16, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(18, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', see));
  scatter(14, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.35 ? 2.6 : 1.3, 'crate'));
  scatter(9, 1.6, 1.6, 1.2, (x, z) => add(x, z, 1.6, 1.6, 1.1, 'sandcastle', see));
  scatter(8, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(6, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', see));
  return K.finish(i, { pond: [42, 19, 16, 15] });
}

function buildGrave(i) {
  const K = kit(131313), { R, add, spot, line, house, manor, locker, scatter, see } = K;
  const stone = 0x6a6d7a, moss = 0x5a6658;
  // Crypts: small stone rooms, each with a coffin stood on end to hide in
  for (const [x, z, c, doors, lx] of [[-30, -30, stone, { S: [0] }, 1], [32, -30, moss, { S: [0] }, -1], [-32, 32, moss, { N: [0] }, 1], [34, 30, stone, { N: [0] }, -1],
    [-62, 4, stone, { E: [0] }, 1], [62, -6, moss, { W: [0] }, -1], [-12, 62, stone, { N: [0] }, 1], [30, 62, moss, { N: [0] }, -1]]) {
    house(x, z, 8, 7, 3.2, c, doors);
    add(x + lx * 3.2, z + (doors.N ? 2.7 : -2.7), 0.8, 0.8, 2, 'locker', { coffin: true });
    spot('coffin', x + lx * 3.2, z + (doors.N ? 2.7 : -2.7), -lx * 1.3, 0);
  }
  // The chapel (north) and two haunted mansions
  house(0, -58, 20, 13, 5, 0x55505f, { S: [0] }, 2.6);
  for (const x of [-6, 6]) for (const z of [-60.5, -56.5]) add(x, z, 3.4, 0.7, 0.9, 'bench', see);
  add(0, -63, 2.4, 1, 1.1, 'table');
  locker(9.2, -63.6, -1.3); locker(-9.2, -63.6, 1.3);
  manor(-54, -52, 16, 11, 0x4a3f55, { S: [0], E: [0] });
  manor(56, 52, 16, 11, 0x3f4a55, { S: [0], W: [0] });

  // Hedge-lined walks out from the gate
  for (const sx of [-1, 1]) { line(sx * 12, 22, sx * 12, 46, 0.6, 2.3, 'hedge', [[34, 2.6]]); line(sx * 18, -46, sx * 18, -22, 0.6, 2.3, 'hedge', [[-34, 2.6]]); }
  K.plaza('fountain');
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 12], [12, 18], [-40, 0], [40, 0], [0, -34], [0, 44], [-44, -40], [44, 40]]) K.lamp(x, z);
  K.lookout(-36, -8); K.lookout(40, 14); K.lookout(-20, 50);
  K.beacon(-68, 30); K.beacon(68, -34); K.beacon(8, 69);

  // Coffins lying in the open: lift the lid and lie down
  scatter(9, 3.4, 3.4, 1.6, (x, z) => { add(x - 0.4, z, 1, 2.2, 0.8, 'coffinbox'); spot('coffin', x - 0.4, z, 1.3, 0); });
  scatter(12, 1.6, 1.6, 2, (x, z) => spot('bush', x, z, 0, 0));
  // Rows of tombstones, with gaps to slip through
  scatter(26, 7, 2, 1.3, (x, z) => { for (let k = -1; k <= 1; k++) if (R() < 0.85) add(x + k * 2.2, z, 0.9, 0.35, 1.2, 'tomb', { v: R(), see: true }); });
  scatter(60, 0.7, 0.7, 1.5, (x, z) => add(x, z, 0.7, 0.7, 6, 'deadtree', { v: R() }));
  scatter(12, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(14, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(16, 0.8, 0.8, 1.1, (x, z) => add(x, z, 0.8, 0.8, 0.7, 'pumpkin', { v: R(), see: true }));
  scatter(8, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.3 ? 2.6 : 1.3, 'crate'));
  return K.finish(i);
}

function buildMoon(i) {
  const K = kit(196907), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const hull = 0xd9dde6, grey = 0xaab0bd, orange = 0xe09a4a;
  // Habitat modules
  home(-30, -28, 12, 9, hull, { S: [-2], E: [1] });
  home(30, -28, 12, 9, grey, { S: [-2], W: [1] });
  home(-30, 28, 12, 10, grey, { N: [0], E: [2] });
  home(30, 28, 12, 10, hull, { N: [0], W: [2] });
  home(-60, 6, 10, 9, hull, { S: [-2], E: [2] });
  home(60, -8, 10, 9, grey, { S: [-2], W: [2] });
  // Command centre and the science lab: two storeys each
  manor(-54, -52, 16, 10, 0xc8ccd6, { S: [0], E: [0] });
  manor(54, 52, 16, 10, 0xb8bcc8, { S: [0], W: [0] });
  // Hangar
  house(0, -57, 28, 14, 5, 0x8a8f9c, { S: [-8, 8] }, 3.2);
  for (const [x, z, h] of [[-11, -61.5, 2.6], [-9.6, -61.5, 1.3], [-2, -58, 2.6], [3, -61.5, 1.3], [11, -60, 2.6], [6, -54, 1.3], [-7, -53.5, 1.3]]) add(x, z, 1.3, 1.3, h, 'crate');
  for (const [x, z] of [[0, -62.5], [1.2, -62.5], [-12.5, -55]]) add(x, z, 0.8, 0.8, 1.1, 'barrel', see);
  locker(13.2, -55, -1.3); locker(-13.2, -58.5, 1.3);

  K.plaza('tower');
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 12], [12, 18], [-42, 0], [42, 0], [0, -36], [0, 42], [-44, -36], [44, 38]]) K.lamp(x, z);
  K.lookout(-36, -6); K.lookout(40, 12); K.lookout(-16, 52); K.lookout(24, -40);
  K.beacon(-68, 28); K.beacon(68, -32); K.beacon(10, 69);

  // Escape pods you can climb into, and boulder fields to crouch among
  scatter(11, 4.4, 2.6, 1.2, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'hidebox', { color: R() < 0.5 ? hull : orange }); spot('pod', x - 0.6, z, 1.95, 0); });
  scatter(14, 1.6, 1.6, 2, (x, z) => spot('boulders', x, z, 0, 0));
  scatter(55, 1.6, 1.4, 1.3, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(16, 2.4, 2.4, 1.4, (x, z) => add(x, z, 2.4, 2.4, 2.8, 'bigrock', { v: R() }));
  scatter(20, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', see));
  scatter(18, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.4 ? 2.6 : 1.3, 'crate'));
  scatter(12, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'solar') : add(x, z, 0.25, 6, 1.8, 'solar')));
  return K.finish(i, { gravity: 5.5 });
}

function buildCandy(i) {
  const K = kit(808080), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const ginger = 0xb5713c, dark = 0x8a4f2a;
  // Gingerbread houses
  home(-30, -28, 12, 10, ginger, { S: [-2], E: [1] });
  home(30, -28, 12, 10, dark, { S: [-2], W: [1] });
  home(-30, 28, 12, 10, dark, { N: [0], E: [2] });
  home(-60, -10, 10, 9, ginger, { S: [-2], E: [2] });
  home(60, 12, 10, 9, dark, { S: [-2], W: [2] });
  home(58, -50, 10, 9, ginger, { S: [-2], W: [2] });
  home(-58, 50, 10, 9, ginger, { S: [-2], E: [2] });
  // The cake castle and the sweet shop: two storeys each
  manor(-54, -52, 16, 10, 0xffd9ec, { S: [0], E: [0] });
  manor(54, 52, 16, 10, 0xd9f2ff, { S: [0], W: [0] });
  // Chocolate factory
  house(0, -57, 24, 13, 4.5, 0x7a4a32, { S: [-7, 7] }, 3);
  for (const [x, z, h] of [[-9.5, -61, 2.6], [-8.1, -61, 1.3], [-2, -58, 1.3], [3, -61, 2.6], [9.5, -60, 1.3], [5, -54, 1.3]]) add(x, z, 1.3, 1.3, h, 'crate');
  for (const [x, z] of [[0, -62], [-5, -54], [10, -54.5]]) add(x, z, 0.8, 0.8, 1.1, 'barrel', see);
  locker(11.2, -57, -1.3); locker(-11.2, -57, 1.3);

  K.plaza('fountain');
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 12], [12, 18], [-42, 0], [0, -36], [0, 42], [-44, -36], [44, -30], [-30, 54]]) K.lamp(x, z);
  K.keepOut.push([22, 14, 62, 40]); // the chocolate lake stays open
  K.lookout(-36, 8); K.lookout(44, -12); K.lookout(10, 56); K.lookout(-10, -38);
  K.beacon(-68, 30); K.beacon(68, -30); K.beacon(-12, 69);

  scatter(9, 4.4, 2.6, 1.2, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'giftbox', { color: [0xff5d8a, 0x5db8ff, 0xffd447, 0x7ddc8a][(R() * 4) | 0] }); spot('gift box', x - 0.6, z, 1.95, 0); });
  scatter(15, 1.6, 1.6, 2, (x, z) => spot('gumdrops', x, z, 0, 0));
  scatter(85, 0.6, 0.6, 1.5, (x, z) => add(x, z, 0.6, 0.6, 6, 'lolly', { v: R() }));
  scatter(24, 0.5, 0.5, 1.2, (x, z) => add(x, z, 0.5, 0.5, 2.4, 'candycane', { v: R(), see: true }));
  scatter(16, 1.4, 1.4, 1.2, (x, z) => add(x, z, 1.4, 1.4, 1.2, 'cupcake', { v: R(), see: true }));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.35 ? 2.6 : 1.3, 'crate'));
  scatter(10, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(7, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', see));
  return K.finish(i, { pond: [42, 27, 18, 11] });
}

function buildWest(i) {
  const K = kit(1885), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const plank = 0xb07a4a, faded = 0x9a8a6a, red = 0x9a4a3a;
  // Main street: shops facing each other across the plaza
  home(-40, -17, 12, 10, plank, { S: [-2] });
  home(-23, -17, 10, 10, faded, { S: [-2] });
  home(23, -17, 10, 10, red, { S: [-2] });
  home(40, -17, 12, 10, plank, { S: [-2] });
  home(-36, 27, 12, 10, faded, { N: [0] });
  home(36, 27, 12, 10, plank, { N: [0] });
  home(-60, 42, 10, 9, red, { S: [-2], E: [2] });
  home(60, -44, 10, 9, faded, { S: [-2], W: [2] });
  // The saloon and the hotel: two storeys each
  manor(-54, -50, 16, 10, 0xa8683a, { S: [0], E: [0] });
  manor(54, 52, 16, 10, 0x8a5a4a, { S: [0], W: [0] });
  // The barn
  house(0, -56, 24, 13, 5, 0x8a3a2a, { S: [-7, 7] }, 3);
  for (const [x, z, h] of [[-9.5, -60, 2.6], [-8.1, -60, 1.3], [-2, -58, 1.3], [3, -60.5, 2.6], [9.5, -59, 1.3], [5, -53, 1.3], [-6, -52.5, 1.3]]) add(x, z, 1.3, 1.3, h, 'haycube');
  locker(11.2, -57, -1.3); locker(-11.2, -56, 1.3);

  K.plaza('fountain');
  for (const [x, z] of [[-12, -8], [12, -8], [-12, 10], [14, 18], [-44, -6], [44, -6], [0, -34], [0, 42], [-30, 44], [34, -40]]) K.lamp(x, z);
  K.lookout(-24, 50); K.lookout(30, -40); K.lookout(46, 6);
  K.beacon(-68, 20); K.beacon(68, -22); K.beacon(8, 69);

  // Covered wagons to climb into, and stacks of hay bales to burrow in
  scatter(10, 4.4, 2.6, 1.2, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'wagon'); spot('wagon', x - 0.6, z, 1.95, 0); });
  scatter(15, 1.6, 1.6, 2, (x, z) => spot('hay bales', x, z, 0, 0));
  scatter(75, 0.7, 0.7, 1.5, (x, z) => add(x, z, 0.7, 0.7, 3, 'cactus', { v: R(), see: true }));
  scatter(28, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(12, 2.4, 2.4, 1.4, (x, z) => add(x, z, 2.4, 2.4, 2.8, 'bigrock', { v: R() }));
  scatter(22, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', see));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.35 ? 2.6 : 1.3, 'crate'));
  scatter(15, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(6, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', see));
  return K.finish(i);
}

function buildJungle(i) {
  const K = kit(6500), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const bamboo = 0xb89a5a, mud = 0x8a6a4a, stone = 0x7a8070;
  home(-30, -28, 12, 10, bamboo, { S: [-2], E: [1] });
  home(30, -28, 12, 10, mud, { S: [-2], W: [1] });
  home(-30, 28, 12, 10, mud, { N: [0], E: [2] });
  home(-60, 4, 10, 9, bamboo, { S: [-2], E: [2] });
  home(60, -50, 10, 9, bamboo, { S: [-2], W: [2] });
  home(-58, 52, 10, 9, mud, { S: [-2], E: [2] });
  // The research station and the tree lodge: two storeys each
  manor(-54, -52, 16, 10, 0x6a8a7a, { S: [0], E: [0] });
  manor(54, 52, 16, 10, 0x9a7a4a, { S: [0], W: [0] });
  // The ruined temple
  house(0, -57, 22, 14, 5, stone, { S: [-6, 6] }, 3);
  for (const [x, z, h] of [[-8.5, -61.5, 2.6], [-2, -58, 1.3], [3, -61.5, 1.3], [8.5, -60, 2.6], [5, -53.5, 1.3]]) add(x, z, 1.3, 1.3, h, 'crate');
  add(0, -62.5, 3, 1.2, 1.2, 'table');
  locker(10.2, -55, -1.3); locker(-10.2, -58, 1.3);

  K.plaza('campfire');
  for (const [x, z, w, d] of [[-8.6, -3, 0.6, 2], [8.6, -3, 0.6, 2], [0, -9, 2, 0.6]]) add(x, z, w, d, 0.5, 'bench', see);
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 12], [12, 18], [-42, 0], [0, -36], [0, 42], [-44, -36], [44, -30], [-30, 54]]) K.lamp(x, z);
  K.keepOut.push([20, 12, 58, 40]); // the swamp stays open
  K.lookout(-38, 8); K.lookout(44, -10); K.lookout(8, 56); K.lookout(-8, -36);
  K.beacon(-68, 30); K.beacon(68, -30); K.beacon(-12, 69);

  // Giant eggs with a crack big enough to squeeze through, and thick ferns
  scatter(10, 4.4, 2.6, 1.2, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'egg', { v: R() }); spot('giant egg', x - 0.6, z, 1.95, 0); });
  scatter(17, 1.6, 1.6, 2, (x, z) => spot('ferns', x, z, 0, 0));
  scatter(115, 0.7, 0.7, 1.4, (x, z) => add(x, z, 0.7, 0.7, 6, 'tree', { v: 0.55 + R() * 0.45 }));
  scatter(55, 0.6, 0.6, 1.5, (x, z) => add(x, z, 0.6, 0.6, 7, 'palm', { v: R() }));
  scatter(14, 2.6, 2.6, 1.3, (x, z) => (R() < 0.5 ? add(x, z, 2.6, 1.3, 1.3, 'bones', { v: R(), see: true }) : add(x, z, 1.3, 2.6, 1.3, 'bones', { v: R(), see: true })));
  scatter(20, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(10, 2.4, 2.4, 1.4, (x, z) => add(x, z, 2.4, 2.4, 2.8, 'bigrock', { v: R() }));
  scatter(10, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.3 ? 2.6 : 1.3, 'crate'));
  scatter(7, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i, { pond: [39, 26, 17, 12] });
}

function buildReef(i) {
  const K = kit(20000), { R, add, spot, house, home, manor, locker, scatter, see } = K;
  const shell = 0xe8b89a, sand = 0xd9c9a0, teal = 0x5fb5a8;
  // Coral-stone huts
  home(-30, -28, 12, 10, shell, { S: [-2], E: [1] });
  home(30, -28, 12, 10, teal, { S: [-2], W: [1] });
  home(-30, 28, 12, 10, sand, { N: [0], E: [2] });
  home(30, 28, 12, 10, shell, { N: [0], W: [2] });
  home(-60, 4, 10, 9, teal, { S: [-2], E: [2] });
  home(60, -50, 10, 9, sand, { S: [-2], W: [2] });
  // The sunken palace and the sea lab: two storeys each
  manor(-54, -52, 16, 10, 0x9ad0c8, { S: [0], E: [0] });
  manor(54, 52, 16, 10, 0xc8b0e0, { S: [0], W: [0] });
  // The wreck of a galleon, resting on its keel
  house(0, -57, 26, 12, 5, 0x5a4632, { S: [-8, 8] }, 3);
  for (const [x, z, h] of [[-10.5, -60.5, 2.6], [-9.1, -60.5, 1.3], [-2, -58, 1.3], [3, -60.5, 2.6], [10.5, -59, 1.3], [5, -54, 1.3], [-6, -53.5, 1.3]]) add(x, z, 1.3, 1.3, h, 'crate');
  for (const [x, z] of [[0, -61.5], [8, -54.5]]) add(x, z, 0.8, 0.8, 1.1, 'barrel', see);
  locker(12.2, -57, -1.3); locker(-12.2, -56, 1.3);

  K.plaza('fountain');
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 12], [12, 18], [-42, 0], [42, 0], [0, -36], [0, 42], [-44, -36], [44, 38]]) K.lamp(x, z);
  K.lookout(-38, 8); K.lookout(44, -10); K.lookout(8, 56); K.lookout(-8, -36);
  K.beacon(-68, 30); K.beacon(68, -30); K.beacon(-12, 69);

  // Giant clams that close over you, and kelp beds to float in
  scatter(11, 4.4, 2.6, 1.2, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 1.6, 'clam', { v: R() }); spot('giant clam', x - 0.6, z, 1.95, 0); });
  scatter(18, 1.6, 1.6, 2, (x, z) => spot('kelp', x, z, 0, 0));
  scatter(95, 0.8, 0.8, 1.5, (x, z) => add(x, z, 0.8, 0.8, 4, 'coral', { v: R() }));
  scatter(30, 1.6, 1.4, 1.2, (x, z) => add(x, z, 1.6, 1.4, 1.0, 'rock', { v: R(), see: true }));
  scatter(14, 2.4, 2.4, 1.4, (x, z) => add(x, z, 2.4, 2.4, 2.8, 'bigrock', { v: R() }));
  scatter(12, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.3 ? 2.6 : 1.3, 'crate'));
  scatter(12, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', see));
  return K.finish(i, { gravity: 8 });
}

function buildNeon(i) {
  const K = kit(2077), { R, add, spot, house, home, manor, locker, dumpster, scatter, see } = K;
  const c1 = 0x2a2440, c2 = 0x24304a, c3 = 0x3a2444;
  // Shops along the main strip
  home(-40, -17, 12, 10, c1, { S: [-2] });
  home(-23, -17, 10, 10, c2, { S: [-2] });
  home(23, -17, 10, 10, c3, { S: [-2] });
  home(40, -17, 12, 10, c2, { S: [-2] });
  home(-36, 27, 12, 10, c3, { N: [0] });
  home(36, 27, 12, 10, c1, { N: [0] });
  home(-60, 42, 10, 9, c2, { S: [-2], E: [2] });
  home(60, -44, 10, 9, c3, { S: [-2], W: [2] });
  // The noodle bar and the capsule hotel: two storeys each
  manor(-54, -50, 16, 10, 0x30284e, { S: [0], E: [0] });
  manor(54, 52, 16, 10, 0x283a4e, { S: [0], W: [0] });
  // The arcade
  house(0, -56, 24, 13, 6, 0x221a3a, { S: [-7, 7] }, 3);
  for (const [x, z] of [[-9.5, -60.5], [-7, -60.5], [-4.5, -60.5], [4.5, -60.5], [7, -60.5], [9.5, -60.5], [-10.6, -55], [10.6, -52.5]]) add(x, z, 0.9, 0.8, 2, 'vending', { v: R() });
  locker(11.2, -58, -1.3); locker(-11.2, -52, 1.3);

  K.plaza('tower');
  for (const [x, z] of [[-12, -8], [12, -8], [-12, 10], [14, 18], [-44, -6], [44, -6], [0, -34], [0, 42], [-30, 44], [34, -40], [-60, 6], [60, 8]]) K.lamp(x, z);
  K.lookout(-24, 50); K.lookout(30, -40); K.lookout(46, 6);
  K.beacon(-68, 20); K.beacon(68, -22); K.beacon(8, 69);

  scatter(9, 4.2, 2.6, 1.3, (x, z) => dumpster(x - 0.7, z, 1.4));
  scatter(15, 1.6, 1.6, 2, (x, z) => spot('cardboard boxes', x, z, 0, 0));
  const paint = [0xffd23c, 0xff5fc8, 0x3de0d0, 0x8a5fff, 0xf2f4f8, 0xff7a3c];
  scatter(14, 5, 5, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 4.4, 1.9, 1.5, 'car', { color: paint[(R() * 6) | 0], see: true }) : add(x, z, 1.9, 4.4, 1.5, 'car', { color: paint[(R() * 6) | 0], see: true, turn: true })));
  scatter(16, 0.9, 0.8, 1.2, (x, z) => add(x, z, 0.9, 0.8, 2, 'vending', { v: R() }));
  scatter(30, 0.3, 0.3, 1.6, (x, z) => add(x, z, 0.3, 0.3, 5, 'neonsign', { v: R(), see: true }));
  scatter(16, 1.3, 1.3, 1.2, (x, z) => add(x, z, 1.3, 1.3, R() < 0.4 ? 2.6 : 1.3, 'crate'));
  scatter(16, 0.8, 0.8, 1.2, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', see));
  scatter(12, 6, 6, 1.2, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  scatter(6, 2, 0.6, 1.2, (x, z) => add(x, z, 2, 0.6, 0.5, 'bench', see));
  return K.finish(i);
}

function buildDocks(i) {
  const K = kit(424242), { R, add, spot, house, manor, locker, dumpster, scatter } = K;
  const paint = [0xc94f3d, 0x3d7fc9, 0xd9a52e, 0x4f9a5f, 0x8a5fc9, 0xd97a2e, 0x7d8894, 0x2e9aa0];
  // Warehouse (north)
  house(0, -58, 28, 14, 5, 0x6f7785, { S: [-8, 8] }, 3);
  for (const [x, z, h] of [[-11.5, -62.5, 2.6], [-10.1, -62.5, 1.3], [-3, -59, 2.6], [1, -62, 1.3], [2.4, -62, 2.6], [11.5, -60, 2.6], [5, -54.5, 1.3], [-6, -54, 1.3], [-12, -54, 2.6]]) add(x, z, 1.3, 1.3, h, 'crate');
  add(0, -56, 0.6, 3.4, 2.2, 'shelf');
  locker(13.2, -55.5, -1.3); locker(-13.2, -58, 1.3);
  // Two-storey harbour office (south) and customs house (north-east), plus a small gatehouse
  manor(0, 60, 16, 10, 0x8c8f7a, { W: [0], E: [0] });
  manor(58, -58, 14, 10, 0x7a8590, { S: [0], W: [0] });
  house(-60, 60, 10, 8, 3.2, 0x8a7f6a, { N: [0], E: [1] });
  add(-63.4, 62, 1.8, 1.1, 0.8, 'table'); locker(-56, 62.8, -1.3);

  K.lookout(-30, 0); K.lookout(34, 0); K.lookout(0, -36);
  // Container stacks on a loose grid, leaving alleys between them, the two main roads and the building yards clear
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) {
    const cx = sx * (12.5 + a * 9), cz = sz * (12.5 + b * 9);
    const along = R() < 0.5, jx = (R() - 0.5) * 1.4, jz = (R() - 0.5) * 1.4, tall = R() < 0.35, c1 = paint[(R() * paint.length) | 0], c2 = paint[(R() * paint.length) | 0];
    if (R() < 0.26) continue;
    if (K.keepOut.some((k) => cx > k[0] - 5 && cx < k[2] + 5 && cz > k[1] - 5 && cz < k[3] + 5)) continue;
    add(cx + jx, cz + jz, along ? 6 : 2.5, along ? 2.5 : 6, tall ? 5.2 : 2.6, 'container', { color: c1, color2: c2 });
  }

  K.plaza('tower');
  for (const [x, z, ex] of [[-7, -21, 1.4], [7, 23, -1.4], [-22, 6.6, 1.4], [25, -6.6, -1.4], [-49, -6.6, 1.4], [52, 6.6, -1.4], [7, -42, -1.4], [-7, 44, 1.4]]) dumpster(x, z, ex);
  [[-16, 5.4], [18, -5.4], [-40, 5.4], [44, -5.4]].forEach(([x, z]) => add(x, z, 4.4, 1.9, 1.5, 'car', { color: 0xe0b23a, see: true }));
  [[-5.4, -30], [5.4, 32]].forEach(([x, z]) => add(x, z, 1.9, 4.4, 1.5, 'car', { color: 0xe0b23a, see: true, turn: true }));
  for (const [x, z] of [[-8, -8], [8, 8], [-8, 30], [8, -30], [-34, 8], [34, -8], [-60, -8], [60, 8], [-8, -48], [8, 50], [-8, 8], [8, -8]]) K.lamp(x, z);
  K.beacon(-70, 0); K.beacon(70, 0); K.beacon(24, 70);

  // Open containers you can climb into
  scatter(10, 4.4, 2.6, 1.1, (x, z) => { add(x - 0.6, z, 2.4, 2.4, 2.4, 'hidebox', { color: paint[(R() * paint.length) | 0] }); spot('container', x - 0.6, z, 1.95, 0); });
  scatter(30, 1.3, 1.3, 1.1, (x, z) => add(x, z, 1.3, 1.3, R() < 0.45 ? 2.6 : 1.3, 'crate'));
  scatter(24, 0.8, 0.8, 1.1, (x, z) => add(x, z, 0.8, 0.8, 1.1, 'barrel', { see: true }));
  scatter(9, 6, 6, 1.1, (x, z) => (R() < 0.5 ? add(x, z, 6, 0.25, 1.8, 'fence') : add(x, z, 0.25, 6, 1.8, 'fence')));
  return K.finish(i);
}

export function cellIdx(x, z) {
  const ix = Math.max(0, Math.min(GN - 1, Math.floor((x + HALF) / CELL)));
  const iz = Math.max(0, Math.min(GN - 1, Math.floor((z + HALF) / CELL)));
  return iz * GN + ix;
}
const N = GN * GN;
const cellX = (c) => -HALF + ((c % GN) + 0.5) * CELL;
const cellZ = (c) => -HALF + (((c / GN) | 0) + 0.5) * CELL;

// Which level a player is on and how high their feet are, given where they stand. Stairs move you between levels.
// Returns [level, height].
export function levelAt(W, x, z, lv) {
  for (const st of W.stairs) {
    if (x < st.x0 || x > st.x1 || z < st.z0 || z > st.z1) continue;
    const t = (x - st.xa) / (st.xb - st.xa);
    return [t >= 0.5 ? 1 : 0, t * FLOOR_H];
  }
  return [lv, lv * FLOOR_H];
}
// Upstairs only exists inside two-storey houses
export function inUpper(W, x, z) {
  return W.upper.some((u) => x > u[0] && x < u[2] && z > u[1] && z < u[3]);
}
export function onStairs(W, x, z) {
  return W.stairs.some((st) => x >= st.x0 && x <= st.x1 && z >= st.z0 && z <= st.z1);
}
export function validLevel(W, x, z, lv) {
  return lv === 1 && (inUpper(W, x, z) || onStairs(W, x, z)) ? 1 : 0;
}

// Push a circle out of all boxes on one level. Returns [x, z].
export function collide(W, x, z, r = PR, lv = 0) {
  for (let it = 0; it < 3; it++) {
    let hit = false;
    for (const b of W.bl[lv]) {
      const hx = b.w / 2, hz = b.d / 2, dx = x - b.x, dz = z - b.z;
      if (Math.abs(dx) > hx + r || Math.abs(dz) > hz + r) continue;
      const cx = Math.max(-hx, Math.min(hx, dx)), cz = Math.max(-hz, Math.min(hz, dz));
      const ox = dx - cx, oz = dz - cz, d2 = ox * ox + oz * oz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        x += (ox / d) * (r - d);
        z += (oz / d) * (r - d);
      } else {
        const px = hx - Math.abs(dx), pz = hz - Math.abs(dz);
        if (px < pz) x += (dx < 0 ? -1 : 1) * (px + r);
        else z += (dz < 0 ? -1 : 1) * (pz + r);
      }
    }
    if (!hit) break;
  }
  return [x, z];
}

// True if nothing tall blocks the straight line between two points on the same level.
export function hasLOS(W, x1, z1, x2, z2, lv = 0) {
  const dx = x2 - x1, dz = z2 - z1;
  for (const b of W.los[lv]) {
    let t0 = 0, t1 = 1, ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (Math.abs(x1 - b.x) > b.w / 2) ok = false;
    } else {
      let a = (b.x - b.w / 2 - x1) / dx, c = (b.x + b.w / 2 - x1) / dx;
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) ok = false;
    }
    if (!ok) continue;
    if (Math.abs(dz) < 1e-9) {
      if (Math.abs(z1 - b.z) > b.d / 2) ok = false;
    } else {
      let a = (b.z - b.d / 2 - z1) / dz, c = (b.z + b.d / 2 - z1) / dz;
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) ok = false;
    }
    if (ok) return false;
  }
  return true;
}

// Nearest reachable nav node (level * N + cell) to a point, or -1.
function nearFree(W, x, z, lv) {
  const { reach } = W.nav, o = lv * N;
  const c = cellIdx(x, z);
  if (reach[o + c]) return o + c;
  const cx = c % GN, cz = (c / GN) | 0;
  let best = -1, bd = 1e9;
  for (let r = 1; r <= 10 && best < 0; r++) {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= GN || iz >= GN) continue;
      const n = o + iz * GN + ix;
      if (!reach[n]) continue;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = n; }
    }
  }
  return best;
}

export function walkable(W, x1, z1, x2, z2, lv = 0) {
  const d = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(d / 0.25), B = W.nav.blocked[lv];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (B[cellIdx(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)]) return false;
  }
  return true;
}

// A random reachable point as [x, z, level]. Pass ground = true to stay off the upper floors.
export function randomPoint(W, ground = false) {
  const l = ground ? W.nav.list0 : W.nav.list, n = l[(Math.random() * l.length) | 0], lv = n >= N ? 1 : 0;
  return [cellX(n - lv * N), cellZ(n - lv * N), lv];
}

// A* over both nav grids, joined at the stairs. Returns [[x, z, level], ...] or null.
const _g = new Float32Array(N * 2), _from = new Int32Array(N * 2), _closed = new Uint8Array(N * 2);
export function findPath(W, sx, sz, slv, tx, tz, tlv) {
  const { blocked, portal } = W.nav;
  const s = nearFree(W, sx, sz, slv), t = nearFree(W, tx, tz, tlv);
  if (s < 0 || t < 0) return null;
  const node = (n) => { const lv = n >= N ? 1 : 0; return [cellX(n - lv * N), cellZ(n - lv * N), lv]; };
  if (s === t) return [node(t)];
  _g.fill(Infinity); _from.fill(-1); _closed.fill(0);
  const tl = t >= N ? 1 : 0, tx_ = (t - tl * N) % GN, tz_ = ((t - tl * N) / GN) | 0;
  const hf = [], hi = [];
  const push = (f, i) => {
    let n = hf.length;
    hf.push(f); hi.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hf[p] <= f) break;
      hf[n] = hf[p]; hi[n] = hi[p];
      n = p;
    }
    hf[n] = f; hi[n] = i;
  };
  const pop = () => {
    const top = hi[0], lf = hf.pop(), li = hi.pop(), len = hf.length;
    if (len) {
      let n = 0;
      for (;;) {
        let c = n * 2 + 1;
        if (c >= len) break;
        if (c + 1 < len && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hf[n] = hf[c]; hi[n] = hi[c];
        n = c;
      }
      hf[n] = lf; hi[n] = li;
    }
    return top;
  };
  // Octile distance; changing level means a detour through a staircase, which the estimate may safely ignore
  const heur = (n) => {
    const c = n >= N ? n - N : n, dx = Math.abs((c % GN) - tx_), dz = Math.abs(((c / GN) | 0) - tz_);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  };
  _g[s] = 0;
  push(heur(s), s);
  while (hf.length) {
    const cur = pop();
    if (cur === t) break;
    if (_closed[cur]) continue;
    _closed[cur] = 1;
    const lv = cur >= N ? 1 : 0, o = lv * N, c = cur - o, B = blocked[lv], cx = c % GN, cz = (c / GN) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= GN || nz >= GN) continue;
      const nc = nz * GN + nx, n = o + nc;
      if (B[nc] || _closed[n]) continue;
      if (dx && dz && (B[cz * GN + nx] || B[nz * GN + cx])) continue;
      const g = _g[cur] + (dx && dz ? 1.4142 : 1);
      if (g < _g[n]) { _g[n] = g; _from[n] = cur; push(g + heur(n), n); }
    }
    const pt = portal[cur];
    if (pt >= 0 && !_closed[pt] && _g[cur] + 1 < _g[pt]) { _g[pt] = _g[cur] + 1; _from[pt] = cur; push(_g[pt] + heur(pt), pt); }
  }
  if (_from[t] < 0) return null;
  const path = [];
  for (let n = t; n !== s && n >= 0; n = _from[n]) path.push(node(n));
  path.reverse();
  return path;
}
