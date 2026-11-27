# Retrospective: hf-19m.3

- **Bead:** hf-19m.3 (desktop skips end-to-end tests the viewport cannot change)
- **PR:** #190

## `coin-shower.spec.ts` missed an intermediate coin total again

**What happened.** The full local `pnpm run test:e2e` ended 486 passed, 2 failed, both on mobile and
neither touched by the change. `e2e/coin-shower.spec.ts:59` "ticking a task off sends five coins, the
number climbs coin by coin, with a clink each" recorded `0 4 6 8 10`: `2` was missing, five coins and
clinks as expected. `e2e/board-tabs.spec.ts:122` "each empty tab says its own words" did not find
"Inga uppgifter här." within 5 s. Both spec files then passed in full (45 passed, 2 skipped).

**Why.** Not established. The load average was about 30 to 40 from other fleet sessions.

**Cost.** About two minutes for the rerun.

**Prevent by.** File a flaky-test bead for `e2e/coin-shower.spec.ts` (hf-im2 asked for one if it was
seen again): make the recorder keep every value the counter is given, or assert a rising sequence
ending at 10.

**Seen before.** `docs/retrospectives/hf-im2.md`, the same test with the same missing `2`. Nothing
for the `board-tabs` test.

## The review packet is too large to paste into the reviewer's prompt as the skill says

**What happened.** `review-packet` printed 69 KB. `produce-bead` says to paste it whole into the
sub-agent's prompt, which means the producer retyping all of it. The producer instead wrote it to a
file and gave the reviewer only its path, asking it to read all of it unedited.

**Why.** A producer has no way to hand a command's output to a sub-agent other than reproducing it.

**Cost.** None measured; retyping would have cost about 20k output tokens and risked altering it.

**Prevent by.** `produce-bead`, *The review loop*: say that the packet may be given as a file the
producer wrote straight from `review-packet` and did not edit.

**Seen before.** Nothing found in `docs/retrospectives/`.
