import "server-only";
import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { chore, floor, household, membership, room, user } from "@/db/schema";
import { nextFloorName } from "@/lib/floors";
import { UserError } from "@/lib/errors";
import { assertCan, type Role } from "@/lib/permissions";
import {
  floorDirection,
  floorId,
  floorName,
  householdName,
  memberId,
  roleInput,
  roomId,
  roomName,
} from "@/lib/validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
      await tx.insert(floor).values({ householdId: home.id, name: "1", position: 1 });
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

export type RoomView = { id: string; name: string; floorId: string };

/** The home's current rooms, alphabetically. */
export async function listRooms(householdId: string): Promise<RoomView[]> {
  return db
    .select({ id: room.id, name: room.name, floorId: room.floorId })
    .from(room)
    .where(and(eq(room.householdId, householdId), isNull(room.archivedAt)))
    .orderBy(sql`lower(${room.name})`, asc(room.id));
}

/**
 * Adds a room on a floor. The floor may be left out while the home has a single floor,
 * which is how the forms look then.
 */
export async function addRoom(actor: Actor, name: string, floorIdArg?: string | null) {
  assertCan(actor, "room:manage");
  const roomNameValue = roomName.parse(name);
  return db.transaction(async (tx) => {
    const floors = await tx
      .select({ id: floor.id })
      .from(floor)
      .where(and(eq(floor.householdId, actor.householdId), isNull(floor.archivedAt)))
      // Share-lock the floors so one cannot be removed while a room is added to it.
      .for("share");
    const target = floorIdArg ? floorId.parse(floorIdArg) : floors.length === 1 ? floors[0]!.id : null;
    if (!target) throw new UserError("Välj en våning");
    if (!floors.some((f) => f.id === target)) throw new UserError("Våningen finns inte i hemmet");

    const [created] = await tx
      .insert(room)
      .values({ householdId: actor.householdId, floorId: target, name: roomNameValue })
      .onConflictDoNothing()
      .returning({ id: room.id, name: room.name, floorId: room.floorId });
    if (!created) throw new UserError("Det rummet finns redan på våningen");
    return created;
  });
}

/**
 * Removes a room from the home. It is archived, not deleted, so tasks done there keep their
 * room in the history. A room with tasks on the board cannot be removed.
 */
export async function deleteRoom(actor: Actor, id: string) {
  assertCan(actor, "room:manage");
  const target = roomId.parse(id);
  await db.transaction(async (tx) => {
    // Lock the room: a task being created in it at this moment waits, or makes us wait.
    const [r] = await tx
      .select({ id: room.id })
      .from(room)
      .where(and(eq(room.id, target), eq(room.householdId, actor.householdId), isNull(room.archivedAt)))
      .for("update");
    if (!r) return;
    const [active] = await tx
      .select({ id: chore.id })
      .from(chore)
      .where(and(eq(chore.roomId, target), isNull(chore.archivedAt)))
      .limit(1);
    if (active) throw new UserError("Rummet har uppgifter. Ta bort dem först.");
    await tx.update(room).set({ archivedAt: new Date() }).where(eq(room.id, target));
  });
}

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------

export type FloorView = { id: string; name: string };

/** The home's current floors, top floor first, as in a section of the house. */
export async function listFloors(householdId: string): Promise<FloorView[]> {
  return db
    .select({ id: floor.id, name: floor.name })
    .from(floor)
    .where(and(eq(floor.householdId, householdId), isNull(floor.archivedAt)))
    .orderBy(desc(floor.position), asc(floor.createdAt));
}

/** Takes the household's floor lock, so floor changes in one home happen one at a time. */
async function lockFloors(tx: Tx, householdId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hemmafix:floors:' || ${householdId}))`);
  return tx
    .select({ id: floor.id, name: floor.name, position: floor.position })
    .from(floor)
    .where(and(eq(floor.householdId, householdId), isNull(floor.archivedAt)))
    .orderBy(desc(floor.position), asc(floor.createdAt));
}

/** Adds a floor at the top of the house, named after the next free number unless named. */
export async function addFloor(actor: Actor, name?: string | null) {
  assertCan(actor, "room:manage");
  const given = name?.trim() ? floorName.parse(name) : null;
  return db.transaction(async (tx) => {
    const floors = await lockFloors(tx, actor.householdId);
    const top = Math.max(0, ...floors.map((f) => f.position));
    const [created] = await tx
      .insert(floor)
      .values({
        householdId: actor.householdId,
        name: given ?? nextFloorName(floors.map((f) => f.name)),
        position: top + 1,
      })
      .onConflictDoNothing()
      .returning({ id: floor.id, name: floor.name });
    if (!created) throw new UserError("Det finns redan en våning med det namnet");
    return created;
  });
}

export async function renameFloor(actor: Actor, id: string, name: string) {
  assertCan(actor, "room:manage");
  const target = floorId.parse(id);
  const next = floorName.parse(name);
  await db.transaction(async (tx) => {
    const floors = await lockFloors(tx, actor.householdId);
    if (!floors.some((f) => f.id === target)) throw new UserError("Våningen finns inte i hemmet");
    if (floors.some((f) => f.id !== target && f.name.toLowerCase() === next.toLowerCase())) {
      throw new UserError("Det finns redan en våning med det namnet");
    }
    await tx.update(floor).set({ name: next }).where(eq(floor.id, target));
  });
}

/** Moves a floor one step up or down the house, swapping places with its neighbour. */
export async function moveFloor(actor: Actor, id: string, direction: "up" | "down") {
  assertCan(actor, "room:manage");
  const target = floorId.parse(id);
  const dir = floorDirection.parse(direction);
  await db.transaction(async (tx) => {
    // Top floor first; renumber so positions are distinct before swapping.
    const floors = await lockFloors(tx, actor.householdId);
    const index = floors.findIndex((f) => f.id === target);
    if (index < 0) throw new UserError("Våningen finns inte i hemmet");
    const other = dir === "up" ? index - 1 : index + 1;
    if (other < 0 || other >= floors.length) return;
    const order = floors.map((f) => f.id);
    [order[index], order[other]] = [order[other]!, order[index]!];
    for (const [i, floorIdValue] of order.entries()) {
      await tx.update(floor).set({ position: order.length - i }).where(eq(floor.id, floorIdValue));
    }
  });
}

/** Removes a floor without rooms. A home always keeps at least one floor. */
export async function deleteFloor(actor: Actor, id: string) {
  assertCan(actor, "room:manage");
  const target = floorId.parse(id);
  await db.transaction(async (tx) => {
    const floors = await lockFloors(tx, actor.householdId);
    if (!floors.some((f) => f.id === target)) return;
    if (floors.length === 1) throw new UserError("Hemmet måste ha minst en våning");
    // Lock the floor row: a room being added to it waits, or makes us wait.
    await tx.select({ id: floor.id }).from(floor).where(eq(floor.id, target)).for("update");
    const [hasRoom] = await tx
      .select({ id: room.id })
      .from(room)
      .where(and(eq(room.floorId, target), isNull(room.archivedAt)))
      .limit(1);
    if (hasRoom) throw new UserError("Våningen har rum. Ta bort dem först.");
    await tx.update(floor).set({ archivedAt: new Date() }).where(eq(floor.id, target));
  });
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

    // The actor's role as of now, not as of the start of the request: someone who was just
    // made a child must not change roles while waiting for the lock.
    const [self] = await tx
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.householdId, actor.householdId), eq(membership.userId, actor.userId)));
    assertCan({ role: self?.role ?? "child" }, "member:set-role");

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
