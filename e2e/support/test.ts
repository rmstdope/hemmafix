// The `test` every spec imports: each test starts from an empty database, and the
// database connection is closed once the worker is done with all spec files.
import { test as base } from "@playwright/test";
import { closeDatabase, resetDatabase } from "./family";

export const test = base.extend<{ freshDatabase: void }, { database: void }>({
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
