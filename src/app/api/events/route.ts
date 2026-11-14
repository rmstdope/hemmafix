import { pg } from "@/db";
import { getCurrentMember } from "@/server/dal";
import { TASKS_CHANNEL } from "@/server/tasks";

/**
 * Server-Sent Events: pushes "changed" to every browser in the household when
 * a task changes. Postgres LISTEN/NOTIFY fans out across server instances.
 */
export async function GET(request: Request) {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const { unlisten } = await pg.listen(TASKS_CHANNEL, (householdId) => {
        if (householdId === member.householdId) send("data: changed\n\n");
      });
      // Comment lines keep proxies from closing an idle connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        void unlisten().catch(() => {});
        cleanup = () => {};
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });

      send("retry: 5000\n\n");
    },
    cancel() {
      cleanup();
    },
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
