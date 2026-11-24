# hf-q4o retrospectives

- **Bead:** hf-q4o (bugfix: the Uppgifter header at 300 px)
- **PR:** #119

## `badges.int.test.ts` "100 uppgifter is won on the hundredth tick" timed out again under load

**What happened.** The first full `pnpm run test:int` for this CSS-only fix failed one test:
`src/server/badges.int.test.ts` "winning badges > 100 uppgifter is won on the hundredth tick",
`Test timed out in 5000ms`. Run alone right after, the file failed two tests by timeout; run alone
a third time, 31/31 passed, and the next full run passed 434/434. The diff touches no server code.

**Why.** `uptime` showed a load average of 31 from other fleet sessions building and testing. The
test makes 99 sequential ticks against Postgres, close to vitest's 5000 ms default even when the
machine is quiet.

**Cost.** About 5 minutes: two isolated reruns and a second full `test:int`.

**Prevent by.** Second sighting, so this is now a flaky-test bead for
`src/server/badges.int.test.ts` "100 uppgifter is won on the hundredth tick": seed the 99 done
tasks in one insert, or give the test an explicit timeout, so it stops depending on machine load.

**Seen before.** hf-z7p (the same test, the same 5000 ms timeout, during a parallel production
build). hf-qjk (local failures under fleet load, in e2e).
