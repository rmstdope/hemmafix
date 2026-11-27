import { defineConfig, devices } from "@playwright/test";
import { ALLOWED, E2E_AUTH_SECRET, E2E_BASE_URL, E2E_DB, E2E_PORT, PEOPLE } from "./e2e/support/env";
import { RUN_ONCE } from "./e2e/support/tags";
import { databaseUrl } from "./test/database.mjs";

/**
 * End-to-end tests against the production build (`pnpm build` first, or `pnpm e2e`). The
 * web server gets its own freshly migrated database and a throwaway secret; tests share it,
 * so they run one at a time and reset the database before each test.
 */
/** Splits a `--shard` run by the time each test takes. */
const sharding = ["./e2e/support/balanced-shards.ts"] as const;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // A retry shows whether a failure is flaky, but a flaky test still fails the run.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  globalTeardown: "./e2e/support/global-teardown.ts",
  // `list` in CI too: its per-test times are what `test-times.json` is refreshed from.
  reporter: process.env.CI
    ? [sharding, ["list"], ["github"], ["html", { open: "never" }]]
    : [sharding, ["list"]],
  use: {
    baseURL: E2E_BASE_URL,
    locale: "sv-SE",
    timezoneId: "Europe/Stockholm",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    // A second viewport adds nothing to these: see `RUN_ONCE`.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: new RegExp(RUN_ONCE) },
  ],
  webServer: {
    // The standalone server, as in the production image (which also copies these assets in).
    command: [
      `node test/migrate-database.mjs ${E2E_DB}`,
      "cp -R public .next/standalone/",
      "cp -R .next/static .next/standalone/.next/",
      "node .next/standalone/server.js",
    ].join(" && "),
    url: `${E2E_BASE_URL}/healthz`,
    // Never test against a server started elsewhere: it would use another database and secret.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      // The server that `test/migrate-database.mjs` creates the e2e database on.
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL!,
      DATABASE_URL: databaseUrl(E2E_DB),
      BETTER_AUTH_URL: E2E_BASE_URL,
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      GOOGLE_CLIENT_ID: "e2e",
      GOOGLE_CLIENT_SECRET: "e2e",
      ALLOWED_EMAILS: ALLOWED.map((p) => PEOPLE[p].email).join(","),
      TZ: "Europe/Stockholm",
      PORT: String(E2E_PORT),
      HOSTNAME: "localhost",
    },
  },
});
