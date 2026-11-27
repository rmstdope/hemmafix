# Instructions

@AGENTS.md

`AGENTS.md` holds the Next.js block that `next dev` writes and re-adds; it is imported above so every
session reads it. Keep it, and put everything else here.

## The project

Hemmafix is a family's shared to-do list for the home, a Next.js 16 web app (App Router, TypeScript,
PostgreSQL 17 through Drizzle, Better Auth with Google, Tailwind and shadcn/ui) that is installable
on a phone as a PWA. A family member logs in with Google, sets up the home's floors, rooms and chores
(predefined or custom, recurring or one-off), assigns them to someone and ticks them off; a recurring
chore comes back one interval after it was done, and the list updates live on everyone's devices.
Adults change the home, the rooms and the chores; children tick chores off and see what they have
done. "Working" means a family member can do all of that on both phone and desktop, that only
addresses on `ALLOWED_EMAILS` get in, and that every release deploys and rolls back cleanly.

Everything a family member reads is in **Swedish**: labels, messages, errors, dates
(`sv-SE`, `Europe/Stockholm`). Code, comments, tests, commits and pull requests are in English,
except that the existing Swedish `README.md` and `deploy/README.md` stay Swedish.

## Producer review

Nothing merges red. Before delivery, a producer obtains and addresses one independent, full review
of the complete diff and bead. If its changes are substantial enough to make another review useful,
the producer chooses the right follow-up scope and obtains it; minor, self-contained answers need
not create a review loop. Unresolved findings, a red or missing check, or a reviewer that cannot
produce a usable result go to a person. Whether the navigator also takes part in the plan, the
review or the merge is `navigator_gates` in `.cerebro/project.conf`; absent means none. Once its
review is addressed and every CI check is green, the producer merges its own pull request. A merge
to `main` deploys to production (see *Deployment*), so a producer never merges with a finding
unresolved or a check red or missing.

## Work tracking

Planned work is tracked in beads (`bd`), prefix `hf`; the `beads-workflow` skill
(`.claude/skills/beads-workflow`) carries the commands.
GitHub issues are the inbox for outside requests and bug reports only. Every bead is created unranked
and ranked later with the navigator; a bead is planned in one session and implemented in another.

The board syncs through the Dolt remote on `origin`, not through git. A fresh clone runs
`bd bootstrap` once (it refuses if a database already exists, so do not run `bd list` first); after
that it is `bd dolt pull` and `bd dolt push`.

## Skills usage

Always select the appropriate skill for a task, say in the chat which skills are in use, and follow
their instructions to the letter.

## Development practices

- Work is delivered in very small increments that stand on their own.
- Code is written test-first. A bug fix starts with a test that reproduces it. While pinpointing a
  bug, traces and experiments are fine without tests; once it is pinpointed, the failing test comes
  before the fix.
- Prefer the simple design; say so when you decline a more general one. Ask the navigator when a
  requirement is ambiguous, with the question tool and predefined answers plus a free-text option.
- Every pull request is reviewed by another instance before it merges (four-eyes), and never merges
  with a failing check.

## Architecture

