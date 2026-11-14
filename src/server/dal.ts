import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { membership } from "@/db/schema";
import type { Role } from "@/lib/permissions";
import { decideAccess } from "@/lib/access";
import { allowedEmails, auth } from "./auth";

export type CurrentMember = {
  userId: string;
  name: string;
  image: string | null;
  householdId: string;
  role: Role;
};

/** Returns the logged-in member, or null. Deduplicated per request. */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  // Re-checked on every request: removing someone from ALLOWED_EMAILS takes effect at once.
  if (decideAccess(session.user, allowedEmails()) !== "ok") return null;

  const [m] = await db
    .select({ householdId: membership.householdId, role: membership.role })
    .from(membership)
    .where(eq(membership.userId, session.user.id))
    .limit(1);
  if (!m) return null;

  return {
    userId: session.user.id,
    name: session.user.name,
    image: session.user.image ?? null,
    householdId: m.householdId,
    role: m.role,
  };
});

/** For pages: redirect to /login when not logged in. */
export async function requireMember(): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) redirect("/login");
  return member;
}
