import { getCurrentMember } from "@/server/dal";
import { readCalendar } from "@/server/calendar";
import { lastAnswerHeaders } from "@/server/shutdown";

/** The family calendar's coming days, as the person asking may read them with their own access. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });
  const view = await readCalendar(member);
  return Response.json(view, { headers: { "Cache-Control": "no-store", ...lastAnswerHeaders() } });
}
