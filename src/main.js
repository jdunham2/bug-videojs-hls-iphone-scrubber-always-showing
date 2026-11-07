import './style.css';
import { loadConfig } from './config.js';
import { build, stat } from './skills.js';
import { loadModels, models } from './models.js';
import { Game } from './game.js';

loadConfig();
const game = new Game(document.getElementById('app'));
game.run();

// Meshy models load in the background; the placeholder shapes are used until
// (or unless) they arrive. Grunts spawned after this point use the model too.
loadModels().then(() => {
  game.player.attachModel();
  const loaded = Object.keys(models);
  if (loaded.length) console.info('Loaded models:', loaded.join(', '));
});

// Handy for poking at things from the browser console (and for tests).
window.game = game;
window.__build = build;
window.__stat = stat;
window.__buildAdd = (id) => build.add(id);
window.__models = models;
