# hf-o78

## A local e2e run stalled for eight minutes because the Mac slept

**What happened:** One run of `connect-claude` and `connected-apps` took 14.5 minutes instead of about 3. In the trace, one test, "an adult sees only their own apps…" [mobile], spent about 503 s inside a single 5 s `toBeVisible` check after its page had loaded in 48 ms, then failed with "Test timeout of 30000ms exceeded".

**Why:** `pmset -g log` shows `Entering Sleep state due to 'Idle Sleep' … Using Batt … 504 secs` at the same moment. The laptop was on battery, the last `caffeinate` sleep assertion had just exited, and the Playwright runner and the server were frozen with it. This may also be the "unexplained local e2e stall" noted after the MVP.

**Cost:** About 8 minutes of the run, one false failure to tell apart from the real ones, and a trace read to find the gap.

**Prevent by:** running long local suites under `caffeinate -i` (for example `caffeinate -i .cerebro/cerebro/scripts/smoke-port -- pnpm run test:e2e`). The *Pre-merge checklist* in `CLAUDE.md` could say so for the e2e step. When a local e2e test stalls far past its timeout, check `pmset -g log` for a sleep before looking at the app.

**Seen before:** nothing like it yet.

## Repeating the Claude specs trips the authorize rate limit

**What happened:** `--repeat-each 3` on the two specs failed eight tests with a page reading `{"message":"Too many requests. Please try again later."}`.

**Why:** The oauth-provider plugin limits `/oauth2/authorize` to 30 requests, and Better Auth's limiter resets its counter only after 60 s with no request at all (`better-auth/dist/api/rate-limiter`). One full e2e run makes 28 authorize requests, 14 per project, so repeats exceed the limit. A few more authorize calls in the suite would exceed it in CI too.

**Cost:** One 3.5-minute run that looked like a new failure.

**Prevent by:** repeating these specs in separate invocations (each starts a fresh server, and with it a fresh limiter) rather than with `--repeat-each`. Raising the margin for the e2e server is a separate bead for the navigator.

**Seen before:** nothing like it yet.
