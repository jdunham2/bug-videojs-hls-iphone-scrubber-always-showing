import { heightAt, slopeAt, WORLD, HALF } from './terrain.js';
import { KIND } from './building.js';

// World map: a hill-shaded render of the island, fog of war that lifts as you explore,
// markers for you, your tames, your bed and buildings, plus a corner minimap.
const RES = 256;           // map texture resolution
const FOG = 64;            // exploration grid resolution
const REVEAL = 60;         // metres revealed around the player

const PLACES = [
  { name: 'Landing Beach', x: 20, z: 300 },
  { name: 'Crescent Lake', x: 120, z: 30 },
  { name: 'Northern Peak', x: -40, z: -230 },
  { name: 'Ironridge', x: -150, z: -160 },
  { name: 'Western Woods', x: -250, z: 40 },
  { name: 'Eastern Shore', x: 300, z: 120 },
];

const toMap = (v) => (v / WORLD + 0.5);

export class WorldMap {
  constructor(game) {
    this.game = game;
    this.fog = new Uint8Array(FOG * FOG);
    this.img = null;
    this.open = false;
    this.el = document.getElementById('map');
    this.canvas = document.getElementById('map-canvas');
    this.mini = document.getElementById('minimap');
    this.miniT = 0;
    document.getElementById('map-close').addEventListener('click', () => this.toggle(false));
  }

  // Lazily render the base map (≈65k height samples) the first time it is needed.
  base() {
    if (this.img) return this.img;
    const c = document.createElement('canvas');
    c.width = c.height = RES;
    const ctx = c.getContext('2d');
    const im = ctx.createImageData(RES, RES);
    const hs = new Float32Array(RES * RES);
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      hs[j * RES + i] = heightAt((i / (RES - 1) - 0.5) * WORLD, (j / (RES - 1) - 0.5) * WORLD);
    }
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const h = hs[j * RES + i];
      const hl = hs[j * RES + Math.max(0, i - 1)], hu = hs[Math.max(0, j - 1) * RES + i];
      const shade = Math.max(0.55, Math.min(1.35, 1 + ((hl - h) + (hu - h)) * 0.12));
      let r, g, b;
      if (h < 0) { const d = Math.min(1, -h / 14); r = 40 - d * 25; g = 120 - d * 70; b = 140 - d * 50; }
      else if (h < 2.4) { r = 214; g = 196; b = 150; }
      else if (h < 26) { const t = h / 26; r = 92 - t * 30; g = 140 - t * 40; b = 60 - t * 15; }
      else if (h < 68) { const t = (h - 26) / 42; r = 110 + t * 20; g = 104 + t * 16; b = 92 + t * 18; }
      else { r = 236; g = 238; b = 242; }
      const k = (j * RES + i) * 4;
      const sh = h < 0 ? 1 : shade;
      im.data[k] = r * sh; im.data[k + 1] = g * sh; im.data[k + 2] = b * sh; im.data[k + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    this.img = c;
    return c;
  }

  reveal(x, z) {
    const gx = toMap(x) * FOG, gz = toMap(z) * FOG, r = (REVEAL / WORLD) * FOG;
    let changed = false;
    for (let j = Math.floor(gz - r); j <= Math.ceil(gz + r); j++) for (let i = Math.floor(gx - r); i <= Math.ceil(gx + r); i++) {
      if (i < 0 || j < 0 || i >= FOG || j >= FOG) continue;
      if ((i + 0.5 - gx) ** 2 + (j + 0.5 - gz) ** 2 > r * r) continue;
      if (!this.fog[j * FOG + i]) { this.fog[j * FOG + i] = 1; changed = true; }
    }
    return changed;
  }

  explored() { let n = 0; for (const v of this.fog) n += v; return n / this.fog.length; }

  serializeFog() {
    let s = '';
    for (let i = 0; i < this.fog.length; i += 6) {
      let v = 0; for (let k = 0; k < 6; k++) v |= (this.fog[i + k] ? 1 : 0) << k;
      s += String.fromCharCode(48 + v);
    }
    return s;
  }

  loadFog(s) {
    if (typeof s !== 'string') return;
    for (let i = 0; i < s.length; i++) {
      const v = s.charCodeAt(i) - 48;
      for (let k = 0; k < 6; k++) if (i * 6 + k < this.fog.length) this.fog[i * 6 + k] = (v >> k) & 1;
    }
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.el.classList.toggle('show', this.open);
    const g = this.game;
    if (this.open) { if (g.noLock) g.locked = false; else document.exitPointerLock?.(); this.draw(); }
    else g.lock();
    g.input.keys = {};
  }

  update(dt) {
    const p = this.game.player;
    this.miniT -= dt;
    if (this.reveal(p.pos.x, p.pos.z)) this.game.saves.markDirty?.();
    if (this.miniT <= 0) { this.miniT = 0.15; this.drawMini(); }
  }

