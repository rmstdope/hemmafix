# hf-83j: a flaky e2e on an unrelated head

## What happened
On PR #53 (a docs-only change) the e2e job failed after `update-branch`: `[desktop] e2e/failed-save.spec.ts:56 an edit to a room removed meanwhile ...` never saw "Rummet finns inte", on the first run and on Playwright's retry. Four local repeats passed; a bare re-run of the same head passed.

## Why
Not established. The test arrived with hf-alp (#50).

## Cost
One re-run of the e2e job (~4 min) and a local reproduction attempt.

## Prevent by
Next failure: keep the trace from the CI artifact and look at the timing of the room removal against the Spara click in `e2e/failed-save.spec.ts` before re-running.

## Seen before
Nothing like it yet.
