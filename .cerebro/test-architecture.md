# Test architecture

Agreed with the navigator 2026-11-27.

## Unit             src/**/*.test.ts (not *.int.test.ts), pnpm test
  Belongs here:    pure decisions in src/lib — validation, dates and recurrence, permissions, coins and levels, which words to show
  Not here:        the database, files, processes, the network, the real clock
  Enough is:       every branch of a decision once

## Repository checks   test/repo/**/*.test.ts, pnpm test:repo
  Belongs here:    what holds the build and deploy setup together — a script that decides something, the CI workflow's mistakes that would pass unnoticed, a fact the repository states twice; and the proof of a requirement about releases that the workflow alone keeps (REL-3), named by its ID
  Not here:        the app's own logic; a line of a file restated, where breaking it shows itself in a run
  Enough is:       every answer of a script once; each silent failure of the workflow once; each repeated fact once, against the real tree and not on made-up input

## Integration      src/**/*.int.test.ts, pnpm test:int
  Belongs here:    server code against a real Postgres — each server function's and action's rules, refusals and household scoping, the login hooks, live notifications, migrations with the previous release's code
  Not here:        pure logic a unit test pins branch by branch; a mocked database; waits on the real clock
  Enough is:       every rule and refusal once, at the function that decides it

## System           e2e/*.spec.ts, pnpm test:e2e (the production build in Chromium, mobile and desktop); deploy/smoke-test.sh for the image; src/server/mcp*.int.test.ts for what a connected app does through its tools
  Belongs here:    one requirement each, named by its ID — what a family member sees and does, on phone and desktop (REL-3 is proven by the repository checks)
  Not here:        branch-by-branch rules that unit or integration pin; a second viewport's run of a test that sets its own width or loads no page
  Enough is:       every requirement once; both viewports only where the viewport changes what is seen
