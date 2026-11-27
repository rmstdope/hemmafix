# hf-gtx — retrospective

- **Implementer:** Cyclops
- **Date:** 2026-11-27
- **PR:** #180

## `home.spec.ts:91` timed out locally with the daily chest dialog over the page

**What happened.** The full `pnpm run test:e2e` (13.2 minutes, load average about 8-17) failed
`[mobile] home.spec.ts:91` "among the recently done, a child sees only their own ticks": clicking
"Klart senaste veckan" retried for 30 s because `<dialog aria-labelledby="chest-title">` intercepted
pointer events. `lists.spec.ts:126` also failed in that run (already in hf-z7p and hf-aq2). Both
passed on a rerun of their files.

**Why.** The daily chest dialog was open over the page the test was clicking. Why it is open only in
some runs is not established.

**Cost.** A rerun of three spec files, after about five minutes waiting for a free `smoke-port`
block (the orphaned servers of hf-ocy and hf-5pl: on this day pids from `hf-lzb.9`, `hf-lzb.10` and
`hf-bn7`, started 23-24 November, still held six blocks).

**Prevent by.** `e2e/home.spec.ts:91` seeding today's chest as already opened, or closing the dialog
before it clicks.

**Seen before.** hf-5rp (the same test timing out, cause not established), hf-998 (`edit.spec.ts:44`
meeting the same dialog).
