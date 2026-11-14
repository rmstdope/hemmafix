// The login hooks in auth.ts, run the way Better Auth runs them after a Google login. The e2e
// tests log in through a test-only auth instance without these hooks, so they are covered here.
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, membership, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { auth } = await import("./auth");
const internal = async () => (await auth.$context).internalAdapter;

const googleUser = (email: string, emailVerified = true) => ({ name: email.split("@")[0]!, email, emailVerified });
/** Creates the account as the Google callback does: through Better Auth, so its hooks run. */
const signUp = async (person: ReturnType<typeof googleUser>) =>
  (await internal()).createUser(person, { method: "oauth" });

beforeAll(async () => {
  await db.delete(household);
});
beforeEach(async () => {
  await db.delete(user);
});

describe("creating an account", () => {
  it("is allowed for a verified address on the allowlist", async () => {
    const created = await signUp(googleUser("anna@example.com"));
    expect(created.email).toBe("anna@example.com");
  });

  it("is refused for an address not on the allowlist", async () => {
    await expect(signUp(googleUser("eve@example.com"))).rejects.toMatchObject({
      body: { code: "EMAIL_NOT_ALLOWED" },
    });
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it("is refused for an unverified address", async () => {
    await expect(signUp(googleUser("anna@example.com", false))).rejects.toMatchObject({
      body: { code: "EMAIL_NOT_VERIFIED" },
    });
  });
});

describe("logging in", () => {
  it("adds the person to the household", async () => {
    const adapter = await internal();
    const anna = await signUp(googleUser("anna@example.com"));

    await adapter.createSession(anna.id);

    const [m] = await db.select().from(membership).where(eq(membership.userId, anna.id));
    expect(m).toBeDefined();
  });

  it("is refused once the address has been removed from the allowlist", async () => {
    const adapter = await internal();
    const bo = await signUp(googleUser("bo@example.com"));

    process.env.ALLOWED_EMAILS = "anna@example.com";
    try {
      await expect(adapter.createSession(bo.id)).rejects.toMatchObject({ body: { code: "EMAIL_NOT_ALLOWED" } });
    } finally {
      process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    }
  });
});
