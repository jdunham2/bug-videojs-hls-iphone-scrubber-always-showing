# Dusk Hollow — multiplayer hide & seek

A 3D first-person hide-and-seek game for the browser, set in a small town at sunset.
Up to 16 players per room, with bots to fill empty seats (or to play solo). Pick your own character, colour, hat
and pattern before you play.

## Run it

```bash
cd hide-and-seek
npm install
npm start
```

Open http://localhost:3000, pick a name and press **Play**. Share the invite link
(or the 4-letter room code) with friends on the same server. The host can add bots
and start the round. Set `PORT`, `HIDE_T` or `SEEK_T` (seconds), `MAP` (0-10, the starting map) or `MODE` (0-13) to change the defaults.

## How it plays

One in four players is a **seeker**; everyone else hides. Seekers count with their eyes
closed for 30 seconds, then have 3½ minutes to catch everybody. Roles rotate each round and
scores carry over.

### Game modes

The host picks the mode in the lobby with **Next mode**.

| Mode | How it works |
| --- | --- |
| **Classic** | Caught hiders go to jail until a teammate pulls the lever. |
| **Infection** | Everyone a seeker catches becomes a seeker too. Survive until the clock runs out. |
| **Freeze Tag** | Tagged hiders freeze where they stand. A teammate who holds **E** next to them for 1.5 seconds thaws them (+30). |
| **Prop Hunt** | Hiders are disguised as crates, barrels, bushes, rocks or traffic cones (**R** changes disguise) and there are no hiding spots. A seeker who swings at a real prop is dazed. |
| **Blackout** | Classic rules in near-total darkness. Seekers have flashlights, everyone else a faint glow, and street lamps are islands of light. |
| **Coin Heist** | Hiders win the moment they have collected enough coins between them (4 plus 2 per hider). |
| **Sardines** | One player hides and everyone else seeks. Tag the hider and you become a hider too, right there. The round ends when only one seeker is left. |
| **Turbo** | 15 seconds to hide, 90 to seek, everyone 30% faster and nobody runs out of breath. |
| **VIP Escort** | One hider is the VIP, marked in gold for their team. If the VIP is caught the seekers win at once; if the VIP survives they get +200. |
| **Playground Tag** | One player is "it". Tag someone and they are it instead (+25). Everyone else scores while they are not it. |
| **Giants** | Seekers are 1.7× size with a 3.7 m reach. Hiders are half size and can hide behind almost anything. |
| **Closing Storm** | A storm wall shrinks from 100 m to 17 m around the plaza. A hider outside it for more than 4 seconds is swept off to jail. |
| **Switcheroo** | Every 45 seconds each seeker becomes a hider, and the same number of free hiders become seekers. |
| **Spotlight** | Seekers cannot tag. A hider held in the middle of a flashlight beam (within 15 m, in line of sight) for 1.2 seconds is caught. |

Beacons, power-ups, coins and challenges work in every mode.

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

### Characters

Twenty characters (Blob, Robot, Cat, Bear, Penguin, Ghost, Frog, Alien, Dino, Bunny, Astronaut, Ninja, Pumpkin,
Duck, Knight, Wizard, Pirate, Shark, Mushroom, Snowman), 16 colours, seven hats, four patterns and
41 pets (puppy, kitten, bunny, duckling, baby dragon, slime, bee, robo-ball, fox, panda, piglet, unicorn, turtle,
owl, bat, ghostling, crab, hedgehog, froglet, parrot, snail, penguin chick, mouse, butterfly, mini UFO, baby shark, jellyfish, chick, lamb, tiny T-rex, squirrel, firefly,
little cloud, corgi, red panda, koala, axolotl, ladybug, seahorse, phoenix, pumpkin sprout). Your pet runs just ahead of you;
other players' pets trail behind them. Seekers cannot see a hider's pet, so it never gives you away.
Choose on the start screen, or with **Change character** in the lobby; everyone else sees your look.

### Maps

Each map is 150 m across and has two-storey houses. Walk up the staircase inside to reach the upper floor,
which has its own locker, furniture and coins, but only one way back down. Bots use the stairs too.

The host picks the map in the lobby with **Next map**.

| Map | Setting | Hiding spots |
| --- | --- | --- |
| **Dusk Hollow** | A town at sunset with eleven houses (three of them two-storey), a warehouse and a hedge maze | Bushes, lockers, dumpsters |
| **Frostpine Camp** | A snowy campground in daylight with cabins, three two-storey chalets, a lodge and a frozen pond | Tents, snowdrifts, lockers |
| **Midnight Docks** | A container yard at night with tight alleys, a warehouse and two two-storey offices | Open containers, lockers, dumpsters |
| **Pirate Cove** | A sunny beach with huts, palms, a shipwreck, an inn and a lagoon | Rowboats, bushes, lockers |
| **Haunted Graveyard** | A foggy graveyard at midnight with crypts, a chapel and two haunted mansions | Coffins, bushes, lockers |
| **Moonbase Alpha** | A base on the Moon with habitat modules and a hangar. Low gravity: jumps go nearly three times as high | Escape pods, boulder piles, lockers |
| **Candy Kingdom** | Gingerbread houses, lollipop trees, a cake castle and a chocolate lake | Gift boxes, gumdrops, lockers |
| **Dusty Gulch** | A wild-west main street with a saloon, a hotel, a barn and a lot of cactus | Covered wagons, hay bales, lockers |
| **Dino Jungle** | A misty jungle with huts, a ruined temple, a swamp and old bones | Giant eggs, ferns, lockers |
| **Coral Reef** | The sea floor, with coral forests, a sunken galleon and a palace. Floaty gravity: jumps go nearly twice as high | Giant clams, kelp, lockers |
| **Neon City** | A city at night with glowing signs, shops, an arcade and parked cars | Dumpsters, cardboard boxes, lockers |

