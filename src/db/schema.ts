import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
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
// Domain tables. Modeled for many households; step 1 runs with one.
// ---------------------------------------------------------------------------

export const household = pgTable("household", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
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
    ...timestamps,
  },
  (t) => [
    index("chore_household_idx").on(t.householdId),
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

export type Chore = typeof chore.$inferSelect;
export type ChoreInstance = typeof choreInstance.$inferSelect;
export type Room = typeof room.$inferSelect;
export type Floor = typeof floor.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
