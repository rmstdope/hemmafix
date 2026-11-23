import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  foreignKey,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ROLES } from "@/lib/permissions";
import { MAX_INTERVAL, RECURRENCE_UNITS } from "@/lib/recurrence";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Better Auth core tables (user, session, account, verification).
// Field names follow Better Auth's expected schema.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// OAuth 2.1 / MCP authorization server (Better Auth's oauth-provider and jwt plugins), so that
// Claude can connect to Hemmafix. Additive only: the previous release never reads these.
// ---------------------------------------------------------------------------

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  alg: text("alg"),
  crv: text("crv"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const oauthClient = pgTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (t) => [index("oauth_client_user_id_idx").on(t.userId)],
);

export const oauthResource = pgTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("oauth_client_resource_unique").on(t.clientId, t.resourceId),
    index("oauth_client_resource_client_idx").on(t.clientId),
    index("oauth_client_resource_resource_idx").on(t.resourceId),
  ],
);

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("oauth_refresh_token_client_idx").on(t.clientId),
    index("oauth_refresh_token_session_idx").on(t.sessionId),
    index("oauth_refresh_token_user_idx").on(t.userId),
    index("oauth_refresh_token_code_idx").on(t.authorizationCodeId),
  ],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    revoked: timestamp("revoked", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("oauth_access_token_client_idx").on(t.clientId),
    index("oauth_access_token_session_idx").on(t.sessionId),
    index("oauth_access_token_user_idx").on(t.userId),
    index("oauth_access_token_code_idx").on(t.authorizationCodeId),
    index("oauth_access_token_refresh_idx").on(t.refreshId),
  ],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [index("oauth_consent_client_idx").on(t.clientId), index("oauth_consent_user_idx").on(t.userId)],
);

export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// A connected app is the refresh-token family of one approval (`authorization_code_id`).
// `app_token` maps each issued access token (JWT, by jti) to its family so a revoked connection
// is refused at once; `app_connection_use` remembers when a family last called the MCP server.
export const appToken = pgTable(
  "app_token",
  {
    jti: text("jti").primaryKey(),
    connectionId: text("connection_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("app_token_connection_idx").on(t.connectionId)],
);

export const appConnectionUse = pgTable("app_connection_use", {
  connectionId: text("connection_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
});

// ---------------------------------------------------------------------------
// Domain tables. Modeled for many households; step 1 runs with one.
// ---------------------------------------------------------------------------

export const household = pgTable("household", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Set once the ready-made routines were given to the home, so a removed one never returns. */
  routinesSeededAt: timestamp("routines_seeded_at", { withTimezone: true }),
  ...timestamps,
});

/** Adult or child; see src/lib/permissions.ts for what each may do. */
export const memberRole = pgEnum("member_role", ROLES);

export const membership = pgTable(
  "membership",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    // Least privilege by default: an adult makes another member an adult.
    role: memberRole("role").notNull().default("child"),
    /** How this person sorts the Listor overview (src/lib/lists.ts); null means alphabetical. */
    listOrder: text("list_order"),
    /** The looks this person uses (src/lib/looks.ts); null means the free default of each kind. */
    frame: text("frame"),
    theme: text("theme"),
    coinLook: text("coin_look"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.householdId] }),
    index("membership_household_id_idx").on(t.householdId),
  ],
);

/**
 * A floor of the home. New floors are named after the next free number ("1", "2" …) and can
 * be renamed ("Suterräng", "Markplan"). Every room is on a floor; a home always has one.
 */
export const floor = pgTable(
  "floor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Higher is further up the house. */
    position: integer("position").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("floor_household_name_idx")
      .on(t.householdId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    // Target of room's (floor, household) foreign key.
    unique("floor_id_household_unique").on(t.id, t.householdId),
  ],
);

