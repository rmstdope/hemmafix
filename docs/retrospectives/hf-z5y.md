# hf-z5y: green locally, red in CI

## What happened
My new integration test asserted the exact list of read-only MCP tools. Locally it passed; CI failed because CI tests the PR merged with main, and main had gained `visa_rutiner` (already read-only) after my branch point.

## Why
An exact-list assertion over tools breaks whenever another bead adds a tool, and my tree was behind main.

## Cost
One red CI run (a fix attempt) and about 5 minutes.

## Prevent by
Rebase onto `origin/main` and rerun `pnpm run test:int` before opening the PR; or assert the read-only set as a subset plus "every tool is either read-only or marked write" rather than an exact list.

## Seen before
Nothing like it yet.