  // Draw the full map into the overlay canvas.
  draw() {
    const cv = this.canvas, ctx = cv.getContext('2d');
    const size = Math.min(window.innerWidth - 32, window.innerHeight - 110, 760);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = cv.style.height = `${size}px`;
    cv.width = cv.height = Math.round(size * dpr);
    const S = cv.width;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.base(), 0, 0, S, S);
    // fog
    // soft-edged fog: one pixel per cell, scaled up with smoothing
    const fc = this.fogCanvas || (this.fogCanvas = Object.assign(document.createElement('canvas'), { width: FOG, height: FOG }));
    const fctx = fc.getContext('2d');
    const fim = fctx.createImageData(FOG, FOG);
    for (let k = 0; k < this.fog.length; k++) { fim.data[k * 4] = 14; fim.data[k * 4 + 1] = 16; fim.data[k * 4 + 2] = 12; fim.data[k * 4 + 3] = this.fog[k] ? 0 : 222; }
    fctx.putImageData(fim, 0, 0);
    ctx.drawImage(fc, 0, 0, S, S);
    const P = (x, z) => [toMap(x) * S, toMap(z) * S];
    const seen = (x, z) => { const i = Math.floor(toMap(x) * FOG), j = Math.floor(toMap(z) * FOG); return i >= 0 && j >= 0 && i < FOG && j < FOG && this.fog[j * FOG + i]; };
    ctx.textAlign = 'center';
    ctx.font = `${Math.round(11 * dpr)}px Inter, sans-serif`;
    for (const pl of PLACES) {
      if (!seen(pl.x, pl.z)) continue;
      const [x, y] = P(pl.x, pl.z);
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(pl.name.toUpperCase(), x + dpr, y + dpr);
      ctx.fillStyle = '#f6ead0'; ctx.fillText(pl.name.toUpperCase(), x, y);
    }
    const g = this.game;
    for (const b of g.building.pieces) {
      const [x, y] = P(b.pos.x, b.pos.z);
      const k = KIND[b.type];
      if (k === 'bed') continue;
      ctx.fillStyle = k === 'forge' || k === 'fire' ? '#ff9a3a' : '#c8a878';
      ctx.fillRect(x - 2 * dpr, y - 2 * dpr, 4 * dpr, 4 * dpr);
    }
    if (g.bed) { const [x, y] = P(g.bed.pos.x, g.bed.pos.z); this.icon(ctx, x, y, '🛏️', 16 * dpr); }
    for (const c of g.creatures.list) {
      if (!c.tamed || !c.alive) continue;
      const [x, y] = P(c.pos.x, c.pos.z);
      ctx.fillStyle = '#5ab0ff'; ctx.beginPath(); ctx.arc(x, y, 4 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0a1a2a'; ctx.lineWidth = dpr; ctx.stroke();
      ctx.fillStyle = '#cfe6ff'; ctx.font = `${Math.round(10 * dpr)}px Inter, sans-serif`; ctx.fillText(c.name, x, y - 7 * dpr);
    }
    if (g.altar && seen(g.altar.pos.x, g.altar.pos.z)) { const [x, y] = P(g.altar.pos.x, g.altar.pos.z); this.icon(ctx, x, y, '💀', 18 * dpr); }
    if (g.boss && g.boss.alive) { const [x, y] = P(g.boss.pos.x, g.boss.pos.z); this.icon(ctx, x, y, '💀', 18 * dpr); }
    this.arrow(ctx, ...P(g.player.pos.x, g.player.pos.z), -g.player.yaw, 9 * dpr);
    document.getElementById('map-info').textContent = `Explored ${Math.round(this.explored() * 100)}% of the island`;
  }

  icon(ctx, x, y, ch, size) {
    ctx.font = `${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, x, y); ctx.textBaseline = 'alphabetic';
  }

  arrow(ctx, x, y, heading, s) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
    ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, s * 0.8); ctx.lineTo(0, s * 0.35); ctx.lineTo(-s * 0.7, s * 0.8); ctx.closePath();
    ctx.fillStyle = '#e8c27a'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = s * 0.15; ctx.stroke();
    ctx.restore();
  }

  drawMini() {
    const cv = this.mini;
    if (!cv || cv.offsetParent === null) return;
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const g = this.game, p = g.player;
    const span = 220; // metres across
    const px = toMap(p.pos.x) * RES, pz = toMap(p.pos.z) * RES, w = (span / WORLD) * RES;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#0b2a36'; ctx.fillRect(0, 0, S, S);
    ctx.drawImage(this.base(), px - w / 2, pz - w / 2, w, w, 0, 0, S, S);
    const sc = S / span;
    const M = (x, z) => [S / 2 + (x - p.pos.x) * sc, S / 2 + (z - p.pos.z) * sc];
    for (const b of g.building.pieces) { const [x, y] = M(b.pos.x, b.pos.z); ctx.fillStyle = '#c8a878'; ctx.fillRect(x - 2, y - 2, 4, 4); }
    for (const c of g.creatures.list) {
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d > span / 2) continue;
      if (!c.tamed && d > 70) continue; // only nearby wild creatures show up
      const [x, y] = M(c.pos.x, c.pos.z);
      ctx.fillStyle = c.tamed ? '#5ab0ff' : c.def.temper === 'aggressive' ? '#ff5a4a' : '#e8e0c8';
      ctx.beginPath(); ctx.arc(x, y, c.tamed ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    this.arrow(ctx, S / 2, S / 2, -p.yaw, 7);
    ctx.strokeStyle = 'rgba(232,194,122,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#e8c27a'; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', S / 2, 12);
  }
}
