# hf-78l — retrospective

- **Implementer:** Storm
- **Date:** 2026-11-27
- **PR:** #181

## `pnpm exec` rewrote pnpm-lock.yaml during a mutation check

**What happened.** To show that `test/repo/node-version.test.ts` fails, a script changed
`@types/node` in `package.json` for one `pnpm exec vitest` run and put it back. `package.json` came
back unchanged, but `pnpm-lock.yaml` was modified and `@types/node` had moved from 26.6.7 to
26.6.11 in `node_modules`. `git checkout pnpm-lock.yaml && pnpm install --frozen-lockfile` undid it.

**Why.** pnpm 11 installed before running the command, because `package.json` no longer matched the
lockfile.

**Cost.** A few minutes; it would have put an unrelated dependency bump in the pull request had
`git status` not been read before the commit.

**Prevent by.** `.claude/skills/produce-bead` or `.cerebro/traps.md`: when mutating `package.json`
for a test, call `node_modules/.bin/vitest` rather than `pnpm exec`.

**Seen before.** none found.

## 15 integration tests timed out under fleet load

**What happened.** `pnpm run test:int` failed 15 of 501 tests, all on timeouts, in a branch that
changes no server code. After eight minutes of waiting for the load to fall (it stayed at 42-58)
the rerun passed 501/501.

**Why.** `uptime` showed a load average of 54; many of these tests sit under vitest's 5000 ms
default only on a quiet machine.

**Cost.** About ten minutes.

**Prevent by.** `vitest.config.mts`, integration project: a `testTimeout` well above 5000 ms.

**Seen before.** hf-z7p, hf-q4o, hf-qjk and others in this directory record the same timeout.
