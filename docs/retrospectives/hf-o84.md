# hf-o84 — retrospective

- **Producer:** Nightcrawler (bugfixer)
- **Date:** 2026-11-27
- **PR:** #147

## A layout-effect cleanup does not cover a page that is hidden before its marks arrive

**What happened.** hf-0l9 kept a hidden page from matching `:root:has(…)` by removing its marks in a
`useLayoutEffect` cleanup. That covers a page that was shown and then hidden. It does not cover marks
that stream into a page *after* the person has left it. React writes their DOM into the hidden
Activity and runs no effect there, so the rendered `data-look-own="jul"` stayed. CI caught it once
(PR #141). It did not reproduce locally in more than 100 runs, because locally the marks always
arrived before the test could leave the page.

**Why.** Only the CI trace showed it. Its DOM snapshots, expanded, had a hidden
(`display: none !important`) span still marked `jul` next to the live `svart` one. Network delays in
Playwright could not reproduce it, since the marks ride in the same RSC response as the shell.
Locking the table that only the looks read (`holdLooks` in `e2e/support/family.ts`) and leaving by
`page.goBack()` before the page had rendered made it fail every time.

**Cost.** About two hours of probing before the reproduction, most of it on approaches that could
not work: per-request network delays, and a lock held while waiting for the heading, which starved
the app's 10-connection pool.

**Prevent by.** Amend the hf-0l9 trap entry, when it is written to `.cerebro/traps.md`: an attribute
that a global selector reads must not be in the JSX after hydration, only set by a layout effect
(`useShownAttributes` in `src/components/look-marks.tsx`). The test must leave the page *before*
its data arrives (`holdLooks` plus `goBack`), not after. For a CI-only flake, start from the
uploaded trace's DOM snapshots before trying to reproduce it locally.

**Seen before.** hf-0l9: the same class of bug, and the fix that this one completes.

## A pre-existing clock race in the jul suite under load

**What happened.** On this machine (load average 30 to 45), `e2e/jul.spec.ts` › "moving between the
parts and Hemmet neither restarts nor interrupts the rhythm" failed once in three on mobile with
`clock.pauseAt: Cannot fast-forward to the past`. `pausedClock` reads `Date.now()` in the page and
then calls `pauseAt(now + 100)`. When more than 100 ms passes between the two calls, the target is
in the past. Separately, `badges.int.test.ts` › "100 uppgifter is won on the hundredth tick" timed
out at 5 s in two full integration runs, and passed alone and with `--testTimeout 20000`.

**Why.** Both are timing margins in tests this bead does not touch, and machine load exposes them.

**Cost.** Two extra suite runs to rule this diff out.

**Prevent by.** `pausedClock` in `e2e/jul.spec.ts` could pause relative to the clock's own time
instead of a value read earlier, for example `pauseAt` after `page.clock.setFixedTime`, or a margin
read inside the same `evaluate`. This would be a Testing bead for Sage or the navigator.

**Seen before.** Machine load: hf-qjk. Both specific tests: not in this directory.

`smoke-port` also found every port block taken (eight sessions running e2e). This run used
`E2E_PORT=3417` by hand, which works but sits outside the port contract.
