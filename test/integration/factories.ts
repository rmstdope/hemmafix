import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { user } from "@/db/schema";

/** Inserts a verified user, as Better Auth would after a Google login. */
export async function createUser(name: string) {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({ id, name, email: `${name.toLowerCase()}-${id.slice(0, 8)}@example.com`, emailVerified: true })
    .returning();
  return row!;
}
