import { UserError } from "./errors";

/**
 * Who may do what. An account is either an adult or a child in its household; the server
 * checks every action against this table, and the UI uses it only to hide what would be
 * refused anyway.
 */
export const ROLES = ["adult", "child"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { adult: "Vuxen", child: "Barn" };

const ADULTS_ONLY = new Set<Action>([
  "household:rename",
  "room:manage",
  "member:set-role",
  "task:create",
  "task:assign",
  "task:delete",
  "history:view-anyone",
]);

export type Action =
  | "household:rename"
  | "room:manage"
  | "member:set-role"
  | "task:create"
  | "task:assign"
  | "task:delete"
  | "task:complete"
  | "task:view"
  | "history:view-own"
  | "history:view-anyone";

export function can(role: Role, action: Action): boolean {
  return role === "adult" || !ADULTS_ONLY.has(action);
}

/** Thrown when someone tries an action their role does not allow. */
export class ForbiddenError extends UserError {
  constructor(message = "Det här får bara vuxna göra.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertCan(actor: { role: Role }, action: Action): void {
  if (!can(actor.role, action)) throw new ForbiddenError();
}
