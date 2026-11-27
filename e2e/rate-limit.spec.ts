import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./support/test";

/** An authorize request with nothing valid in it: the rate limiter counts it before anything else looks. */
const authorize = (request: APIRequestContext) =>
  request.get("/api/auth/oauth2/authorize", { maxRedirects: 0, failOnStatusCode: false });

test("the authorize limit still applies", async ({ request }) => {
  for (let i = 0; i < 30; i++) await authorize(request);
  const limited = await authorize(request);
  expect(limited.status()).toBe(429);
  expect(await limited.text()).toContain("Too many requests");
});

test("a test has an authorize allowance of its own", async ({ request }) => {
  // The test above has just used an allowance up: sharing one bucket, this one would be refused.
  for (let i = 0; i < 30; i++) {
    expect((await authorize(request)).status(), `request ${i + 1}`).not.toBe(429);
  }
});
