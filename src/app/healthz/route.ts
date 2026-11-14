import { pg } from "@/db";

/** Readiness probe for Docker/infra: fails when the database is unreachable. */
export async function GET() {
  try {
    await pg`select 1`;
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "db-unavailable" }, { status: 503 });
  }
}
