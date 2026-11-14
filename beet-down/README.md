# Beet Down

A top-down arena roguelite vertical slice: pick a crash-landed veggie, survive 10 waves of aliens, spend materials in the shop and smash the Brood Queen.

Open `index.html` in a browser to play. Move with WASD / arrows or drag on touch. Esc pauses, M mutes.

## Files

- `index.html` – layout and styles
- `game.js` – all game logic
- `assets.js` – generated sprites (data URIs)
- `tools/` – asset pipeline

## Art

All art is from [Kenney](https://kenney.nl) and is CC0 (public domain): Food Kit, Blaster Kit, Weapon Pack, Survival Kit, Mini Dungeon (3D models rendered to sprites), Monster Builder Pack (aliens) and Particle Pack (effects).

## Rebuilding the art

1. Get the Kenney packs (for example a clone of `shorepine/kenney`) and put `three@0.160.0` in `node_modules` next to `tools/render.html`, with a `kenney` symlink to the packs.
2. `node tools/run.js tools/jobs.json raw` renders the 3D models to PNG.
3. `python3 tools/build_assets.py <kenney_root> raw assets.js` mirrors/rotates the renders, outlines them, assembles the aliens and writes `assets.js`.
