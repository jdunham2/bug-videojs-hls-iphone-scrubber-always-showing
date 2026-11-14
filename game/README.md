# Mischief Lane (vertical slice)

A top-down sandbox where you play a raccoon loose in a village.

## Run it
Open `game/index.html` in any browser. There's no build step and no dependencies.

## Controls
| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | WASD / Arrow keys | Drag anywhere |
| Run | Hold Shift | Drag far |
| Chitter (hop + scare butterflies) | Space | "chitter" button |
| Toggle minimap | M | — |

## What's in the slice
- Hand-drawn (procedural canvas) raccoon with 4 facing directions, walk cycle, ringed tail, idle breathing
- 72×52 tile village: plaza with well, roads, 6 houses, fenced vegetable garden, pond with lily pads, stream + bridge, forest border
- Collision against water, houses, trees, fences and props (slides along walls)
- Y-sorted depth: walk behind trees and houses; tree canopies fade when you're behind them
- Smooth camera with look-ahead, minimap, drifting cloud shadows, butterflies that flee, running dust

## Code layout (`game.js`)
- **Map**: `buildMap()` lays out tiles and places objects (seeded RNG, same village every time)
- **Objects**: `make*()` factories return `{x, y, hitbox, bounds, draw, shadow}`; add new props here
- **Player**: `updatePlayer()` (movement/collision) and `drawRaccoon*()` (rendering)
- **Render**: `render()` draws ground → shadows → y-sorted objects → UI
