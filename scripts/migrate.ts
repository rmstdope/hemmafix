/**
 * Applies pending Drizzle migrations at container start.
 * An advisory lock makes concurrent containers (e.g. web + api) take turns;
 * the second one finds nothing left to do.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql`select pg_advisory_lock(hashtext('hemmafix:migrate'))`;
  await migrate(drizzle(sql), { migrationsFolder: process.env.MIGRATIONS_DIR ?? "./drizzle" });
  console.log("migrate: database is up to date");
} catch (err) {
  console.error("migrate: failed", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
