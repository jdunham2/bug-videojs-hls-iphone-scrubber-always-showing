# Mischief Lane (vertical slice)

A top-down sandbox where you play a raccoon loose in a village.

## Run it
Open `game/index.html` in any browser. There's no build step and no dependencies.

## Controls
| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | WASD / Arrow keys | Drag anywhere |
| Run | Hold Shift | Drag far |
| Grab / drop / pet the dog | E | "grab" / "drop" button |
| Throw | F | "throw" button |
| Chitter (hop, scare butterflies, drop what's in your mouth) | Space | "chitter" button |
| Toggle minimap | M | — |
| Show / hide to-do list | T | "To-do" tab |
| Mute sound | N | — |

## What's in the game
- **Runs ("days")**: every day is a freshly generated village (roads, plaza, pond, garden and houses shuffled
  around), a hand of tasks from a pool of 41, a clock until sunset (the world warms and dims as it runs out) and a
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
  (sit, wander, alert, chase, fetch, return, happy, follow)
- **Runs**: `TASK_POOL`, `setupRun()`, `endRun()`, `UPGRADES` + the den, save in `localStorage`
- **To-do list**: run's task hand, `completeTask()` / `setProgress()` called from game events, `checkTasks()` for
  polled conditions; notepad markup + styles live in `index.html`
- **Objects**: `make*()` factories return `{x, y, hitbox, bounds, draw, shadow}`; add new props here
- **Player**: `updatePlayer()` (movement/collision) and `drawRaccoon*()` (rendering)
- **Render**: `render()` draws ground → shadows → y-sorted objects → UI
