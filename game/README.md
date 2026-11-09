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
- **Map (M, or 🗺️ on touch):** a shaded map of the island with fog of war that lifts as you
  explore, plus place names and markers for you, your tames, buildings and your bed. A
  corner minimap (desktop) shows nearby creatures, with hostile ones in red.
- **Metal age:** orange-veined metal ore in the northern mountains (use a pick). A Forge
  smelts 2 ore + 1 wood into an ingot while lit, and unlocks the Metal Pick, Metal Hatchet,
  Metal Sword and Metal Armor.
- **Armor:** Hide Armor (blocks 25%) and Metal Armor (blocks 50%). Tap one twice in the
  inventory to wear it; it wears down as you take hits.
- **Base items:** Storage Box (24 slots), Sleeping Bag (sets your respawn point and lets you
  sleep through the night), stone floors, walls and doorways.
- **Building:** placement ghost with grid snapping, walls that snap to floor edges (rotate
  with R), and wall collision. Campfires give light and cook raw meat.
- **Creatures:** ten species with herd/pack behaviour and a predator-prey food chain:
  - Pudgewing: skittish bird
  - Dashbeak: tiny pack scavenger that nips at your heels
  - Crestcaller: fast, skittish crested herbivore that runs in herds; rideable
  - Trikeros: neutral horned herbivore; rideable
  - Domehead: neutral, thick-skulled head-butter in the hills
  - Ironhide: armoured, slow, takes much less damage, club tail; rideable, mines rock fast
  - Talonrunner: pack raptor; rideable
  - Spinesail: sail-backed predator that stalks the beaches and wades into water; rideable
  - Thunderneck: giant sauropod
  - Gorgonax: apex predator, found in the north; rideable
  - Galewing: skittish pterosaur that circles the island and perches to rest; tame with meat, rideable flyer
  - Thunderwing: huge aggressive pterosaur of the northern peaks that dive-bombs prey; rideable flyer
- **Taming:** build up torpor with tranq arrows or a club to knock a creature out, then
  feed it its preferred food. Dozeberries keep it asleep. Tamed creatures follow or stay
  (F) and defend you.
- **Flying:** tranq a pterosaur out of the sky (it falls when knocked out), tame it with
  meat, saddle it and press Space (Jump on touch) to take off. Fly where you look, hold W
  to go forward and Shift to boost. Space/C climb and descend, and descending onto dry land
  lands you. Jumping off high up hurts.
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
| M | World map |

### Saving

Progress saves automatically: after important actions (at most every 20 s), at least once a
minute, and when you leave the tab. You can also save by hand from the inventory or pause
menu. The title screen offers **Continue** or **New game** (tap twice to erase).
When the game runs as a claude.ai artifact it saves to your account, privately. Otherwise it
saves to browser storage. Saves include your stats, inventory, objectives, buildings, tames
and the time of day.

### Touch (phones and tablets)

Touch controls turn on automatically on touch screens, and quality defaults to Performance.
Drag anywhere on the left side for a joystick and swipe on the right side to look.
The buttons are Hit (hold to attack), Use, Jump, plus Run and Sneak toggles.
The 🎒 button opens inventory and crafting, and you tap a hotbar slot to equip or eat.
Landscape plays best.

Three.js (MIT) is vendored in `vendor/`.
