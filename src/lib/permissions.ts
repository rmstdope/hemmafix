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
  "routine:manage",
  "member:set-role",
  "task:create",
  "task:edit",
  "task:postpone",
  "task:assign",
  "task:delete",
  "task:uncomplete-others",
  "task:tick-early",
  "history:view-anyone",
  "reward:manage",
  "reward:give",
  "app:connect",
]);

export type Action =
  | "household:rename"
  | "room:manage"
  | "routine:manage"
  /** Everything on the household's shared lists: lists and their items. */
  | "list:edit"
  | "member:set-role"
  | "task:create"
  | "task:edit"
  /** Move an open chore to a later day, and undo that. */
  | "task:postpone"
  | "task:assign"
  | "task:delete"
  | "task:complete"
  /** Undo someone else's tick; anyone may undo their own. */
  | "task:uncomplete-others"
  /** Tick a repeating chore before its day, for no coins. */
  | "task:tick-early"
  | "task:view"
  | "history:view-own"
  | "history:view-anyone"
  /** Add, change and remove the rewards the family can buy with coins. */
  | "reward:manage"
  /** Give a bought reward, or decline to. */
  | "reward:give"
  /** Let an app such as Claude act on the home, through its approval page. */
  | "app:connect";

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
