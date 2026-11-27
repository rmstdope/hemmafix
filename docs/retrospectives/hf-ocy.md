# hf-ocy — retrospective

- **Implementer:** Storm
- **Date:** 2026-11-27
- **PR:** #166

## Leaked e2e servers still hold the port blocks `smoke-port` tries

**What happened.** `smoke-port -- pnpm run test:e2e` exited 3 before running a test: every block it
tried was taken. Six holders (3210 to 3260) were `next-server` processes started on 23 and 24
November from the `.next/standalone` of the worktrees `hf-lzb.9`, `hf-lzb.10` and `hf-bn7`, none of
which exists any more. The other two blocks were held by runs of other sessions, so the suite ran only
after polling until a block came free.
**Why.** Not established how the servers outlived their runs.
**Cost.** A second start of the suite, a wait for a free block, and a process listing to find out
who held them. The processes were left running: they are not this session's to stop.
**Prevent by.** The navigator stopping the six processes, and a step in Cerebro's worktree removal
(or in `smoke-port` itself) that ends a listener whose working directory no longer exists.
**Seen before.** hf-5pl, hf-fh6.
