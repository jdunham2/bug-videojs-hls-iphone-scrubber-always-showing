import './style.css';
import { loadConfig } from './config.js';
import { build, stat } from './skills.js';
import { Game } from './game.js';

loadConfig();
const game = new Game(document.getElementById('app'));
game.run();

// Handy for poking at things from the browser console (and for tests).
window.game = game;
window.__build = build;
window.__stat = stat;
window.__buildAdd = (id) => build.add(id);
