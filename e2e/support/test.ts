// The `test` every spec imports: each test starts from an empty database, and the
// database connection is closed once the worker is done with all spec files.
import { test as base } from "@playwright/test";
import { closeDatabase, resetDatabase } from "./family";

let testsStarted = 0;

export const test = base.extend<{ freshDatabase: void }, { database: void }>({
  // Better Auth rate limits per client address (the authorize endpoint: 30 a minute), and every
  // test in the run shares one: give each test its own address, as separate people would have.
  extraHTTPHeaders: async ({}, provide) => {
    const n = ++testsStarted;
    await provide({ "x-forwarded-for": `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}` });
  },
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
