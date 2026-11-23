import { getCurrentMember } from "@/server/dal";
import { getPendingRecap } from "@/server/weeks";
import { WeekRecapSheet } from "./week-recap";

/** Shows "Din vecka" over whichever part opens first in a new week. */
export async function WeekRecapGate() {
  const member = await getCurrentMember();
  if (!member) return null;
  const recap = await getPendingRecap(member);
  return recap ? <WeekRecapSheet recap={recap} /> : null;
}
