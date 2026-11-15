import { connection } from "next/server";
import { auth } from "@/server/auth";

// Better Auth's mcp plugin answers the RFC 9728 document; this route only lets the request
// reach it, since Next sends just /api/auth/* to the auth handler.
export const GET = async (request: Request) => {
  // Answered per request: the build has no secrets, and the document is made from them.
  await connection();
  const res = await auth.handler(request);
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, { status: res.status, headers });
};
