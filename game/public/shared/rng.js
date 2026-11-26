// Deterministic RNG + noise shared by server and client.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed >>> 0); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  weighted(entries) { // [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let x = this.r() * total;
    for (const e of entries) { x -= e[1]; if (x <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
}

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = fade(x - xi), zf = fade(z - zi);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * xf + (c - a) * zf + (a - b - c + d) * xf * zf;
}

export function fbm(x, z, oct = 4) {
  let v = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += noise2(x * f, z * f) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return v / n;
}

export const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const uid = () => Math.random().toString(36).slice(2, 10);
