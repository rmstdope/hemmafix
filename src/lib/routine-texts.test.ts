import { describe, expect, it } from "vitest";
import { taskCountLabel } from "./routine-texts";

describe("taskCountLabel", () => {
  it("says none, one and many", () => {
    expect(taskCountLabel(0)).toBe("Inga uppgifter");
    expect(taskCountLabel(1)).toBe("1 uppgift");
    expect(taskCountLabel(5)).toBe("5 uppgifter");
  });
});
