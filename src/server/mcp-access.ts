import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { membership, user } from "@/db/schema";
import { decideAccess } from "@/lib/access";
import { can } from "@/lib/permissions";
import { allowedEmails } from "./auth";
import type { Actor } from "./household";

export type McpAccess = { actor: Actor } | { denied: "removed" | "child" };

/**
 * Who a token's owner is right now. Checked on every call, not when the token was issued, so
 * removing an address from ALLOWED_EMAILS or making an adult a child takes effect at once.
 */
export async function resolveMcpMember(userId: string): Promise<McpAccess> {
  const [row] = await db
    .select({ email: user.email, emailVerified: user.emailVerified, householdId: membership.householdId, role: membership.role })
    .from(user)
    .leftJoin(membership, eq(membership.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);
  if (!row || !row.householdId || decideAccess(row, allowedEmails()) !== "ok") return { denied: "removed" };
  // "task:create" is an adult-only action: only adults may use the app through Claude.
  if (!can(row.role!, "task:create")) return { denied: "child" };
  return { actor: { userId, householdId: row.householdId, role: row.role! } };
}
