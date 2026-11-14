import { describe, expect, it } from "vitest";
import { createTaskInput, taskFilter } from "./validation";

describe("createTaskInput", () => {
  it("trims and normalizes empty optionals to null", () => {
    const parsed = createTaskInput.parse({ title: "  Dammsuga  ", notes: "", assigneeId: "", dueDate: "" });
    expect(parsed).toEqual({ title: "Dammsuga", notes: null, assigneeId: null, dueDate: null });
  });

  it("keeps provided values", () => {
    const parsed = createTaskInput.parse({ title: "Tvätta", assigneeId: "u1", dueDate: "2026-12-24" });
    expect(parsed).toMatchObject({ assigneeId: "u1", dueDate: "2026-12-24" });
  });

  it("rejects an empty title and a malformed date", () => {
    expect(createTaskInput.safeParse({ title: "   " }).success).toBe(false);
    expect(createTaskInput.safeParse({ title: "x", dueDate: "24/12" }).success).toBe(false);
  });
});

describe("taskFilter", () => {
  it("falls back to all for unknown values", () => {
    expect(taskFilter.parse("mine")).toBe("mine");
    expect(taskFilter.parse("nonsense")).toBe("all");
    expect(taskFilter.parse(undefined)).toBe("all");
  });
});
