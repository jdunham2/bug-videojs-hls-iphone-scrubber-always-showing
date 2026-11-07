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
| Space / right mouse / Shift | Dodge roll |
| `` ` `` | Show/hide the tuning panel |
| P / Esc | Pause |
| M | Mute |
| R | Restart |

## What's in the slice

- **Charge shot:** damage and arrow speed scale with draw time. A short perfect window opens at full draw, shown by the closing ring snapping gold plus a chime. Holding past it ("overdraw") makes the bow tremble and loses the perfect bonus.
- **Dodge roll:** rolls the way you're moving, or backwards if you're standing still. You're invulnerable for most of it and can roll through grunts. Rolling through a lunge as it would have hit you is a **perfect dodge**: time slows briefly, and your next draw within 1.5s starts at full, so a quick tap fires a perfect counter shot. By default, rolling cancels a draw in progress (toggle in the tuning panel).
- **Skill draft:** after each wave you pick 1 of 3 skill cards (one reroll per run). Skills stack up to level III, rarer cards are stronger, and legendaries get likelier in later waves. Your build shows under the HUD stats and on the game-over screen.
- **Grunt:** chases you, then winds up (glows red and shows a wedge on the ground for its lunge path), commits to a direction, lunges, and pauses to recover. A full-draw or perfect hit during the windup **staggers** it.
- **Waves:** each wave adds more grunts with more HP and speed. You heal a little between waves.
- **Feedback:** hit-stop, screen shake, knockback, damage numbers, arrows that stick in enemies, walls and the floor, and synthesized sound.
- **Tuning panel:** every number lives in `src/config.js` and can be changed live. Changes are saved in your browser. Use *Copy settings JSON* to share a tuning.

## Skills

| Skill | Type | Rarity | Effect |
| --- | --- | --- | --- |
| Heavy Draw | Bow | Common | +20% full-draw damage per level |
| Quick Hands | Bow | Common | Draw 15% faster per level (compounding) |
| Steady Aim | Bow | Common | Perfect window 40% wider per level |
| Ricochet | Bow | Rare | Arrows bounce to 1 more grunt per level |
| Split Shot | Bow | Rare | Full-draw shots add side arrows (2 at 50%, then full damage, then 4) |
| Thunderstrike | Perfect shot | Rare | Perfect hits chain lightning to 2/3/4 grunts for 60% damage |
| Refresh | Perfect shot | Common | Perfect shots refill your dodge charges |
| Fire Arrows | Element | Rare | Hits burn for 4/7/10 damage per second over 3s |
| Frost Arrows | Element | Rare | Hits slow 30/40/50%; every 3rd hit freezes for 1.5s |
| Second Wind | Dodge | Rare | +1 dodge charge per level (max 2) |
| Vitality | Survival | Common | +25 max HP per level and a full heal |
| Overdraw | Bow | Legendary | Hold past the perfect window to charge a 3× piercing mega-shot |

Fire and Frost don't stack: taking one replaces the other. Skill definitions live in `src/skills.js`.

## What to evaluate

1. Is the draw → release rhythm satisfying, and does hitting the perfect window feel rewarding?
2. Does moving slowly while drawing create good tension when grunts close in?
3. Does the dodge make fights feel better or too safe? Is the perfect-dodge counter worth going for?
4. Does it hold up for 3–5 minutes of waves?

## Code map

| File | What it does |
| --- | --- |
| `src/config.js` | All tunable numbers and their defaults |
| `src/skills.js` | Skill catalogue, the current run's build, card rolling |
| `src/game.js` | Main loop, waves, combat events, HUD, tuning panel |
| `src/player.js` | Movement, draw/release, bow and charge-ring visuals |
| `src/enemy.js` | Grunt state machine (spawn → chase → windup → lunge → recover) |
| `src/arrows.js` | Arrow flight, swept hit detection, piercing, sticking |
| `src/world.js` | Arena, pillars, torches, collision helpers |
| `src/fx.js` | Particles, damage numbers, screen shake |
| `src/audio.js` | Synthesized sound effects (Web Audio) |
| `src/input.js` | Keyboard and mouse |
