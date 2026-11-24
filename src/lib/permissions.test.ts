import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError, type Action } from "./permissions";

// The requirements, one row per action: V = adults only, V+B = adults and children.
const RULES: Record<Action, "V" | "V+B"> = {
  "household:rename": "V",
  "room:manage": "V",
  "routine:manage": "V",
  "list:edit": "V+B",
  "member:set-role": "V",
  "task:create": "V",
  "task:edit": "V",
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
