// Ember Rifts (timed endgame dungeons), Paragon progression and seasons. Shared by server + client.
export const RIFT_TIME = 300; // seconds to beat for keystone upgrades + leaderboard
export const RIFT_MODS = {
  swift: { name: 'Swift', desc: 'Enemies move 30% faster', color: '#5eea8a' },
  frenzy: { name: 'Frenzied', desc: 'Enemies attack 30% faster', color: '#ff6a4a' },
  volatile: { name: 'Volatile', desc: 'Enemies leave fire when they die', color: '#ff9a3c' },
  empowered: { name: 'Empowered', desc: 'Many more elites', color: '#c77dff' },
  darkness: { name: 'Darkness', desc: 'Light barely reaches you', color: '#8a8aa8' },
};
export const RIFT_MOD_KEYS = Object.keys(RIFT_MODS);
export const riftEnemyLevel = (k, roomLevel) => Math.max(roomLevel, Math.ceil(k * 0.8));
export const riftHpMul = (k) => 1 + 0.08 * k;

export const LEVEL_CAP = 30;
export const PARAGON = {
  dmg: { name: 'Might', per: 0.01, fmt: (v) => `+${(v * 100).toFixed(0)}% damage` },
  hp: { name: 'Vitality', per: 0.015, fmt: (v) => `+${(v * 100).toFixed(1)}% health` },
  armor: { name: 'Bulwark', per: 2, fmt: (v) => `+${v} armor` },
  crit: { name: 'Precision', per: 0.002, fmt: (v) => `+${(v * 100).toFixed(1)}% crit` },
  cdr: { name: 'Haste', per: 0.002, max: 50, fmt: (v) => `${(v * 100).toFixed(1)}% cooldown reduction` },
  gold: { name: 'Fortune', per: 0.02, fmt: (v) => `+${(v * 100).toFixed(0)}% gold find` },
};
export const paragonXp = (pts) => Math.round(4000 * Math.pow(1.05, pts));
export const season = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
