import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { databaseUrl, dropDatabase } from "../../test/database.mjs";

const run = promisify(execFile);
const scratch = `hemmafix_test_verify_${randomBytes(4).toString("hex")}`;
const verifyApp = async (command: string) => {
  const { stdout } = await run(process.execPath, ["scripts/verify-app.mjs", command], {
    env: { ...process.env, VERIFY_APP_DB: scratch },
  });
  return stdout;
};

afterAll(async () => {
  await dropDatabase(scratch);
});

describe("verify-app reset", () => {
  it("clears the routines, keeps them cleared, and status counts them", async () => {
    await verifyApp("status"); // creates and migrates the scratch database
    const sql = postgres(databaseUrl(scratch), { max: 1 });
    try {
      const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
      const [r] = await sql`insert into routine (household_id, name) values (${home!.id}, 'Tom rutin') returning id`;
      await sql`insert into routine_task (routine_id, title) values (${r!.id}, 'Damma')`;
      expect(JSON.parse(await verifyApp("status")).routines).toBe("1");

      await verifyApp("reset");

      expect(JSON.parse(await verifyApp("status")).routines).toBe("0");
      expect(await sql`select 1 from routine_task`).toHaveLength(0);
      const [after] = await sql`select routines_seeded_at from household`;
      expect(after!.routines_seeded_at).not.toBeNull();
    } finally {
      await sql.end();
    }
  });
});
