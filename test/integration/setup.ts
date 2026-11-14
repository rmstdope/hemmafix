// Runs before each integration test file: gives the file a private, migrated database and
// points DATABASE_URL (read by src/db when first imported) at it. Files therefore run in
// parallel without seeing each other's rows.
import { randomBytes } from "node:crypto";
import { afterAll, inject } from "vitest";
import { createDatabase, databaseUrl, dropDatabase } from "../database.mjs";

const prefix = inject("testDbPrefix");
const name = `${prefix}${randomBytes(4).toString("hex")}`;
await createDatabase(name, { template: `${prefix}template` });
process.env.DATABASE_URL = databaseUrl(name);

afterAll(async () => {
  // src/db keeps its pool on globalThis; close it so the database can be dropped.
  const g = globalThis as { pg?: { end(): Promise<void> } };
  await g.pg?.end();
  delete g.pg;
  await dropDatabase(name);
});
