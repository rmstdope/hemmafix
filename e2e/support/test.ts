// The `test` every spec imports: each test starts from an empty database, and the
// database connection is closed once the worker is done with all spec files.
import { test as base } from "@playwright/test";
import { closeDatabase, resetDatabase } from "./family";

export const test = base.extend<{ freshDatabase: void }, { database: void }>({
  // Better Auth rate limits per client address (the authorize endpoint: 30 a minute), and every
  // test in the run shares one: give each test its own address, as separate people would have.
  extraHTTPHeaders: async ({}, provide) => {
    const n = () => Math.floor(Math.random() * 254) + 1;
    await provide({ "x-forwarded-for": `10.${n()}.${n()}.${n()}` });
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
