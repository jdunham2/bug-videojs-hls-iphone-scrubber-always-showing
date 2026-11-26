// Offline/solo mode: runs the full Emberfall server simulation inside the page (used by the static Artifact build).
import { createGame } from '../server/game.js';

class LocalDB {
  constructor() {
    this.key = 'emberfall_offline_db_v1';
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || { profiles: {} }; } catch (e) { this.data = { profiles: {} }; }
    this.data.profiles ||= {};
    setInterval(() => this.flush(), 3000);
    addEventListener('pagehide', () => this.flush());
  }
  get(t) { return this.data.profiles[t] || null; }
  put(t, p) { this.data.profiles[t] = p; this.touch(); }
  touch() { this.dirty = true; }
  flush() { if (!this.dirty) return; this.dirty = false; try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } }
}

export function offlineProfile(token) {
  try { return JSON.parse(localStorage.getItem('emberfall_offline_db_v1'))?.profiles?.[token] || null; } catch (e) { return null; }
}

let game = null;
export function connectLocal(onMessage, onClose) {
  game ||= createGame({ db: new LocalDB(), makeToken: () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('') });
  const h = { message: [], close: [] };
  const serverSide = { readyState: 1, send: (s) => queueMicrotask(() => onMessage(s)), close() { this.readyState = 3; onClose(); }, on: (ev, fn) => h[ev]?.push(fn) };
  game.attach(serverSide);
  return { readyState: 1, send: (s) => queueMicrotask(() => h.message.forEach((f) => f(s))), close() { h.close.forEach((f) => f()); } };
}
