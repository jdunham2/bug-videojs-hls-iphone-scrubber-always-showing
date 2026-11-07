// All tunable gameplay numbers live here. The in-game tuning panel edits this
// object live and saves it to localStorage, so tweaks survive a reload.

export const DEFAULTS = {
  bow: {
    drawTime: 0.7, // seconds to reach full draw
    perfectWindow: 0.16, // seconds after full draw where a release counts as "perfect"
    minDamage: 6, // damage of an instant (uncharged) release
    maxDamage: 22, // damage at full draw
    perfectMultiplier: 2, // damage multiplier for a perfect release (also pierces)
    minArrowSpeed: 18,
    maxArrowSpeed: 46,
    range: 22, // distance before an arrow drops to the ground
    drawMoveMultiplier: 0.45, // movement speed multiplier while drawing
    fireCooldown: 0.12, // seconds after a shot before you can draw again
  },
  player: {
    moveSpeed: 7,
    maxHp: 100,
    iFrames: 0.7, // invulnerability after being hit
    healPerWave: 20,
  },
  grunt: {
    baseHp: 30,
    speed: 3.4,
    attackRange: 2.8, // distance at which it starts winding up a lunge
    windupTime: 0.55, // telegraph duration (direction locks at 70%)
    lungeSpeed: 15,
    lungeTime: 0.22,
    recoverTime: 0.7, // vulnerable pause after a lunge
    damage: 18,
    staggerCharge: 0.9, // a hit at this charge or higher interrupts a windup
  },
  waves: {
    baseCount: 3,
    countPerWave: 2,
    hpGrowth: 0.15, // +15% grunt HP per wave
    speedGrowth: 0.06, // +6% grunt speed per wave
    spawnInterval: 0.8,
    breakTime: 3,
  },
  feel: {
    hitStop: 0.045,
    perfectHitStop: 0.11,
    shake: 1,
    knockback: 6,
    cameraZoom: 1,
    bloom: true,
    bloomStrength: 0.55,
  },
};

const KEY = 'draw-release.config.v1';

export const config = JSON.parse(JSON.stringify(DEFAULTS));

export function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return;
    for (const group of Object.keys(DEFAULTS)) {
      for (const key of Object.keys(DEFAULTS[group])) {
        const v = saved[group]?.[key];
        if (v !== undefined && typeof v === typeof DEFAULTS[group][key]) config[group][key] = v;
      }
    }
  } catch {
    /* storage unavailable or corrupt: keep defaults */
  }
}

export function saveConfig() {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    /* ignore */
  }
}

export function resetConfig() {
  for (const group of Object.keys(DEFAULTS)) {
    Object.assign(config[group], DEFAULTS[group]);
  }
  saveConfig();
}
