# Mischief Lane (vertical slice)

A top-down sandbox where you play a raccoon loose in a village.

## Run it
Open `game/index.html` in any browser. There's no build step and no dependencies.

## Controls
| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | WASD / Arrow keys | Drag anywhere |
| Run | Hold Shift | Drag far |
| Grab / drop | E | "grab" / "drop" button |
| Throw | F | "throw" button |
| Chitter (hop, scare butterflies, drop what's in your mouth) | Space | "chitter" button |
| Toggle minimap | M | — |
| Mute sound | N | — |

## What's in the slice
- Hand-drawn (procedural canvas) raccoon with 4 facing directions, walk cycle, ringed tail, idle breathing
- 72×52 tile village: plaza with well, roads, 6 houses, fenced vegetable garden, pond with lily pads, stream + bridge, forest border
- Collision against water, houses, trees, fences and props (slides along walls)
- Y-sorted depth: walk behind trees and houses; tree canopies fade when you're behind them
- **Picking things up**: ~55 items (pie, crops, crates, barrels, gnomes, hats, apples, a rubber duck, ...)
  - Light items go in your mouth; heavy ones (crates, barrels) are carried overhead, slow you down and block movement when set down
  - Throw with arcs, bounces, spin; things fly over low fences
  - Things that land in the pond splash: some float and drift, others sink for good
  - Crops start planted and get pulled up; kick the beach ball by running into it
  - Synthesized sound effects (no audio files)
- **Villagers**: Bertram (gardener), Mrs. Fennick (neighbour), Rosa (picnicker), Toby (kid)
  - Daily routines with A* pathfinding around houses, fences and water; idle chatter with little voice blips
  - Each owns certain items (the prompt says whose: "Rosa's pie"). If they **see** you holding their stuff: "!" and a chase
  - Vision is a cone in front of them blocked by houses/trees, so sneak up from behind
  - Caught? They snatch it back, shove you, and carry it home (crops get replanted, the pie goes back on the table)
  - They notice their things lying in the wrong place and tidy them up; floating/sunk items make them sulk
  - Chitter near them or hit them with a thrown item and they jump, dropping whatever they carry. Hit them with
    something that isn't theirs and they chase you off
  - Toby plays with his beach ball; Rosa and Mrs. Fennick complain when their pie/sandwich/hat is missing
- Smooth camera with look-ahead, minimap, drifting cloud shadows, butterflies that flee, running dust

## Code layout (`game.js`)
- **Map**: `buildMap()` lays out tiles and places objects (seeded RNG, same village every time)
- **Items**: `ITEM` table (name, size, heavy, floats, draw), `placeItems()`, `updateItems()` physics, `grabOrDrop()` / `throwHeld()`
- **Villagers**: `VILLAGER_DEFS` (looks, speeds, routine stops, lines), `updateVillagers()` state machine
  (route → act, chase, fetch, return, sulk, startled), `findPath()` A* over the `nav` grid, `canSee()`
- **Objects**: `make*()` factories return `{x, y, hitbox, bounds, draw, shadow}`; add new props here
- **Player**: `updatePlayer()` (movement/collision) and `drawRaccoon*()` (rendering)
- **Render**: `render()` draws ground → shadows → y-sorted objects → UI
