# hf-3kz

- **Bead:** hf-3kz, the chosen day tab survives a reload after ticking or postponing
- **PR:** #149

## `badges.int.test.ts` "100 uppgifter is won on the hundredth tick" timed out again, sixth sighting

**What happened.** The first full `pnpm run test:int` for this client-only fix failed one test with
`Test timed out in 5000ms`. The file run on its own failed the same way (5137 ms). The next full
run passed 465/465. The diff touches no server code.

**Why.** The test makes about 100 sequential ticks inside the 5000 ms default. It takes about 5 s,
so it fails whenever other fleet sessions load the machine. That is not established for this run
(no `uptime` taken), but it matches the earlier sightings.

**Cost.** Two extra `test:int` runs, about a minute.

**Prevent by.** A flaky-test bead for `src/server/badges.int.test.ts`: seed the 99 done tasks in
one insert, or give the test an explicit timeout. On 2026-11-27, `bd search "hundredth"` and
`bd search "badges"` found no open bead for it, although hf-q4o asked for one. Filing it is the
navigator's or Sage's.

**Seen before.** hf-z7p, hf-q4o, hf-im2, hf-6nq, hf-5rp (same test, same timeout).
