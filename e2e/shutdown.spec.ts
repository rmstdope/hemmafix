import { spawn } from "node:child_process";
import { once } from "node:events";
import { logIn } from "./support/family";
import { ALLOWED, E2E_AUTH_SECRET, E2E_PORT, PEOPLE } from "./support/env";
import { expect, test } from "./support/test";

// The image contract asks for a fast shutdown on SIGTERM: a deploy stops the old container and
// waits for it. A family member's open page holds a live-update stream (/api/events), which must
// not keep the old server running. The shared web server cannot be stopped mid-suite, so this
// test starts its own standalone server on the next port, on the same database and secret.

const PORT = E2E_PORT + 1;
const BASE = `http://localhost:${PORT}`;

test("the server exits promptly on SIGTERM while a page holds an event stream", async ({ page, context }) => {
  const server = spawn(process.execPath, [".next/standalone/server.js"], {
    env: {
      ...process.env,
      BETTER_AUTH_URL: BASE,
      BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
      GOOGLE_CLIENT_ID: "e2e",
      GOOGLE_CLIENT_SECRET: "e2e",
      ALLOWED_EMAILS: ALLOWED.map((p) => PEOPLE[p].email).join(","),
      PORT: String(PORT),
      HOSTNAME: "localhost",
    },
    stdio: "ignore",
  });
  const exited = once(server, "exit");
  try {
    await expect(async () => expect((await fetch(`${BASE}/healthz`)).ok).toBe(true)).toPass({ timeout: 30_000 });

    await logIn(context, "anna", "adult");
    const stream = page.waitForResponse((r) => r.url().endsWith("/api/events") && r.status() === 200);
    await page.goto(`${BASE}/`);
    await stream;

    const stopped = Date.now();
    server.kill("SIGTERM");
    await Promise.race([exited, page.waitForTimeout(10_000)]);
    expect(server.exitCode ?? server.signalCode, "the server is still running 10 s after SIGTERM").not.toBeNull();
    expect(Date.now() - stopped).toBeLessThan(5_000);
  } finally {
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  }
});
