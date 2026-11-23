import { describe, expect, it } from "vitest";
import { COINS_PER_TASK, coinsLabel, formatCoins } from "./coins";

describe("coins", () => {
  it("gives 10 coins per task until amounts can be set", () => {
    expect(COINS_PER_TASK).toBe(10);
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
