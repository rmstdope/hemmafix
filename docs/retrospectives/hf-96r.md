# hf-96r

## An avatar-menu e2e test was flaky in CI only

**What happened:** After `update-branch`, CI's e2e job failed with `1 flaky`: `e2e/avatar-menu.spec.ts:38` (`expect(getByRole("menu")).toHaveCount(0)` after Esc) failed its first attempt and passed on retry; `failOnFlakyTests` makes that red. The same test passed 96 of 96 times locally (`--repeat-each=6`, both projects). A bare re-run of the job was green.

**Why:** not established. The diff does not touch the user menu.

**Cost:** one CI cycle (about 7 minutes) and one of the two bare re-runs.

**Prevent by:** not established; if it recurs, keep the Playwright trace of the first attempt from the CI artifact.

**Seen before:** nothing like it yet.
