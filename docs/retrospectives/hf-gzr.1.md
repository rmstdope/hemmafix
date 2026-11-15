# hf-gzr.1 — green locally, red in CI: build without secrets, smoke test on a streamed page

## Two CI-only failures after a fully green local gate

**What happened**: The local gate (lint, typecheck, unit, int, build, e2e) was green, but CI failed twice. (1) `pnpm run build` and the image build failed prerendering `/.well-known/oauth-authorization-server/api/auth` with `BetterAuthError: You are using the default secret`: those GET route handlers were prerendered at build time and instantiated Better Auth with no `BETTER_AUTH_SECRET`. (2) After that was fixed, `deploy/smoke-test.sh` failed with `/login did not render`: `curl ... | grep -q Hemmafix` under `pipefail` fails with `curl: Failed writing body` once grep exits early, which only happens now that `/login` is a dynamic, streamed page.

**Why**: The local worktree has a copy of `.env` with the secret, so a local build never runs without one; CI and the image build do. The smoke test's `grep -q` pipe only worked while the login page arrived in one piece.

**Cost**: Two extra CI rounds (two of the three fix attempts) of about three minutes each, plus the time to find them.

**Prevent by**: Check a build without secrets before the PR: `BETTER_AUTH_SECRET= BETTER_AUTH_URL= GOOGLE_CLIENT_ID= pnpm run build` (any new route handler that touches `auth` needs `await connection()`). In `deploy/smoke-test.sh`, never pipe curl into `grep -q`; read into a variable first.

**Seen before**: no.

## A bare `git checkout <sha> --` detached the worktree

**What happened**: Mid-bead I ran `git checkout <sha>~0 --` meaning to restore a file, which detached HEAD. Later commits landed on the detached HEAD and `git push` pushed nothing, so the PR branch lagged three commits behind while PR comments already named the newer SHAs. Found only when CI reported the old head.

**Why**: Not established beyond the careless command; nothing in the workflow checks that the local branch still tracks the PR branch.

**Cost**: One CI round on a stale head and a corrected push.

**Prevent by**: After each push, compare `git rev-parse HEAD` with `gh pr view <n> --json headRefOid` before posting any SHA in a PR comment or waiting on CI.

**Seen before**: no.
