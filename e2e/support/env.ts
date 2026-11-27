// One place for the settings shared by playwright.config.ts (the web servers) and the tests.
// Playwright loads this first in its main process, which then starts the web servers and the
// test workers; both inherit what is pinned in process.env here. Each worker loads it again and
// gets its own server and database: `E2E_PORT`, `E2E_BASE_URL` and `E2E_DB` as exported here
// are this process's, and in the main process the first worker's.
import "dotenv/config";
import { databaseUrl, newRunPrefix } from "../../test/database.mjs";
import { workerCount, workerSlot } from "./slots";

// The server test databases are created on; must be pinned before DATABASE_URL is repointed.
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
/** The name this run's databases start with: overlapping runs never share (or drop) each other's. */
const runDb = (process.env.E2E_DB ??= `${newRunPrefix()}e2e`);
const basePort = Number(process.env.E2E_PORT ?? 3100);

/** How many tests run at once, and each worker's own server and database. */
export const E2E_WORKERS = workerCount(process.env);
export const E2E_SLOTS = Array.from({ length: E2E_WORKERS }, (_, i) => workerSlot(basePort, runDb, i));

// Playwright sets the index in a worker before it loads the configuration.
const index = Number(process.env.TEST_PARALLEL_INDEX ?? 0);
const slot = E2E_SLOTS[index];
if (!slot) {
  throw new Error(`No server for worker ${index}: set the number of workers with E2E_WORKERS=<n>, not --workers`);
}
export const { port: E2E_PORT, baseUrl: E2E_BASE_URL, db: E2E_DB } = slot;
// Anything in the test process that opens the app's database gets its worker's, never dev.
process.env.DATABASE_URL = databaseUrl(E2E_DB);
/** Test-only secret: the tests sign session cookies with it, exactly as the server does. */
export const E2E_AUTH_SECRET = "e2e-secret-not-for-production-0123456789abcdef";

export const PEOPLE = {
  anna: { name: "Anna Andersson", email: "anna@e2e.test" },
  bo: { name: "Bo Andersson", email: "bo@e2e.test" },
  /** Has a Google account but is not on ALLOWED_EMAILS. */
  eve: { name: "Eve Utomstående", email: "eve@e2e.test" },
} as const;
export type Person = keyof typeof PEOPLE;

/** The people the web server lets in. */
export const ALLOWED: Person[] = ["anna", "bo"];
