# Pinecone Prowler — roadmap

An original cozy stealth game: you are **Moss**, a shy forest giant raiding Hollowpine Campground for snacks while a developer, **Gideon Grube**, plans to pave it into a resort. Single file: `index.html` (HTML + canvas + vanilla JS, no build step). `window.__pp` exposes game state for headless testing.

## Done — Slice 1: core loop
- Top-down open world: den, forest, lake, 5 campsites, Snack Shack, Ranger Station
- Stealth: vision cones, line of sight, suspicion, bushes, noisy sprinting
- Ranger AI (patrol → investigate → chase → search); caught = drop backpack, sent home
- Raiding coolers, baskets, bins; backpack, hunger, stamina; den fridge and bed
- Day/night with lighting; raincoat disguise; coins and Snack Shack
- Pip the crow and a 6-step quest chain; autosave; keyboard and touch

## Done — Slice 2: the Town and the first job
- **3/4 tilted "diorama" camera** (closer to the original's look): ground is foreshortened, and pines, rocks, tents, tables, cars, lamps and buildings are drawn with height, walls and roofs, all depth-sorted with characters. Characters have legs, arms and walk cycles; trees fade when Moss walks behind them
- **Pinewick town** east of the campground: Main Street, sidewalks, crosswalk, the Stack 'Em Diner, Brambles General Store, Post Office, parking lot (with Grube's gold car), street lamps, bus stop, flagpole
- **Deputy Ruiz** patrols Main Street; townsfolk and pedestrians report an undisguised Moss to the nearest guard
- **Job system — Diner Line Cook**: 60-second ticket mini-game (9 ingredients, 7 recipes, harder ones unlock), tips for speed, accuracy bonus, grade, once per day, number-key shortcuts
- **Wardrobe** in the den + outfits from the store: Sweater & cap (silent running), Ranger-ish vest (guards barely notice)
- **Named townsfolk**: Dot Pickering (diner), Walt Brambles (store), Iris Okafor (post office), plus side quest *Special Delivery* (carry Iris's parcel to Gus at the Big Stump campsite)
- **Story**: eavesdrop on Grube and his assistant Kendra on the diner patio (11 AM–2 PM) → 30-day council-vote countdown in the HUD
- Save format v2 with automatic migration of Slice 1 saves

## Done — Slice 3: Proof, vehicles and the golf course
- **Drag-to-eat**: eating opens a close-up of Moss's face; drag food from the table into his mouth (mouth opens as food gets close, chomp animation). Picnic tables at every campsite now hold food you can feast on in place or drag into your backpack. Q / tapping a snack opens the same screen for backpack food
- **Camera & photo proof**: Iris sells a disposable camera. Photo mode (C) with a moving viewfinder; E snaps a real cropped photo of the scene. Evidence photos (footprints on the east lakeshore, mossy nest in the forest, fur tuft on the Elk Ridge fence) are scored on framing + distance (stars, /100), spoiled if someone sees you, and kept in a photo album on the desk in the den
- **Dr. Anita Holm** visits the Ranger Station 9–5; delivering the album triggers the species review and Grube's escalation
- **Hank Voss**, Grube's private eye, prowls the campground at dusk with a flashlight; if he photographs undisguised Moss the council vote moves up 2 days (once per day)
- **Vehicles**: bicycle (Brambles, 15 coins) and Walt's pickup (side quest *Truck Trouble*: fetch his tackle box from the lakeshore). E to get on/off, momentum, honk (H), noisy and more noticeable when undisguised
- **Pinewick Golf Club** north of town: 3-hole golf mini-game (aim, oscillating power meter, wind, sand, water penalties), 5-coin entry, prizes, best-score board
- **Caddy job**: 8 timed shots, hand Mrs. Thistlewood the right club for the lie and distance, once per day
- Save format v3 with migration from v1/v2 saves; touch controls gained a Cam button and Run becomes Honk while riding

## Done — Slice 4: Fishing, foraging and a dog
- **Hollowpine Highway**: one long paved loop road (yellow centre line) connecting the den, the campground, Pinewick's Main Street, the east side, the Bait & Tackle, the lake and back. Four cars drive it, stop and honk when Moss is in the way, and report an undisguised Moss
- **Fishing**: rod from Brambles (12). Cast from any lakeshore or the new wooden dock: hold to wind up (farther = bigger fish), hook when the bobber dips, then a reel/tension mini-game. 8 species (pumpkinseed to golden trout) depend on time of day, cast distance and rain. Fish log, bucket of 10, sell at **Bait & Tackle** (Marge) or cook at the den fire pit / any campfire into smoked fish
- **Foraging**: mushrooms spawn daily in the forest (chanterelle, morel, rare porcini, and the poisonous jack-o'-lantern look-alike). Basket of 12; the forager's guidebook on the den desk fills in; sell to Dot (she bins the poisonous ones)
- **Biscuit the dog**: a stray near the south of camp; feed her on 3 different days to adopt. Follow / Sit-and-stay / Sniff commands. Bark (B) makes everyone near her look at her for 5 s. Sniff mode shows a hot/cold meter to buried truffles under leafy trees (25 coins at the diner)
- **Weather**: 30% rain days: darker, rain particles, puddles with ripples, campers stay in tents 2 hours out of 3, fish bite faster and rare fish appear, the evidence footprints wash away
- **Story**: Grube's bulldozer crew (Big Earl and Deb by day, Stu the watchman by night) clears a forest corner east of the den. Hide the bulldozer keys and swap the crew's lunch in one night to win back a day on the council countdown
- Save format v4 with migration from all older saves; touch controls gained a Bark button

## Done — Slice 5: The mountain and the lake
- **The mountain**: the world now extends 1000 units north. A snowy mountain sits above the golf course with snowy pines, rocky peaks, a groomed ski run, a trail from the golf club, the **Ski Lodge** (Ingrid) and a **chairlift** with moving chairs and a liftie (Olaf). The rest of the new northern strip is dense forest
- **Skiing**: rent skis (6, for the day). Downhill time trial from the chairlift: steer through 12 gates, avoid trees, penalties for misses and crashes, prizes and a best-time board. **Ski patrol** job (once per day): rescue 6 stranded skiers on the way down. Hot cocoa at the lodge. Rain days become snow on the mountain
- **Canoe**: rent at the Bait & Tackle (5, for the day); it waits at the end of the dock. Paddle anywhere on the lake; get out near any shore, the dock or the island
- **Swimming**: Moss can wade and swim in the shallow ring of the lake (slow, drains stamina; when it runs out he scrambles ashore). Deep water stays off limits
- **Mystery island** in the middle of the lake (canoe only): Grandpa Root's cairn with his journal, 40 coins and a golden pinecone
- **Scuba**: buy gear (20). Paddle to the three bubbling dive spots and dive: side-view underwater mini-game with an air meter, lost items to collect, a grumpy pike that steals air, and a sunken treasure chest (60 coins + antique compass). Marge buys lake finds
- **Story**: search the site office trailer at night for Grube's bribe letter to Dr. Holm, mail it to the Gazette through Iris, and the council vote is delayed a week
- **The Pinewick Gazette**: a newspaper each morning with a headline built from what happened yesterday (bribe scandal, sabotage, Voss photos, the species review) plus local filler, weather and the countdown
- **Map (M)**: the whole world with the highway, buildings, trees, discovered places (12 to find), you, Biscuit and your goal star. **Menu (Esc)**: sound volume, newspaper on/off, reread today's paper, save now, start over. Map and Menu buttons sit beside the backpack
- Save format v5 with migration from all older saves; settings are stored separately

## Done — Slice 6: Town life
- **New town buildings**: Pinewick Clinic and Police station on the south side of Main Street, facing a new paved **town square** with a fountain; **Pixel Palace** arcade on Main Street (flashing neon)
- **Clinic job** (Dr. Patel, 8 AM–6 PM, once a day): 8 patients, match their symptoms to one of 6 remedies before the timer runs out (cheat sheet included)
- **Police desk job** (8 AM–8 PM, once a day): sort 8 reports into Traffic / Lost & found / Noise / Wildlife, answer the radio when it flashes, and quietly shred Bigfoot sightings. Shredded reports mean guards sometimes shrug off calls the next day
- **Arcade** (10 AM–10 PM): tokens (3 for 2 coins), three original canvas games (Worm Hunt, Timber Drop, Highway 9) with keyboard and touch controls, top-5 boards with initials entry, 5-coin bonus for a new #1
- **Home upgrades** (Home catalog on the den desk): bigger fridge (12 → 30), second backpack row (6 → 12 slots, shown as two rows), trophy shelf (biggest fish, golden pinecone, ski medal, golf trophy, photos, compass), rug colours (red, blue, green, plaid) and cave wall styles (bare, pine mural, starry ceiling)
- **The town reacts**: a rally in the town square (sign-waving ralliers, Dot's speech), SAVE HOLLOWPINE buttons on townsfolk and campers, and a **petition** quest: 10 signers around the valley, each with a small favour (a mushroom, a fish, a sandwich, a cocoa, a ski run, a police shift…)
- **Story finale for Voss**: Hank Voss stakes out the den. Buy joke bigfoot slippers, stomp a fake trail at 3 spots, have Biscuit bark near him, and he follows it to photograph a moose. Grube fires him; the Voss dusk patrols end
- Newspaper headlines for the rally, the petition, the moose and the "misfiled" Bigfoot reports
- Fixes: an adopted Biscuit no longer steals the E prompt from people and doors; bushes no longer grow inside the den or over buildings
- Save format v6 with migration from all older saves

## Done — Slice 7: Birds and badges
- **Birdwatching**: 20 bird species (robin, chickadee, Steller's jay, pileated woodpecker, great horned owl, heron, loon, mallard, kingfisher, bald eagle, ptarmigan, nutcracker, raven, sparrow, pigeon, rufous hummingbird, goldfinch, waxwing, evening grosbeak, snowy owl) spread across forest, lake, mountain, town, campground and the sanctuary. Each has its own time of day, and some only come in certain seasons. Birds hop and peck, and fly off if Moss walks too close (wider if he runs or drives; hiding in a bush keeps them calm). Camera photos of birds are scored (centred, size by distance, perched, rarity) and fill a **bird guide** on the den desk
- **Binoculars** (Brambles, 10 coins; V key or Binoc button): a twin-lens zoom that names the bird in view and its rarity
- **Rosa's bird sanctuary** north-west of the lake: meadow, feeders, a bird hide, and Rosa, who gives photo requests ("a Great blue heron, lakeshore, at dawn") for 18–34 coins
- **Ranger badge book**: 25 badges across the whole game, with a popup (batched as "+N more") and a badge page in the Menu and on the desk
- **Seasons** every 7 days: summer → autumn (orange and red leafy trees, golden grass, fallen leaves) → winter (snow over the whole map, snowy trees, frozen walkable lake with an ice-fishing hole, no canoe or diving, snowfall instead of rain) → spring (pink blossoms, wildflowers). Two seasonal fish: burbot (winter) and brook char (spring), for 10 species in total. Seasonal birds and newspaper headlines
- **Story**: the council sets the vote (10 days). Dr. Holm needs a photo of the creature itself. Choose who you trust to take it (Pip and Biscuit try their best…), pick the place (den, lakeshore at dawn, mountain lookout) and how much Moss shows (shadow, half hidden, full portrait). A hand-drawn portrait goes into the album, and each friend reacts in their own way. Deliver it to Holm
- **Look**: grass tufts everywhere, lake shimmer, a soft vignette, warm morning and golden-hour colour grading, and seasonal tints
- Fixes: Pip and people now beat an adopted Biscuit for the E prompt; the phone clock wraps
- Save format v7 with migration from all older saves

## Done — Slice 8: The vote (finale)
- **Town Hall** on the town square (columns, clock, flag). When the countdown ends after the portrait is delivered (or you pick "Go to the vote" in the menu), quest "Vote day" sends you there (9 AM–6 PM). If the countdown runs out before the story is ready, the council postpones 3 days
- **Moss's choice at the door**: walk in disguised, or take off the disguise and walk in as himself. This changes the scene (Grube panics, Deputy Ruiz: "He's waiting in line, sir"), the score and the ending text
- **Council scene** built from what you did: Dot's petition, Iris and the Gazette, Walt and the moose, Rosa's birds, Dr. Holm's evidence and the portrait
- **Tally** (max 102): evidence photos, portrait, petition, sabotage, bribe letter, moose photo, badges, bird guide, friends, and walking in as yourself. 70+ → **Hollowpine Provincial Park**; 40+ → **the little lodge**; less → **the mountain camp** (bittersweet)
- **Endings**: an illustrated scene per ending, rolling credits for the whole cast, Pip's epilogue line and a newspaper headline the next morning
- **Changed world after the vote**: park (bulldozer gone, flowers, ranger booth, "HOLLOWPINE PARK" sign, crew and Grube gone), lodge (a small Hollowpine Lodge replaces the bulldozer), mountain (construction continues; a new camp west of the ski run). If Moss revealed himself, people no longer panic when they see him
- **New Game+** on the title screen after any ending (all outfits, binoculars, 50 coins). New badge **Keeper of Hollowpine** (26 total)
- **Polish**: first-time tips (raiding, hiding, eating, disguise, map and menu), a "What can I do now?" list in the menu (goal, open jobs and venues, birds, fishing, foraging, badges), and a tree spatial grid that speeds up collision and line-of-sight checks
- Save format v8 with migration from all older saves (veteran saves skip the tips)

## Done — Slice 9: Extras and polish
- Procedural WebAudio music per area (camp, town, mountain, night), plus birdsong, crickets and rain ambience. Main volume controls everything; a separate Music slider controls music.
- Holidays on a 28-day calendar: Halloween night (day 14: campers in costumes don't react to Moss, trick-or-treat for candy), Winter Festival (day 18: lights, a tree, sledding on the golf hill), Spring Fishing Derby (day 26: leaderboard, prizes at 6 PM). The newspaper announces each one the day before.
- Post-vote jobs: park ranger rounds (park ending), lodge kitchen (lodge ending), mountain trading post (mountain ending).
- Accessibility: remappable keys, high-contrast HUD, relaxed mode (slower suspicion and chases), large touch buttons.
- Controls card on first launch, save export/import code in Settings. Coin prices were reviewed against job pay and left unchanged.
- Save format v9 with migration.

## Done — Slice 10: Seasons of the valley + character animations
- Juniper's travelling wagon: shows up on some days (the newspaper says where), 9 AM to 7 PM, at the Snack Shack, the town square or the ski lodge. Sells two rare outfits (Lumberjack flannel, Rain poncho), a storm lantern and den furniture (lamp, radio, fern, quilt).
- Weather events: a thunderstorm on day 10 of each 28-day cycle (and some other rainy days) with lightning, thunder and a town blackout; hang lanterns on 4 dark lamp posts to relight Pinewick. A summer heatwave (days 4–5) drains hunger and stamina faster (swim to cool off) and brings an ice cream truck job.
- Valley stories (after the vote): five 3-step side stories from Dot, Walt, Iris, Rosa and Olaf, tracked in the side panel, quest arrow and a "Valley stories" menu.
- Photo book: flip through photos two pages at a time and write captions. The album now keeps 12 photos.
- Performance options: pause far-away people, 30 fps cap, low detail.
- Character animations: walk squash and lean, sprint dust, breathing and blinking, idle yawns, stretches, scratches and look-arounds, dancing to the den radio, eating with chomping cheeks and crumbs, rummaging when raiding, crouching in bushes with peeking eyes, startle hop with "!" when noticed, swim strokes and splashes, sleeping in bed with floating z's, coin sparkles, campers flailing when they flee, and z's over sleeping campers.
- 4 new badges. Save format v10 with migration.

## Possible next prompt (Slice 11, optional)
> Continue building Pinecone Prowler in `pinecone-prowler/index.html` (read `ROADMAP.md` first). Add **Slice 11: Friends and festivals**. 1) Moss can invite friends (Pip, Biscuit, and townsfolk from finished valley stories) to a campfire night at the den with marshmallow roasting. 2) A cooking pot at the den: combine 2 ingredients (fish, mushrooms, berries, apples) into new recipes that give bigger hunger boosts. 3) A summer lake swim race and an autumn pumpkin-carving contest. 4) A collection log for every food, outfit and furniture item with "found/not found" silhouettes. 5) Gamepad support (move, use, eat, menu). Keep everything working, save format v11 with migration, and test in a headless browser.
