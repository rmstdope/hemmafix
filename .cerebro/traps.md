# Traps

The facts this project has already paid for, read by producers before they start.
One entry per trap: what happened, what it cost, and what to do about it.

## A migration that broke the previous release (0001, 0002; fixed in PR #8, 2026-11-15)

`deploy/runtime/app.json` declares `migration_policy: backward-compatible`: a release that does not
come up healthy is rolled back to the previous image, but its migrations stay. 0001 and 0002 only
worked with the new code, so a rollback would have left production running old code on a schema it
could not read. Every migration must work with the **previous** release's code too: add columns as
nullable or with a default (or a trigger that fills them, like `room_default_floor` in 0004), and
drop or reshape a column only in a later release, once no code reads it. Cover it in
`src/db/migrations.int.test.ts`. See *Migreringar* in `README.md`.

## The e2e database reset deadlocked against a late request (PR #8, 2026-11-15)

`resetDatabase` in the e2e support used `TRUNCATE`, which takes exclusive locks table by table,
while the server was still answering a late request from the previous test. Locally an e2e run hung
for 5-7 minutes; CI reported `deadlock detected`. It now deletes with `DELETE` and checks that the
tables are empty. Never go back to `TRUNCATE` there. If a stall recurs, keep the Playwright trace and
look at `pg_stat_activity` before changing anything.

## A merge to main is a production deploy

CI publishes every push to `main` and rmstdope-infra rolls it out to hemmafix.rmstdope.eu on its
own. So a producer merges its own pull request only once its review is addressed and every check
is green; nothing merges with a finding open or a check red or missing. The host registration in `deploy/runtime/` is frozen; a change there needs a separate, reviewed
re-registration and is never part of an ordinary bead.

## The Cerebro submodule looped the build (mounting Cerebro, 2026-11-15)

`.cerebro/cerebro` contains a symlink back into itself, and the fleet's worktrees sit under
`.cerebro/worktrees/` and `.claude/worktrees/`. Tailwind's automatic class detection followed the
link and Turbopack panicked (`'.cerebro/cerebro/.cerebro/cerebro' is a symlink ... infinite loop`);
`tsconfig.json`'s `**/*.ts` and ESLint would have swept in every worktree as well. They are excluded
in `src/app/globals.css` (`@source not`), `tsconfig.json`, `eslint.config.mjs` and `.dockerignore`.
Any new tool that globs the repository needs the same two exclusions.
