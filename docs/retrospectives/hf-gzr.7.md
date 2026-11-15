# hf-gzr.7

## The e2e suite hit Better Auth's authorize rate limit

**What happened**: After adding six tests that open `/api/auth/oauth2/authorize`, the later desktop tests showed `{"message":"Too many requests..."}` instead of the page. Each passed alone.

**Why**: `@better-auth/oauth-provider` limits `/oauth2/authorize` to 30 a minute per client address, and every test in the run shares one address.

**Cost**: About 15 minutes of reading failure traces before finding the JSON body in `error-context.md`.

**Prevent by**: `e2e/support/test.ts` now gives each test its own `x-forwarded-for`. A new test that calls an OAuth endpoint needs no extra care; read `error-context.md` first when a page is unexpectedly missing.

**Seen before**: nothing like it yet.

## A pre-existing e2e test failed once in CI only

**What happened**: "Avbryt sends the adult back to Claude with nothing granted" saw the redirect captured twice (expected 1) on one CI run; 30 of 30 local repeats passed, and the CI re-run passed.

**Why**: it recurred later with a per-test `x-forwarded-for` header sent on cross-origin requests too, and went away once the header was scoped to requests to the app only (`e2e/support/test.ts`); that header on the redirect to Claude was the likely cause.

**Cost**: One CI re-run (of two allowed).

**Prevent by**: send per-test headers only on requests to the app origin (done in `e2e/support/test.ts`).

**Seen before**: nothing like it yet.
