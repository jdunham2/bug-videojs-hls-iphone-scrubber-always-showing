import './style.css';
import * as THREE from 'three';
import { loadConfig } from './config.js';
import { build, stat, buffs } from './skills.js';
import { loadModels, models, modelStatus } from './models.js';
import { Game } from './game.js';
import { loadProfile, profile } from './profile.js';
import { loadSettings } from './settings.js';

loadConfig();
loadProfile();
loadSettings();
const game = new Game(document.getElementById('app'));
game.run();

// Meshy models load in the background; the placeholder shapes are used until
// (or unless) they arrive. Grunts spawned after this point use the model too.
loadModels().then(() => {
  game.player.attachModel();
  game.env.build();
  game.showCampBackdrop();
  const loaded = Object.keys(models);
  if (loaded.length) console.info('Loaded models:', loaded.join(', '));
  game.showModelStatus();
});
// Refresh the title-screen status lines once sounds finish decoding.
const statusTimer = setInterval(() => {
  const el = document.getElementById('audio-status');
  if (el) el.textContent = game.audioStatusText();
  if (!el || /samples|synth|supported/.test(el.textContent)) clearInterval(statusTimer);
}, 500);

// Handy for poking at things from the browser console (and for tests).
window.game = game;
window.__build = build;
window.__stat = stat;
window.__buildAdd = (id) => build.add(id);
window.__models = models;
window.__profile = profile;
window.__buffs = buffs;
window.__THREE = THREE;
window.__modelStatus = modelStatus;
