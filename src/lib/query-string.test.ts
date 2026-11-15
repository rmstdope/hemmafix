import { describe, expect, it } from "vitest";
import { toQueryString } from "./query-string";

describe("toQueryString", () => {
  it("keeps keys that repeat repeated, not joined with commas", () => {
    expect(toQueryString({ a: "1", ba_param: ["x", "y"], gone: undefined })).toBe("a=1&ba_param=x&ba_param=y");
  });
});
