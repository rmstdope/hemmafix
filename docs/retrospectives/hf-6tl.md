# hf-6tl — retrospective

- **Implementer:** Bishop
- **Date:** 2026-11-16
- **PR:** #47

## The full e2e run died on ENOENT trace errors while the review sub-agent was running

**What happened.** I started `smoke-port -- pnpm run test:e2e` in the worktree in the background, then spawned the `reviewer` sub-agent. The reviewer ran Playwright (`--repeat-each 3`) in the same worktree. My run ended with 2 failures that were not assertions: `ENOENT ... test-results/.playwright-artifacts-0/traces/...recording527.network`.
**Why.** Both runs used the same `test-results/` directory, and Playwright clears it at the start of each run. The reviewer's run deleted the trace files that my run was still writing. Each run had its own port, so only the output folder was shared.
**Cost.** One full e2e run (about 3 minutes) that proved nothing and had to be read and discounted.
**Prevent by.** In `.cerebro/cerebro/agents/reviewer.md`, the narrow (producer's sub-agent) mode should say: never run Playwright in the producer's worktree; or run it with `--output` set to a directory of its own. Alternatively, `produce-bead` *The review loop* could tell the producer not to run browser suites while its reviewer is out.
**Seen before.** none found

## A new spec from main that is already flaky turned this PR's CI red twice

**What happened.** `e2e/failed-save.spec.ts:56` (from #45) failed in this PR's CI on the merge commit, and again after `update-branch`, where it passed on retry and `failOnFlakyTests` failed the job. With main's own code it fails 5 of 40 runs locally. Filed as hf-kix.
**Why.** A race in that spec, or in how the edit form handles a live update. Not established.
**Cost.** A rebase, a local check with main's toaster restored (about 10 minutes), and one bare CI re-run.
**Prevent by.** Before merging a spec, run it with `--repeat-each 10` on both projects, the way the acceptance of hf-6tl does. `produce-bead` *Building* could name that for any new or changed e2e spec.
**Seen before.** none found
