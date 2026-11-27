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

## Next prompt (Slice 5)
Copy this into the next session:

> Continue building Pinecone Prowler in `pinecone-prowler/index.html` (read `ROADMAP.md` first). Add **Slice 5: The mountain and the lake**.
> 1. **Ski hill**: extend the map north of the golf course with a snowy mountain (the 3/4 renderer gets snow ground, snowy pines and a chairlift with moving chairs). Rent skis at a ski lodge; a downhill mini-game (steer through gates, avoid trees, time trial with a best-time board) and a disguised-Moss-only ski patrol job.
> 2. **Canoe & swimming**: rent a canoe at the Bait & Tackle and paddle around the lake (water becomes walkable while in the canoe); Moss can swim slowly in shallow water with a stamina drain. Hidden island in the lake with a secret.
> 3. **Scuba diving**: buy scuba gear; dive spots on the lake show an underwater view mini-game (collect lost items, avoid running out of air) with a sunken treasure chest.
> 4. **Story**: Gideon Grube tries to buy off Dr. Holm; find his bribe letter in the site office at night and mail it to the Pinewick Gazette (via Iris) to turn the town against him. Add a newspaper headline screen each morning showing world events.
> 5. **Quality of life**: a map screen (M) showing the whole world, the loop road, and discovered places; a save/settings menu with sound volume.
> Keep the 3/4 diorama renderer, the loop road and traffic, drag-to-eat, art style, HUD, save format (bump to v5 with migration) and touch controls. Test it in a headless browser and give me the prompt for Slice 6 when done.

## Later slices (ideas)
- Slice 6: More jobs (doctor's office, police desk), arcade cabinets in town
- Slice 7: Birdwatching with photo scoring (reuse the camera); badge collection
- Slice 8: Council vote finale and save Hollowpine
