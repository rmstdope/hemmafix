import { pg } from "@/db";
import { getCurrentMember } from "@/server/dal";
import { TASKS_CHANNEL } from "@/server/chores";
import { onShutdown } from "@/server/shutdown";

type Closer = (reason?: Error) => void;

/**
 * Server-Sent Events: pushes "changed" to every browser in the household when
 * a task changes. Postgres LISTEN/NOTIFY fans out across server instances.
 *
 * Open streams never end on their own, so on shutdown they are ended with an
 * abort, which makes Next drop the connection: a stream that merely closed
 * would leave its connection open for keep-alive, and the browser would
 * reconnect on it to a server that never finishes closing. A stream asked for
 * after shutdown began is ended the same way at once. Browsers reconnect to
 * the next instance (see `retry` below).
 */
export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;
  let unlisten: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  let stopWatching: (() => void) | undefined;

  const close: Closer = (reason) => {
    if (closed) return;
    closed = true;
    stopWatching?.();
    clearInterval(heartbeat);
    void unlisten?.().catch(() => {});
    try {
      if (reason) controllerRef?.error(reason);
      else controllerRef?.close();
    } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      stopWatching = onShutdown(close);
      if (closed) return;
      request.signal.addEventListener("abort", () => close());

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const listener = await pg.listen(TASKS_CHANNEL, (householdId) => {
        if (householdId === member.householdId) send("data: changed\n\n");
      });
      unlisten = listener.unlisten;
      // The client may have gone while LISTEN was being set up.
      if (closed || request.signal.aborted) {
        closed = false;
        close();
        return;
      }

      // Comment lines keep proxies from closing an idle connection.
      heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      send("retry: 5000\n\n");
    },
    cancel: () => close(),
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
