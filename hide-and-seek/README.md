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

`WASD` move · `Shift` sprint · `C` crouch · `E` use / hide / search · `Click` or `F` tag ·
`Q` rock · `T` taunt · `Enter` chat · `Esc` menu

## Code map

| File | What it does |
| --- | --- |
| `server.js` | HTTP + WebSocket server, rooms, rules, scoring, bot AI |
| `shared/world.js` | The map (generated from a fixed seed), collision, line of sight, pathfinding — used by both sides |
| `public/js/main.js` | Client: networking, input, movement, HUD |
| `public/js/gfx.js` | Three.js scene, characters, effects |
| `public/js/audio.js` | Synthesised sound effects |
| `test/smoke.js` | `npm test`: boots the server and plays a full round with bots |

The server referees tags, hiding spots, coins, jail and rescues. Player movement is
client-side with a loose sanity check, so this is fine for playing with friends but is
not hardened against cheating.
