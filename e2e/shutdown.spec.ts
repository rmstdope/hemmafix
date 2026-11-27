import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import type { BrowserContext } from "@playwright/test";
import { logIn } from "./support/family";
import { ALLOWED, E2E_AUTH_SECRET, E2E_PORT, PEOPLE } from "./support/env";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

// The image contract asks for a fast shutdown on SIGTERM: a deploy stops the old container and
// waits for it. A family member's open page holds a live-update stream (/api/events), which must
// not keep the old server running. The worker's web server cannot be stopped mid-suite, so these
// tests start their own standalone server on the next port, on the same database and secret.

const PORT = E2E_PORT + 1;
const BASE = `http://localhost:${PORT}`;

/** Starts the standalone server, runs `body` against it, and stops it however `body` ends. */
async function withServer(body: (server: ChildProcess, exited: Promise<unknown>) => Promise<void>) {
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
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  server.stderr?.on("data", (chunk) => (stderr += chunk));
  const exited = once(server, "exit");
  try {
    await expect(async () => expect((await fetch(`${BASE}/healthz`)).ok).toBe(true)).toPass({ timeout: 30_000 });
    // Something else may have answered on the port; make sure it was this server.
    expect(server.exitCode ?? server.signalCode, `the test's server is not running: ${stderr}`).toBeNull();
    await body(server, exited);
  } finally {
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  }
}

/** Sends SIGTERM and asserts that the server has exited within a few seconds. */
async function expectPromptExit(server: ChildProcess, exited: Promise<unknown>, signalled: number) {
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
  expect(server.exitCode ?? server.signalCode, "the server is still running 10 s after SIGTERM").not.toBeNull();
  expect(Date.now() - signalled).toBeLessThan(5_000);
}

function refusesConnections() {
  return new Promise<boolean>((resolve) => {
    const probe = connect(PORT, "localhost");
    probe.once("connect", () => (probe.destroy(), resolve(false)));
    probe.once("error", () => resolve(true));
  });
}

async function cookieHeader(context: BrowserContext) {
  return (await context.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join("; ");
}

test("the server exits promptly on SIGTERM while a page holds an event stream", { tag: RUN_ONCE }, async ({ page, context }) => {
  await withServer(async (server, exited) => {
    await logIn(context, "anna", "adult");
    const stream = page.waitForResponse((r) => r.url().endsWith("/api/events") && r.status() === 200);
    await page.goto(`${BASE}/`);
    await stream;

    const signalled = Date.now();
    server.kill("SIGTERM");
    await expectPromptExit(server, exited, signalled);
  });
});

// Node's server.close() drops only the connections idle at that moment. One that is busy then
// (a page load, a refresh, or a proxy's pooled connection) stays open afterwards, and an event
// stream asked for on it must not keep the server running either.
test("the server exits promptly on SIGTERM when an event stream is asked for afterwards", { tag: RUN_ONCE }, async ({ context }) => {
  await withServer(async (server, exited) => {
    await logIn(context, "anna", "adult");
    const cookie = await cookieHeader(context);

    const socket = connect(PORT, "localhost");
    await once(socket, "connect");
    let received = "";
    socket.on("data", (chunk) => (received += chunk));
    socket.on("error", () => {});
    // A request under way: its headers are only half sent, so the connection is not idle.
    socket.write(`GET /healthz HTTP/1.1\r\nHost: localhost:${PORT}\r\n`);

    const signalled = Date.now();
    server.kill("SIGTERM");
    // Once new connections are refused, the server has stopped listening with ours still busy.
    await expect.poll(refusesConnections).toBe(true);
    socket.write("\r\n");
    await expect.poll(() => received).toContain('"status":"ok"');
    expect(received, "the busy connection is kept open").toMatch(/^Connection: keep-alive$/im);
    // The same connection now asks for an event stream.
    const answered = received.length;
    socket.write(`GET /api/events HTTP/1.1\r\nHost: localhost:${PORT}\r\nCookie: ${cookie}\r\n\r\n`);

    await expectPromptExit(server, exited, signalled);
    expect(received.slice(answered), "the event stream was refused instead of asked for").not.toMatch(/^HTTP\/1\.1 401/);
    socket.destroy();
  });
});
