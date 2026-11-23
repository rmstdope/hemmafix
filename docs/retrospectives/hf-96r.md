# hf-96r

## `avatar-menu.spec.ts:28` is red on main, and so on every PR

**What happened:** After `update-branch` onto main (`4faa470` + a cerebro bump), CI's e2e job failed on `e2e/avatar-menu.spec.ts:28` (mobile only: `expect(getByRole("menu")).toHaveCount(0)` after Esc). It was flaky on the first attempt and failed outright on a re-run and on a docs-only commit. The same test fails in main's own CI runs (45186940378, 45190868206), so it is not caused by this PR. Locally it passed 96 of 96 repeats; this PR's first CI run (before the catch-up) was green.

**Why:** not established. This PR's diff does not touch the user menu.

**Cost:** about 25 minutes of CI waiting, the re-run budget spent, and the bead handed back with a green-in-substance PR that cannot merge.

**Prevent by:** check main's last CI result before `update-branch`; a red main means the bead should wait for a fix bead instead of spending CI cycles.

**Seen before:** hf-83j and hf-kix (a flaky e2e on an unrelated head).
