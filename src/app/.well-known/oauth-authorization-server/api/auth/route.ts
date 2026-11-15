import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { connection } from "next/server";
import { auth } from "@/server/auth";

const metadata = oauthProviderAuthServerMetadata(auth, { headers: { "Access-Control-Allow-Origin": "*" } });

export const GET = async (request: Request) => {
  // Answered per request: the build has no secrets, and the document is made from them.
  await connection();
  return metadata(request);
};
