# hf-gzr.6

## A second token-verifying e2e spec failed only in the full run

**What happened:** `e2e/connected-apps.spec.ts` called `/mcp` with a fresh access token and got `{"message":"invalid access token"}` in `pnpm run test:e2e`, but passed alone and next to `connect-claude.spec.ts`.

**Why:** Not fully established. `resetDatabase` deleted `jwks` after every test, while the server caches its signing keys (`jwksCacheKey` is the adapter); a token signed with a new key is then unverifiable until the cache refreshes. Keeping `jwks` between tests made the full run green.

**Cost:** Three full e2e runs (about 1.5 minutes each) and a read through the provider's JWKS code.

**Prevent by:** the note in `resetDatabase` (`e2e/support/family.ts`) that `jwks` is kept on purpose, and its exclusion from the empty-tables check.

**Seen before:** nothing like it yet.
