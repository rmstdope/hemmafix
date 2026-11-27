import { expect, test } from "./support/test";

// Throwaway: proves that one failing shard turns the required check `e2e` red.
test("fails on purpose", () => {
  expect(1).toBe(2);
});
