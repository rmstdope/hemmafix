# hf-6nq

## The 100-tick badges test times out on a loaded machine, and takes a neighbour down with it

**What happened**: In four local `pnpm run test:int` runs (machine load average 23-26 from other fleet sessions) `src/server/badges.int.test.ts` "100 uppgifter is won on the hundredth tick" timed out at the 5000 ms default. Twice the timeout was followed by a second badges test failing with `deadlock detected` on `delete from "household"` (cleanup racing the still-running ticks). The file passes alone (31/31) and a run with `--maxWorkers=2` passed once.

**Why**: The test does about 100 sequential ticks inside the default timeout; under CPU contention that is not enough. The deadlock is the cleanup colliding with the timed-out test's work.

**Cost**: About four extra gate runs (roughly ten minutes) to get a green local `test:int`, for a change that touches only `scripts/verify-app.mjs`.

**Prevent by**: Giving that one test an explicit timeout in `src/server/badges.int.test.ts`. Not done here: out of scope for this bead.

**Seen before**: hf-z7p (same test, same timeout).

## A flaky e2e in CI fails the job and cannot be reproduced locally

**What happened**: The CI e2e job failed with "489 passed, 1 flaky": `e2e/daily-chest.spec.ts:54` ("a chest closed unopened with Esc opens itself…", mobile) failed once on the `/mynt$/` pill and passed on Playwright's retry. `failOnFlakyTests` turns that into a red job. Three repeats of that spec locally on the production build all passed, so the "reproduce it locally first" step could not be met; I spent one bare re-run, which went green.

**Why**: Not established. The diff touches no app code and no e2e file.

**Cost**: One CI re-run, about 12 minutes.

**Prevent by**: Not established. If it recurs, keep the Playwright trace for `daily-chest.spec.ts:54` and look at the pill's wait in that test.

**Seen before**: Not found in `docs/retrospectives/`.