- Pages, server actions (`actions.ts`) and API routes live in `src/app/`; UI components in
  `src/components/` (`ui/` is shadcn's); the Drizzle schema and client in `src/db/`; pure logic
  (validation, dates, the allowlist) in `src/lib/`; auth, the data access layer and queries in
  `src/server/`. SQL migrations are in `drizzle/`.
- What a role may do is decided in one place, `src/lib/permissions.ts`, and who may log in at all in
  `src/lib/access.ts` (`ALLOWED_EMAILS`); both are checked on the server in every action. Never rely
  on the UI hiding a button. A home always keeps at least one adult.
- Live updates go through Server-Sent Events (`src/app/api/events/`) on Postgres `LISTEN/NOTIFY`.
- The data model supports several households; today one household is created on first login.
- Validate every input at the boundary with Zod.

## Migrations

`deploy/runtime/app.json` declares `migration_policy: backward-compatible`: a release that does not
come up healthy is rolled back to the previous image, but migrations are never rolled back. Every
migration must therefore work with the **previous** release's code as well:

- Change `src/db/schema.ts`, then `pnpm db:generate`; never hand-edit a generated migration's
  snapshot. CI fails when the schema and the migrations disagree.
- Add columns as nullable or with a default (or a trigger that fills them, like `room_default_floor`
  in `0004`). Drop or reshape a column only in a later release, once no code reads it.
- Cover the compatibility in `src/db/migrations.int.test.ts`.
- Destructive changes are planned maintenance with a database dump first, never an ordinary bead.

## Testing

Four levels, all run in CI on every pull request that changes anything outside `docs/`:

- **Unit** (`src/**/*.test.ts`, `pnpm test`): pure logic next to the code it covers, no database
  (an accidental import of `src/db` fails loudly).
- **Repository checks** (`test/repo/**/*.test.ts`, `pnpm test:repo`): what holds the build and deploy
  setup together: `scripts/ci-needed.sh`, the mistakes in `ci.yml` that would pass unnoticed, the
  end-to-end shard split and workers, and the Node version stated more than once. Unit tests read no files and start no processes.
- **Integration** (`src/**/*.int.test.ts`, `pnpm test:int`): server code against a real Postgres,
  including the login hooks in `src/server/auth.ts`. Each file gets its own freshly migrated
  database. Mock as little as possible.
- **End-to-end** (`e2e/`, Playwright, `pnpm e2e`): the production build in Chromium, mobile and
  desktop. Tests log in through Better Auth's `test-utils` plugin, which exists only in the test
  process; the app itself has no test login, and none may be added. A test tagged `RUN_ONCE`
  (`e2e/support/tags.ts`) runs in mobile only: one that sets its own viewport before it loads
  anything or loads no page, or one whose subject the viewport cannot change (server rules, coin
  arithmetic, history), which takes the navigator's approval. Tests of layout, the header, menus,
  touch or narrow screens run on both. CI splits the suite into seven shards on separate runners
  (`e2e-shard` in `ci.yml`), each running two tests at a time; the required check `e2e` passes only
  when every shard does. Each worker has its own server and database (`e2e/support/slots.ts`), so
  tests running at once share nothing; locally one runs at a time unless `E2E_WORKERS` says
  otherwise (use it, not `--workers`). A test that ticks something off and then clicks on logs in
  with `logInWithChestTaken`, or the day's chest card covers the page. The split
  is test by test, by the times in `e2e/support/test-times.json`, so a test must not depend on
  another having run before it (a file that must stay together declares `mode: "serial"`). A new
  spec or test needs no registration; when the shards drift apart, refresh the times as
  `e2e/support/refresh-test-times.mjs` says.

Integration and e2e need a local Postgres (README *Kom igång*) and create databases named
`hemmafix_test_*` on `TEST_DATABASE_URL` (else `DATABASE_URL`). A worktree gets a copy of the main
checkout's `.env` from `install_shell` in `.cerebro/project.conf`. Parallel worktrees get their own
block of e2e ports through `E2E_PORT` (two per worker).

A pull request that changes only files under `docs/` still reports the three required checks, but they
skip their steps (`scripts/ci-needed.sh`). So nothing under `docs/` may be read by the app, its
tests, its tools or its image.

## Pre-merge checklist

Before opening a pull request, run the full gate locally. It mirrors `.github/workflows/ci.yml`
except CI's `pnpm run db:migrate` on an empty database, which locally would migrate the dev
database; the integration tests already migrate a fresh database per file. If the drift check fails
it leaves a `*_ci-drift-check.sql` behind in `drizzle/`: delete it and run `pnpm db:generate`.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium   # once per machine
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:repo
pnpm run test:int
pnpm exec drizzle-kit generate --name ci-drift-check   # must leave drizzle/ unchanged
pnpm run build
pnpm run test:e2e
```

Run each check as its own command and read its exit status; never chain them with `;` or pipe their
output through `grep`, since that hides failures. No ESLint or TypeScript inline directives
(`eslint-disable`, `@ts-ignore`, `@ts-expect-error`) and no `any`; configure lint and types globally.

## Deployment

Every push to `main` builds, smoke-tests and publishes an image, and rmstdope-infra rolls it out to
hemmafix.rmstdope.eu on its own; a push that changes only `docs/` starts no CI run and releases
nothing. Any other merge is a production release: the producer merges only a
reviewed pull request with every check green (*Producer review*).
The host registration in `deploy/runtime/` is frozen: changes there (Postgres version, memory limits,
secret files, environment) need a separate, reviewed re-registration and are never part of an
ordinary bead. The image must keep the rmstdope-infra contract: port 8080, `/healthz`,
`/release.json`, migrations at start, fast shutdown on SIGTERM. See `deploy/README.md`.

## Chat

Be concise about what you are about to do, are doing and have done. When asking the navigator
something, use the question tool with predefined answers and a free-text option.
