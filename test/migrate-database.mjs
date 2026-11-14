// `node test/migrate-database.mjs <hemmafix_test_name>`: creates a fresh, migrated test
// database. Run from the repository root (the e2e web server command does this).
import { createMigratedDatabase } from "./database.mjs";

const name = process.argv[2];
if (!name) {
  console.error("usage: node test/migrate-database.mjs <hemmafix_test_name>");
  process.exit(2);
}
await createMigratedDatabase(name);
console.log(`test database ${name} is ready`);
