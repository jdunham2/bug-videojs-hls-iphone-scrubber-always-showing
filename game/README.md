# Knockout Isle (vertical slice)

A third-person platform brawler roguelike built with three.js. This first slice focuses on the core fight: one hero, one AI opponent, one floating-island arena, and a short wave loop with power-ups.

## Run it

It's a single HTML file with no build step. three.js loads from a CDN through an import map.

```bash
cd game && python3 -m http.server 8000
```

Then open http://localhost:8000.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Left-side stick |
| Jump (double jump) | Space | JUMP |
| Attack (3-hit combo, air spin) | J / left click | HIT |
| Smash (hold to charge) | K / right click | SMASH (hold) |
| Dash (dodge, once in air) | Shift | DASH |
| Camera | Mouse (click to capture), Q toggles lock-on | Drag the right side |
| Pause | Esc / P | II button |

## How the fight works

- **Damage %**: hits add damage, and higher damage means bigger knockback (`kb = base + damage × growth`).
- **Ring-outs**: you lose a life by flying past the blast zone or falling off the island.
- **Waves**: KO the opponent to clear a wave, then pick 1 of 3 power-ups. Enemies rotate (Grub → Vex → Bolt → Moss) and get stronger and smarter. From wave 4 on they have 2 lives.
- **Game feel**: hitstop, screen shake, particles, shock rings, damage popups, squash and stretch, and synthesized sound effects.

## Code map (`index.html`)

- `ROSTER`: character definitions (stats, colors, silhouette style). Add a character here.
- `ATTACKS`: frame data per move (startup, active, recovery, damage, knockback, growth).
- `Fighter`: movement, physics, attacks, hit detection, knockback and procedural animation. The player and the AI share this class.
- `Brain`: AI that turns the game state into the same input struct the player produces.
- `PLATFORMS`: arena collision. The visual island is built in `buildIsland()`.
- `UPGRADES`: the roguelike power-up pool.

`window.__ko` exposes `{ player, enemy, game, brain }` for tweaking in the browser console.
