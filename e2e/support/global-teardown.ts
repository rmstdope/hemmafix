import { dropDatabase } from "../../test/database.mjs";
import { E2E_DB } from "./env";

export default async function teardown() {
  await dropDatabase(E2E_DB);
}
