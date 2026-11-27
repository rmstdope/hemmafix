# hf-6o7 — retrospective

- **Implementer:** Rogue
- **Date:** 2026-11-27
- **PR:** #184

## The local full e2e run failed twice on specs the diff does not touch

**What happened.** `pnpm run test:e2e` at load average 40-76 failed once on `board.spec.ts:49`
(1 of 566) and, after a rebase, on `board.spec.ts:49` (desktop), `edit.spec.ts:44` (mobile and
desktop) and `lists.spec.ts:126` (mobile). In `board.spec.ts` and `edit.spec.ts` the log shows
`<dialog ... aria-labelledby="chest-title"> intercepts pointer events` on the click after a tick.
**Why.** For `board.spec.ts:49` and `edit.spec.ts:44`: both log in with `logIn`, not
`logInWithChestTaken` (`e2e/support/family.ts`), so their first tick offers the daily chest, and the
next click races the card; they pass when the click wins. `lists.spec.ts:126` expects Klart's open or
folded state after a reload (lines 178 and 181) and failed 4 of 7 reruns; cause not established.
**Cost.** Two full e2e runs of 16 and 21 minutes, and about 20 minutes of reruns.
**Prevent by.** Log in with `logInWithChestTaken` in `e2e/board.spec.ts:49` and
`e2e/edit.spec.ts:44`; for `e2e/lists.spec.ts:126`, keep the trace and see whether the reload comes
before the folded state is stored.
**Seen before.** hf-998 (`edit.spec.ts:44` met the chest dialog, cause not established then).
