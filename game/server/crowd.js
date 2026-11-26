// Crowd separation for enemies: a uniform spatial hash instead of the O(n²) all-pairs push.
// Pure function over packed arrays so it can run on the main thread or inside a worker thread.
const CELL = 3;
/** pos: Float32Array [x, z, r] * n  ->  out: Float32Array [dx, dz] * n */
export function separate(pos, n, out = new Float32Array(n * 2)) {
  out.fill(0, 0, n * 2);
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const k = (Math.floor(pos[i * 3] / CELL) + 4096) * 8192 + (Math.floor(pos[i * 3 + 1] / CELL) + 4096);
    const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]);
  }
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], z = pos[i * 3 + 1], r = pos[i * 3 + 2], cx = Math.floor(x / CELL) + 4096, cz = Math.floor(z / CELL) + 4096;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const b = grid.get(gx * 8192 + gz); if (!b) continue;
      for (const j of b) {
        if (j <= i) continue;
        const ox = x - pos[j * 3], oz = z - pos[j * 3 + 1], od = Math.hypot(ox, oz), min = r + pos[j * 3 + 2];
        if (od < min && od > 0.001) { const push = (min - od) * 0.5, ux = ox / od, uz = oz / od; out[i * 2] += ux * push; out[i * 2 + 1] += uz * push; out[j * 2] -= ux * push; out[j * 2 + 1] -= uz * push; }
      }
    }
  }
  return out;
}
export function pack(list, buf) {
  const n = list.length; if (!buf || buf.length < n * 3) buf = new Float32Array(Math.max(64, n * 2) * 3);
  for (let i = 0; i < n; i++) { const e = list[i]; buf[i * 3] = e.x; buf[i * 3 + 1] = e.z; buf[i * 3 + 2] = e.radius; }
  return buf;
}
