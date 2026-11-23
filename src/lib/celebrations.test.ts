import { describe, expect, it } from "vitest";
import { badgeAnnouncement, confettiPieces, levelAnnouncement } from "./celebrations";

describe("announcements", () => {
  it("reads a badge and a level aloud", () => {
    expect(badgeAnnouncement("Tio av samma")).toBe("Nytt märke: Tio av samma, 25 mynt");
    expect(levelAnnouncement(5, "Hemmahjälte")).toBe("Nivå 5, Hemmahjälte");
  });
});

describe("confettiPieces", () => {
  const seeded = () => {
    let s = 7;
    return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  };

  it("makes the number asked for, deterministically", () => {
    expect(confettiPieces(40, seeded())).toHaveLength(40);
    expect(confettiPieces(10, seeded())).toEqual(confettiPieces(10, seeded()));
  });

  it("keeps every piece inside the screen and done within about two seconds", () => {
    for (const p of confettiPieces(200, seeded())) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left).toBeLessThanOrEqual(100);
      expect(p.delay + p.duration).toBeLessThanOrEqual(2000);
      expect(p.colour).toBeGreaterThanOrEqual(0);
      expect(p.colour).toBeLessThan(6);
    }
  });
});
