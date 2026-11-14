import { connection } from "next/server";

/** Release identity required by rmstdope-infra. GIT_SHA is baked into the image. */
export async function GET() {
  await connection();
  return Response.json(
    { revision: process.env.GIT_SHA ?? "development" },
    { headers: { "Cache-Control": "no-cache" } },
  );
}
