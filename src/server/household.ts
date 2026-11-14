import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { household, membership } from "@/db/schema";

/**
 * Step 1: there is exactly one household. The first allowed user to log in
 * creates it and becomes admin; later allowed users join as members.
 * Multi-household support will replace this with invitations.
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
      .values({ userId, householdId: home.id, role: isFirst ? "admin" : "member" })
      .onConflictDoNothing();
  });
}
