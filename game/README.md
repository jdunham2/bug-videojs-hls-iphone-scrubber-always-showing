# Mischief Lane (vertical slice)

A top-down sandbox where you play a raccoon loose in a village.

## Run it
Open `game/index.html` in any browser. There's no build step and no dependencies.

## Controls
| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | WASD / Arrow keys | Drag anywhere |
| Run | Hold Shift | Drag far |
| Grab / drop / pet an animal | E | "grab" / "drop" button |
| Throw | F |
| Eat what you're carrying | Q | "eat" button | "throw" button |
| Chitter (hop, scare butterflies, drop what's in your mouth) | Space | "chitter" button |
| Toggle minimap | M | — |
| Show / hide to-do list | T | "To-do" tab |
| Mute sound | N | — |

## What's in the game
- **Runs ("days")**: every day is a freshly generated village (roads, plaza, pond, garden and houses shuffled
  around), a hand of tasks from a pool of 55, a clock until sunset (the world warms and dims as it runs out) and a
  few strikes before you're out. Harder days ask for more and villagers get faster and sharper-eyed.
- **The den**: shinies from tasks (plus time and day bonuses on a win) buy upgrades that carry over between days:
  Quick Paws, Strong Back, Light Step, Big Chitter, Thick Fur, Long Day, Slippery. Progress is saved in your browser.
  Losing a day resets the streak to Day 1, but upgrades stay.
- **Houses you can go into**: push up into a front door to go in, walk out over the mat to leave. Every house has a
  furnished room (bed, fireplace or stove, shelves, wardrobe, table, rug) with things on the table and lying around.
  Villagers go home during their rounds, so a house isn't always empty, and they'll chase you round their own kitchen.
- **Seven villagers**: Bertram (gardener), Mrs. Fennick (neighbour), Rosa (picnicker), Toby (her son), Percy (postman,
  fast), Granny Mabel (knits on her doorstep, slow) and Ollie (fisherman). Each has a daily round worked out from the
  village layout, owns certain things, and will chase you if they see you carrying them. Vision is a cone, blocked by
  houses and walls. Caught? They snatch it back, shove you, and you lose a strike.
- **~105 things to grab per village** (about a third indoors): pies, cakes, teapots, teddy bears, cookie jars, crops,
  crates, a wheelbarrow, parcels, milk bottles, a kite, a fishing rod, yarn, gnomes... Light things go in your mouth,
  heavy ones overhead. Throw them, sink them, float them, or stash them in your hideout.
- **Hiding bushes**: big walk-in shrubs (about 18 per village, many beside houses and the garden). Inside one,
  villagers can't see you unless they walk right into it; your eyes peek out and a "Hidden" pill shows. You can't
  hide carrying something heavy, and running makes the leaves rustle. Duck in mid-chase and chasers lose track.
- **Biscuit the dog** (Bertram's): wanders near his bed and sniffs you out (bushes don't fool his nose), barks so
  villagers turn to look, and knocks things out of your mouth to carry back to his bed. Throw something near him
  and he fetches it instead. Press E next to him to pet him and he follows you around as a friend for a while.
  He guards his bone. The Dog Treats upgrade makes him start each day friendly.
- **Hiding under beds**: crawl under any bed from its foot end. Same rules as bushes; a lump appears under the
  blanket and your eyes peek out. Villagers walk round beds, so they won't find you unless they bump into you.
- **Marmalade the cat** (Mrs. Fennick's): ignores you. Naps in cosy spots (armchair, bench, doorstep, garden),
  wanders through doors, and knocks things off tables. Biscuit chases her on sight, which keeps him off your back;
  chitter at her and she hisses and bolts, so you can herd her toward him. Pet her while she naps for a purr.
- **Fragile things** (vases, teapots, frames, cookie jars, milk bottles) smash if they hit the floor hard, whether
  you threw them or the cat swatted them. Nearby villagers turn to see what broke.
- **Eating people's food**: carrying pie, cake, cookies, a sandwich, bread, cheese, an apple, a carrot, cabbage,
  a pumpkin or milk? Press Q to eat it, bite by bite (stand still; it shrinks each bite). Your tummy fills (bar in
  the run bar) and slowly digests. Overeat and you're Stuffed: rounder, slower, no running. Sweets give a 12 s
  sugar rush. Munching is noisy (nearby villagers turn to look), Biscuit smells food from farther away, and owners
  who watch you finish their food are outraged.
- **Hiding in wardrobes**: stand in front of one and press E to climb in (not with anything heavy); move or press E
  to step out. Nobody can see you in there, but a villager who watched you climb in will open the doors.
- **Online** (when opened from the claude.ai link; offline play is unchanged):
  - *Play together live*: villages are daily (the same village for everyone on the same day number today, UTC),
    and each village has a live room. Friends in it show up as raccoons with name tags, colour scarves and minimap
    dots; you see them move, carry things, eat, chitter and hide. Only raccoons are shared: each player's villagers
    and items are their own.
  - *Leaderboard*: best day reached and lifetime shinies, shown in the den. Saving a score needs Contributor
    access (or ownership) on the artifact.
- **Hideout**: a hollow log at one end of the road. Things in its nest are safe, and villagers won't follow you in.

## Code layout (`game.js`)
- **Map**: `buildMap()` lays out tiles and places objects (seeded RNG, same village every time)
- **Items**: `ITEM` table (name, size, heavy, floats, draw), `placeItems()`, `updateItems()` physics, `grabOrDrop()` / `throwHeld()`
- **Village generator**: `genLayout()` + `buildMap()` (roads, plaza, pond, garden, houses, carved paths),
  `newVillage(seed)` rebuilds everything for a run
- **Interiors**: `buildInteriors()` puts a room per house in a hidden strip below the map; `areaOf()`, doors in
  `updateDoors()`, villagers cross doors with `travel()`
- **Villagers**: `VILLAGER_DEFS` (looks, speeds, lines), `stopsFor()` (daily round from the layout),
  `updateVillagers()` state machine (route → act, chase, fetch, return, sulk, startled), A* `findPath()`, `canSee()`
- **Hiding & dog**: `makeHideBush()`, `updateHiding()`, `canSeePlayer()`; `spawnDog()`, `updateDog()` state machine
  (sit, wander, alert, chase, catchase, fetch, return, happy, follow); `spawnCat()`, `updateCat()` (nap, stroll,
  swat, sit, flee), `shatter()` for fragile items, `lookTowards()` for noises
- **Online**: `dailySeed()`, `initOnline()`, `joinVillageRoom()`, `syncPeers()`/`updateOnline()` (room presence),
  `subscribeScores()`/`postScore()`/`renderBoard()` (db `scores/<user id>`)
- **Eating**: `FOOD` table, `startEating()`, `updateEating()` (bites, tummy, stuffed, sugar rush), `finishFood()`
- **Runs**: `TASK_POOL`, `setupRun()`, `endRun()`, `UPGRADES` + the den, save in `localStorage`
- **To-do list**: run's task hand, `completeTask()` / `setProgress()` called from game events, `checkTasks()` for
  polled conditions; notepad markup + styles live in `index.html`
- **Objects**: `make*()` factories return `{x, y, hitbox, bounds, draw, shadow}`; add new props here
- **Player**: `updatePlayer()` (movement/collision) and `drawRaccoon*()` (rendering)
- **Render**: `render()` draws ground → shadows → y-sorted objects → UI