export const room = pgTable(
  "room",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    /** A floor of the same household (enforced by the composite foreign key below). */
    floorId: uuid("floor_id").notNull(),
    name: text("name").notNull(),
    /** Removed rooms are archived, so the history still knows where a task was done. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "room_floor_same_household_fk",
      columns: [t.floorId, t.householdId],
      foreignColumns: [floor.id, floor.householdId],
    }),
    // Names are unique among a floor's current rooms: Badrum on two floors is fine, and a
    // removed room's name can be reused.
    uniqueIndex("room_floor_name_idx")
      .on(t.floorId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    // Target of chore's (room, household) foreign key.
    unique("room_id_household_unique").on(t.id, t.householdId),
  ],
);

export const recurrenceUnit = pgEnum("recurrence_unit", RECURRENCE_UNITS);

/**
 * A task: what to do, in which room, and whether it recurs. Each time it is to be done is a
 * `chore_instance`. Deleting a task archives it, so what people did stays in the history.
 */
export const chore = pgTable(
  "chore",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    /** A room of the same household (enforced by the composite foreign key below). */
    roomId: uuid("room_id").notNull(),
    title: text("title").notNull(),
    /** Set when the task was made from a predefined one (src/lib/chore-templates.ts). */
    templateKey: text("template_key"),
    /** Both null for a one-off task. */
    recurrenceUnit: recurrenceUnit("recurrence_unit"),
    recurrenceInterval: integer("recurrence_interval"),
    /** Who does it every time; copied to each new instance. */
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** What a tick of this task earns (0-100); copied to the instance when it is ticked off. */
    coins: integer("coins").notNull().default(10),
    ...timestamps,
  },
  (t) => [
    index("chore_household_idx").on(t.householdId),
    check("chore_coins_check", sql`${t.coins} between 0 and 100`),
    check(
      "chore_recurrence_check",
      sql`(${t.recurrenceUnit} is null and ${t.recurrenceInterval} is null) or (${t.recurrenceUnit} is not null and ${t.recurrenceInterval} between 1 and ${sql.raw(String(MAX_INTERVAL))})`,
    ),
    foreignKey({
      name: "chore_room_same_household_fk",
      columns: [t.roomId, t.householdId],
      foreignColumns: [room.id, room.householdId],
    }),
    // Target of chore_instance's (chore, household) foreign key.
    unique("chore_id_household_unique").on(t.id, t.householdId),
  ],
);

/** One time a task is to be done. A task has at most one open instance at a time. */
export const choreInstance = pgTable(
  "chore_instance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** A task of the same household (enforced by the composite foreign key below). */
    choreId: uuid("chore_id").notNull(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    dueDate: date("due_date", { mode: "string" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: text("completed_by_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * The task's title and room when it was ticked off, so the history keeps what was done
     * even after the task is edited. Null for open instances.
     */
    doneTitle: text("done_title"),
    doneRoomId: uuid("done_room_id"),
    /**
     * What the tick earned its ticker; a person's total is the sum over what they ticked. Null
     * for open instances and for ticks made before coins existed, which earn nothing.
     */
    coins: integer("coins"),
    /**
     * The Europe/Stockholm day of the tick, for the streak: set when ticked, cleared by undo.
     * Null for open instances and for every tick made before streaks existed, which count for no day.
     */
    tickedOn: date("ticked_on", { mode: "string" }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "chore_instance_done_room_same_household_fk",
      columns: [t.doneRoomId, t.householdId],
      foreignColumns: [room.id, room.householdId],
    }),
    foreignKey({
      name: "chore_instance_chore_same_household_fk",
      columns: [t.choreId, t.householdId],
      foreignColumns: [chore.id, chore.householdId],
    }).onDelete("cascade"),
    uniqueIndex("chore_instance_one_open_idx").on(t.choreId).where(sql`${t.completedAt} is null`),
    index("chore_instance_household_open_idx").on(t.householdId, t.completedAt),
    index("chore_instance_completed_by_idx").on(t.completedById, t.completedAt),
  ],
);

/**
 * A family member's high five for one tick (a done `chore_instance`). One per person per tick;
 * `closedAt` is set when the doer closes the note about it, so a new high five brings a new note.
 */
export const highFive = pgTable(
  "high_five",
  {
    instanceId: uuid("instance_id")
      .notNull()
      .references(() => choreInstance.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.instanceId, t.userId] })],
);

/**
 * The newest week (its Monday) whose "Din vecka" sheet a person has been through, one row each.
 * The first row is made on their first open, which is why the sheet never shows in the first week.
 */
