// One place for the settings shared by playwright.config.ts (the web server) and the tests.
// Playwright loads this first in its main process, which then starts the web server and the
// test workers; both inherit what is pinned in process.env here.
import "dotenv/config";
import { databaseUrl, newRunPrefix } from "../../test/database.mjs";

// The server test databases are created on; must be pinned before DATABASE_URL is repointed.
process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
/** This run's database: overlapping runs never share (or drop) each other's. */
export const E2E_DB = (process.env.E2E_DB ??= `${newRunPrefix()}e2e`);
// Anything in the test process that opens the app's database gets the e2e one, never dev.
process.env.DATABASE_URL = databaseUrl(E2E_DB);

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
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
