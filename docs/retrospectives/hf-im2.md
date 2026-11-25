# hf-im2 retrospectives

- **Bead:** hf-im2 (the home's name whole on a 390 px phone)
- **PR:** #125

## `coin-shower.spec.ts` missed an intermediate coin total in the full e2e run

**What happened.** The full local `pnpm run test:e2e` for this header-only change ended 505 passed,
1 failed: `e2e/coin-shower.spec.ts:52` "ticking a task off sends five coins, the number climbs coin
by coin, with a clink each" on mobile. The recorded numbers were `0 4 6 8 10`; `2` was missing,
with five coins flown and the end total right. The spec alone then passed (11 passed, 1 skipped).

**Why.** Not established. The load average was between 10 and 40 from other fleet sessions; a likely
reading is that two coins landed before the page's recorder saw the number between them.

**Cost.** About a minute for the rerun.

**Prevent by.** If seen again, file a flaky-test bead for `e2e/coin-shower.spec.ts`: make the
recorder keep every value the counter is given, or assert a rising sequence ending at 10.

**Seen before.** Nothing for this spec. The same runs also hit the `badges.int.test.ts`
"100 uppgifter" 5000 ms timeout again (hf-z7p, hf-q4o); hf-q4o asked for a flaky-test bead and a
search of the board found none.
