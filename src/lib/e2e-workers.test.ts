import { afterEach, describe, expect, it, vi } from "vitest";
import { workerCount, workerSlot } from "../../e2e/support/slots";

describe("how many end-to-end tests run at once", () => {
  it("is two in CI and one elsewhere", () => {
    expect(workerCount({ CI: "true" })).toBe(2);
    expect(workerCount({})).toBe(1);
  });

  it("can be set with E2E_WORKERS, in CI too", () => {
    expect(workerCount({ E2E_WORKERS: "2" })).toBe(2);
    expect(workerCount({ CI: "true", E2E_WORKERS: "1" })).toBe(1);
    expect(workerCount({ E2E_WORKERS: "5" })).toBe(5);
  });

  // Each worker takes two ports, and a worktree's port block holds ten.
  it.each(["0", "6", "1.5", "two", ""])("refuses E2E_WORKERS=%j", (value) => {
    expect(() => workerCount({ E2E_WORKERS: value })).toThrow(/E2E_WORKERS/);
  });
});

describe("a worker's own server and database", () => {
  const slots = [0, 1, 2, 3, 4].map((index) => workerSlot(3200, "hemmafix_test_r1_ab_e2e", index));

  it("shares no port or database with another worker", () => {
    expect(new Set(slots.map((s) => s.db)).size).toBe(slots.length);
    // The port after a server's own is spare for a test that starts a server of its own.
    const ports = slots.flatMap((s) => [s.port, s.port + 1]);
    expect(ports).toEqual([3200, 3201, 3202, 3203, 3204, 3205, 3206, 3207, 3208, 3209]);
  });

  it("is reached on its port and named after the run", () => {
    expect(slots[1]).toEqual({
      port: 3202,
      baseUrl: "http://localhost:3202",
      db: "hemmafix_test_r1_ab_e2e_w1",
    });
  });
});

/** The settings as one of Playwright's processes loads them: a worker has its parallel index. */
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const settings = await import("../../e2e/support/env");
  const { default: config } = await import("../../playwright.config");
  return { settings, config };
}

describe("an end-to-end run of two workers", () => {
  const run = {
    E2E_WORKERS: "2",
    E2E_PORT: "3200",
    E2E_DB: "hemmafix_test_r1_ab_e2e",
    TEST_DATABASE_URL: "postgres://u:p@localhost:5432/dev",
    DATABASE_URL: "postgres://u:p@localhost:5432/dev",
  };
  const database = (url: string | undefined) => new URL(url!).pathname.slice(1);

  afterEach(() => void vi.unstubAllEnvs());

  it("gives a worker its own server and database", async () => {
    const { settings, config } = await load({ ...run, TEST_PARALLEL_INDEX: "1" });
    expect(settings.E2E_PORT).toBe(3202);
    expect(settings.E2E_BASE_URL).toBe("http://localhost:3202");
    expect(config.use?.baseURL).toBe("http://localhost:3202");
    expect(settings.E2E_DB).toBe("hemmafix_test_r1_ab_e2e_w1");
    expect(database(process.env.DATABASE_URL)).toBe("hemmafix_test_r1_ab_e2e_w1");
    // Inherited by whatever this process starts: still the run's name, not one worker's.
    expect(process.env.E2E_DB).toBe("hemmafix_test_r1_ab_e2e");
    expect(process.env.E2E_PORT).toBe("3200");
  });

  it("starts one server per worker, each on its own database", async () => {
    const { settings, config } = await load(run);
    expect(config.workers).toBe(2);
    expect(config.fullyParallel).toBe(true);
    const servers = [config.webServer].flat();
    expect(
      servers.map((s) => ({
        url: s!.url,
        port: s!.env!.PORT,
        auth: s!.env!.BETTER_AUTH_URL,
        db: database(s!.env!.DATABASE_URL),
        migrates: s!.command.split(" && ")[0],
      })),
    ).toEqual(
      [0, 1].map((i) => ({
        url: `http://localhost:${3200 + 2 * i}/healthz`,
        port: String(3200 + 2 * i),
        auth: `http://localhost:${3200 + 2 * i}`,
        db: `hemmafix_test_r1_ab_e2e_w${i}`,
        migrates: `node test/migrate-database.mjs hemmafix_test_r1_ab_e2e_w${i}`,
      })),
    );
    expect(settings.E2E_SLOTS.map((s) => s.db)).toEqual(servers.map((s) => database(s!.env!.DATABASE_URL)));
  });

  // `--workers` on the command line raises the workers without starting servers for them.
  it("refuses a worker that no server was started for", async () => {
    await expect(load({ ...run, TEST_PARALLEL_INDEX: "2" })).rejects.toThrow(/E2E_WORKERS/);
  });
});
