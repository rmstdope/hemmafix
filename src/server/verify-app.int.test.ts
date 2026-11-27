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
  // One home for every case, so the script starts as few times as possible, not once per group:
  // every start re-checks the database and its migrations.
  it("empties every table and member setting, ones it has never heard of too, and keeps the logins", { timeout: 30_000 }, async () => {
    await verifyApp("status"); // creates and migrates the scratch database
    const sql = postgres(databaseUrl(scratch), { max: 1 });
    try {
      const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
      const [r] = await sql`insert into routine (household_id, name) values (${home!.id}, 'Tom rutin') returning id`;
      await sql`insert into routine_task (routine_id, title) values (${r!.id}, 'Damma')`;
      const [l] = await sql`insert into list (household_id, name) values (${home!.id}, 'Ölkväll') returning id`;
      await sql`insert into list_item (list_id, text, rank) values (${l!.id}, 'Chips', 1)`;
      const [u] = await sql`insert into "user" (id, name, email) values ('u-coins', 'Mia', 'mia@example.com') returning id`;
      await sql`insert into account (id, account_id, provider_id, user_id) values ('a-coins', 'g1', 'google', ${u!.id})`;
      await sql`insert into membership (user_id, household_id, role, frame, theme, coin_look) values (${u!.id}, ${home!.id}, 'adult', 'f', 'x', 'c')`;
      await sql`insert into look_purchase (household_id, user_id, kind, key, price) values (${home!.id}, ${u!.id}, 'theme', 'x', 169)`;
      await sql`insert into reward (household_id, name, price) values (${home!.id}, 'Glass', 10)`;
      await sql`insert into reward_purchase (household_id, buyer_id, name, price) values (${home!.id}, ${u!.id}, 'Glass', 10)`;
      await sql`insert into badge_award (household_id, user_id, key, coins) values (${home!.id}, ${u!.id}, 'first', 25)`;
      await sql`insert into daily_chest (household_id, user_id, day, coins) values (${home!.id}, ${u!.id}, '2026-11-24', 5)`;
      await sql`insert into week_recap_seen (user_id, week_start) values (${u!.id}, '2026-11-23')`;
      // A table the script has never heard of, as the next schema change would add.
      await sql`create table later_table (household_id uuid references household)`;
      await sql`insert into later_table values (${home!.id})`;
      // Per-member columns it has never heard of either, nullable and with a default.
      await sql`alter table membership add column later_pref text, add column later_count integer not null default 0`;
      await sql`update membership set list_order = 'skapad', later_pref = 'p', later_count = 7`;
      const counted = ["routine", "list", "look_purchase", "reward_purchase", "reward", "daily_chest", "badge_award", "later_table"];
      const rows = async () => JSON.parse(await verifyApp("status")).rows as Record<string, number>;
      const before = await rows();
      expect(before).toMatchObject(Object.fromEntries(counted.map((table) => [table, 1])));
      const kept = ["user", "account", "session", "verification", "household", "membership", "jwks", "badge_epoch", "oauth_resource"];
      for (const table of kept) expect(before).not.toHaveProperty(table);

      // A kept table pointing at the home's contents: emptying it would take the members along, so
      // reset refuses, names both tables and changes nothing.
      await sql`create table later_team (id integer primary key)`;
      await sql`alter table membership add column later_team_id integer references later_team`;
      await expect(verifyApp("reset")).rejects.toMatchObject({
        stderr: expect.stringContaining('Table "membership" references "later_team".'),
      });
      expect(await sql`select list_order, later_pref from membership`).toEqual([{ list_order: "skapad", later_pref: "p" }]);
      expect(await sql`select 1 from later_table`).toHaveLength(1);
      expect(await sql`select 1 from membership`).toHaveLength(1);
      await sql`alter table membership drop column later_team_id`;
      await sql`drop table later_team`;
      // Login state and the server's own rows stay.
      await sql`insert into verification (id, identifier, value, expires_at) values ('v', 'i', 'x', now())`;
      await sql`insert into oauth_resource (id, identifier, name) values ('r', 'https://example.com/mcp', 'MCP')`;

      await verifyApp("reset");

      // Every table of the home's contents is empty, but for the new home's one floor.
      const emptied = await rows();
      expect(emptied).toEqual({ ...Object.fromEntries(Object.keys(before).map((table) => [table, 0])), floor: 1 });
      const [after] = await sql`select routines_seeded_at from household`;
      expect(after!.routines_seeded_at).not.toBeNull();
      const [m] = await sql`select list_order, frame, theme, coin_look, later_pref, later_count from membership where user_id = ${u!.id}`;
      expect(m).toEqual({ list_order: null, frame: null, theme: null, coin_look: null, later_pref: null, later_count: 0 });

      expect(await sql`select 1 from later_table`).toHaveLength(0);
      expect(await sql`select 1 from "user" where id = 'u-coins'`).toHaveLength(1);
      expect(await sql`select 1 from account where id = 'a-coins'`).toHaveLength(1);
      expect(await sql`select 1 from verification`).toHaveLength(1);
      expect(await sql`select 1 from oauth_resource`).toHaveLength(1);
      expect(await sql`select 1 from badge_epoch`).toHaveLength(1);
    } finally {
      await sql.end();
    }
  });
});
