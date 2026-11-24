import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, describe, expect, inject, it } from "vitest";
import { databaseUrl, dropDatabase } from "../../test/database.mjs";

const run = promisify(execFile);
// Under the run's prefix, so a killed run's leftover is swept by the next one.
const scratch = `${inject("testDbPrefix")}verifyapp${randomBytes(2).toString("hex")}`;
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
  it("clears the routines, keeps them cleared, and status counts them", { timeout: 30_000 }, async () => {
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

  it("clears the lists and their items, and status counts them", { timeout: 30_000 }, async () => {
    await verifyApp("status");
    const sql = postgres(databaseUrl(scratch), { max: 1 });
    try {
      const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
      const [l] = await sql`insert into list (household_id, name) values (${home!.id}, 'Ölkväll') returning id`;
      await sql`insert into list_item (list_id, text, rank) values (${l!.id}, 'Chips', 1)`;
      expect(JSON.parse(await verifyApp("status")).lists).toBe("1");

      await verifyApp("reset");

      expect(JSON.parse(await verifyApp("status")).lists).toBe("0");
      expect(await sql`select 1 from list_item`).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
  it("clears coins, purchases, badges, chests and recap marks, and keeps the logins", { timeout: 30_000 }, async () => {
    await verifyApp("status");
    const sql = postgres(databaseUrl(scratch), { max: 1 });
    try {
      const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
      const [u] = await sql`insert into "user" (id, name, email) values ('u-coins', 'Mia', 'mia@example.com') returning id`;
      await sql`insert into account (id, account_id, provider_id, user_id) values ('a-coins', 'g1', 'google', ${u!.id})`;
      await sql`insert into membership (user_id, household_id, role, frame, theme, coin_look) values (${u!.id}, ${home!.id}, 'adult', 'f', 'x', 'c')`;
      await sql`insert into look_purchase (household_id, user_id, kind, key, price) values (${home!.id}, ${u!.id}, 'theme', 'x', 169)`;
      await sql`insert into reward (household_id, name, price) values (${home!.id}, 'Glass', 10)`;
      await sql`insert into reward_purchase (household_id, buyer_id, name, price) values (${home!.id}, ${u!.id}, 'Glass', 10)`;
      await sql`insert into badge_award (household_id, user_id, key, coins) values (${home!.id}, ${u!.id}, 'first', 25)`;
      await sql`insert into daily_chest (household_id, user_id, day, coins) values (${home!.id}, ${u!.id}, '2026-11-24', 5)`;
      await sql`insert into week_recap_seen (user_id, week_start) values (${u!.id}, '2026-11-23')`;
      const before = JSON.parse(await verifyApp("status"));
      expect([before.look_purchases, before.reward_purchases, before.rewards, before.chests, before.badges]).toEqual(["1", "1", "1", "1", "1"]);

      await verifyApp("reset");

      const after = JSON.parse(await verifyApp("status"));
      expect([after.look_purchases, after.reward_purchases, after.rewards, after.chests, after.badges]).toEqual(["0", "0", "0", "0", "0"]);
      const [m] = await sql`select frame, theme, coin_look from membership where user_id = ${u!.id}`;
      expect(m).toEqual({ frame: null, theme: null, coin_look: null });

      for (const table of ["look_purchase", "reward", "reward_purchase", "badge_award", "daily_chest", "week_recap_seen"]) {
        expect(await sql`select 1 from ${sql(table)}`, table).toHaveLength(0);
      }
      expect(await sql`select 1 from "user" where id = 'u-coins'`).toHaveLength(1);
      expect(await sql`select 1 from account where id = 'a-coins'`).toHaveLength(1);
    } finally {
      await sql.end();
    }
  });
});
