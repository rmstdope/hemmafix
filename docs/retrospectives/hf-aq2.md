# hf-aq2 — retrospective

- **Implementer:** Storm
- **Date:** 2026-11-27
- **PR:** #157

## A flaky `lists.spec.ts` test turned CI red on a pull request that changes no application code

**What happened.** On 8e01752, which changes only `ci.yml`, a unit test and `deploy/README.md`,
`e2e-shard (9)` ended "60 passed, 1 flaky": `[desktop] e2e/lists.spec.ts:125` "items are added
first, ticked into Klart, unticked and cleared with Ångra" did not find the `Klart (2)` button
after the reload (line 177, 5000 ms) and passed on the retry. One local run of `lists.spec.ts` at the
same head had 25 passed and 1 failed: the same test on desktop, at the earlier focus assertion
(line 172, `Mjölk: bocka av` `toBeFocused()` received "inactive").

**Why.** Not established for either assertion.

**Cost.** A red CI run, a local build and spec run, and about ten minutes. The branch was behind
`main` anyway, so no bare re-run was spent.

**Prevent by.** File the flaky-test bead for `e2e/lists.spec.ts` "items are added first, ticked
into Klart…", naming both assertions. hf-z7p asked for it after the second sighting of the focus
failure and `bd search` found no such bead under "lists.spec" or "Klart".

**Seen before.** hf-8jj and hf-z7p (the focus assertion). The `Klart (2)` assertion after the
reload: none found.
