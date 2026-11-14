import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { household, membership, room, user } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { assertCan, type Role } from "@/lib/permissions";
import { householdName, memberId, roleInput, roomId, roomName } from "@/lib/validation";

/** The logged-in person acting in their household. */
export type Actor = { userId: string; householdId: string; role: Role };

/**
 * Step 1: there is exactly one household. The first allowed user to log in
 * creates it and becomes an adult; later allowed users join as children until an
 * adult changes their role. Multi-household support will replace this with invitations.
 */
export async function ensureMembership(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialize concurrent first logins so only one household is created.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hemmafix:household'))`);

    const existing = await tx
      .select({ householdId: membership.householdId })
      .from(membership)
      .where(eq(membership.userId, userId))
      .limit(1);
    if (existing.length > 0) return;

    let [home] = await tx
      .select({ id: household.id })
      .from(household)
      .orderBy(asc(household.createdAt))
      .limit(1);
    const isFirst = !home;
    if (!home) {
      [home] = await tx
        .insert(household)
        .values({ name: process.env.HOUSEHOLD_NAME?.trim() || "Familjen" })
        .returning({ id: household.id });
    }

    await tx
      .insert(membership)
      .values({ userId, householdId: home.id, role: isFirst ? "adult" : "child" })
      .onConflictDoNothing();
  });
}

export async function renameHousehold(actor: Actor, name: string) {
  assertCan(actor, "household:rename");
  await db
    .update(household)
    .set({ name: householdName.parse(name) })
    .where(eq(household.id, actor.householdId));
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function listRooms(householdId: string) {
  return db
    .select({ id: room.id, name: room.name })
    .from(room)
    .where(eq(room.householdId, householdId))
    .orderBy(sql`lower(${room.name})`);
}

export async function addRoom(actor: Actor, name: string) {
  assertCan(actor, "room:manage");
  const [created] = await db
    .insert(room)
    .values({ householdId: actor.householdId, name: roomName.parse(name) })
    .onConflictDoNothing()
    .returning({ id: room.id, name: room.name });
  if (!created) throw new UserError("Det rummet finns redan");
  return created;
}

export async function deleteRoom(actor: Actor, id: string) {
  assertCan(actor, "room:manage");
  await db.delete(room).where(and(eq(room.id, roomId.parse(id)), eq(room.householdId, actor.householdId)));
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberWithRole = { id: string; name: string; image: string | null; role: Role };

export async function listMembersWithRoles(householdId: string): Promise<MemberWithRole[]> {
  return db
    .select({ id: user.id, name: user.name, image: user.image, role: membership.role })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.householdId, householdId))
    .orderBy(asc(user.name));
}

/** Makes a member an adult or a child. The household always keeps at least one adult. */
export async function setMemberRole(actor: Actor, targetUserId: string, role: Role) {
  assertCan(actor, "member:set-role");
  const target = memberId.parse(targetUserId);
  const next = roleInput.parse(role);

  await db.transaction(async (tx) => {
    // Serialize role changes in the household, so two adults demoting each other at the
    // same moment cannot leave it without an adult.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hemmafix:roles:' || ${actor.householdId}))`);

    const [current] = await tx
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.householdId, actor.householdId), eq(membership.userId, target)));
    if (!current) throw new UserError("Personen finns inte i hemmet");

    if (current.role === "adult" && next === "child") {
      const [{ others }] = (await tx
        .select({ others: sql<number>`count(*)::int` })
        .from(membership)
        .where(
          and(
            eq(membership.householdId, actor.householdId),
            eq(membership.role, "adult"),
            ne(membership.userId, target),
          ),
        )) as [{ others: number }];
      if (others === 0) throw new UserError("Hemmet måste ha minst en vuxen");
    }

    await tx
      .update(membership)
      .set({ role: next })
      .where(and(eq(membership.householdId, actor.householdId), eq(membership.userId, target)));
  });
}
