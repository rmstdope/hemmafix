import { describe, expect, it } from "vitest";
import {
  buyText,
  coinsLeftText,
  giveRecipients,
  givenWhen,
  purchasedWhen,
  rewardInput,
  waitingWhen,
} from "./rewards";

const NOW = new Date("2026-11-23T15:30:00Z"); // 16:30 in Stockholm, a Monday

describe("rewardInput", () => {
  it("trims the name and takes a whole price from 1 to 1 000", () => {
    expect(rewardInput.parse({ name: "  Glass ", price: "50" })).toEqual({ name: "Glass", price: 50 });
    expect(rewardInput.parse({ name: "Resa", price: 1000 }).price).toBe(1000);
    expect(rewardInput.parse({ name: "Resa", price: "1" }).price).toBe(1);
  });

  it("asks for a name", () => {
    const r = rewardInput.safeParse({ name: "   ", price: "50" });
    expect(r.error?.issues[0]?.message).toBe("Skriv ett namn.");
  });

  it.each(["0", "1001", "-5", "2.5", "", "abc"])("refuses the price %j", (price) => {
    const r = rewardInput.safeParse({ name: "Glass", price });
    expect(r.error?.issues[0]?.message).toBe("Priset ska vara 1–1 000 mynt.");
  });
});

describe("texts", () => {
  it("says how many coins are missing", () => {
    expect(coinsLeftText(120, 40)).toBe("80 mynt kvar");
  });

  it("writes the buy sheet's sentence", () => {
    expect(buyText(50, 320)).toBe("Det kostar 50 mynt. Du har 320 och får 270 kvar. En vuxen ger dig belöningen.");
    expect(buyText(1000, 1250)).toBe("Det kostar 1\u00a0000 mynt. Du har 1\u00a0250 och får 250 kvar. En vuxen ger dig belöningen.");
  });

  it("says when it was bought", () => {
    expect(purchasedWhen(new Date("2026-11-23T15:20:00Z"), NOW)).toBe("Köpt idag 16:20");
    expect(purchasedWhen(new Date("2026-11-22T10:05:00Z"), NOW)).toBe("Köpt igår 11:05");
    expect(purchasedWhen(new Date("2026-11-20T10:05:00Z"), NOW)).toBe("Köpt i fredags 11:05");
    expect(purchasedWhen(new Date("2026-11-02T10:05:00Z"), NOW)).toBe("Köpt 2 nov 11:05");
  });

  it("says when the gold row's reward was bought, in lower case", () => {
    expect(waitingWhen(new Date("2026-11-23T15:20:00Z"), NOW)).toBe("🎁 Belöning · köpt idag 16:20");
  });

  it("says when it was given", () => {
    expect(givenWhen(new Date("2026-11-23T15:20:00Z"), NOW)).toBe("Fick idag");
    expect(givenWhen(new Date("2026-11-22T10:05:00Z"), NOW)).toBe("Fick igår");
    expect(givenWhen(new Date("2026-11-20T10:05:00Z"), NOW)).toBe("Fick i fredags");
    expect(givenWhen(new Date("2026-11-02T10:05:00Z"), NOW)).toBe("Fick 2 nov");
  });
});

describe("giveRecipients", () => {
  const anna = { id: "a", role: "adult" as const };
  const pappa = { id: "p", role: "adult" as const };
  const bo = { id: "b", role: "child" as const };

  it("gives a child's purchase to every adult", () => {
    expect(giveRecipients("b", [anna, pappa, bo])).toEqual(["a", "p"]);
  });
  it("gives an adult's purchase to the other adults", () => {
    expect(giveRecipients("a", [anna, pappa, bo])).toEqual(["p"]);
  });
  it("gives the only adult's own purchase to that adult", () => {
    expect(giveRecipients("a", [anna, bo])).toEqual(["a"]);
  });
  it("gives a purchase to no one when the home has no adult", () => {
    expect(giveRecipients("x", [bo])).toEqual([]);
  });
});
