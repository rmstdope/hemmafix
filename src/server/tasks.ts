import "server-only";
import { and, asc, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db, pg } from "@/db";
import { household, membership, task, user } from "@/db/schema";
import type { TaskFilter } from "@/lib/validation";

export const TASKS_CHANNEL = "hemmafix_tasks";

export type Member = { id: string; name: string; image: string | null };

export type TaskView = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  completedAt: Date | null;
};

export async function getHousehold(householdId: string) {
  const [h] = await db.select().from(household).where(eq(household.id, householdId)).limit(1);
  return h ?? null;
}

export async function listMembers(householdId: string): Promise<Member[]> {
  return db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.householdId, householdId))
    .orderBy(asc(user.name));
}

export async function isMember(householdId: string, userId: string) {
  const rows = await db
    .select({ userId: membership.userId })
    .from(membership)
    .where(and(eq(membership.householdId, householdId), eq(membership.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

const columns = {
  id: task.id,
  title: task.title,
  notes: task.notes,
  dueDate: task.dueDate,
  assigneeId: task.assigneeId,
  completedAt: task.completedAt,
};

export async function listOpenTasks(
  householdId: string,
  filter: TaskFilter,
  userId: string,
): Promise<TaskView[]> {
  const filterClause =
    filter === "mine"
      ? eq(task.assigneeId, userId)
      : filter === "unassigned"
        ? isNull(task.assigneeId)
        : undefined;

  return db
    .select(columns)
    .from(task)
    .where(and(eq(task.householdId, householdId), isNull(task.completedAt), filterClause))
    .orderBy(sql`${task.dueDate} asc nulls last`, asc(task.createdAt));
}

/** Recently completed tasks, so a mistaken tick can be undone. */
export async function listRecentlyCompleted(householdId: string): Promise<TaskView[]> {
  return db
    .select(columns)
    .from(task)
    .where(
      and(
        eq(task.householdId, householdId),
        isNotNull(task.completedAt),
        gt(task.completedAt, sql`now() - interval '7 days'`),
      ),
    )
    .orderBy(desc(task.completedAt))
    .limit(20);
}

/** Tell every open browser in the household that tasks changed. */
export async function notifyTasksChanged(householdId: string) {
  await pg.notify(TASKS_CHANNEL, householdId);
}
