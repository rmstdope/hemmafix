import { isEmailAllowed } from "./allowlist";

export type AccessDecision = "ok" | "not-allowed" | "unverified";

/**
 * Who may use the app: a verified e-mail on the allowlist. Checked when an
 * account is created, on every login and on every request, so removing an
 * address from ALLOWED_EMAILS revokes access at once.
 */
export function decideAccess(
  user: { email: string | null | undefined; emailVerified?: boolean | null },
  allowed: Set<string>,
): AccessDecision {
  if (!isEmailAllowed(user.email, allowed)) return "not-allowed";
  if (user.emailVerified !== true) return "unverified";
  return "ok";
}
