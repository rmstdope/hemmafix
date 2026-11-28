import { getCurrentMember } from "@/server/dal";
import { readCalendar } from "@/server/calendar";

/** The family calendar's coming days, as the person asking may read them with their own access. */
export async function GET() {
  const member = await getCurrentMember();
  if (!member) return new Response("Unauthorized", { status: 401 });
  return Response.json(await readCalendar(member), { headers: { "Cache-Control": "no-store" } });
}
