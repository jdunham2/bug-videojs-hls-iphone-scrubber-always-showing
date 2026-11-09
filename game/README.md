# Isle of the Primal — survival vertical slice

An original open-world dinosaur survival game in the spirit of the survival/taming genre,
built with Three.js and running in the browser. Everything is procedural: the island,
vegetation, creature models, animation and audio. There are no external art or sound assets.

## Run it

ES modules need to be served over HTTP (opening the file directly won't work):

```bash
cd game && python3 -m http.server 8080
```

Then open http://localhost:8080. Add `?quality=low` for weaker GPUs.

## What's in the slice

- **World:** a 900 m procedural island with beaches, lowland forest, a lake basin and a
  snow-capped northern peak. It has a day/night cycle with sun, moon and stars, animated
  water with shoreline foam, wind-blown grass and trees, and drifting clouds.
- **Survival:** health, stamina, food and water. You can drink from water, eat from the
  hotbar, take fall damage and drown when your stamina runs out.
- **Gathering:** punch or use tools on trees, rocks and bushes to get wood, stone, flint,
  fiber, wildberries and dozeberries. Tools have durability and break.
- **Crafting (Tab):** hatchet, pick, club, spear, bow, tranq arrows, saddle, campfire and
  timber floor/wall/doorway.
- **Building:** placement ghost with grid snapping, walls that snap to floor edges (rotate
  with R), and wall collision. Campfires give light and cook raw meat.
- **Creatures:** five species with herd/pack behaviour and a predator-prey ecosystem:
  - Pudgewing: skittish bird
  - Trikeros: neutral herbivore, rideable
  - Talonrunner: pack raptor
  - Thunderneck: giant sauropod
  - Gorgonax: apex predator, found in the north
- **Taming:** build up torpor with tranq arrows or a club to knock a creature out, then
  feed it its preferred food. Dozeberries keep it asleep. Tamed creatures follow or stay
  (F) and defend you.
- **Riding:** saddle a Trikeros, Talonrunner or Gorgonax and press E to ride in third
  person. Mounted creatures attack and gather.
- **Progression:** XP and levels, plus an 8-step guided objective chain covering the core
  loop.

## Controls

| Key | Action |
| --- | --- |
| WASD / Shift / Space / C | Move / sprint / jump or swim up / crouch (sneak) |
| Mouse / LMB | Look / attack, harvest, place |
| E | Use: feed, ride or dismount, drink, pick berries, light fire |
| F | Toggle a tame between follow and stay |
| Tab or I | Inventory and crafting |
| 1–8 / wheel | Hotbar; selecting food eats it |
| R | Rotate the building piece |
| V | Zoom the mount camera |

### Touch (phones and tablets)

Touch controls turn on automatically on touch screens, and quality defaults to Performance.
Drag anywhere on the left side for a joystick and swipe on the right side to look.
The buttons are Hit (hold to attack), Use, Jump, plus Run and Sneak toggles.
The 🎒 button opens inventory and crafting, and you tap a hotbar slot to equip or eat.
Landscape plays best.

Three.js (MIT) is vendored in `vendor/`.
