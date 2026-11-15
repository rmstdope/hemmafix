import { pg } from "@/db";
import { getCurrentMember } from "@/server/dal";
import { TASKS_CHANNEL } from "@/server/chores";

type Closer = () => void;
const globalForStreams = globalThis as unknown as { sseClosers?: Set<Closer> };

/**
 * Open event streams never end on their own, so a graceful shutdown would wait
 * for them until the container is killed. On SIGTERM, close them all; browsers
 * reconnect to the next instance (see `retry` below). Next's own handler closes
 * the server alongside this one.
 */
function openStreams(): Set<Closer> {
  if (!globalForStreams.sseClosers) {
    const closers = new Set<Closer>();
    globalForStreams.sseClosers = closers;
    process.once("SIGTERM", () => {
      for (const close of closers) close();
    });
  }
  return globalForStreams.sseClosers;
}

/**
 * Server-Sent Events: pushes "changed" to every browser in the household when
 * a task changes. Postgres LISTEN/NOTIFY fans out across server instances.
 */
export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  const streams = openStreams();
  let closed = false;
  let unlisten: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;

  const close: Closer = () => {
    if (closed) return;
    closed = true;
    streams.delete(close);
    clearInterval(heartbeat);
    void unlisten?.().catch(() => {});
    try {
      controllerRef?.close();
    } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      streams.add(close);
      request.signal.addEventListener("abort", close);

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
    cancel: close,
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
