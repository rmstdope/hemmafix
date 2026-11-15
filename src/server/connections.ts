import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, min, sql } from "drizzle-orm";
import { db } from "@/db";
import { appConnectionUse, appToken, membership, oauthClient, oauthRefreshToken } from "@/db/schema";
import { assertCan } from "@/lib/permissions";
import { notifyHouseholdChanged } from "./chores";
import type { Actor } from "./household";

/**
 * A connected app is the refresh-token family of one approval: rotation inserts a new row and
 * revokes the old one, but `authorization_code_id` stays, so it is the connection's identity.
 */
export type Connection = {
  id: string;
  appName: string;
  icon: string | null;
  connectedAt: Date;
  lastUsedAt: Date | null;
};

export const UNKNOWN_APP_NAME = "Okänd app";

/** At most one last-use write per connection per this many milliseconds. */
const USE_WRITE_INTERVAL_MS = 60_000;

const liveHead = (now: Date) => and(isNull(oauthRefreshToken.revoked), gt(oauthRefreshToken.expiresAt, now));

/** The person's own live connections, newest first. */
export async function listConnections(userId: string): Promise<Connection[]> {
  const heads = await db
    .select({ id: oauthRefreshToken.authorizationCodeId, name: oauthClient.name, icon: oauthClient.icon })
    .from(oauthRefreshToken)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthRefreshToken.clientId))
    .where(and(eq(oauthRefreshToken.userId, userId), liveHead(new Date())));
  const ids = heads.flatMap((h) => (h.id ? [h.id] : []));
  if (ids.length === 0) return [];

  const [firsts, uses] = await Promise.all([
    db
      .select({ id: oauthRefreshToken.authorizationCodeId, at: min(oauthRefreshToken.createdAt) })
      .from(oauthRefreshToken)
      .where(and(eq(oauthRefreshToken.userId, userId), inArray(oauthRefreshToken.authorizationCodeId, ids)))
      .groupBy(oauthRefreshToken.authorizationCodeId),
    db
      .select({ id: appConnectionUse.connectionId, at: appConnectionUse.lastUsedAt })
      .from(appConnectionUse)
      .where(inArray(appConnectionUse.connectionId, ids)),
  ]);
  const firstAt = new Map(firsts.map((f) => [f.id, f.at]));
  const usedAt = new Map(uses.map((u) => [u.id, u.at]));

  return heads
    .flatMap((h) => {
      const connectedAt = h.id ? firstAt.get(h.id) : null;
      if (!h.id || !connectedAt) return [];
      return [
        {
          id: h.id,
          appName: h.name?.trim() || UNKNOWN_APP_NAME,
          icon: h.icon,
          connectedAt,
          lastUsedAt: usedAt.get(h.id) ?? null,
        },
      ];
    })
    .sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime());
}

/**
 * Disconnects one of the actor's own connections: its refresh tokens go (the stored access
 * tokens with them), and with the records that let a token through. Another person's or an
 * unknown id changes nothing, which also makes a second disconnect harmless.
 */
export async function revokeConnection(actor: Actor, connectionId: string): Promise<void> {
  assertCan(actor, "app:connect");
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(oauthRefreshToken)
      .where(and(eq(oauthRefreshToken.userId, actor.userId), eq(oauthRefreshToken.authorizationCodeId, connectionId)))
      .returning({ id: oauthRefreshToken.id });
    if (deleted.length === 0) return;
    await tx.delete(appToken).where(eq(appToken.connectionId, connectionId));
    await tx.delete(appConnectionUse).where(eq(appConnectionUse.connectionId, connectionId));
  });
}

/** Remembers that an access token (by jti) was issued for a connection. Expired records are pruned. */
export async function recordToken(jti: string, connectionId: string, expiresAt: Date): Promise<void> {
  await db.delete(appToken).where(lt(appToken.expiresAt, new Date()));
  await db.insert(appToken).values({ jti, connectionId, expiresAt }).onConflictDoNothing();
}

/**
 * The connection an access token belongs to, or null when the token is unknown, belongs to
 * someone else, or its connection has been disconnected. Checked on every MCP call.
 */
export async function resolveConnection(userId: string, jti: string): Promise<string | null> {
  const [row] = await db
    .select({ id: appToken.connectionId })
    .from(appToken)
    .innerJoin(oauthRefreshToken, eq(oauthRefreshToken.authorizationCodeId, appToken.connectionId))
    .where(and(eq(appToken.jti, jti), eq(oauthRefreshToken.userId, userId), liveHead(new Date())))
    .limit(1);
  return row?.id ?? null;
}

/** Notes that a connection called the MCP server, writing at most once a minute. */
export async function recordUse(userId: string, connectionId: string, now: Date): Promise<void> {
  await db
    .insert(appConnectionUse)
    .values({ connectionId, userId, lastUsedAt: now })
    .onConflictDoUpdate({
      target: appConnectionUse.connectionId,
      set: { lastUsedAt: now },
      setWhere: sql`${appConnectionUse.lastUsedAt} <= ${new Date(now.getTime() - USE_WRITE_INTERVAL_MS).toISOString()}::timestamptz`,
    });
}

/**
 * After the token endpoint answered: remember the new access token against its connection
 * (so a disconnect can refuse it at once) and tell the person's devices a connection may have
 * appeared. Anything that is not a token response is ignored.
 */
export async function onTokenIssued(body: unknown): Promise<void> {
  if (!body || typeof body !== "object") return;
  const { access_token: accessToken, refresh_token: refreshToken } = body as Record<string, unknown>;
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return;
  const claims = decodeJwtClaims(accessToken);
  if (!claims) return;

  const [row] = await db
    .select({ family: oauthRefreshToken.authorizationCodeId, userId: oauthRefreshToken.userId })
    .from(oauthRefreshToken)
    .where(eq(oauthRefreshToken.token, hashToken(refreshToken)))
    .limit(1);
  if (!row?.family) return;
  await recordToken(claims.jti, row.family, new Date(claims.exp * 1000));

  const [m] = await db.select({ householdId: membership.householdId }).from(membership).where(eq(membership.userId, row.userId)).limit(1);
  if (m) await notifyHouseholdChanged(m.householdId);
}

/** How the OAuth provider stores tokens by default (`storeTokens: "hashed"`): SHA-256, unpadded base64url. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function decodeJwtClaims(jwt: string): { jti: string; exp: number } | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof payload.jti === "string" && typeof payload.exp === "number" ? { jti: payload.jti, exp: payload.exp } : null;
  } catch {
    return null;
  }
}