export const weekRecapSeen = pgTable("week_recap_seen", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  weekStart: date("week_start", { mode: "string" }).notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A routine: tasks that are usually done together ("Städa badrum"). A template only: a task in
 * a routine is a name, and changing or removing the routine never touches tasks in the home.
 */
export const routine = pgTable(
  "routine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Creation order; an identity, so two routines made in one transaction never tie. */
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    ...timestamps,
  },
  (t) => [uniqueIndex("routine_household_name_idx").on(t.householdId, sql`lower(${t.name})`)],
);

export const routineTask = pgTable(
  "routine_task",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routine.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The order tasks were added in. */
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    /** What a task added from this one gives (0-100). */
    coins: integer("coins").notNull().default(10),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("routine_task_routine_title_idx").on(t.routineId, sql`lower(${t.title})`),
    check("routine_task_coins_check", sql`${t.coins} between 0 and 100`),
  ],
);

/** A shared list of the household ("Inköp"). `updatedAt` moves whenever an item or the name changes. */
export const list = pgTable(
  "list",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("list_household_idx").on(t.householdId)],
);

/**
 * One thing on a list. Open items show highest `rank` first: a new or unticked item takes the
 * next rank, and one put back by Ångra keeps its old one. Ticked items (`doneAt`) sit in Klart.
 */
export const listItem = pgTable(
  "list_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => list.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    rank: bigint("rank", { mode: "number" }).notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("list_item_list_idx").on(t.listId)],
);

export type Chore = typeof chore.$inferSelect;
export type ChoreInstance = typeof choreInstance.$inferSelect;
export type Room = typeof room.$inferSelect;
export type Floor = typeof floor.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];

/**
 * A person's chest for one day (Europe/Stockholm), made by their first coin-giving tick-off of
 * the day. The coins count once it is opened, or once its day has passed, so no chest is lost.
 * Undoing the tick-off leaves it alone.
 */
export const dailyChest = pgTable(
  "daily_chest",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    coins: integer("coins").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("daily_chest_user_day_unique").on(t.userId, t.day),
    check("daily_chest_coins_check", sql`${t.coins} between 5 and 10`),
  ],
);

/**
 * A look bought with coins (src/lib/looks.ts). The price is kept as paid; the coins are never
 * given back. One row per person and look, so an owned look is never charged twice.
 */
export const lookPurchase = pgTable(
  "look_purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    price: integer("price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("look_purchase_user_look_unique").on(t.userId, t.kind, t.key),
    check("look_purchase_kind_check", sql`${t.kind} in ('frame', 'theme', 'coin')`),
    check("look_purchase_price_check", sql`${t.price} >= 0`),
  ],
);

/** A reward the family can buy with coins ("Glass"); adults add, change and remove them. */
export const reward = pgTable(
  "reward",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** In coins, 1 to 1 000. */
    price: integer("price").notNull(),
    ...timestamps,
  },
  (t) => [index("reward_household_idx").on(t.householdId), check("reward_price_check", sql`${t.price} between 1 and 1000`)],
);

/**
 * One purchase of a reward. It keeps the reward's name and price as bought, so changing or
 * removing the reward never touches it. The coins are spent while it is `waiting` or `given`;
 * `declined` gives them back. A purchase the buyer cancels is deleted.
 */
export const rewardPurchase = pgTable(
  "reward_purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    status: text("status").notNull().default("waiting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** When it was given or declined. */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    index("reward_purchase_household_status_idx").on(t.householdId, t.status),
    index("reward_purchase_buyer_idx").on(t.buyerId, t.createdAt),
    check("reward_purchase_status_check", sql`${t.status} in ('waiting', 'given', 'declined')`),
  ],
);

/**
 * A badge a person has won (src/lib/badges.ts), once each. The coins are kept as paid (25, or 0 for
 * a badge that was only marked won) and count in earned coins; a badge is never taken back.
 */
export const badgeAward = pgTable(
  "badge_award",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    coins: integer("coins").notNull(),
    wonAt: timestamp("won_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("badge_award_user_key_unique").on(t.userId, t.key),
    check("badge_award_coins_check", sql`${t.coins} >= 0`),
  ],
);

/**
 * The moment badges began: one row, made by the migration that added them. Ticks, days and weeks
 * before it count for nothing, so everybody starts fresh.
 */
export const badgeEpoch = pgTable(
  "badge_epoch",
  {
    id: boolean("id").primaryKey().default(true),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("badge_epoch_single_check", sql`${t.id}`)],
);
