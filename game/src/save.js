import * as THREE from 'three';
import { heightAt } from './terrain.js';

// Save system. Progress is written to the viewer's private cloud slot when the page
// runs as a claude.ai artifact (db capability), and always to browser storage as a
// backup. On load the newest of the two wins.
const LOCAL_KEY = 'iotp-save-v1';
const VERSION = 1;
const MIN_GAP = 20;   // seconds between automatic saves
const AUTOSAVE = 60;  // save at least this often while playing

export class SaveSystem {
  constructor(game) {
    this.game = game;
    this.cloud = null;        // DocumentReference once available
    this.cloudData = null;
    this.localData = readLocal();
    this.dirty = false;
    this.sinceSave = 0;
    this.sinceAuto = 0;
    this.writing = false;
    this.listeners = [];
    this.connect();
  }

  onChange(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(this.best()); }

  async connect() {
    const use = window.claude?.use;
    if (!use) return;
    try {
      const [db, user] = await Promise.all([use('db'), use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      this.cloud = db.collection('data/users/' + id).doc('save');
      let timer;
      const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 10000); });
      const snap = await Promise.race([this.cloud.get(), timeout]);
      clearTimeout(timer);
      if (snap.exists) {
        const d = snap.data();
        if (d && typeof d.json === 'string') { try { this.cloudData = JSON.parse(d.json); } catch (e) { /* corrupt slot */ } }
      }
      this.emit();
    } catch (e) {
      this.cloud = null; // signed out, view-only, or offline: browser storage only
    }
  }

  best() {
    const a = this.cloudData, b = this.localData;
    if (a && b) return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
    return a || b || null;
  }

  get where() { return this.cloud ? 'your account' : 'this browser'; }

  markDirty() { this.dirty = true; }

  tick(dt) {
    const g = this.game;
    if (!g.started || !g.player.alive) return;
    this.sinceSave += dt; this.sinceAuto += dt;
    if ((this.dirty && this.sinceSave > MIN_GAP) || this.sinceAuto > AUTOSAVE) this.save();
  }

  async save(manual = false) {
    if (this.writing) return;
    const data = serialize(this.game);
    this.dirty = false; this.sinceSave = 0; this.sinceAuto = 0;
    writeLocal(data);
    this.localData = data;
    let ok = true;
    if (this.cloud) {
      this.writing = true;
      try { await this.cloud.set({ json: JSON.stringify(data), savedAt: data.savedAt, version: VERSION }); this.cloudData = data; }
      catch (e) { ok = false; }
      this.writing = false;
    }
    this.game.ui.saveIndicator(ok ? `Saved to ${this.where}` : 'Saved to this browser (account save failed)', manual);
  }

  // Quick local-only save when the tab is hidden or closed.
  flushLocal() {
    if (!this.game.started) return;
    const data = serialize(this.game);
    writeLocal(data);
    this.localData = data;
  }

  async erase() {
    try { localStorage.removeItem(LOCAL_KEY); } catch (e) { /* ignore */ }
    this.localData = null;
    if (this.cloud) { try { await this.cloud.delete(); } catch (e) { /* ignore */ } }
    this.cloudData = null;
    this.emit();
  }
}

function readLocal() {
  try { const s = localStorage.getItem(LOCAL_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function writeLocal(data) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
}

const r2 = (v) => Math.round(v * 100) / 100;
const v3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];

export function serialize(g) {
  const p = g.player;
  const anchor = p.mount ? p.mount.pos : p.pos;
  return {
    version: VERSION,
    savedAt: Date.now(),
    player: {
      pos: v3(anchor), mounted: !!p.mount, yaw: r2(p.yaw), level: p.level, xp: r2(p.xp),
      armor: p.armor ? { ...p.armor } : null,
      hp: r2(Math.max(1, p.hp)), maxHp: p.maxHp, stam: r2(p.stam), maxStam: p.maxStam, food: r2(p.food), water: r2(p.water),
    },
    world: { time: r2(g.env.time * 1000) / 1000, day: g.env.day },
    inventory: g.inv.slots.map((s) => (s ? { ...s } : null)),
    hotIndex: g.hotIndex,
    stats: { ...g.stats },
    questIdx: g.questIdx,
    buildings: g.building.pieces.map((b) => ({ type: b.type, pos: v3(b.pos), rot: r2(b.rot), lit: !!b.lit, items: b.items ? b.items.map((s) => (s ? { ...s } : null)) : undefined, bed: b === g.bed || undefined })),
    tames: g.creatures.list.filter((c) => c.tamed && c.alive).map((c) => ({
      species: c.species, level: c.level, name: c.name, pos: v3(c.pos), yaw: r2(c.yaw),
      hp: r2(c.hp), saddled: c.saddled, follow: c.follow,
    })),
  };
}

export function applySave(g, d) {
  if (!d || d.version !== VERSION) return false;
  const p = g.player;
  Object.assign(p, {
    level: d.player.level, xp: d.player.xp, maxHp: d.player.maxHp, hp: d.player.hp,
    maxStam: d.player.maxStam, stam: d.player.stam, food: d.player.food, water: d.player.water, yaw: d.player.yaw, pitch: 0,
  });
  p.armor = d.player.armor || null;
  p.pos.fromArray(d.player.pos);
  p.pos.y = d.player.mounted ? heightAt(p.pos.x, p.pos.z) : Math.max(p.pos.y, heightAt(p.pos.x, p.pos.z));
  p.vel.set(0, 0, 0);
  g.env.time = d.world.time; g.env.day = d.world.day;

  g.inv.slots = d.inventory.slice(0, g.inv.slots.length).map((s) => (s ? { ...s } : null));
  while (g.inv.slots.length < 24) g.inv.slots.push(null);
  g.hotIndex = d.hotIndex || 0;
  Object.assign(g.stats, d.stats || {});
  g.questIdx = Math.min(d.questIdx || 0, g.quests.length);

  for (const b of d.buildings || []) {
    if (!g.building.geos[b.type]) continue;
    const piece = g.building.place(b.type, new THREE.Vector3().fromArray(b.pos), b.rot);
    if (piece.lit !== undefined) piece.lit = b.lit;
    if (b.items && piece.items) piece.items = b.items.slice(0, 24).map((s) => (s ? { ...s } : null));
    if (b.bed) g.bed = piece;
  }
  for (const t of d.tames || []) {
    const pos = new THREE.Vector3().fromArray(t.pos);
    pos.y = heightAt(pos.x, pos.z);
    const c = g.creatures.spawn(t.species, pos, t.level);
    c.flying = false; c.pos.y = pos.y;
    Object.assign(c, { tamed: true, state: 'tamed', name: t.name, saddled: t.saddled, follow: t.follow, yaw: t.yaw });
    c.hp = Math.min(c.maxHp, t.hp);
  }
  g.ui.refresh();
  return true;
}
