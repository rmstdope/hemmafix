import "server-only";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { oauthClient } from "@/db/schema";
import { appDisplayName, describeAddress, type AppAddress } from "@/lib/connecting-app";
import { toQueryString, type SearchParams } from "@/lib/query-string";
import { auth } from "./auth";

/** `name` is for headings, `nameInline` for the middle of a sentence; a nameless app is named after its address. */
export type ConnectingApp = { clientId: string; name: string; nameInline: string; address: AppAddress };

/**
 * The app asking to connect, from the page's search params: only when they carry a request
 * signed by this server that has not expired. Null for anything else.
 */
export async function readConnectingApp(params: SearchParams): Promise<ConnectingApp | null> {
  const query = new URLSearchParams(toQueryString(params));
  const clientId = query.get("client_id");
  if (!clientId || !query.has("sig")) return null;
  if (!(await verifyOAuthQueryParams(query.toString(), (await auth.$context).secret))) return null;

  const [client] = await db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1);
  if (!client) return null;
  // Where Godkänn/Avbryt send the person: the signed request's own redirect address.
  const address = describeAddress(query.get("redirect_uri") ?? "");
  if (!address) return null;
  const display = appDisplayName(client.name, address);
  return { clientId, name: display.heading, nameInline: display.inline, address };
}
