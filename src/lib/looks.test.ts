import { describe, expect, it } from "vitest";
import { buyLookLabel, coinsLeft, chooseLookInput, defaultLook, findLook, LOOKS, LOOK_KINDS, previewMotionText, previewText } from "./looks";

const of = (kind: "frame" | "theme" | "coin") => LOOKS.filter((l) => l.kind === kind).map((l) => [l.name, l.price]);

describe("the catalogue", () => {
  it("sells the agreed frames", () =>
    expect(of("frame")).toEqual([["Ingen ram", 0], ["Guldram", 150], ["Grön ram", 150], ["Rosa ram", 150], ["Himmelsram", 300]]));
  it("sells the agreed themes", () =>
    expect(of("theme")).toEqual([["Svart", 0], ["Lila", 200], ["Skog", 200], ["Hallon", 200], ["Jul", 300]]));
  it("sells the agreed coins", () =>
    expect(of("coin")).toEqual([["Guld", 0], ["Silver", 100], ["Diamant", 250], ["Stjärna", 400]]));
  it("has three kinds, each starting with its free default", () => {
    expect(LOOK_KINDS).toEqual(["frame", "theme", "coin"]);
    for (const kind of LOOK_KINDS) expect(defaultLook(kind).price).toBe(0);
  });
  it("finds a look by kind and key, and never across kinds", () => {
    expect(findLook("frame", "guld")?.name).toBe("Guldram");
    expect(findLook("theme", "guld")).toBeUndefined();
  });
});

describe("texts", () => {
  it("previews each kind in its own words", () => {
    expect(previewText("frame")).toBe("Så här ser din bild ut för hela familjen.");
    expect(previewText("theme")).toBe("Så här ser Hemmafix ut för dig.");
    expect(previewText("coin")).toBe("Så här ser dina mynt ut.");
  });
  it("says what moves, for Jul only", () => {
    expect(previewMotionText(findLook("theme", "jul")!)).toBe("Snö och paket faller, och tomtens släde flyger förbi.");
    expect(previewMotionText(findLook("theme", "lila")!)).toBeNull();
    expect(previewMotionText(findLook("coin", "silver")!)).toBeNull();
  });
  it("says what is missing", () => expect(coinsLeft(150, 70)).toBe("80 mynt kvar"));
  it("labels the buy button", () => expect(buyLookLabel(150)).toBe("Köp för 150 mynt"));
});

describe("chooseLookInput", () => {
  it("accepts a look of the catalogue", () => expect(chooseLookInput.parse({ kind: "frame", key: "gron" })).toEqual({ kind: "frame", key: "gron" }));
  it("refuses an unknown key or kind", () => {
    expect(chooseLookInput.safeParse({ kind: "frame", key: "nope" }).success).toBe(false);
    expect(chooseLookInput.safeParse({ kind: "hat", key: "none" }).success).toBe(false);
  });
});
