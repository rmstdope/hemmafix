# hf-lzb.6 — retrospective

- **Implementer:** Storm
- **Date:** 2026-11-23
- **PR:** #88

## Two other beads took the next migration number while this one waited for CI

**What happened:** The rewards migration was generated as `0014`, then `0015`, and finally `0016`. Each time, a sibling bead (hf-lzb.5, hf-lzb.2) merged a migration with the same number between my gate and my push, so the PR went `CONFLICTING` before CI had started. Every round meant resolving `drizzle/meta/_journal.json` and the snapshot, deleting my SQL file, regenerating it, renumbering the migration test and re-running the gate.

**Why:** Not established beyond the cause above: parallel producers each generate the next free number from their own checkout, and the 7-minute local e2e leaves room for main to move.

**Cost:** About three rebase rounds and two repeated gate runs.

**Prevent by:** A step in `produce-bead` *Building* to fetch and rebase onto the default branch immediately before generating the migration and again before the final push. Not done here.

**Seen before:** nothing like it yet (searched `docs/retrospectives/` for "migration").

## An integration test failed once and passed on re-run

**What happened:** `src/server/mcp-home.int.test.ts` "are told when a floor cannot move further, and nobody is notified" failed in one full `pnpm run test:int` run after the last rebase and passed in the next, with no change in between. Rewards code does not touch that path.

**Why:** not established.

**Cost:** one extra integration run.

**Prevent by:** not established.

**Seen before:** nothing like it yet.
