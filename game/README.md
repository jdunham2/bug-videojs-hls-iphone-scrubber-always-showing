# Knockout Isle (vertical slice)

A third-person platform brawler roguelike built with three.js. The slice focuses on the core fight: four playable fighters, AI opponents, four arenas, items, and a wave loop with power-ups.

## Content

- **Fighters**: Nova (sword combo + charged smash), Pyra (fireballs from range, charged fire burst up close) Tank-o (hold dash on the ground to shield, charged rocket punch) and Whisk (frying-pan combo; smash throws the pan, which boomerangs back). Enemies: Grub, Vex, Bolt, Moss.
- **Arenas** (alternate every wave):
  - **Sky Isle**: a floating island with three floating platforms.
  - **Lava Forge**: every 19 seconds the floor sinks into lava for about 4 seconds. Touching lava adds 7% and bounces you up, so get onto the raised pillars.
  - **Windy Peaks**: every 12 seconds a gust blows across the summit for 3.5 seconds (an arrow shows its direction). Walk into it, or shield to brace.
  - **Clockwork Tower**: a giant clock face. The gear platforms spin and carry you with them, and piston pads glow red, then launch anyone standing on them.
- **Items** (drop every 7–11s, walk over to grab):
  - **Hammer**: 8s of big swings, no jumping.
  - **Bomb**: attack to throw, explodes on contact. It blows up in your hands after 5s.
  - **Heart**: heals 30%.
  - **Star**: 6s of invincibility and extra speed. Touching the enemy hurts them.
  - **Boomerang**: 3 throws; it flies out, comes back and can hit both ways.
  - **Banana**: toss a peel trap. Whoever steps on it slips.
  - **Ray Gun**: 6 fast laser shots.
  - **Jetpack**: unlimited air jumps for 10s.
  - **Mystery Box**: a random item, or sometimes an explosion.
- **Power-ups** (pick 1 of 3 after each wave): Iron Knuckles, Feather Boots, Anchor Belt, Cloud Step, Quickstep, Cyclone, Hot Blood, Spare Heart, **Vampire Fist** (hits heal 25% of damage dealt), **Second Wind** (one saved KO per wave), **Glass Cannon** (2× knockback dealt, 2× damage taken), **Thorns** (attackers take 3%), **Fire Trail** (dashes leave burning fire), **Chain Lightning** (every 3rd hit zaps for +6%), **Magnet** (items slide to you), **Shockwave Landing** (big landings knock enemies away), **Echo** (each attack repeats as a half-strength ghost hit).

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
| Dash (dodge, once in air); Tank-o: hold to shield | Shift | DASH |
| Camera | Mouse (click to capture), Q toggles lock-on | Drag the right side |
| Pause | Esc / P | II button |

## How the fight works

- **Damage %**: hits add damage, and higher damage means bigger knockback (`kb = base + damage × growth`).
- **Ring-outs**: you lose a life by flying past the blast zone or falling off the island.
- **Waves**: KO the opponent to clear a wave, then pick 1 of 3 power-ups. Enemies rotate (Grub → Vex → Bolt → Moss) and get stronger and smarter. From wave 4 on they have 2 lives.
- **Game feel**: hitstop, screen shake, particles, shock rings, damage popups, squash and stretch, and synthesized sound effects.

## Code map (`index.html`)

- `ROSTER` / `PLAYABLE`: character definitions (stats, colors, silhouette style, kit) and the select-screen info.
- `ARENAS`: arena definitions (platforms, sky/fog/light colors, hazard `update`). `setArena(key)` swaps them.
- `spawnProjectile` / `explode`: fireballs and thrown bombs.
- `ITEM_DEFS` / `updateItems`: item spawning, pickup and effects.
- `ATTACKS`: frame data per move (startup, active, recovery, damage, knockback, growth).
- `Fighter`: movement, physics, attacks, hit detection, knockback and procedural animation. The player and the AI share this class.
- `Brain`: AI that turns the game state into the same input struct the player produces.
- `PLATFORMS`: arena collision. The visual island is built in `buildIsland()`.
- `UPGRADES`: the roguelike power-up pool.

`window.__ko` exposes `{ player, enemy, game, brain }` for tweaking in the browser console.
