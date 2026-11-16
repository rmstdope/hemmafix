import { describe, expect, it } from "vitest";
import { addRoutineButtonLabel, removeRoutineNotice, routineAddedNotice, taskCountLabel } from "./routine-texts";

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

describe("removeRoutineNotice", () => {
  it("names the tasks that go with the routine in the right number, and none when there are none", () => {
    const tail = " Uppgifter som redan finns i hemmet påverkas inte.";
    expect(removeRoutineNotice(5)).toBe("Rutinen och dess 5 uppgifter tas bort." + tail);
    expect(removeRoutineNotice(1)).toBe("Rutinen och dess 1 uppgift tas bort." + tail);
    expect(removeRoutineNotice(0)).toBe("Rutinen tas bort." + tail);
  });
});
