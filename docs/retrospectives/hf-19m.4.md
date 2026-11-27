# hf-19m.4 — retrospective

- **Producer:** Rogue
- **Date:** 2026-11-27
- **PR:** #187

## Two tests at a time on one runner made old e2e timing races fail CI, one by one

**What happened.** With two workers per shard, CI runs failed in turn on `edit.spec.ts` (day's chest
card over the next click), `add-routine.spec.ts` (a notice over the +, fixed meanwhile on main by
hf-e49), `daily-chest.spec.ts` Esc (twice; reads the coin pill while coins still fly) and
`jul.spec.ts` "a session that ended" (the live refresh after the event stream opens redirects before
the press). None showed in the first run of a configuration alone; each took repeated runs.
**Why.** Each test depended on being faster than something the app does on its own. The plan put the
tests out of scope and did not expect this, so the navigator had to be asked twice.
**Cost.** Two questions to the navigator, several extra CI rounds and re-runs, about an hour.
**Prevent by.** A bead that changes how e2e runs (workers, shards, runner load) saying in its scope
that timing races it exposes are fixed in it, and its plan including several re-runs of the CI run.
A step in `agents/qa.md`'s sweep looking for the three shapes: a click after a tick without
`logInWithChestTaken`, `innerText()` of an animating number, and `clearCookies()` before a press
with the live stream open.
**Seen before.** hf-998, hf-gtx, hf-6o7 (chest card), hf-6nq (`daily-chest.spec.ts` Esc).
