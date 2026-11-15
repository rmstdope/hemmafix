import { describe, expect, it } from "vitest";
import { addRoutineButtonLabel, routineAddedNotice, taskCountLabel } from "./routine-texts";

describe("taskCountLabel", () => {
  it("says none, one and many", () => {
    expect(taskCountLabel(0)).toBe("Inga uppgifter");
    expect(taskCountLabel(1)).toBe("1 uppgift");
    expect(taskCountLabel(5)).toBe("5 uppgifter");
  });
});

describe("addRoutineButtonLabel", () => {
  it("counts the tasks, and says only Lägg till when there are none", () => {
    expect(addRoutineButtonLabel(0)).toBe("Lägg till");
    expect(addRoutineButtonLabel(1)).toBe("Lägg till 1 uppgift");
    expect(addRoutineButtonLabel(5)).toBe("Lägg till 5 uppgifter");
  });
});

describe("routineAddedNotice", () => {
  it("says one and many", () => {
    expect(routineAddedNotice(1)).toBe("1 uppgift är tillagd");
    expect(routineAddedNotice(5)).toBe("5 uppgifter är tillagda");
  });
});
