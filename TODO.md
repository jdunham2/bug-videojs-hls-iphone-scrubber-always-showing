# To do

Open work only. When something is done, delete it from this list (the git log
keeps the history). Subagents: read this first, and only take items marked as
yours.

## Now

- [ ] Working through the roadmap below in order (user said: do them all, one by one).

## Proposed: replayability roadmap (pick order with the user)

1. Mission map: pick a stage from a world map, each a hand-made layout with
   objectives, secrets, chests and a boss; stars for clearing.
2. Merchant and blacksmith in camp: spend gems on gear rolls, salvage gear
   for upgrades.
3. Daily/weekly challenge runs with modifiers and a leaderboard.
4. Polish: hit-pause tuning, more death/hit animations, cinematic boss intros,
   music per stage.

## Next

- [ ] Confirm on the live page that the trophy board shows Best wave 5 /
      Bosses 1 after a refresh (account save doc: `data/users/<id>/profile`).

- [ ] Re-run `loot.cjs` with `g.start()` to confirm HUD caching shows gems.
- [ ] Bow string hand: line the drawing hand up with the string.

## Needs the user

- [ ] GitHub Pages: Settings → Pages → Source: GitHub Actions.
- [ ] Rotate the Meshy API key (it was pasted in chat); it lives only in the
      gitignored `tools/meshy/.env`.
