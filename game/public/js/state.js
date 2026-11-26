// Global game state shared between client modules.
export const G = {
  time: 0,
  myId: null,
  roomCode: '',
  roomLevel: 1,
  zone: null,          // active zone object (TownZone / DungeonZone / DarkZone)
  zoneKey: '',
  player: null,
  enemies: new Map(),
  remotes: new Map(),
  loots: new Map(),
  projectiles: new Map(),
  structures: new Map(),
  defense: { phase: 'day', wave: 0, waves: 5, timer: 0, coreHp: 1, coreMax: 1 },
  nightF: 0,
  shake: 0,
  hitstop: 0,
  inGame: false,
  uiOpen: false,
  buildMode: false,
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}
