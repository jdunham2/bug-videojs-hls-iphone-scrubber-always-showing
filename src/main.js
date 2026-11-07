import './style.css';
import { loadConfig } from './config.js';
import { Game } from './game.js';

loadConfig();
const game = new Game(document.getElementById('app'));
game.run();

// Handy for poking at things from the browser console.
window.game = game;
