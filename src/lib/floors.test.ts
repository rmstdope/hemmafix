import { describe, expect, it } from "vitest";
import { floorLabel, nextFloorName, roomLabel } from "./floors";

describe("floorLabel", () => {
  it("shows numbered floors as Plan N and named floors as they are", () => {
    expect(floorLabel("1")).toBe("Plan 1");
    expect(floorLabel("-1")).toBe("Plan -1");
    expect(floorLabel("Suterräng")).toBe("Suterräng");
    expect(floorLabel("Plan 3")).toBe("Plan 3");
  });
});

describe("nextFloorName", () => {
  it("takes the lowest free number", () => {
    expect(nextFloorName([])).toBe("1");
    expect(nextFloorName(["1", "2"])).toBe("3");
    expect(nextFloorName(["2", "Suterräng"])).toBe("1");
    expect(nextFloorName(["1", "Markplan", "3"])).toBe("2");
  });
});

describe("roomLabel", () => {
  it("adds the floor only when the home has several", () => {
    expect(roomLabel("Badrum", "2", true)).toBe("Badrum · Plan 2");
    expect(roomLabel("Badrum", "Suterräng", true)).toBe("Badrum · Suterräng");
    expect(roomLabel("Badrum", "1", false)).toBe("Badrum");
    expect(roomLabel("Badrum", null, true)).toBe("Badrum");
  });
});
