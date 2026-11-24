# hf-z7p — retrospective

- **Implementer:** Nightcrawler
- **Date:** 2026-11-24
- **PR:** #114

## `lists.spec.ts` focus failure seen a second time; `badges.int.test.ts` timed out once

**What happened.** The full local e2e run on 70f9505 (a CSS-only fix to theme colours) had 476
passed and 1 failed: `[mobile] e2e/lists.spec.ts:125` "items are added first, ticked into Klart,
unticked and cleared with Ångra", `expect(getByRole("button", { name: "Mjölk: bocka av" }))
.toBeFocused()` received "inactive". That is the same assertion hf-8jj recorded at `:79`, and the
test has since moved down the file. Running `lists.spec.ts` alone right after: 26/26 passed. Separately,
one `pnpm run test:int` run had `src/server/badges.int.test.ts` "100 uppgifter is won on the
hundredth tick" time out at vitest's 5000 ms default (99 sequential ticks). It passed alone
(28/28) and on a full re-run.

**Why.** Not established for the focus failure. The badge timeout ran with a production build
going at the same time, and 99 sequential database round-trips sit near the 5 s default.

**Cost.** About 15 minutes: two isolated re-runs and a second full `test:int`.

**Prevent by.** The focus failure has now been seen twice, which by hf-8jj's own rule makes it a
flaky-test bead naming `e2e/lists.spec.ts` "items are added first, ticked into Klart…" and both
retrospectives. For `badges.int.test.ts:143`, give that test an explicit timeout (or seed the 99 done
tasks in one insert) so it does not depend on machine load.

**Seen before.** hf-8jj (the same focus assertion, first sighting); hf-83j and hf-96r (flaky e2e on an
unrelated head). No earlier sighting of the badge timeout.
