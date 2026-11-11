# Dusk Hollow — multiplayer hide & seek

A 3D first-person hide-and-seek game for the browser, set in a small town at sunset.
Up to 16 players per room, with bots to fill empty seats (or to play solo).

## Run it

```bash
cd hide-and-seek
npm install
npm start
```

Open http://localhost:3000, pick a name and press **Play**. Share the invite link
(or the 4-letter room code) with friends on the same server. The host can add bots
and start the round. Set `PORT`, `HIDE_T` or `SEEK_T` (seconds) to change the defaults.

## How it plays

One in four players is a **seeker**; everyone else hides. Seekers count with their eyes
closed for 25 seconds, then have 3 minutes to catch everybody. Roles rotate each round and
scores carry over.

### Every action has a consequence

| You do this | This happens |
| --- | --- |
| Sprint | Seekers nearby see a noise ping through walls, and you leave footprints that linger for 12 seconds |
| Sprint until your stamina is gone | You slow down and gasp loudly for a few seconds |
| Crouch | Slow, but silent and much harder to spot |
| Get tagged | You're locked in the jail cage in the plaza |
| Hold **E** at the jail lever for 3 seconds | Every prisoner is freed (+50 each) — if a seeker doesn't get you first |
| Seeker searches an empty hiding spot | The seeker is dazed for 2.5 seconds |
| Taunt (**T**) | +15 points, and everyone hears where you are |
| Throw a rock (**Q**, 3 per round) | A loud noise where it lands — a decoy |
| A seeker gets close | Your heartbeat pounds and the screen edges pulse red |

### Things to do

- Hide inside bushes, lockers and dumpsters (**E**), or behind cars, crates and hedges.
- Explore five buildings, a hedge maze, and the central plaza.
- Collect 30 coins scattered around town (+10 each).
- Stage a jailbreak, or guard the cage.
- Chat with **Enter**.

### Controls

Keyboard and mouse: `WASD` move · `Shift` sprint · `C` crouch · `E` use / hide / search · `Click` or `F` tag ·
`Q` rock · `T` taunt · `Enter` chat · `Esc` menu

Phone or tablet: drag the left side of the screen to move (push the stick to its edge to sprint), drag anywhere
else to look, and use the on-screen **USE**, **TAG**, **CROUCH**, rock and taunt buttons. Landscape works best.

## Three ways to play

| Mode | Where the game runs | Who can join |
| --- | --- | --- |
| **Play online** on the Node server | `server.js` | Anyone who can reach the server, by room code or invite link |
| **Play solo with bots** | In your own browser tab | Just you and five bots |
| **Claude artifact** (`npm run build:artifact`) | The first tab to open a room code hosts the game | Signed-in people with access to the artifact who enter the same room code |

In the artifact there is no server, so the hosting tab runs the rules and shares state through the artifact's
realtime room. If the host closes or backgrounds their tab the game pauses or ends for everyone. To republish,
run `npm run build:artifact` and publish `artifact/index.html` with `public/style.css`, `public/js/*`,
`public/shared/*` and `node_modules/three/build/three.module.js` as its files (served as `style.css`, `js/`,
`shared/` and `vendor/three.module.js`).

## Code map

| File | What it does |
| --- | --- |
| `server.js` | HTTP + WebSocket server: one game room per code |
| `public/shared/game.js` | Rules, rounds, scoring and bot AI — runs on the server or in a browser tab |
| `public/shared/world.js` | The map (generated from a fixed seed), collision, line of sight, pathfinding |
| `public/js/net.js` | The three connection modes above |
| `public/js/main.js` | Client: input (keyboard, mouse, touch), movement, HUD |
| `public/js/gfx.js` | Three.js scene, characters, effects |
| `public/js/audio.js` | Synthesised sound effects |
| `test/` | `npm test`: plays a full round on the server, and a hosted game through a fake realtime room |

The game module referees tags, hiding spots, coins, jail and rescues. Player movement is
client-side with a loose sanity check, so this is fine for playing with friends but is
not hardened against cheating.
