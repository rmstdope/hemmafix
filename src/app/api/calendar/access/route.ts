import { getCurrentMember } from "@/server/dal";
import { calendarNeedsAccess } from "@/server/calendar";
import { lastAnswerHeaders } from "@/server/shutdown";

/** Whether the person still has to give access to the calendar: the red dot on its tab. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });
  const needsAccess = await calendarNeedsAccess(member);
  return Response.json({ needsAccess }, { headers: { "Cache-Control": "no-store", ...lastAnswerHeaders() } });
}
