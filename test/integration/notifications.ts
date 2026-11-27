import { randomUUID } from "node:crypto";
import { pg } from "@/db";
import { TASKS_CHANNEL } from "@/server/notify";

/**
 * Listens for the homes whose open devices are told to refresh, without waiting on the clock.
 * `told` sends a marker of its own on the same channel and waits for it: Postgres delivers
 * notifications in commit order, so everything announced by calls that have returned (the server
 * awaits each notify) has arrived by then, and nothing arriving means nobody was told.
 */
export async function listenForHomes() {
  let heard: string[] = [];
  let marker: { payload: string; arrived: (before: string[]) => void } | undefined;
  const listener = await pg.listen(TASKS_CHANNEL, (payload) => {
    if (payload !== marker?.payload) {
      heard.push(payload);
      return;
    }
    marker.arrived(heard);
    heard = [];
  });
  return {
    /** The home ids announced since the last call (or since listening began). One call at a time. */
    async told() {
      const payload = `marker-${randomUUID()}`;
      const before = new Promise<string[]>((arrived) => (marker = { payload, arrived }));
      await pg.notify(TASKS_CHANNEL, payload);
      return before;
    },
    unlisten: () => listener.unlisten(),
  };
}
