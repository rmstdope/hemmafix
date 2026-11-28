/**
 * Knows whether this server process has been told to stop (SIGTERM), and ends
 * what would otherwise keep it running. Next stops listening on SIGTERM and
 * waits for every connection to close, but an open event stream never ends on
 * its own. State lives on globalThis: Next loads instrumentation and each
 * route in its own module graph.
 */
type Closer = (reason: Error) => void;
type Shutdown = { reason?: Error; closers: Set<Closer> };
const globalForShutdown = globalThis as unknown as { hemmafixShutdown?: Shutdown };

/** Starts watching for SIGTERM. Called once at server start (src/instrumentation.ts); safe to repeat. */
export function watchShutdown(): Shutdown {
  if (!globalForShutdown.hemmafixShutdown) {
    const shutdown: Shutdown = { closers: new Set() };
    globalForShutdown.hemmafixShutdown = shutdown;
    process.once("SIGTERM", () => {
      shutdown.reason = new DOMException("The server is shutting down", "AbortError");
      for (const close of shutdown.closers) close(shutdown.reason);
      shutdown.closers.clear();
    });
  }
  return globalForShutdown.hemmafixShutdown;
}

/**
 * Calls `close` when the server is told to stop, or at once if it already has
 * been. Returns the function that cancels the call.
 */
export function onShutdown(close: Closer): () => void {
  const shutdown = watchShutdown();
  if (shutdown.reason) {
    close(shutdown.reason);
    return () => {};
  }
  shutdown.closers.add(close);
  return () => shutdown.closers.delete(close);
}

/**
 * Headers for an answer that may be given after the server was told to stop. A connection that was
 * busy then is otherwise kept open once answered, and the server waits until it times out.
 */
export function lastAnswerHeaders(): Record<string, string> {
  return watchShutdown().reason ? { Connection: "close" } : {};
}
