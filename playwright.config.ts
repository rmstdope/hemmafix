import { defineConfig, devices } from "@playwright/test";
import { ALLOWED, E2E_AUTH_SECRET, E2E_BASE_URL, E2E_SLOTS, E2E_WORKERS, PEOPLE } from "./e2e/support/env";
import { RUN_ONCE } from "./e2e/support/tags";
import { databaseUrl } from "./test/database.mjs";

/** Splits a `--shard` run by the time each test takes. */
const sharding = ["./e2e/support/balanced-shards.ts"] as const;

/**
 * End-to-end tests against the production build (`pnpm build` first, or `pnpm e2e`). Each
 * worker has a web server of its own with a freshly migrated database and a throwaway secret,
 * and resets that database before each test, so tests running at once never share state.
 */
export default defineConfig({
  testDir: "./e2e",
  // Test by test, so every worker stays busy to the end, also when few files are left.
  fullyParallel: true,
  workers: E2E_WORKERS,
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
    // A second viewport adds nothing to the tagged tests: see `RUN_ONCE`.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, grepInvert: new RegExp(RUN_ONCE) },
  ],
  // Playwright starts these one after another, so the copies never run over each other.
  webServer: E2E_SLOTS.map(({ port, baseUrl, db }) => ({
    // The standalone server, as in the production image (which also copies these assets in).
    command: [
      `node test/migrate-database.mjs ${db}`,
      "cp -R public .next/standalone/",
      "cp -R .next/static .next/standalone/.next/",
      "node .next/standalone/server.js",
    ].join(" && "),
    url: `${baseUrl}/healthz`,
    // Never test against a server started elsewhere: it would use another database and secret.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe" as const,
    env: {
      // The server that `test/migrate-database.mjs` creates the e2e database on.
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL!,
      DATABASE_URL: databaseUrl(db),
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      GOOGLE_CLIENT_ID: "e2e",
      GOOGLE_CLIENT_SECRET: "e2e",
      ALLOWED_EMAILS: ALLOWED.map((p) => PEOPLE[p].email).join(","),
      TZ: "Europe/Stockholm",
      PORT: String(port),
      HOSTNAME: "localhost",
    },
  })),
});
