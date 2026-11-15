// The `test` every spec imports: each test starts from an empty database, and the
// database connection is closed once the worker is done with all spec files.
import { randomBytes } from "node:crypto";
import { test as base } from "@playwright/test";
import { closeDatabase, resetDatabase } from "./family";

/**
 * Better Auth keeps one rate-limit bucket per client address and path, and without a forwarded
 * address every request lands in one shared bucket, so the suite as a whole is held to
 * /oauth2/authorize's 30 requests a minute. Each test presents itself as its own client, which
 * gives it the full allowance; the app's limit is untouched.
 */
export const test = base.extend<{ freshDatabase: void }, { database: void }>({
  extraHTTPHeaders: [
    async ({}, use) => {
      const [a, b, c] = randomBytes(3);
      await use({ "x-forwarded-for": `10.${a}.${b}.${c}` });
    },
    { scope: "test" },
  ],
  database: [
    async ({}, use) => {
      await use();
      await closeDatabase();
    },
    { scope: "worker", auto: true },
  ],
  freshDatabase: [
    async ({}, use) => {
      await resetDatabase();
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
