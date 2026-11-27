# hf-97l — retrospective

## `gh pr checks --required` exits 0 before the `e2e` check exists

**What happened.** Waiting for CI on #158 at `2ddb40f`, the loop polled `gh pr checks 158 --required`
until its exit status stopped being 8 (pending). It exited 0 listing `checks` and
`production-image` only. `e2e`, the third required check, was not listed at all: its shards were
still running.

**Why.** `e2e` is a job that needs every `e2e-shard` job, and GitHub creates its check only when it
can start. Until then `gh` has nothing pending to report for it (inferred from the output; the
GitHub behaviour was not looked up).

**Cost.** One extra wait loop, about three minutes. Caught by reading the check list before merging.

**Prevent by.** In `produce-bead`, *Merging*: a wait is over only when each required context named by
the branch protection (`required_status_checks.contexts`) is listed and has passed, never on the
exit status of `gh pr checks` alone.

**Seen before.** No.
