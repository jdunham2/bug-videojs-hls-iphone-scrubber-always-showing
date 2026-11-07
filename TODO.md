# To do

Open work only. When something is done, delete it from this list (the git log
keeps the history). Subagents: read this first, and only take items marked as
yours.

## Now

- [ ] Waiting on the user (Build 58): build label in the corner, which
      characters "aren't working" and how, and a Copy diagnostics report if
      walking still stops after wave 4 or the merchant/blacksmith misbehave.
      None of these reproduce here with their real save.

## Ideas for later

- More missions per arena (new layouts), mission modifiers, a fourth arena.
- A second boss type with its own moves.
- Walkable building interiors (step inside and use the counter, anvil, racks).
- Co-op on the published page (room capability); cosmetic capes.
- Weekly trial with a bigger reward; a season track.

## Next

- [ ] Confirm on the live page that the trophy board shows Best wave 5 /
      Bosses 1 after a refresh (account save doc: `data/users/<id>/profile`).

- [ ] Re-run `loot.cjs` with `g.start()` to confirm HUD caching shows gems.
- [ ] Bow string hand: line the drawing hand up with the string.

## Needs the user

- [ ] GitHub Pages: Settings → Pages → Source: GitHub Actions.
- [ ] Rotate the Meshy API key (it was pasted in chat); it lives only in the
      gitignored `tools/meshy/.env`.
