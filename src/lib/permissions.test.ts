import { describe, expect, it } from "vitest";
import {
  assertCan,
  can,
  canChangeListSharing,
  canDeleteList,
  canSeeList,
  ForbiddenError,
  type Action,
} from "./permissions";

// The requirements, one row per action: V = adults only, V+B = adults and children.
const RULES: Record<Action, "V" | "V+B"> = {
  "household:rename": "V",
  "room:manage": "V",
  "routine:manage": "V",
  "list:edit": "V+B",
  "list:claim": "V",
  "member:set-role": "V",
  "task:create": "V",
  "task:edit": "V",
  "task:postpone": "V",
  "task:assign": "V",
  "task:delete": "V",
  "task:complete": "V+B",
  "task:uncomplete-others": "V",
  "task:tick-early": "V",
  "task:view": "V+B",
  "history:view-own": "V+B",
  "history:view-anyone": "V",
  "reward:manage": "V",
  "reward:give": "V",
  "app:connect": "V",
  "coins:spend": "V+B",
  "look:choose": "V+B",
  "purchase:cancel": "V+B",
  "note:close": "V+B",
  "list:order": "V+B",
  "high-five:take-back": "V+B",
};

describe("can", () => {
  it.each(Object.entries(RULES) as [Action, "V" | "V+B"][])("%s is allowed for %s", (action, who) => {
    expect(can("adult", action)).toBe(true);
    expect(can("child", action)).toBe(who === "V+B");
  });
});

describe("assertCan", () => {
  it("throws ForbiddenError for a child doing an adult's action", () => {
    expect(() => assertCan({ role: "child" }, "task:create")).toThrow(ForbiddenError);
    expect(() => assertCan({ role: "adult" }, "task:create")).not.toThrow();
  });
});

describe("a list's own rules", () => {
  const anna = { userId: "anna", role: "adult" } as const;
  const bo = { userId: "bo", role: "child" } as const;
  const pappa = { userId: "pappa", role: "adult" } as const;
  const list = (isPrivate: boolean, creatorId: string | null, sharedWith: string[] = []) => ({
    isPrivate,
    creatorId,
    sharedWith,
  });

  it("shows a public list to everyone, a private one to its creator and shares only", () => {
    expect(canSeeList(bo, list(false, "anna"))).toBe(true);
    expect(canSeeList(bo, list(true, "bo"))).toBe(true);
    expect(canSeeList(bo, list(true, "anna", ["bo"]))).toBe(true);
    // An adult does not see a child's private list unless the child shares it.
    expect(canSeeList(anna, list(true, "bo"))).toBe(false);
    expect(canSeeList(pappa, list(true, "anna", ["bo"]))).toBe(false);
  });

  it("lets only the creator change who sees a list that has one", () => {
    expect(canChangeListSharing(bo, list(false, "bo"))).toBe(true);
    expect(canChangeListSharing(bo, list(true, "bo"))).toBe(true);
    expect(canChangeListSharing(anna, list(false, "bo"))).toBe(false);
    expect(canChangeListSharing(anna, list(true, "bo", ["anna"]))).toBe(false);
  });

  it("lets any adult, but no child, change a public list without a creator", () => {
    expect(canChangeListSharing(anna, list(false, null))).toBe(true);
    expect(canChangeListSharing(bo, list(false, null))).toBe(false);
    // A private list whose creator is gone is nobody's to change.
    expect(canChangeListSharing(anna, list(true, null, ["anna"]))).toBe(false);
  });

  it("lets anyone remove a public list, only the creator a private one", () => {
    expect(canDeleteList(bo, list(false, "anna"))).toBe(true);
    expect(canDeleteList(bo, list(false, null))).toBe(true);
    expect(canDeleteList(anna, list(true, "anna"))).toBe(true);
    expect(canDeleteList(bo, list(true, "anna", ["bo"]))).toBe(false);
    expect(canDeleteList(anna, list(true, null, ["anna"]))).toBe(false);
  });
});
