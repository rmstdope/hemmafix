// Which server and database each of Playwright's workers has to itself. Pure: `env.ts` applies it.

/** Each worker takes two ports, and a worktree's block holds ten (`port_block_size` in `.cerebro/project.conf`). */
const MAX_WORKERS = 5;

/**
 * How many tests run at once: `E2E_WORKERS`, else two in CI, where the run has the machine to
 * itself, and one elsewhere, where it often does not.
 */
export function workerCount(env: Record<string, string | undefined>) {
  const value = env.E2E_WORKERS;
  if (value === undefined) return env.CI ? 2 : 1;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_WORKERS) {
    throw new Error(`E2E_WORKERS must be a whole number from 1 to ${MAX_WORKERS}, not "${value}"`);
  }
  return count;
}

/**
 * Worker `index`'s own port and database in the run whose ports start at `basePort`. The port
 * after its server's stays free for a test that starts a server of its own.
 */
export function workerSlot(basePort: number, runDb: string, index: number) {
  const port = basePort + 2 * index;
  return { port, baseUrl: `http://localhost:${port}`, db: `${runDb}_w${index}` };
}
