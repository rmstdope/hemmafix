import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowedEmails } from "./allowlist";

describe("parseAllowedEmails", () => {
  it("handles commas, whitespace, case and blanks", () => {
    const set = parseAllowedEmails(" Anna@Example.com, bo@example.com;\n,, ");
    expect([...set]).toEqual(["anna@example.com", "bo@example.com"]);
  });

  it("returns an empty set for undefined", () => {
    expect(parseAllowedEmails(undefined).size).toBe(0);
  });
});

describe("isEmailAllowed", () => {
  const allowed = parseAllowedEmails("anna@example.com");

  it("matches case-insensitively", () => {
    expect(isEmailAllowed("ANNA@example.com", allowed)).toBe(true);
  });

  it("rejects unknown and missing addresses", () => {
    expect(isEmailAllowed("eve@example.com", allowed)).toBe(false);
    expect(isEmailAllowed(undefined, allowed)).toBe(false);
  });
});
