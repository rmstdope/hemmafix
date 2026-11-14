// Shared by the integration tests (Vitest) and the end-to-end tests (Playwright).
// Plain JavaScript so a bare `node` can run it before the e2e web server starts
// (test/migrate-database.mjs). No `import.meta`: Playwright loads this file as CommonJS.
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Test databases are created and dropped freely, so they must carry this prefix. */
export const TEST_DB_PREFIX = "hemmafix_test_";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * The server the tests may create databases on. Runners pin TEST_DATABASE_URL before any
 * test starts, because the integration setup repoints DATABASE_URL at a test database.
 * Only a local server, unless in CI or explicitly allowed: a `.env` pointing somewhere else
 * must not get test databases created and dropped on it.
 */
export function serverUrl() {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL to a Postgres you may create databases on");
  const { hostname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname) && !process.env.CI && process.env.ALLOW_REMOTE_TEST_DB !== "1") {
    throw new Error(
      `Refusing to create test databases on ${hostname}: use a local Postgres, or set ALLOW_REMOTE_TEST_DB=1`,
    );
  }
  return url;
}

/** The same server, but database `name`. */
export function databaseUrl(name) {
  const url = new URL(serverUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * A prefix for one test run's databases: `hemmafix_test_r<pid>_<random>_`, where pid is the
 * process that owns the run. Overlapping runs never share a database, and a later run can
 * tell that a leftover database belongs to a run whose process is gone.
 */
export function newRunPrefix(pid = process.pid) {
  return `${TEST_DB_PREFIX}r${pid}_${randomBytes(3).toString("hex")}_`;
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

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/**
 * Drops databases left by interrupted runs on this machine: those whose owning process no
 * longer exists. A database of a live run is never touched.
 */
export async function dropStaleDatabases() {
  await withAdmin(async (admin) => {
    const rows = await admin`select datname from pg_database where datname like ${`${TEST_DB_PREFIX}r%`}`;
    for (const { datname } of rows) {
      const pid = Number(/^hemmafix_test_r(\d+)_/.exec(datname)?.[1]);
      if (!pid || isRunning(pid)) continue;
      assertTestName(datname);
      await admin.unsafe(`drop database if exists "${datname}" with (force)`);
    }
  });
}
