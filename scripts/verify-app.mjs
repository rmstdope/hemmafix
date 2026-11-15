// The verifier's Hemmafix: the merged production build on the local `hemmafix_verify` database.
// Used by the `verify-hemmafix` skill and declared as `launch_web` in .cerebro/project.conf.
//
//   node --env-file=.env scripts/verify-app.mjs serve                 migrate, then serve the build on :3000
//   node --env-file=.env scripts/verify-app.mjs status                who is in the home, and the logins that still work
//   node --env-file=.env scripts/verify-app.mjs role <email> <adult|child>
//   node --env-file=.env scripts/verify-app.mjs member <name> <adult|child>   a family member who never logs in
//   node --env-file=.env scripts/verify-app.mjs reset                 empty the home; keep the logins
//
// The database lives on the same local server as DATABASE_URL and is never dropped: its users,
// accounts and sessions survive every reset, so the navigator's Google login (60 days, renewed on
// use) carries over from one look to the next. Everything else in the home is emptied by `reset`.
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const VERIFY_DB = "hemmafix_verify";
const PORT = "3000"; // the only local port Google redirects back to
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function verifyUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL is not set: run with `node --env-file=.env`");
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname)) fail(`refusing a database on ${url.hostname}: verification runs on a local Postgres only`);
  url.pathname = `/${VERIFY_DB}`;
  return url.toString();
}

function fail(message) {
  console.error(`verify-app: ${message}`);
  process.exit(1);
}

async function withSql(url, fn) {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function ensureDatabase(quiet = false) {
  const url = verifyUrl();
  const server = new URL(url);
  server.pathname = "/postgres";
  await withSql(server.toString(), async (sql) => {
    const [found] = await sql`select 1 from pg_database where datname = ${VERIFY_DB}`;
    if (!found) {
      await sql.unsafe(`create database ${VERIFY_DB}`);
      if (!quiet) console.log(`verify-app: created ${VERIFY_DB}`);
    }
  });
  await withSql(url, (sql) => migrate(drizzle(sql), { migrationsFolder: "./drizzle" }));
  if (!quiet) console.log(`verify-app: ${VERIFY_DB} is migrated to this tree`);
  return url;
}

async function serve() {
  if (!existsSync(".next/standalone/server.js")) fail("no build: run `pnpm build` first (the verifier's prewarm)");
  const url = await ensureDatabase();
  // As the production image and the e2e server do: the standalone server serves these from its own folder.
  cpSync("public", ".next/standalone/public", { recursive: true });
  cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
  const child = spawn(process.execPath, [".next/standalone/server.js"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, PORT, HOSTNAME: "127.0.0.1", BETTER_AUTH_URL: `http://localhost:${PORT}` },
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => process.exit(code ?? 0));
  console.log(`verify-app: Open http://localhost:${PORT}/`);
}

async function status() {
  await withSql(await ensureDatabase(true), async (sql) => {
    const homes = await sql`select name from household order by created_at`;
    const members = await sql`
      select u.name, u.email, m.role, exists(select 1 from account a where a.user_id = u.id) as logs_in,
             (select max(s.expires_at) from session s where s.user_id = u.id and s.expires_at > now()) as login_until
      from membership m join "user" u on u.id = m.user_id order by u.created_at`;
    const [counts] = await sql`select (select count(*) from floor) floors, (select count(*) from room) rooms,
      (select count(*) from chore) chores, (select count(*) from oauth_client) apps`;
    console.log(JSON.stringify({ homes: homes.map((h) => h.name), members, ...counts }, null, 2));
  });
}

async function role(email, newRole) {
  if (!email || !["adult", "child"].includes(newRole)) fail("usage: role <email> <adult|child>");
  await withSql(await ensureDatabase(true), async (sql) => {
    const rows = await sql`update membership set role = ${newRole}, updated_at = now()
      where user_id = (select id from "user" where email = ${email}) returning user_id`;
    if (rows.length === 0) fail(`nobody with ${email} is in the home: log in first`);
    console.log(`verify-app: ${email} is now ${newRole}`);
  });
}

async function member(name, newRole) {
  if (!name || !["adult", "child"].includes(newRole)) fail("usage: member <name> <adult|child>");
  await withSql(await ensureDatabase(true), async (sql) => {
    const [home] = await sql`select id from household order by created_at limit 1`;
    if (!home) fail("there is no home yet: log in first");
    const id = randomUUID();
    await sql.begin(async (tx) => {
      await tx`insert into "user" (id, name, email) values (${id}, ${name}, ${`${id}@verify.invalid`})`;
      await tx`insert into membership (user_id, household_id, role) values (${id}, ${home.id}, ${newRole})`;
    });
    console.log(`verify-app: added ${name} (${newRole}), who never logs in`);
  });
}

async function reset() {
  await withSql(await ensureDatabase(true), async (sql) => {
    await sql.begin(async (tx) => {
      // The home's contents and every connected app go; users, accounts, sessions and the home stay.
      await tx`truncate chore_instance, chore, room, floor, app_connection_use, app_token, oauth_consent,
        oauth_access_token, oauth_refresh_token, oauth_client_assertion, oauth_client_resource, oauth_client cascade`;
      await tx`delete from "user" u where not exists (select 1 from account a where a.user_id = u.id)`;
      await tx`update membership set role = 'adult', updated_at = now()`;
      const name = process.env.HOUSEHOLD_NAME?.trim() || "Familjen";
      const homes = await tx`update household set name = ${name}, updated_at = now() returning id`;
      for (const home of homes) await tx`insert into floor (household_id, name, position) values (${home.id}, '1', 1)`;
    });
    console.log("verify-app: the home is empty again; logins kept");
  });
}

const [command, ...args] = process.argv.slice(2);
const commands = { serve, status, reset, role: () => role(...args), member: () => member(...args) };
if (!commands[command]) fail("usage: verify-app.mjs serve | status | reset | role <email> <adult|child> | member <name> <adult|child>");
await commands[command]();
