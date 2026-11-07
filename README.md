# Draw & Release

A browser prototype for a top-down, bow-focused action game built with three.js.
This first vertical slice tests one mechanic: **the charge shot**.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). `npm run build` produces a static build in `dist/`.

## Play online (GitHub Pages)

`.github/workflows/pages.yml` builds the game and deploys it to GitHub Pages on every push to `master` (and the current dev branch):

https://jdunham2.github.io/bug-videojs-hls-iphone-scrubber-always-showing/

One-time setup: in the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Aim |
| Hold left mouse | Draw the bow (you move slower while drawing) |
| Release | Fire. Releasing during the **gold flash** is a *perfect* shot: 2× damage and it pierces |
| `` ` `` | Show/hide the tuning panel |
| P / Esc | Pause |
| M | Mute |
| R | Restart |

## What's in the slice

- **Charge shot:** damage and arrow speed scale with draw time. A short perfect window opens at full draw, shown by the closing ring snapping gold plus a chime. Holding past it ("overdraw") makes the bow tremble and loses the perfect bonus.
- **Grunt:** chases you, then winds up (glows red and shows a wedge on the ground for its lunge path), commits to a direction, lunges, and pauses to recover. A full-draw or perfect hit during the windup **staggers** it.
- **Waves:** each wave adds more grunts with more HP and speed. You heal a little between waves.
- **Feedback:** hit-stop, screen shake, knockback, damage numbers, arrows that stick in enemies, walls and the floor, and synthesized sound.
- **Tuning panel:** every number lives in `src/config.js` and can be changed live. Changes are saved in your browser. Use *Copy settings JSON* to share a tuning.

## What to evaluate

1. Is the draw → release rhythm satisfying, and does hitting the perfect window feel rewarding?
2. Does moving slowly while drawing create good tension when grunts close in?
3. Is spacing against melee enemies interesting on its own, or does it clearly need a dodge?
4. Does it hold up for 3–5 minutes of waves?

## Code map

| File | What it does |
| --- | --- |
| `src/config.js` | All tunable numbers and their defaults |
| `src/game.js` | Main loop, waves, combat events, HUD, tuning panel |
| `src/player.js` | Movement, draw/release, bow and charge-ring visuals |
| `src/enemy.js` | Grunt state machine (spawn → chase → windup → lunge → recover) |
| `src/arrows.js` | Arrow flight, swept hit detection, piercing, sticking |
| `src/world.js` | Arena, pillars, torches, collision helpers |
| `src/fx.js` | Particles, damage numbers, screen shake |
| `src/audio.js` | Synthesized sound effects (Web Audio) |
| `src/input.js` | Keyboard and mouse |
