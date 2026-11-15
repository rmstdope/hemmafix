# hf-fyj.2: an e2e test green locally, red in CI

## What happened
`e2e/add-routine.spec.ts` ("a routine removed while the form is open") deleted every routine through the database and then expected the filled-in form to still show its room. Locally it passed 20+ times; in CI on desktop it failed twice in a row (initial run and retry): a live refresh (the SSE `onopen` refresh) arrived late, props then held no routines, and the form correctly switched to "Inga rutiner ännu.", so the room field was gone.

## Why
The test depended on whether a refresh had arrived before its assertion. The app behaved as designed; the test asserted a state that only holds in one of two valid timings.

## Cost
One red CI run (~4 min) and one extra push.

## Prevent by
When an e2e test changes data behind the page's back while the page has a live-updates connection, change only what the assertion does not depend on (here: delete just the chosen routine), or notify and wait for the refresh explicitly. Add to `e2e/` review checks for specs that use `db.delete`/`db.insert` on open pages.

## Seen before
Nothing like it yet.
