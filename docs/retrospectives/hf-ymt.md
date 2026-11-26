# hf-ymt — retrospective

- **Implementer:** Rogue
- **Date:** 2026-11-27
- **PR:** #145

## The local integration gate failed on tests the diff does not touch, in two ways

**What happened.** `pnpm run test:int` failed with the 100-tick badges timeout (5000 ms) and, in the
same run, an unhandled `UserError: Våningen finns inte i hemmet` from `src/server/floors.int.test.ts`
("wait for a floor being removed, and are then refused"). The timeout recurred at
`--maxWorkers=2`, also with `badges.int.test.ts` run alone (load average 14-25).
`--maxWorkers=2 --testTimeout=30000` passed 442/442. CI passed on the first head.

**Why.** Badges: the test runs close to vitest's default timeout under load. Floors, read from the
code: the test creates the `adding` promise, then awaits `removal` before attaching
`expect(adding).rejects`, so a rejection arriving first has no handler.

**Cost.** Four extra integration runs.

**Prevent by.** An explicit timeout on "100 uppgifter is won on the hundredth tick" in
`src/server/badges.int.test.ts`; in `src/server/floors.int.test.ts`, attach the rejection
assertion to `adding` before `release()`. Neither done here: out of scope.

**Seen before.** hf-5rp, hf-6nq (badges timeout). Floors rejection: none found.
