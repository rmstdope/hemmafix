import { getCurrentMember } from "@/server/dal";
import { calendarNeedsAccess } from "@/server/calendar";

/** Whether the person still has to give access to the calendar: the red dot on its tab. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });
  return Response.json(
    { needsAccess: await calendarNeedsAccess(member) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
