import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { chore, choreInstance, highFive, user } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { instanceId as instanceIdInput } from "@/lib/validation";
import type { Actor } from "./household";

const firstName = (name: string) => name.split(" ")[0] ?? name;

/**
 * Gives or takes back the actor's high five for someone else's tick. Only adults are shown
 * other people's ticks (src/server/chores.ts), so only they may cheer them.
 */
export async function setHighFive(actor: Actor, id: string, on: boolean) {
  const target = instanceIdInput.parse(id);
  if (!on) {
    assertCan(actor, "high-five:take-back");
    await db.delete(highFive).where(and(eq(highFive.instanceId, target), eq(highFive.userId, actor.userId)));
    return;
  }
  assertCan(actor, "history:view-anyone");
  const [row] = await db
    .select({ completedById: choreInstance.completedById, completedAt: choreInstance.completedAt })
    .from(choreInstance)
    .where(and(eq(choreInstance.id, target), eq(choreInstance.householdId, actor.householdId)));
  if (!row || !row.completedAt) throw new UserError("Uppgiften finns inte längre");
  if (row.completedById === actor.userId) throw new UserError("Du kan inte ge dig själv en high five");
  await db.insert(highFive).values({ instanceId: target, userId: actor.userId }).onConflictDoNothing();
}

export type HighFiveView = {
  /** Whether the actor has given one for this tick. */
  givenByMe: boolean;
  /** Who gave one, first names, oldest first; only shown to the person whose tick it is. */
  names: string[];
};

/** What the rows among `ids` show: present only for ticks with at least one high five. */
export async function listHighFives(actor: Actor, ids: string[]): Promise<Map<string, HighFiveView>> {
  const result = new Map<string, HighFiveView>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      instanceId: highFive.instanceId,
      userId: highFive.userId,
      name: user.name,
      doerId: choreInstance.completedById,
    })
    .from(highFive)
    .innerJoin(choreInstance, eq(choreInstance.id, highFive.instanceId))
    .innerJoin(user, eq(user.id, highFive.userId))
    .where(and(inArray(highFive.instanceId, ids), eq(choreInstance.householdId, actor.householdId)))
    .orderBy(asc(highFive.createdAt));
  for (const r of rows) {
    const view = result.get(r.instanceId) ?? { givenByMe: false, names: [] };
    if (r.userId === actor.userId) view.givenByMe = true;
    if (r.doerId === actor.userId) view.names.push(firstName(r.name));
    result.set(r.instanceId, view);
  }
  return result;
}

export type HighFiveNote = { instanceId: string; title: string; names: string[] };

/** Notes for the actor's own ticks that were cheered since they last closed them. */
export async function listHighFiveNotes(actor: Actor): Promise<HighFiveNote[]> {
  const rows = await db
    .select({
      instanceId: highFive.instanceId,
      name: user.name,
      title: sql<string>`coalesce(${choreInstance.doneTitle}, ${chore.title})`,
    })
    .from(highFive)
    .innerJoin(choreInstance, eq(choreInstance.id, highFive.instanceId))
    .innerJoin(chore, eq(chore.id, choreInstance.choreId))
    .innerJoin(user, eq(user.id, highFive.userId))
    .where(
      and(
        eq(choreInstance.completedById, actor.userId),
        eq(choreInstance.householdId, actor.householdId),
        isNotNull(choreInstance.completedAt),
        isNull(chore.archivedAt),
        isNull(highFive.closedAt),
      ),
    )
    .orderBy(asc(highFive.createdAt));
  const notes = new Map<string, HighFiveNote>();
  for (const r of rows) {
    const note = notes.get(r.instanceId) ?? { instanceId: r.instanceId, title: r.title, names: [] };
    note.names.push(firstName(r.name));
    notes.set(r.instanceId, note);
  }
  return [...notes.values()];
}

/** The doer closes the notes about their own ticks; the high fives themselves stay counted. */
export async function closeHighFiveNotes(actor: Actor, ids: string[]) {
  assertCan(actor, "note:close");
  const targets = ids.map((i) => instanceIdInput.parse(i));
  if (targets.length === 0) return;
  await db
    .update(highFive)
    .set({ closedAt: new Date() })
    .where(
      and(
        inArray(highFive.instanceId, targets),
        isNull(highFive.closedAt),
        inArray(
          highFive.instanceId,
          db
            .select({ id: choreInstance.id })
            .from(choreInstance)
            .where(and(eq(choreInstance.completedById, actor.userId), eq(choreInstance.householdId, actor.householdId))),
        ),
      ),
    );
}
