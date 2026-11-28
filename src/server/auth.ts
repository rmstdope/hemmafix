import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { decideAccess, type AccessDecision } from "@/lib/access";
import { parseAllowedEmails } from "@/lib/allowlist";
import { can } from "@/lib/permissions";
import { onTokenIssued } from "./connections";
import { ensureMembership } from "./household";

export const allowedEmails = () => parseAllowedEmails(process.env.ALLOWED_EMAILS);

const ACCESS_ERRORS: Record<Exclude<AccessDecision, "ok">, { code: string; message: string }> = {
  "not-allowed": { code: "EMAIL_NOT_ALLOWED", message: "Den här e-postadressen har inte tillgång." },
  unverified: { code: "EMAIL_NOT_VERIFIED", message: "E-postadressen är inte verifierad hos Google." },
};

function assertAccess(user: { email: string | null | undefined; emailVerified?: boolean | null }) {
  const decision = decideAccess(user, allowedEmails());
  // The OAuth callback redirects to errorCallbackURL?error=<code> only when the error has a code.
  if (decision !== "ok") throw new APIError("FORBIDDEN", ACCESS_ERRORS[decision]);
}

/** The MCP server's address; tokens are issued for it. */
export const MCP_RESOURCE = `${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/mcp`;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  // The jwt plugin's own /token would sign browser sessions with the access-token key. The two
  // Google token routes would hand the browser the person's calendar access, which only the
  // server uses (calendar.ts).
  disabledPaths: ["/token", "/get-access-token", "/refresh-token"],
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      prompt: "select_account",
    },
  },
  // A family member's refresh token can read their calendar, so Google's tokens are stored
  // encrypted. Rows written before stay readable.
  account: { encryptOAuthTokens: true },
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days – a family app should rarely ask you to log in.
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Only adults may approve an app, whatever page the request came from.
      if (ctx.path === "/oauth2/consent" && ctx.body?.accept === true) {
        const session = await getSessionFromCtx(ctx);
        const [m] = session
          ? await db.select({ role: schema.membership.role }).from(schema.membership).where(eq(schema.membership.userId, session.user.id)).limit(1)
          : [];
        if (!m || !can(m.role, "app:connect")) {
          throw new APIError("FORBIDDEN", { error: "access_denied", error_description: "Only adults can connect apps" });
        }
      }
    }),
    // The approval is asked every time an app connects, never remembered: once an authorization
    // has been answered (a code issued, or the approval asked for again), forget the stored
    // approval. The approval itself continues the authorization inside the server, so the
    // code it issues consumes the approval it has just stored. It deletes by person and app, not
    // by flow: two connections of the same app open at once may make one see the approval again.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/oauth2/token") {
        // Remember which connection the new access token belongs to, so disconnecting an app
        // refuses its tokens at once. Never let this fail the token response.
        try {
          await onTokenIssued(ctx.context.returned);
        } catch (e) {
          ctx.context.logger.error("could not record an issued access token", e);
        }
        return;
      }
      if (ctx.path !== "/oauth2/authorize") return;
      const clientId = ctx.query?.client_id ?? ctx.body?.client_id;
      const session = await getSessionFromCtx(ctx);
      if (!session || typeof clientId !== "string") return;
      await ctx.context.adapter.deleteMany({
        model: "oauthConsent",
        where: [
          { field: "clientId", value: clientId },
          { field: "userId", value: session.user.id },
        ],
      });
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          assertAccess(newUser);
        },
      },
    },
    session: {
      create: {
        // Runs on every login: re-check the allowlist and make sure the
        // user belongs to the household.
        before: async (newSession) => {
          const [row] = await db
            .select({ email: schema.user.email, emailVerified: schema.user.emailVerified })
            .from(schema.user)
            .where(eq(schema.user.id, newSession.userId))
            .limit(1);
          assertAccess({ email: row?.email, emailVerified: row?.emailVerified });
          await ensureMembership(newSession.userId);
        },
      },
    },
  },
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    // Claude connects over OAuth 2.1: it registers itself (dynamically or by metadata document),
    // sends the person here to log in and approve, and gets a token for the MCP resource.
    mcp({
      loginPage: "/login",
      consentPage: "/consent",
      resource: MCP_RESOURCE,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    // Must stay last: it forwards cookies set by the other plugins' hooks to the Next.js cookie store.
    nextCookies(),
  ],
});
