// Living world rules shared by server and client: world clock, weather and fishing.
import { TOWN } from './world.js';

// One in-game day lasts 8 real minutes, starting at 08:00 when a party is created.
export const DAY_LEN = 480;
export const hourAt = (sec) => ((sec / DAY_LEN) * 24 + 8) % 24;
/** 0 = full day, 1 = deep night, with dusk 18-21 and dawn 5-7 */
export function nightAmount(h) {
  if (h >= 21 || h < 5) return 1;
  if (h >= 18) return (h - 18) / 3;
  if (h < 7) return 1 - (h - 5) / 2;
  return 0;
}
export const isNight = (h) => nightAmount(h) > 0.5;

export const WEATHER = {
  clear: { name: 'Clear skies', icon: '☀', desc: '' },
  rain: { name: 'Rain', icon: '🌧', desc: 'Enemies notice you 30% later', aggro: 0.7, fog: 1.6 },
  snow: { name: 'Blizzard', icon: '❄', desc: 'Everyone moves 15% slower', slow: 0.85, aggro: 0.85, fog: 2.4 },
  ash: { name: 'Ash Storm', icon: '🌋', desc: 'Enemies hit 15% harder · +25% gold', dmg: 1.15, gold: 1.25, fog: 2 },
};
export const WEATHER_TABLE = {
  marsh: [['clear', 3], ['rain', 3], ['ash', 1]],
  peaks: [['clear', 3], ['snow', 3], ['rain', 1]],
  dark: [['clear', 2], ['ash', 2]],
};
export const weatherFx = (kind) => WEATHER[kind] || WEATHER.clear;

// ---- fishing at the Emberhold lake ----
export const FISH = {
  perch: { name: 'Ember Perch', w: 40, gold: 15, diff: 1, color: '#e8a04a' },
  trout: { name: 'Ashfin Trout', w: 28, gold: 32, diff: 1.3, color: '#9aa8b0' },
  pike: { name: 'Gloom Pike', w: 16, gold: 65, diff: 1.7, color: '#4a6a4a' },
  eel: { name: 'Storm Eel', w: 9, gold: 120, diff: 2.1, color: '#5ab0ff', night: true },
  koi: { name: 'Ember Koi', w: 4, gold: 260, diff: 2.6, color: '#ff6a3a', gem: true },
  boot: { name: 'Soggy Boot', w: 3, gold: 1, diff: 0.6, color: '#5a4a3a' },
};
export function rollFish(rand, night) {
  const list = Object.entries(FISH).map(([k, f]) => [k, f.w * (f.night && night ? 3 : 1) * (k === 'koi' && night ? 1.5 : 1)]);
  let r = rand() * list.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of list) { r -= w; if (r <= 0) return k; }
  return 'perch';
}
/** the shore: the waterline sits about 10 m from the lake's centre */
export const SHORE = 10;
export function nearLake(x, z) { const L = TOWN.lake, d = Math.hypot(x - L.x, z - L.z); return d < SHORE + 7 && d > SHORE - 3; }
export const MIN_REEL = 1.2; // seconds the server requires between the bite and the catch
