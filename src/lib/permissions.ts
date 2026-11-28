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
  "list:claim",
]);

export type Action =
  | "household:rename"
  | "room:manage"
  | "routine:manage"
  /** Everything on the lists a person sees: lists and their items. */
  | "list:edit"
  /** Make a list without a recorded creator private, and so become its creator. */
  | "list:claim"
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
  | "app:connect"
  /** Buy a reward or a look with one's own coins. */
  | "coins:spend"
  /** Switch between the looks one owns. */
  | "look:choose"
  /** Take back one's own waiting purchase. */
  | "purchase:cancel"
  /** Close one's own high five notes and week sheet. */
  | "note:close"
  /** Choose one's own order for the lists. */
  | "list:order"
  /** Take back a high five one has given. */
  | "high-five:take-back";

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

/** What decides who sees a list and what they may do with it. */
export type ListAccess = { isPrivate: boolean; creatorId: string | null; sharedWith: readonly string[] };
type Person = { userId: string; role: Role };

/** A private list is seen by its creator and its shares only, adults included. */
export function canSeeList(person: Person, list: ListAccess): boolean {
  return !list.isPrivate || list.creatorId === person.userId || list.sharedWith.includes(person.userId);
}

/** Whether a list is private, and who it is shared with, is the creator's to change. */
export function canChangeListSharing(person: Person, list: ListAccess): boolean {
  if (list.creatorId !== null) return list.creatorId === person.userId;
  return !list.isPrivate && can(person.role, "list:claim");
}

/** Anyone removes a public list; a private one only its creator. */
export function canDeleteList(person: Person, list: ListAccess): boolean {
  return !list.isPrivate || list.creatorId === person.userId;
}
