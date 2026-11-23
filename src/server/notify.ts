import "server-only";
import { pg } from "@/db";

export const TASKS_CHANNEL = "hemmafix_tasks";

/** Tell every open browser in the household that something changed. */
export async function notifyHouseholdChanged(householdId: string) {
  await pg.notify(TASKS_CHANNEL, householdId);
}
