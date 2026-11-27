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
