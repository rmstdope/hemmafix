# hf-26z — retrospective

- **Implementer:** Wolverine
- **Date:** 2026-11-27
- **PR:** #151

## A manual merge fell behind main four times in a row

**What happened.** `scripts/ship` exited 3 ("no fleet view has swept in ten minutes"), so the
producer merged by hand. Branch protection is strict, other pull requests merged every 5 to 20
minutes, and each `update-branch` restarted a 13-minute end-to-end job: the branch was `BEHIND`
again after four green runs.

**Why.** One CI run took about as long as, or longer than, the gap between merges, and nothing
queues the merges of producers that merge by hand.

**Cost.** About an hour of waiting and five CI runs for one reviewed head.

**Prevent by.** A GitHub merge queue on `main`, or a fleet view that is always sweeping so `ship`
serialises the merges. #150 (hf-aqe, ten e2e shards) shortens each run, which narrows the window.

**Seen before.** Not for the repeated catch-up; `ship` exit 3 is not recorded either.
