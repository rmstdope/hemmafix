// Test-side access to the e2e database: reset it, and log people in without Google.
//
// Logging in uses Better Auth's test-utils plugin in a separate auth instance that lives only
// in the test process. It writes a real session row and signs the cookie with the server's
// secret, so the app sees an ordinary session. The app itself has no test login route.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { testUtils } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";
import * as schema from "../../src/db/schema";
import { databaseUrl } from "../../test/database.mjs";
import { E2E_AUTH_SECRET, E2E_BASE_URL, E2E_DB, PEOPLE, type Person } from "./env";

const client = postgres(databaseUrl(E2E_DB), { max: 2, onnotice: () => {} });
export const db = drizzle(client, { schema });

const testAuth = betterAuth({
  baseURL: E2E_BASE_URL,
  secret: E2E_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [testUtils()],
});

/**
 * Empties every table in the app's schema, so each test starts with no household and no
 * users. Tables are looked up, not listed, so new ones cannot leak rows between tests.
 * (Drizzle's migration journal lives in the `drizzle` schema and is kept.)
 */
export async function resetDatabase() {
  await db.execute(sql`
    do $$ begin
      execute (
        select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
          || ' restart identity cascade'
        from pg_tables where schemaname = 'public'
      );
    end $$`);
}

async function homeId() {
  const [existing] = await db.select({ id: schema.household.id }).from(schema.household).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(schema.household).values({ name: "Familjen E2E" }).returning();
  return created!.id;
}

/**
 * Creates `person` as a member of the (single) household with `role` and gives `context`
 * a logged-in session cookie for them.
 */
export async function logIn(
  context: BrowserContext,
  person: Person,
  role: schema.MemberRole = "child",
) {
  const { test } = await testAuth.$context;
  const { name, email } = PEOPLE[person];
  const user = await test.saveUser(test.createUser({ name, email, emailVerified: true }));
  await db.insert(schema.membership).values({ userId: user.id, householdId: await homeId(), role });
  await context.addCookies(await test.getCookies({ userId: user.id, domain: "localhost" }));
  return user;
}

export async function closeDatabase() {
  await client.end();
}

/** Adds rooms to the household (created on demand) and returns them by name. */
export async function seedRooms(...names: string[]) {
  const householdId = await homeId();
  const rows = await db
    .insert(schema.room)
    .values(names.map((name) => ({ householdId, name })))
    .returning();
  return Object.fromEntries(rows.map((r) => [r.name, r])) as Record<string, schema.Room>;
}

/**
 * Adds a task straight into the database, with its open instance. Faster than the form when
 * a test is about something else; tests of creating tasks use the form.
 */
export async function seedChore(opts: {
  title: string;
  roomId: string;
  recurrence?: { unit: "day" | "week" | "month"; interval: number } | null;
  dueDate?: string | null;
  assigneeId?: string | null;
}) {
  const householdId = await homeId();
  const recurrence = opts.recurrence === undefined ? { unit: "week" as const, interval: 1 } : opts.recurrence;
  const [c] = await db
    .insert(schema.chore)
    .values({
      householdId,
      roomId: opts.roomId,
      title: opts.title,
      recurrenceUnit: recurrence?.unit ?? null,
      recurrenceInterval: recurrence?.interval ?? null,
      assigneeId: opts.assigneeId ?? null,
    })
    .returning();
  await db.insert(schema.choreInstance).values({
    choreId: c!.id,
    householdId,
    dueDate: opts.dueDate ?? null,
    assigneeId: opts.assigneeId ?? null,
  });
  return c!;
}
