// Player housing rules shared by server and client: the interior, the decor catalog, trophies and placement checks.
export const HOUSE = { w: 18, d: 14, door: { x: 0, z: 6.4 }, maxItems: 60, grid: 0.5 };
// k -> { name, cost, r (footprint radius), cat }
export const DECOR = {
  rug: { name: 'Ember Rug', cost: { gold: 150 }, r: 0.6, cat: 'Furniture', flat: true },
  table: { name: 'Oak Table', cost: { gold: 250, shards: 10 }, r: 0.9, cat: 'Furniture' },
  chair: { name: 'Oak Chair', cost: { gold: 120 }, r: 0.4, cat: 'Furniture' },
  bed: { name: 'Feather Bed', cost: { gold: 600, shards: 20 }, r: 1.1, cat: 'Furniture' },
  shelf: { name: 'Bookshelf', cost: { gold: 400, shards: 15 }, r: 0.7, cat: 'Furniture' },
  chest: { name: 'Iron-bound Chest', cost: { gold: 300, shards: 10 }, r: 0.55, cat: 'Furniture' },
  lantern: { name: 'Ember Lantern', cost: { gold: 200 }, r: 0.3, cat: 'Lights' },
  brazier: { name: 'Brazier', cost: { gold: 350, shards: 5 }, r: 0.5, cat: 'Lights' },
  banner: { name: 'Emberhold Banner', cost: { gold: 250 }, r: 0.3, cat: 'Decor' },
  plant: { name: 'Potted Fern', cost: { gold: 90 }, r: 0.35, cat: 'Decor' },
  armorstand: { name: 'Armor Stand', cost: { gold: 500, shards: 25 }, r: 0.5, cat: 'Decor' },
  fishtank: { name: 'Fish Tank', cost: { gold: 800, shards: 30 }, r: 0.9, cat: 'Collections', desc: 'Shows every species you have caught' },
};
// boss trophies: unlocked (not bought) by slaying the boss at least once; each can be mounted once
export const TROPHIES = {
  boss: 'Bone Tyrant Skull', matriarch: 'Ash Matriarch Fang', drake: 'Storm Drake Horn', hollowking: 'Hollow Crown (cracked)', colossus: 'Colossus Heartstone', herald: 'Shard of the Storm Crown', warden: 'Drowned Warden Chain', kingreborn: 'The Shattered Tide Crown', ogre: 'Siege Ogre Tusk',
};
export const trophyKey = (boss) => 'trophy_' + boss;
export const decorDef = (k) => DECOR[k] || (k.startsWith('trophy_') && TROPHIES[k.slice(7)] ? { name: TROPHIES[k.slice(7)], r: 0.5, cat: 'Trophies', trophy: k.slice(7) } : null);
/** placement check: inside the room, clear of the door and of other decor (flat rugs may sit under things) */
export function canPlace(items, k, x, z, ignoreId) {
  const D = decorDef(k); if (!D) return 'Unknown decor.';
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 'Bad position.';
  if (Math.abs(x) > HOUSE.w / 2 - 0.4 - D.r || Math.abs(z) > HOUSE.d / 2 - 0.4 - D.r) return 'Too close to the walls.';
  if (Math.hypot(x - HOUSE.door.x, z - HOUSE.door.z) < 1.6 + D.r) return 'Keep the doorway clear.';
  if (!D.flat) for (const it of items) { if (it.id === ignoreId) continue; const O = decorDef(it.k); if (!O || O.flat) continue; if (Math.hypot(it.x - x, it.z - z) < O.r + D.r - 0.05) return 'Something is already there.'; }
  return null;
}
export const snap = (v) => Math.round(v / HOUSE.grid) * HOUSE.grid;
