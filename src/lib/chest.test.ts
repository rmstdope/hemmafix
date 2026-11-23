import { describe, expect, it } from "vitest";
import { CHEST_MAX, CHEST_MIN, rollChestCoins } from "./chest";

describe("rollChestCoins", () => {
  it("gives 5 to 10 coins, every amount reachable", () => {
    expect([CHEST_MIN, CHEST_MAX]).toEqual([5, 10]);
    expect(rollChestCoins(() => 0)).toBe(5);
    expect(rollChestCoins(() => 0.999999)).toBe(10);
    const seen = new Set<number>();
    for (let i = 0; i < 6; i++) seen.add(rollChestCoins(() => i / 6 + 0.01));
    expect([...seen].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
  });
});
