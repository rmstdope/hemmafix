import { describe, expect, it } from "vitest";
import { parseSoundOn } from "./sound-setting";

describe("parseSoundOn", () => {
  it("is on when nothing is stored", () => expect(parseSoundOn(null)).toBe(true));
  it("is off only when stored as off", () => expect(parseSoundOn("off")).toBe(false));
  it("is on for anything else", () => {
    expect(parseSoundOn("on")).toBe(true);
    expect(parseSoundOn("garbage")).toBe(true);
  });
});
