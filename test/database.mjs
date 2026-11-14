// Shared by the integration tests (Vitest) and the end-to-end tests (Playwright).
// Plain JavaScript so a bare `node` can run it before the e2e web server starts
// (test/migrate-database.mjs). No `import.meta`: Playwright loads this file as CommonJS.
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Test databases are created and dropped freely, so they must carry this prefix. */
export const TEST_DB_PREFIX = "hemmafix_test_";

/**
 * The server the tests may create databases on. Runners pin TEST_DATABASE_URL before any
 * test starts, because the integration setup repoints DATABASE_URL at a test database.
 */
export function serverUrl() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL to a Postgres you may create databases on");
  return url;
}

/** The same server, but database `name`. */
export function databaseUrl(name) {
  const url = new URL(serverUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

function assertTestName(name) {
  if (!new RegExp(`^${TEST_DB_PREFIX}[a-z0-9_]+$`).test(name)) {
    throw new Error(`Refusing to touch database "${name}": test databases must match ${TEST_DB_PREFIX}[a-z0-9_]+`);
  }
}

async function withAdmin(fn) {
  const admin = postgres(serverUrl(), { max: 1, onnotice: () => {} });
  try {
    return await fn(admin);
  } finally {
    await admin.end();
  }
}

export async function dropDatabase(name) {
  assertTestName(name);
  await withAdmin((admin) => admin.unsafe(`drop database if exists "${name}" with (force)`));
}

/** Creates `name` empty (or as a copy of `template`), replacing any database by that name. */
export async function createDatabase(name, { template } = {}) {
  assertTestName(name);
  if (template) assertTestName(template);
  await withAdmin(async (admin) => {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
    await admin.unsafe(`create database "${name}"${template ? ` template "${template}"` : ""}`);
  });
}

/** Creates `name` from scratch and applies every migration in ./drizzle. */
export async function createMigratedDatabase(name) {
  await createDatabase(name);
  const sql = postgres(databaseUrl(name), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: resolve(process.cwd(), "drizzle") });
  } finally {
    await sql.end();
  }
}
