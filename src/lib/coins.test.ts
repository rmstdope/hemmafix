import { describe, expect, it } from "vitest";
import { clampCoins, coinsBadgeLabel, coinsLabel, DEFAULT_COINS, formatCoins, MAX_COINS, stepCoins } from "./coins";

describe("coins", () => {
  it("starts a task at 10 coins, up to 100", () => {
    expect(DEFAULT_COINS).toBe(10);
    expect(MAX_COINS).toBe(100);
  });

  it("steps to the next multiple of 5, within 0 and 100", () => {
    expect(stepCoins(7, 1)).toBe(10);
    expect(stepCoins(7, -1)).toBe(5);
    expect(stepCoins(10, 1)).toBe(15);
    expect(stepCoins(10, -1)).toBe(5);
    expect(stepCoins(3, -1)).toBe(0);
    expect(stepCoins(0, -1)).toBe(0);
    expect(stepCoins(98, 1)).toBe(100);
    expect(stepCoins(100, 1)).toBe(100);
  });

  it("clamps a typed amount when the field is left", () => {
    expect(clampCoins("150", 10)).toBe(100);
    expect(clampCoins("2.6", 10)).toBe(3);
    expect(clampCoins("", 25)).toBe(25);
    expect(clampCoins("abc", 25)).toBe(25);
    expect(clampCoins("0", 25)).toBe(0);
    expect(clampCoins("-5", 25)).toBe(0);
  });

  it("names a badge for a screen reader", () => {
    expect(coinsBadgeLabel(30)).toBe("30 mynt");
    expect(coinsBadgeLabel(0)).toBe("0 mynt");
  });

  it("writes numbers in full, with a non-breaking space between thousands", () => {
    expect(formatCoins(0)).toBe("0");
    expect(formatCoins(40)).toBe("40");
    expect(formatCoins(1250)).toBe("1 250");
    expect(formatCoins(1000000)).toBe("1 000 000");
  });

  it("names the pill for a screen reader", () => {
    expect(coinsLabel(40)).toBe("40 mynt");
    expect(coinsLabel(1250)).toBe("1 250 mynt");
  });
});
