# hf-9yc — retrospective

- **Implementer:** Cyclops
- **Date:** 2026-11-28
- **PR:** #194

## A new request on page load failed the shutdown test in CI only

**What happened.** The full end-to-end suite had passed locally and in the first CI run. The next
run, whose commit changed only tests, failed `e2e/shutdown.spec.ts` "while a page holds an event
stream" twice in shard 1: the server exited after 5068 and 5111 ms, limit 5000. Twenty local
repeats passed.
**Why.** A request that is busy at SIGTERM keeps its connection once answered, and the server waits
for Node's five-second keep-alive. The bead added a request that every page makes as it loads
(`/api/calendar/access`), beside the event stream the test waits for. A raw socket with that request
half sent reproduced it every time (6084 ms). That this request was the one under way in the CI run
is inferred from the mechanism, not traced.
**Cost.** One CI cycle, one fix and about ten minutes.
**Prevent by.** An entry in `.cerebro/traps.md`: a route that the browser calls on its own (on load or
by polling) answers with `lastAnswerHeaders()` (`src/server/shutdown.ts`) and has a case in
`e2e/shutdown.spec.ts`.
**Seen before.** none found.
