# hf-5pl — retrospective

- **Producer:** Wolverine
- **Date:** 2026-11-27
- **PR:** #144

## Leaked e2e servers held every port block `smoke-port` tries

**What happened.** `smoke-port -- pnpm exec playwright test …` exited 3 before running anything:
"every block tried was taken: 3210(listening) … 3260(listening) 3270(held by pid …) 3280(held by
pid …)". The listeners checked were `next-server` processes started on 23 and 24 November from the
`.next/standalone` of worktrees `hf-lzb.9`, `hf-lzb.10` and `hf-bn7`, none of which exists any more.
`--blocks 40` found a free block; the processes were left running.

**Why.** Not established how an e2e web server outlived its run and its worktree. `smoke-port` tries
eight blocks by default, and six of them were held by these leftovers.

**Cost.** One failed run and a few minutes. With two more fleet sessions testing, no default run
could have started.

**Prevent by.** A step in the fleet view's worktree removal (or `scripts/ship`'s tidy-up) that kills
processes whose working directory is inside the tree being removed.

**Seen before.** Nothing like it in this directory.
