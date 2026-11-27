# hf-nmw — retrospective

- **Implementer:** Wolverine
- **Date:** 2026-11-27
- **PR:** #165

## A browser assertion named as proving a unit case passed before the page it was about had opened

**What happened.** The bead paired the unit case `litPart("/gjort", "uppgifter")` with the last
line of `e2e/parts.spec.ts` "Gjort opened from Listor…". With `litPart` broken so that Gjort always
lit Listor, `pnpm build` and the spec left that line green: it ran right after
`chooseFromMenu(page, "Gjort")`, while the board, whose Uppgifter tab is already lit, was still
shown. Reading the pair line by line had not shown it; breaking the word did.

**Why.** `toHaveAttribute` passes on the first match, and nothing waited for the Gjort page.

**Cost.** One more build and spec run, and a one-line fix in a file the bead did not name.

**Prevent by.** In `.cerebro/cerebro/agents/qa.md`, where a Testing bead says a higher-level test
already proves a unit test: before removing, break the source and see the named line go red.

**Seen before.** None found for this assertion.

## The `Mjölk: bocka av` focus assertion failed once more, still without a flaky-test bead

**What happened.** One of four local runs of `parts.spec.ts` and `lists.spec.ts` (with unrelated
words broken) failed at `e2e/lists.spec.ts:173` `toBeFocused()`. Fifteen repeats of that test on
unchanged source passed. `bd search` for "flaky" and "lists.spec" found no bead for it.

**Why.** Not established.

**Cost.** One extra build and a 15-repeat run.

**Prevent by.** File the flaky-test bead for `e2e/lists.spec.ts` "items are added first, ticked
into Klart…", as hf-z7p and hf-aq2 asked.

**Seen before.** hf-8jj, hf-z7p, hf-aq2.

## Two "ended session" browser tests timed out in CI: the app reached the login page before the press

**What happened.** After catching up with `main` (2c69fa1), `e2e-shard (3)` and `(10)` of run
45934412066 were flaky, so red: `e2e/jul.spec.ts:227` and `e2e/page-marks.spec.ts:68`, both
`part(page, "Listor").click()` right after `context.clearCookies()`, timing out after 30 s
("element was detached from the DOM, retrying"). `main`'s own run 45933533792 for #164 was red on
the second one. Neither file is in this diff. 160 plain local runs (half under full CPU load) passed.
Dispatching `visibilitychange` after `clearCookies()` and waiting 2 s reproduced it every time
tried (once): the page snapshot is the login page and the link is gone.

**Why.** `LiveUpdates` calls `router.refresh()` 150 ms after its stream opens or the page becomes
visible. A refresh that lands between `clearCookies()` and the press redirects to `/login` first.
That the CI runs were hit by the stream opening is inferred, not traced.

**Cost.** Two local builds, three spec runs and a second CI run, about twenty minutes.

**Prevent by.** A bug bead for the two tests: have each wait for or hold back the pending refresh
before clearing cookies (or accept either route to `/login` in the same document).

**Seen before.** None found.
