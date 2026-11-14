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

/** Empties every table, so each test starts with no household and no users. */
export async function resetDatabase() {
  await db.execute(sql`truncate table "user", household, verification restart identity cascade`);
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
  role: schema.MemberRole = "member",
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
