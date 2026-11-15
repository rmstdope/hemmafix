import "server-only";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";
import { auth } from "./auth";

export type ConnectingApp = { clientId: string; name: string };

/** Shown when a connecting app registered without a name. */
const DEFAULT_APP_NAME = "Claude";

/**
 * The app asking to connect, from the page's search params: only when they carry a request
 * signed by this server that has not expired. Null for anything else.
 */
export async function readConnectingApp(params: Record<string, string | string[] | undefined>): Promise<ConnectingApp | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const clientId = query.get("client_id");
  if (!clientId || !query.has("sig")) return null;
  if (!(await verifyOAuthQueryParams(query.toString(), (await auth.$context).secret))) return null;

  const [client] = await db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1);
  if (!client) return null;
  return { clientId, name: client.name?.trim() || DEFAULT_APP_NAME };
}
