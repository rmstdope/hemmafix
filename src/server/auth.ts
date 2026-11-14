import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isEmailAllowed, parseAllowedEmails } from "@/lib/allowlist";
import { ensureMembership } from "./household";

const allowedEmails = () => parseAllowedEmails(process.env.ALLOWED_EMAILS);

function assertAllowed(email: string | null | undefined) {
  if (!isEmailAllowed(email, allowedEmails())) {
    throw new APIError("FORBIDDEN", { message: "Den här e-postadressen har inte tillgång." });
  }
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
          assertAllowed(newUser.email);
        },
      },
    },
    session: {
      create: {
        // Runs on every login: re-check the allowlist and make sure the
        // user belongs to the household.
        before: async (newSession) => {
          const [row] = await db
            .select({ email: schema.user.email })
            .from(schema.user)
            .where(eq(schema.user.id, newSession.userId))
            .limit(1);
          assertAllowed(row?.email);
          await ensureMembership(newSession.userId);
        },
      },
    },
  },
  plugins: [nextCookies()],
});
