// Persistent player settings: graphics quality, audio volumes, controls & key bindings.
import { DEFAULT_BINDINGS } from './input.js';

const KEY = 'emberfall_settings_v2';
export const QUALITY = {
  low: { label: 'Low', pixel: 0.65, shadows: false, shadowMap: 1024, bloom: false, grass: 0.25 },
  medium: { label: 'Medium', pixel: 0.85, shadows: true, shadowMap: 1024, bloom: true, grass: 0.5 },
  high: { label: 'High', pixel: 1.0, shadows: true, shadowMap: 2048, bloom: true, grass: 1 },
  ultra: { label: 'Ultra', pixel: 1.35, shadows: true, shadowMap: 4096, bloom: true, grass: 1 },
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* ignore */ }
  return { quality: 'high', master: 0.8, music: 0.55, sfx: 0.85, sens: 1, invertY: false, intro: true, dynres: true, cb: false, uiScale: 1, touch: 'auto', rumble: true, ...s, bindings: { ...DEFAULT_BINDINGS, ...(s.bindings || {}) } };
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }

export function getToken() { try { return localStorage.getItem('emberfall_token') || ''; } catch (e) { return ''; } }
export function setToken(t) { try { localStorage.setItem('emberfall_token', t); } catch (e) { /* ignore */ } }
