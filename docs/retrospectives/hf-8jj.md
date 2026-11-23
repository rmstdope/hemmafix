# hf-8jj — retrospective

- **Implementer:** Bishop
- **Date:** 2026-11-23
- **PR:** #64

## `lists.spec.ts:79` failed once locally on a focus assertion, and was not reproducible after

**What happened.** The full local e2e run on the review fix (5986107) had 249 passed and 1 failed:
`[mobile] e2e/lists.spec.ts:79` "items are added first, ticked into Klart, unticked and cleared
with Ångra", at line 126, `expect(getByRole("button", { name: "Mjölk: bocka av" })).toBeFocused()`
received "inactive". The change touched `LiveUpdates`, whose `router.refresh()` timing could plausibly
move focus, so it had to be ruled in or out. `--repeat-each 8` of that test (16 runs): main's
`LiveUpdates` passed 16/16; the fix failed 1/16, at a different line (`toBeAttached`), in a run that
also hung for 1.9 min; rerun, 16/16 passed, then the whole `lists.spec.ts` ×4 passed 80/80, and CI
passed.

**Why.** Not established. The 1.9 min hang matches the Mac sleeping (hf-o78); the focus failure
does not.

**Cost.** About 15 minutes: one rebuild of main's `LiveUpdates` and four repeat runs.

**Prevent by.** If `lists.spec.ts:79` fails again on its focus assertion, file it as a flaky test
with this file named, rather than re-measuring: two sightings make it a bead. Running repeats under
`caffeinate -i` (hf-o78) would have kept the hang from muddying the comparison.

**Seen before.** hf-o78 (local stall from sleep); no earlier sighting of this focus failure.
