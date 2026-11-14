// One place for the settings shared by playwright.config.ts (the web server) and the tests.
import "dotenv/config";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DB = "hemmafix_test_e2e";
/** Test-only secret: the tests sign session cookies with it, exactly as the server does. */
export const E2E_AUTH_SECRET = "e2e-secret-not-for-production-0123456789abcdef";

export const PEOPLE = {
  anna: { name: "Anna Andersson", email: "anna@e2e.test" },
  bo: { name: "Bo Andersson", email: "bo@e2e.test" },
} as const;
export type Person = keyof typeof PEOPLE;

process.env.TEST_DATABASE_URL ??= process.env.DATABASE_URL;
