import { describe, expect, it } from "vitest";
import { decideAccess } from "./access";
import { parseAllowedEmails } from "./allowlist";

const allowed = parseAllowedEmails("anna@example.com");

describe("decideAccess", () => {
  it("allows a verified address on the list", () => {
    expect(decideAccess({ email: "Anna@example.com", emailVerified: true }, allowed)).toBe("ok");
  });

  it("refuses addresses that are not, or no longer, on the list", () => {
    expect(decideAccess({ email: "eve@example.com", emailVerified: true }, allowed)).toBe("not-allowed");
    expect(decideAccess({ email: "anna@example.com", emailVerified: true }, new Set())).toBe("not-allowed");
  });

  it("refuses unverified or missing e-mail", () => {
    expect(decideAccess({ email: "anna@example.com", emailVerified: false }, allowed)).toBe("unverified");
    expect(decideAccess({ email: "anna@example.com" }, allowed)).toBe("unverified");
    expect(decideAccess({ email: null, emailVerified: true }, allowed)).toBe("not-allowed");
  });
});
