import { createMigratedDatabase, dropDatabase } from "../database.mjs";

/** Migrated once per run; every test file gets its own copy (see setup.ts). */
export const TEMPLATE_DB = "hemmafix_test_template";

export default async function setup() {
  await createMigratedDatabase(TEMPLATE_DB);
  return async () => {
    await dropDatabase(TEMPLATE_DB);
  };
}
