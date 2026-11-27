# hf-fh6 — retrospective

- **Producer:** Wolverine
- **Date:** 2026-11-27
- **PR:** #161

## A flaky board spec turned CI red: the "Uppgiften är tillagd" toast covers "Ny uppgift"

**What happened.** On head 679c02c, `e2e-shard (1)` failed on
`[mobile] › e2e/board.spec.ts:213:1 › a change on one device shows up on another without reloading`:
the second `add()` timed out clicking "Ny uppgift" because the first task's toast "intercepts pointer
events", and passed on retry. The same PR's previous head had passed. Locally the spec passed 20 of
20 repeats on mobile. Adding `await page.getByText("Uppgiften är tillagd").last().hover()` after the
item is visible (temporary, not committed) reproduced the failure with the same message.

**Why.** The mobile toast lies over the floating "Ny uppgift" button, and it stayed there for the
rest of the test while the pointer was on it. That the CI run had the pointer resting there is
inferred from the forced reproduction, not observed. The PR changes neither the toast, the button
nor the spec.

**Cost.** One red CI run, a rebuild, a local reproduction and another full CI run (about 15 minutes).

**Prevent by.** In `e2e/board.spec.ts`, have `add()` wait for the toast to be gone, or dismiss it,
before the test opens the form again. Any other spec that presses a bottom-of-screen control right
after a toast needs the same, best as one helper in `e2e/support/`.

**Seen before.** The bug bead hf-6tl (a toast covering "Spara" in `e2e/routines.spec.ts`).

## Leaked e2e servers still hold the port blocks `smoke-port` tries

**What happened.** `smoke-port -- pnpm exec playwright test …` exited 3: every block was taken. Four
holders were `next-server` processes more than two days old, running from the `.next/standalone` of
worktrees `hf-bn7`, `hf-lzb.9` and `hf-lzb.10`; the others looked like current runs. `--blocks 30`
found port 3290. The old processes were left running.

**Why.** Not established.

**Cost.** One run that did not start.

**Prevent by.** As in hf-5pl: a step in the fleet view's worktree removal (or `scripts/ship`'s
tidy-up) that kills processes whose working directory is inside the tree being removed.

**Seen before.** hf-5pl, the same worktrees.
