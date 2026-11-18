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
- **Seasons and village kinds**: every daily village rolls one of four seasons and one of six kinds.
  - *Spring*: blossom trees, drifting petals, Mrs. Fennick's tulip beds to trample, painted eggs hidden by bushes.
  - *Summer*: washing drying on lines (steal it), Rosa's lemonade on the picnic table.
  - *Autumn*: orange and red trees, falling leaves, chimney smoke, leaf piles to jump in (noisy) or hide in.
  - *Winter*: snow, bare and snowy trees, snow on roofs, scarves, falling snow, pawprints, frozen ponds and rivers
    you can slide across, snowmen to knock down, and E on the snow scoops a snowball to throw.
  - *Pond*, *riverside* (a river runs across the map; the road crosses on bridges; floating things drift
    downstream) or *seaside* (a beach and sea along the south edge, a pier, a rowing boat, seashells, Ollie's fish).
  - *Market*: market day, with four stalls on the plaza (Rosa's bakery, Bertram's fruit and veg, Ollie's fish,
    Percy's toys). The stallholders spend the morning behind their stalls shouting their wares, and there's a
    fruit cart to run into (apples everywhere).
  - *Windmill*: a windmill on the hill (its sails spin faster in the wind), flour sacks that burst into a cloud
    when thrown (walk through it and you come out white, and villagers who see you think you're a ghost), a
    wheat field to hide in, and a hay barn with a haystack to hide in.
  - *Lakeside*: a big lake with an island in the middle and a jetty. Press E by the rowing boat to climb in,
    row anywhere on the water, and E again to climb out onto the nearest land; villagers can't follow you to
    the island. There's also a fishing contest with a prize fish on the table.
- **Village events**: some days (about 2 in 5) there's something on, depending on the season:
  - *Village fete* (spring, summer): bunting, and a cake contest with three cakes and a first-prize rosette.
  - *Wedding* (spring to autumn): a flower arch, rows of chairs, confetti, a bouquet and a three-tier cake.
  - *Bonfire night* (autumn, winter): a bonfire, toffee apples, a box of rockets (throw one in the fire to set
    it off; every villager nearby jumps), and fireworks once dusk falls.
  - *Scarecrow festival* (summer, autumn): prize scarecrows around the village, waiting to be knocked over.
  - Every village also has a hen house: hens panic and squawk when chased (loud enough to make villagers look)
    and their eggs can be stolen, eaten or smashed.
- **Weather**: each village also rolls weather that suits its season.
  - *Rain*: rain, a darker sky, puddles to splash through, villagers under umbrellas who see and hear less.
  - *Thunderstorm*: rain plus lightning; every thunderclap makes villagers jump (dropping things), panics the
    hens, sends the cat running and has Biscuit whimpering.
  - *Fog* (autumn, winter): thick mist with a clear patch around you; villagers can barely see.
  - *Snowstorm* (winter): heavy, wind-blown snow and poor visibility. *Windy*: thrown things drift off course.
  - *Hail* (spring, autumn): bouncing hailstones; villagers drop what they're doing and run home to shelter.
  - *Heatwave* (summer): a hazy, sweltering day; villagers move slowly and doze off on benches, and a dozing
    villager sees nothing (steal right from under their nose).
  - *Drizzle*: light rain that brings out the frogs. *Downpour*: torrential rain, huge spreading puddles, and
    villagers barely see or hear a thing; run through a puddle next to one to soak them.
  - *Whirlwind* (on windy days): a dust devil that wanders the village, flinging things into the air and
    sending you spinning if it catches you.
  - *Frost* (autumn, winter): icy, slippery paths; villagers chasing you along them may slip and fall.
  - The weather can change partway through the day; the morning card gives the forecast, and a toast tells you
    when it turns. When rain clears up, a rainbow appears with a pot of gold at its end (+3 shinies).
- **Animals**: ducks on the pond and river (they quack and flee, and eat any food dropped near them),
  sparrow flocks that scatter when you run at them (they shelter from bad weather), squirrels that dash up
  trees (and Biscuit barks up the tree, drawing villagers' eyes), frogs by the water in rain and spring, and
  seaside seagulls that swoop down and steal food out of your mouth (chitter to scare them off).
- **The farm**: most villages have a fenced field with a gate and a trough. Sheep baa and bunch up when you run
  at them (herd them out through the gate), a cow moos and plods off, and a goat by the gate eats anything
  left lying around (newspapers, hats, washing) and charges if you chitter at it, headbutting you over.
- **Wild animals**: a fox that sneaks out of the woods to raid the hen house (run or chitter at it to chase it
  off), rabbits around the garden that bolt in zig-zags, a grumpy badger at dusk that charges if you get too
  close, and deer at the forest edge that you can only sneak up on by freezing whenever they look up.
- **Water and sky**: fish in the pond (wait quietly at the edge and one may leap into your paws), a swan that
  hisses and chases you off, a beehive by the garden in spring and summer (bump it and a swarm chases you;
  lead it to a villager, or hide in a bush to lose it, and grab the honey), and butterflies you can catch
  if you walk rather than run.
- **Pets and pests**: a parrot on a perch that repeats what villagers say and shouts "THIEF!" if you carry
  someone's things past it, a pig in a mud wallow (roll in it and you leave muddy pawprints everywhere, even
  indoors, until a puddle or the rain washes you off), mice indoors that send villagers shrieking if you
  chase one at them, and Pepper, a yappy terrier who gives you away until you win her over with a snack.
- **At dusk** (the last part of the day, not in winter): windows light up, hedgehogs snuffle out from the
  bushes and curl into a ball when startled, an owl on a tree hoots an alarm if it spots you, and fireflies
  drift about to be caught.
- **Runs ("days")**: every day is a freshly generated village (roads, plaza, pond, garden and houses shuffled
  around), a hand of tasks from a pool of 124 (filtered to what the season and village allow), a clock until sunset (the world warms and dims as it runs out) and a
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
- **Seasons**: `SEASON_LOOK`, `placeSeasonal()` / `placeSeasonalItems()`, `updateSeason()`, hens (`updateHens()`),
  `pickWeather()`, `updateWeatherFx()` (puddles, lightning), `spawnCritters()` / `updateCritters()` (ducks,
  sparrows, squirrels, frogs, gulls); tint;
  farm and night: `planWeather()` / `setWeather()` / `updateWeatherPlan()`, `startRainbow()` / `drawRainbow()`,
  `buildPaddock()`, `spawnFarmNight()` / `updateFarmNight()` / `drawFarmNight()` (sheep, cow, goat, hedgehogs,
  owl, fireflies), `updateDusk()`; wild animals and pets: `buildWilds()` (beehive, mud wallow, perch),
  `spawnWilds()` / `updateWilds()` / `wildScare()` / `drawWilds()`, `updatePup()`, `parrotHear()`,
  `updateWildsWorld()` (hive, mud, whirlwind), `drawWhirl()`, `drawFrost()` / `frostSlip()`;
  new villages and events: `buildKindEarly()` / `buildKindLate()` / `placeKindItems()` (stalls, cart, windmill,
  wheat, barn, jetty, contest, event decorations), `buildLakeIsland()`, `buildJetty()`, `boatAction()`,
  `withStall()` (stallholders' rounds), `updateKinds()` (rowing, cart, flour, scarecrows, fireworks), `pickEvent()`; `buildSea()` and the river in `buildMap()`; `taskFits()` + `dealTasks()`
- **Online**: `dailySeed()`, `initOnline()`, `joinVillageRoom()`, `syncPeers()`/`updateOnline()` (room presence),
  `subscribeScores()`/`postScore()`/`renderBoard()` (db `scores/<user id>`)
- **Eating**: `FOOD` table, `startEating()`, `updateEating()` (bites, tummy, stuffed, sugar rush), `finishFood()`
- **Runs**: `TASK_POOL`, `setupRun()`, `endRun()`, `UPGRADES` + the den, save in `localStorage`
- **To-do list**: run's task hand, `completeTask()` / `setProgress()` called from game events, `checkTasks()` for
  polled conditions; notepad markup + styles live in `index.html`
- **Objects**: `make*()` factories return `{x, y, hitbox, bounds, draw, shadow}`; add new props here
- **Player**: `updatePlayer()` (movement/collision) and `drawRaccoon*()` (rendering)
- **Render**: `render()` draws ground → shadows → y-sorted objects → UI