### Vehicles

Every map has fourteen vehicles, always parked outdoors. Stand next to one and press **E** to climb in or out, then drive with the move keys
(or the joystick on a phone).

| Vehicle | Top speed | A full tank lasts | Notes |
| --- | --- | --- | --- |
| The map's own ride (go-kart, snowmobile, forklift, beach buggy, ghost cart, moon rover, cupcake car, buckboard, safari jeep, mini submarine, hover taxi) | 12.5 m/s | about 310 m | The all-rounder; four per map |
| Scooter | 10 m/s | about 300 m | Narrow enough to ride through doorways, and turns on the spot |
| Monster truck | 10.5 m/s | about 525 m | Wide and slow to turn, but the tank goes on and on |
| Hoverboard | 14 m/s | about 175 m | Silent: no engine pings |
| Rocket car | 19 m/s | about 210 m | By far the fastest, with a very wide turning circle |
| Bumper car | 9.5 m/s | about 365 m | Bounces off whatever it hits, and spins on the spot |
| Motorbike | 16 m/s | about 265 m | Fast and narrow enough for doorways |
| Tractor | 7.5 m/s | about 750 m | Barely faster than a sprint, but it almost never runs dry |
| Shopping cart | 8.6 m/s | never runs out | No engine: silent and needs no fuel |

- No vehicle can climb stairs. Only the scooter, hoverboard, motorbike and shopping cart fit through doorways.
- Engines are the loudest thing on the map: seekers see a ping every half second while a hider drives.
- Fuel is burned per metre driven. An empty vehicle only crawls until it has rested.
- Seekers can drive too, and can tag from the driving seat. Getting caught throws you out.
- Bots do not drive.

### Places to jump off

- **Lookout towers** (three or four per map): an open deck one storey up, with stairs on one side and no rail on the
  other three. Run straight off the edge.
- **Jump pads**: the glowing disc beside each lookout launches you about five metres up. Keep moving towards the
  tower and you land on its deck.
- **Balconies**: every two-storey house has one upstairs, open at the front.
- A long drop lands with a thump that seekers can hear and costs a little stamina. Bots take the stairs.

### Things to do

- Hide inside the map's hiding spots (**E**), or behind cars, crates, containers and hedges.
- **Light the beacons.** Each map has three. A hider who holds **E** at one for 4 seconds lights it (+40), but it hums while charging and announces itself when lit. Light all three and the hiders win on the spot.
- **Grab power-ups** from the purple **?** boxes (they return after 30 seconds) and use them with **G**:
  hiders get an energy drink (8 s of endless, silent sprinting) or a shadow cloak (6 s invisible to seekers);
  seekers get radar (pings every hider in the open) or rocket boots (7 s of extra speed).
- **Finish your challenge.** Everyone gets a personal goal each round, such as "Collect 4 coins" or
  "Find someone inside a hiding spot", worth +75.
- Collect around 50 coins scattered around the map, some of them upstairs (+10 each).
- Stage a jailbreak, or guard the cage.
- Jump with **Space**, and chat with **Enter**.

### Controls

Keyboard and mouse: `WASD` move · `Shift` sprint · `Space` jump · `C` crouch · `E` use / hide / search · `Click` or `F` tag ·
`Q` rock · `T` taunt · `G` power-up · `R` change prop · `Enter` chat · `Esc` menu

Phone or tablet: drag the left side of the screen to move (push the stick to its edge to sprint), drag anywhere
else to look, and use the on-screen **USE**, **TAG**, **CROUCH**, **JUMP**, rock, taunt and power-up buttons. Landscape works best.

## Three ways to play

| Mode | Where the game runs | Who can join |
| --- | --- | --- |
| **Play online** on the Node server | `server.js` | Anyone who can reach the server, by room code or invite link |
| **Play solo with bots** | In your own browser tab | Just you and seven bots |
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
| `public/shared/world.js` | The eleven maps (each generated from a fixed seed), collision, line of sight, pathfinding |
| `public/js/net.js` | The three connection modes above |
| `public/js/main.js` | Client: input (keyboard, mouse, touch), movement, HUD |
| `public/js/gfx.js` | Three.js scene, the character models and picker preview, effects |
| `public/js/audio.js` | Synthesised sound effects |
| `test/` | `npm test`: checks every map is fully reachable, plays every mode on every map with bots, drives a vehicle through the rules, plays a full round on the server, and runs a hosted game through a fake realtime room |

The game module referees tags, hiding spots, coins, jail and rescues. Player movement is
client-side with a loose sanity check, so this is fine for playing with friends but is
not hardened against cheating.
