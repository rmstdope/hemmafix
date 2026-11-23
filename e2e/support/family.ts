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
import { todayIso } from "../../src/lib/dates";
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
 * Empties the app's tables, so each test starts with no household and no users.
 *
 * DELETE, not TRUNCATE: TRUNCATE takes exclusive table locks one table at a time, and the
 * server may still be answering a late request from the previous test (a refresh, the event
 * stream), which deadlocks or stalls. Deleting the roots cascades to everything else; every
 * table is then checked to be empty, so a new table that escapes the cascade is noticed.
 */
export async function resetDatabase() {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`delete from household`);
        await tx.execute(sql`delete from "user"`);
        await tx.execute(sql`delete from verification`);
        // jwks is kept: the server caches its signing keys, so a key deleted between two tests
        // makes the next test's tokens unverifiable until the cache refreshes.
        // Clients register themselves without a user, so deleting users does not reach them.
        await tx.execute(sql`delete from oauth_client`);
        await tx.execute(sql`delete from oauth_resource`);
        await tx.execute(sql`delete from app_token`);
      });
      break;
    } catch (err) {
      // A late request from the previous test may still collide; try again.
      if ((err as { cause?: { code?: string } }).cause?.code !== "40P01" || attempt >= 3) throw err;
    }
  }
  const rows = (await db.execute(sql`
    select string_agg(t.tablename, ', ') as leftovers
    from pg_tables t
    where t.schemaname = 'public'
      and t.tablename <> 'jwks'
      and (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', t.schemaname, t.tablename), false, true, '')))[1]::text::int > 0
  `)) as unknown as { leftovers: string | null }[];
  if (rows[0]?.leftovers) {
    throw new Error(`resetDatabase left rows in: ${rows[0].leftovers}. Delete them in resetDatabase.`);
  }
}

async function homeId() {
  const [existing] = await db.select({ id: schema.household.id }).from(schema.household).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(schema.household).values({ name: "Familjen E2E" }).returning();
  await db.insert(schema.floor).values({ householdId: created!.id, name: "1", position: 1 });
  return created!.id;
}

/**
 * Logs in someone whose chest for today is already made (and unopened, so it counts for
 * nothing), so ticking a task off shows no chest card and the coin tests count only the task's
 * own coins.
 */
export async function logInWithChestTaken(context: BrowserContext, person: Person, role: schema.MemberRole = "child") {
  const user = await logIn(context, person, role);
  await db
    .insert(schema.dailyChest)
    .values({ householdId: await homeId(), userId: user.id, day: todayIso(), coins: 5 });
  return user;
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

/** The household's floors (created on demand), top floor first. */
export async function floors() {
  const householdId = await homeId();
  return db
    .select()
    .from(schema.floor)
    .where(sql`${schema.floor.householdId} = ${householdId}`)
    .orderBy(sql`${schema.floor.position} desc`);
}

/** Adds a floor at the top of the house. */
export async function seedFloor(name: string) {
  const existing = await floors();
  const [created] = await db
    .insert(schema.floor)
    .values({ householdId: await homeId(), name, position: (existing[0]?.position ?? 0) + 1 })
    .returning();
  return created!;
}

/**
 * Adds rooms to the household (created on demand) and returns them by name. They go on
 * `floorId`, or on the bottom floor.
 */
export async function seedRooms(...args: (string | { floorId: string })[]) {
  const householdId = await homeId();
  const options = args.find((a): a is { floorId: string } => typeof a !== "string");
  const names = args.filter((a): a is string => typeof a === "string");
  const floorId = options?.floorId ?? (await floors()).at(-1)!.id;
  const rows = await db
    .insert(schema.room)
    .values(names.map((name) => ({ householdId, floorId, name })))
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
  coins?: number;
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
      ...(opts.coins !== undefined && { coins: opts.coins }),
    })
    .returning();
  await db.insert(schema.choreInstance).values({
    choreId: c!.id,
    householdId,
    dueDate: opts.dueDate === undefined ? todayIso() : opts.dueDate,
    assigneeId: opts.assigneeId ?? null,
  });
  return c!;
}

/** Adds a one-off task that `completedById` has already ticked off (now, unless given). */
export async function seedDone(opts: { title: string; roomId: string; completedById: string; completedAt?: Date }) {
  const c = await seedChore({ title: opts.title, roomId: opts.roomId, recurrence: null });
  await db
    .update(schema.choreInstance)
    .set({ completedById: opts.completedById, completedAt: opts.completedAt ?? new Date() })
    .where(sql`${schema.choreInstance.choreId} = ${c.id}`);
  return c;
}

/**
 * Registers an app the way Claude does (a public client with PKCE), straight in the database:
 * the register endpoint is rate limited, and every test starts from an empty database.
 */
export async function seedOAuthClient(opts: { name: string | null; redirectUri: string }) {
  const clientId = `e2e-${crypto.randomUUID()}`;
  await db.insert(schema.oauthClient).values({
    id: crypto.randomUUID(),
    clientId,
    name: opts.name,
    redirectUris: [opts.redirectUri],
    tokenEndpointAuthMethod: "none",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    requirePKCE: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  // What registering through the endpoint does: the client may ask for tokens for the MCP server.
  await db
    .insert(schema.oauthResource)
    .values({ id: "e2e-mcp", identifier: `${E2E_BASE_URL}/mcp`, name: "Hemmafix MCP" })
    .onConflictDoNothing();
  await db.insert(schema.oauthClientResource).values({
    id: crypto.randomUUID(),
    clientId,
    resourceId: `${E2E_BASE_URL}/mcp`,
    createdAt: new Date(),
  });
  return clientId;
}

/** A connected app of `userId`: one live refresh token (its family is the returned id). */
export async function seedConnection(opts: {
  userId: string;
  name: string | null;
  icon?: string | null;
  connectedAt?: Date;
  lastUsedAt?: Date;
  redirectUri?: string;
}) {
  const clientId = `e2e-${crypto.randomUUID()}`;
  const family = `fam-${crypto.randomUUID()}`;
  await db.insert(schema.oauthClient).values({
    id: crypto.randomUUID(),
    clientId,
    name: opts.name,
    icon: opts.icon ?? null,
    redirectUris: [opts.redirectUri ?? "https://claude.ai/api/mcp/auth_callback"],
  });
  await db.insert(schema.oauthRefreshToken).values({
    id: crypto.randomUUID(),
    token: crypto.randomUUID(),
    clientId,
    userId: opts.userId,
    authorizationCodeId: family,
    scopes: ["openid"],
    createdAt: opts.connectedAt ?? new Date(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000),
  });
  if (opts.lastUsedAt) {
    await db.insert(schema.appConnectionUse).values({ connectionId: family, userId: opts.userId, lastUsedAt: opts.lastUsedAt });
  }
  return family;
}

/**
 * Adds a list straight into the database. `items` are given oldest first, so the last one is
 * first on the page; `done` items sit in Klart. Timestamps default to now.
 */
export async function seedList(
  name: string,
  items: (string | { text: string; done?: boolean })[] = [],
  at?: { createdAt?: Date; updatedAt?: Date },
) {
  const householdId = await homeId();
  const [created] = await db
    .insert(schema.list)
    .values({ householdId, name, ...at })
    .returning();
  for (const [i, item] of items.entries()) {
    const { text, done } = typeof item === "string" ? { text: item, done: false } : { done: false, ...item };
    await db
      .insert(schema.listItem)
      .values({ listId: created!.id, text, rank: i + 1, doneAt: done ? new Date() : null });
  }
  return created!;
}
