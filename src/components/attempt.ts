import { toast } from "sonner";
import type { ActionState } from "@/app/actions";
import { SAVE_FAILED } from "@/lib/routine-texts";

/** Runs an action; a failure (also a thrown one) is a notice, and the caller learns whether it worked. */
export async function attempt(run: () => Promise<ActionState>): Promise<boolean> {
  const result = await run().catch(() => ({ ok: false, error: SAVE_FAILED }));
  if (!result.ok) toast.error(result.error ?? SAVE_FAILED);
  return result.ok;
}
