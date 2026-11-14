import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

// One pool per process: Next loads route handlers and pages as separate module graphs,
// and dev hot reloads re-evaluate modules. Both would otherwise create extra pools.
export const pg = (globalForDb.pg ??= postgres(process.env.DATABASE_URL ?? "", { max: 10 }));

export const db = drizzle(pg, { schema });
