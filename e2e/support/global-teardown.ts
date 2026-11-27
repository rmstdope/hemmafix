import { dropDatabase } from "../../test/database.mjs";
import { E2E_SLOTS } from "./env";

export default async function teardown() {
  for (const { db } of E2E_SLOTS) await dropDatabase(db);
}
