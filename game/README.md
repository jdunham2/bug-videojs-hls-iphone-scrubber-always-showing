# Knockout Isle (vertical slice)

A third-person platform brawler roguelike built with three.js. The slice focuses on the core fight: nine playable fighters, AI opponents, eleven arenas, items, and a wave loop with power-ups.

## Content

- **Fighters**: Nova (sword combo + charged smash), Pyra (fireballs from range, charged fire burst up close) Tank-o (hold dash on the ground to shield, charged rocket punch) Whisk (frying-pan combo; smash throws the pan, which boomerangs back) Shade (dash teleports, behind the enemy if close; smash leaves a decoy that stuns whoever hits it), Bubbles (8 rapid slaps; smash traps the enemy in a floating bubble) Rex (combo ends in a tail swipe; smash is a ground-pound), Glitch (every hit rolls random power from weak to critical; smash is a random special) and Lady Bloom (smash plants a vine trap that roots enemies). Enemies: Grub, Vex, Bolt, Moss.
- **Unlocks**: you start with Nova. Clearing waves (counted across all runs and saved in the browser) unlocks the rest: Pyra at 2 waves, Tank-o 4, Whisk 7, Shade 10, Bubbles 14, Rex 18, Glitch 23 and Lady Bloom 30. Arenas unlock from the same counter: Sky Isle and Lava Forge are open at the start, then Windy Peaks at 3, Clockwork Tower 5, Frozen Lake 8, Pirate Ship 12, Shrinking Arena 16, Bounce House 21, Night Market 26, Gravity Garden 31 and Train Top 36. During a run, arenas rotate through the unlocked ones only. The RANDOM FIGHTER and RANDOM ARENA buttons on the select screen spin through your unlocked fighters or arenas and pick one. **Random arena every wave** fights each wave in a random unlocked arena (never the same twice in a row) instead of the normal rotation. It is rewarded too: a free Mystery Box drops in at the start of every wave, +4 gold every wave, and every third wave counts double toward unlocks. Both random modes stack. The **FULLY RANDOM** toggle turns both on (or off) in one tap, and while both are on you also get a CHAOS BONUS: a free random power-up after every wave, on top of the one you pick. Enemies are tougher in fully random mode: they hit 25% harder, are 20% heavier and 10% faster (and scale faster per wave), have smarter AI, get 2 lives from wave 3 and 3 from wave 6, and can be any fighter in the roster. Turning on **Random fighter every wave** makes you a different unlocked fighter at the start of every wave, and your stat power-ups are re-applied to each new fighter. Random mode is rewarded: unlocks come 1.5× faster (every second wave counts double), +8 gold every wave, and 4 power-up choices instead of 3. A link on the select screen resets progress. Change the thresholds in `UNLOCKS` and `ARENA_UNLOCKS`.
- **Arenas** (unlocked arenas rotate every wave):
  - **Sky Isle**: a floating island with three floating platforms.
  - **Lava Forge**: every 19 seconds the floor sinks into lava for about 4 seconds. Touching lava adds 7% and bounces you up, so get onto the raised pillars.
  - **Windy Peaks**: every 12 seconds a gust blows across the summit for 3.5 seconds (an arrow shows its direction). Walk into it, or shield to brace.
  - **Clockwork Tower**: a giant clock face. The gear platforms spin and carry you with them, and piston pads glow red, then launch anyone standing on them.
  - **Frozen Lake**: slippery ice where you keep sliding. Big hits crack holes in it, and falling into the freezing water costs 5%. The holes refreeze after a few seconds.
  - **Pirate Ship**: a long deck that rolls side to side and slides you downhill. Cannons light up a red lane across the deck, then fire. Fall overboard and you're out.
  - **Shrinking Arena**: every 10 seconds the outer ring glows red, then crumbles away, until only the center is left.
  - **Bounce House**: a trampoline in the middle, and inflatable walls that bounce you back once each before deflating for 12s.
  - **Night Market**: lantern-lit at night with fireworks. Food stalls toss snacks that heal 12%, and you can stand on the stall roofs.
  - **Gravity Garden**: low gravity, so jumps go twice as high and launched fighters fly much farther.
  - **Train Top**: fight on moving train cars. When a tunnel comes, jump down into the open wagon or get knocked back.
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
  - **Giant Mushroom**: grow huge for 10s. You hit harder and are harder to launch, but move slower.
  - **Freeze Ray**: 3 shots that freeze the enemy in an ice block for about 2s.
- **Power-ups** (pick 1 of 3 after each wave): Iron Knuckles, Feather Boots, Anchor Belt, Cloud Step, Quickstep, Cyclone, Hot Blood, Spare Heart, **Vampire Fist** (hits heal 25% of damage dealt), **Second Wind** (one saved KO per wave), **Glass Cannon** (2× knockback dealt, 2× damage taken), **Thorns** (attackers take 3%), **Fire Trail** (dashes leave burning fire), **Chain Lightning** (every 3rd hit zaps for +6%), **Magnet** (items slide to you), **Shockwave Landing** (big landings knock enemies away), **Echo** (each attack repeats as a half-strength ghost hit), **Gold Rush** (hits drop coins; spend them in the shop between waves), **Pet Drone** (a drone follows you and zaps the enemy; take it twice for two).

## Music and sound

All audio is generated live with the Web Audio API, so there are no audio files.

- **Music**: a small step sequencer plays a different theme in every arena, plus a menu theme. Each theme has its own tempo, key, scale, chord loop, instruments and drum pattern. The lead melody is generated from a seed, so each theme repeats as a recognizable 8-bar loop. Themes crossfade when the arena changes. Edit them in `THEMES`.
- **Ambience**: a sound bed per arena (`AMB` and `updateAmbience`), for example a lava rumble with crackles, wind that swells with gusts, ticking gears, ice chimes, ocean swells with creaks and gulls, a crowd murmur with wind chimes, birdsong, and train clatter that roars when a tunnel passes.
- **Controls**: the pause menu has Music and Sound effects volume sliders, and the M key turns music on or off. Settings are saved in the browser.

## Leaderboard

Fully random runs (random fighter and random arena every wave) are ranked by waves cleared. The LEADERBOARD button is on the title and game-over screens.

- **Everyone**: when the game is published as a claude.ai artifact, each person's best fully random run is stored at `leaderboard/<their id>` in the artifact's shared database (the `db` + `user` capabilities). Only ids are stored, and names are looked up when the board is shown. Anyone who can open the game can read the board. People with Contributor access or above can post their own entry, and only the owner can change other people's entries.
- **This device**: your top 10 fully random runs, saved in the browser. This is the only board when you run `index.html` locally.

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
- `PLATFORMS`: arena collision. Platforms are circles or boxes and can tilt with the arena (`platTop`, `platInside`, `platPush`, `edgeOf`).
- `UPGRADES`: the roguelike power-up pool.

`window.__ko` exposes `{ player, enemy, game, brain }` for tweaking in the browser console.
