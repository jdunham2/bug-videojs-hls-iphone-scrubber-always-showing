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
- Smooth camera with look-ahead, minimap, drifting cloud shadows, butterflies that flee, running dust

## Code layout (`game.js`)
- **Map**: `buildMap()` lays out tiles and places objects (seeded RNG, same village every time)
- **Items**: `ITEM` table (name, size, heavy, floats, draw), `placeItems()`, `updateItems()` physics, `grabOrDrop()` / `throwHeld()`
- **Objects**: `make*()` factories return `{x, y, hitbox, bounds, draw, shadow}`; add new props here
- **Player**: `updatePlayer()` (movement/collision) and `drawRaccoon*()` (rendering)
- **Render**: `render()` draws ground → shadows → y-sorted objects → UI
