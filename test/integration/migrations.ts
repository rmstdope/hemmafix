// Run migrations step by step, to test that a migration carries existing data over.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";

const SOURCE = resolve(process.cwd(), "drizzle");
type Journal = { entries: { idx: number; tag: string }[] };

/** Applies the migrations up to and including `tag` (all of them when omitted). */
export async function migrateUpTo(sql: Sql, tag?: string) {
  const journal = JSON.parse(readFileSync(join(SOURCE, "meta/_journal.json"), "utf8")) as Journal;
  const last = tag ? journal.entries.findIndex((e) => e.tag === tag) : journal.entries.length - 1;
  if (last < 0) throw new Error(`No migration tagged ${tag}`);

  const folder = mkdtempSync(join(tmpdir(), "hemmafix-migrations-"));
  try {
    cpSync(SOURCE, folder, { recursive: true });
    writeFileSync(
      join(folder, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, last + 1) }),
    );
    await migrate(drizzle(sql), { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
