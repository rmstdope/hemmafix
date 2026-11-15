import { test, expect } from "./support/test";

/** An authorize request with nothing valid in it: the rate limiter counts it before anything else looks. */
const authorize = (request: import("@playwright/test").APIRequestContext) =>
  request.get("/api/auth/oauth2/authorize", { maxRedirects: 0, failOnStatusCode: false });

test("a test has an authorize allowance of its own", async ({ request }) => {
  // Two projects run this: sharing one bucket, they would exceed the limit of 30 together.
  for (let i = 0; i < 20; i++) {
    expect((await authorize(request)).status(), `request ${i + 1}`).not.toBe(429);
  }
});

test("the authorize limit still applies", async ({ request }) => {
  for (let i = 0; i < 30; i++) await authorize(request);
  const limited = await authorize(request);
  expect(limited.status()).toBe(429);
  expect(await limited.text()).toContain("Too many requests");
});
