# Test architecture

Agreed with the navigator 2026-11-27.

## Unit             src/**/*.test.ts (not *.int.test.ts), pnpm test
  Belongs here:    pure decisions in src/lib — validation, dates and recurrence, permissions, coins and levels, which words to show
  Not here:        the database, files, processes, the network, the real clock
  Enough is:       every branch of a decision once

## Integration      src/**/*.int.test.ts, pnpm test:int
  Belongs here:    server code against a real Postgres — each server function's and action's rules, refusals and household scoping, the login hooks, live notifications, migrations with the previous release's code
  Not here:        pure logic a unit test pins branch by branch; a mocked database; waits on the real clock
  Enough is:       every rule and refusal once, at the function that decides it

## System           e2e/*.spec.ts, pnpm test:e2e (the production build in Chromium, mobile and desktop); deploy/smoke-test.sh for the image; src/server/mcp*.int.test.ts for what a connected app does through its tools
  Belongs here:    one requirement each, named by its ID — what a family member sees and does, on phone and desktop
  Not here:        branch-by-branch rules that unit or integration pin; a second viewport's run of a test that sets its own width or loads no page
  Enough is:       every requirement once; both viewports only where the viewport changes what is seen
