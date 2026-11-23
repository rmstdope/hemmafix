/** Runs once when the server starts, before it answers any request. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { watchShutdown } = await import("@/server/shutdown");
    // Watching from the start: a stream asked for after SIGTERM must be ended
    // too, even when no stream was open before it.
    watchShutdown();
  }
}
