import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { decideAccess, type AccessDecision } from "@/lib/access";
import { parseAllowedEmails } from "@/lib/allowlist";
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

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      prompt: "select_account",
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 60, // 60 days – a family app should rarely ask you to log in.
    updateAge: 60 * 60 * 24,
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
  plugins: [nextCookies()],
});
