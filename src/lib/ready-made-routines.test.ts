import { describe, expect, it } from "vitest";
import { READY_MADE_ROUTINES } from "./ready-made-routines";
import { routineName, routineTaskTitle } from "./validation";

describe("READY_MADE_ROUTINES", () => {
  it("are the three agreed routines, tasks in order", () => {
    expect(READY_MADE_ROUTINES.map((r) => [r.name, r.tasks.length])).toEqual([
      ["Städa badrum", 5],
      ["Städa kök", 6],
      ["Städa sovrum", 4],
    ]);
    expect(READY_MADE_ROUTINES[1]!.tasks[0]).toBe("Diska");
    expect(READY_MADE_ROUTINES[2]!.tasks).toEqual(["Byta lakan", "Damma", "Dammsuga golvet", "Vädra"]);
  });

  it("are valid by the same rules as the family's own", () => {
    for (const r of READY_MADE_ROUTINES) {
      expect(routineName.parse(r.name)).toBe(r.name);
      for (const t of r.tasks) expect(routineTaskTitle.parse(t)).toBe(t);
      const keys = r.tasks.map((t) => t.toLowerCase());
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
