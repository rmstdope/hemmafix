# hf-5rp — retrospective

- **Implementer:** Storm
- **Date:** 2026-11-25
- **PR:** #124

## `badges.int.test.ts` "100 uppgifter is won on the hundredth tick" failed two local gate runs

**What happened.** Two full `pnpm run test:int` runs in a row failed this test with `Test timed out
in 5000ms`; in the second, "Nivå 5 is won …" then failed with `deadlock detected` on
`delete from "household"`. `pnpm run test:int --maxWorkers=2` passed 442/442.

**Why.** Load average 16-28 from other fleet sessions; 99 sequential ticks sit close to vitest's
5000 ms default, and the next test's cleanup collides with the timed-out test's work.

**Cost.** Two extra gate runs, a few minutes.

**Prevent by.** Give that test an explicit timeout in `src/server/badges.int.test.ts`, or seed the
99 done tasks in one insert. hf-q4o already asked for a flaky-test bead;
no open bead with that title was found.

**Seen before.** hf-z7p, hf-q4o, hf-6nq (same test, same timeout).

## Two e2e tests failed under load in the full local run

**What happened.** The full `pnpm run test:e2e` took 16.3 minutes and failed `home.spec.ts:91`
(30 s test timeout) and `routines.spec.ts:38` (5 s expect timeout). Both files rerun alone passed
28/28. Neither reaches the changed code.

**Why.** Not established; the load average was still 14-25 right after the run.

**Cost.** About 20 minutes of full run and rerun; the run also outlasted a 10-minute tool timeout.

**Prevent by.** Run the full local e2e gate in the background from the start, and have the fleet
limit how many worktrees run e2e at once.

**Seen before.** hf-qjk.
