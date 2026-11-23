// Migrations that change existing data, tested against data in the previous shape.
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, inject } from "vitest";
import { createDatabase, databaseUrl, dropDatabase } from "../../test/database.mjs";
import { migrateUpTo } from "../../test/integration/migrations";

const name = `${inject("testDbPrefix")}migrations`;
let sql: postgres.Sql;

beforeAll(async () => {
  await createDatabase(name);
  sql = postgres(databaseUrl(name), { max: 1, onnotice: () => {} });
});
afterAll(async () => {
  await sql.end();
  await dropDatabase(name);
});

const reset = async () => {
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
};

describe("0001: admin/member become adult/child", () => {
  beforeEach(reset);

  it("makes the admin an adult and members children, and new members children", async () => {
    await migrateUpTo(sql, "0000_nervous_sentinels");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values
      ('a', 'Anna', 'a@example.com', true), ('b', 'Bo', 'b@example.com', true), ('c', 'Cleo', 'c@example.com', true)`;
    await sql`insert into membership (user_id, household_id, role) values
      ('a', ${home!.id}, 'admin'), ('b', ${home!.id}, 'member')`;

    await migrateUpTo(sql);

    await sql`insert into membership (user_id, household_id) values ('c', ${home!.id})`;
    const roles = await sql`select user_id, role::text from membership order by user_id`;
    expect(roles.map((r) => [r.user_id, r.role])).toEqual([
      ["a", "adult"],
      ["b", "child"],
      ["c", "child"],
    ]);
  });

  it("makes the earliest member an adult in a household that has lost its admin", async () => {
    await migrateUpTo(sql, "0000_nervous_sentinels");
    const [home, other] = await sql`insert into household (name) values ('Hemma'), ('Grannar') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values
      ('b', 'Bo', 'b@example.com', true), ('c', 'Cleo', 'c@example.com', true),
      ('e', 'Eve', 'e@example.com', true), ('f', 'Fia', 'f@example.com', true)`;
    await sql`insert into membership (user_id, household_id, role, created_at) values
      ('c', ${home!.id}, 'member', '2026-02-01'), ('b', ${home!.id}, 'member', '2026-03-01'),
      ('e', ${other!.id}, 'admin', '2026-03-01'), ('f', ${other!.id}, 'member', '2026-01-01')`;

    await migrateUpTo(sql);

    const roles = await sql`select user_id, role::text from membership order by user_id`;
    expect(roles.map((r) => [r.user_id, r.role])).toEqual([
      ["b", "child"],
      ["c", "adult"],
      ["e", "adult"],
      ["f", "child"],
    ]);
  });
});

describe("0002–0003: the flat task list makes way for chores in rooms", () => {
  beforeEach(reset);

  it("drops the old tasks and keeps households, people and rooms", async () => {
    await migrateUpTo(sql, "0001_flat_toxin");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into membership (user_id, household_id, role) values ('a', ${home!.id}, 'adult')`;
    await sql`insert into room (household_id, name) values (${home!.id}, 'Kök')`;
    await sql`insert into task (household_id, title) values (${home!.id}, 'Gammal uppgift')`;

    await migrateUpTo(sql);

    const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    expect(tables.map((t) => t.table_name)).not.toContain("task");
    expect(tables.map((t) => t.table_name)).toEqual(expect.arrayContaining(["chore", "chore_instance"]));
    expect(await sql`select count(*)::int as n from room`).toEqual([{ n: 1 }]);
    expect(await sql`select count(*)::int as n from membership`).toEqual([{ n: 1 }]);
  });
});


describe("0004: floors", () => {
  beforeEach(reset);

  it("gives every home floor 1 and puts its existing rooms there", async () => {
    await migrateUpTo(sql, "0003_chores");
    const [a, b] = await sql`insert into household (name) values ('Hemma'), ('Grannar') returning id`;
    await sql`insert into room (household_id, name) values (${a!.id}, 'Kök'), (${a!.id}, 'Badrum'), (${b!.id}, 'Garage')`;

    await migrateUpTo(sql);

    const floors = await sql`select household_id, name, position from floor order by household_id`;
    expect(floors).toHaveLength(2);
    expect(floors.every((f) => f.name === "1" && f.position === 1)).toBe(true);
    const rooms = await sql`
      select room.name, floor.household_id = room.household_id as same_home
      from room join floor on floor.id = room.floor_id order by room.name`;
    expect(rooms.map((r) => [r.name, r.same_home])).toEqual([
      ["Badrum", true],
      ["Garage", true],
      ["Kök", true],
    ]);
  });

  it("lets the previous release keep adding rooms and homes without floors", async () => {
    await migrateUpTo(sql, "0004_floors");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    // The previous release creates a home without a floor, then rooms without one.
    await sql`insert into room (household_id, name) values (${home!.id}, 'Kök')`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '2', 2)`;
    await sql`insert into room (household_id, name) values (${home!.id}, 'Hall')`;

    const rooms = await sql`
      select room.name, floor.name as floor from room join floor on floor.id = room.floor_id order by room.name`;
    expect(rooms.map((r) => [r.name, r.floor])).toEqual([
      ["Hall", "1"],
      ["Kök", "1"],
    ]);
  });
});

describe("0005: done instances keep their title and room; the floor trigger goes", () => {
  beforeEach(reset);

  it("copies the title and room into what was already done, not into what is open", async () => {
    await migrateUpTo(sql, "0004_floors");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    const [ground] = await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1) returning id`;
    const [kitchen] = await sql`insert into room (household_id, floor_id, name) values (${home!.id}, ${ground!.id}, 'Kök') returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${kitchen!.id}, 'Diska') returning id`;
    await sql`insert into chore_instance (chore_id, household_id, completed_at) values
      (${c!.id}, ${home!.id}, now()), (${c!.id}, ${home!.id}, null)`;

    await migrateUpTo(sql);

    const rows = await sql`select done_title, done_room_id, completed_at is not null as done from chore_instance order by done desc`;
    expect(rows.map((r) => [r.done, r.done_title, r.done_room_id])).toEqual([
      [true, "Diska", kitchen!.id],
      [false, null, null],
    ]);
    const triggers = await sql`select 1 from pg_trigger where tgname = 'room_default_floor'`;
    expect(triggers).toHaveLength(0);
  });

  it("still works for the previous release, which sets floors and knows nothing of snapshots", async () => {
    await migrateUpTo(sql);
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    const [ground] = await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1) returning id`;
    const [kitchen] = await sql`insert into room (household_id, floor_id, name) values (${home!.id}, ${ground!.id}, 'Kök') returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${kitchen!.id}, 'Diska') returning id`;
    const [i] = await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id}) returning id`;
    // The previous release ticks off without a snapshot.
    await sql`update chore_instance set completed_at = now() where id = ${i!.id}`;
    expect(await sql`select done_title from chore_instance`).toEqual([{ done_title: null }]);
  });
});


describe("0006: the OAuth tables for connecting Claude", () => {
  beforeEach(reset);

  it("only adds tables, so the previous release keeps working on the migrated schema", async () => {
    await migrateUpTo(sql, "0005_done_snapshot");
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;

    await migrateUpTo(sql, "0006_oauth_provider");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added.sort()).toEqual([
      "jwks",
      "oauth_access_token",
      "oauth_client",
      "oauth_client_assertion",
      "oauth_client_resource",
      "oauth_consent",
      "oauth_refresh_token",
      "oauth_resource",
    ]);
    // The previous release's queries on the old tables are untouched.
    expect(await sql`select email from "user"`).toEqual([{ email: "a@example.com" }]);
  });
});

describe("0007: the tables behind connected apps", () => {
  beforeEach(reset);

  it("only adds tables, so the previous release keeps working on the migrated schema", async () => {
    await migrateUpTo(sql, "0006_oauth_provider");
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;

    await migrateUpTo(sql, "0007_connected_apps");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added.sort()).toEqual(["app_connection_use", "app_token"]);
    expect(await sql`select email from "user"`).toEqual([{ email: "a@example.com" }]);
  });
});

describe("0008: routines", () => {
  beforeEach(reset);

  it("only adds tables and a nullable column, so the previous release keeps working", async () => {
    await migrateUpTo(sql, "0007_connected_apps");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;

    await migrateUpTo(sql, "0008_routines");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added.sort()).toEqual(["routine", "routine_task"]);
    // Existing homes are untouched (the ready-made routines are given by the app, once), and the
    // previous release's insert of a household, without the new column, still works.
    expect(await sql`select routines_seeded_at from household where id = ${home!.id}`).toEqual([
      { routines_seeded_at: null },
    ]);
    await sql`insert into household (name) values ('Nytt')`;
    expect(await sql`select count(*)::int as n from routine`).toEqual([{ n: 0 }]);
  });
});

describe("0009: shared lists", () => {
  beforeEach(reset);

  it("only adds tables and a nullable column, so the previous release keeps working", async () => {
    await migrateUpTo(sql, "0008_routines");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into membership (user_id, household_id, role) values ('a', ${home!.id}, 'adult')`;
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;

    await migrateUpTo(sql, "0009_lists");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added.sort()).toEqual(["list", "list_item"]);
    // Existing members have no order of their own yet, and the previous release's insert of a
    // member, without the new column, still works.
    expect(await sql`select list_order from membership where user_id = 'a'`).toEqual([{ list_order: null }]);
    await sql`insert into "user" (id, name, email, email_verified) values ('b', 'Bo', 'b@example.com', true)`;
    await sql`insert into membership (user_id, household_id) values ('b', ${home!.id})`;
    expect(await sql`select count(*)::int as n from list`).toEqual([{ n: 0 }]);
  });
});

describe("0010: coins", () => {
  beforeEach(reset);

  it("only adds a nullable column, so the previous release keeps working and old ticks earn nothing", async () => {
    await migrateUpTo(sql, "0009_lists");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;
    await sql`insert into chore_instance (chore_id, household_id, completed_at, completed_by_id)
      values (${c!.id}, ${home!.id}, now(), 'a')`;

    await migrateUpTo(sql, "0010_coins");

    expect(await sql`select coins from chore_instance`).toEqual([{ coins: null }]);
    // The previous release's tick, which does not know the column, still works.
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a' where completed_at is null`;
    expect(await sql`select count(*)::int as n from chore_instance where coins is null`).toEqual([{ n: 2 }]);
  });
});

describe("0011: a value per task", () => {
  beforeEach(reset);

  it("adds columns with a default of 10, so old rows give 10 and the previous release's inserts still work", async () => {
    await migrateUpTo(sql, "0010_coins");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska')`;
    const [rt] = await sql`insert into routine (household_id, name) values (${home!.id}, 'Städa') returning id`;
    await sql`insert into routine_task (routine_id, title) values (${rt!.id}, 'Dammsuga')`;

    await migrateUpTo(sql, "0011_task_coins");

    expect(await sql`select coins from chore`).toEqual([{ coins: 10 }]);
    expect(await sql`select coins from routine_task`).toEqual([{ coins: 10 }]);
    // The previous release's inserts, which do not know the columns, still work.
    await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Torka')`;
    await sql`insert into routine_task (routine_id, title) values (${rt!.id}, 'Damma')`;
    expect(await sql`select count(*)::int as n from chore where coins = 10`).toEqual([{ n: 2 }]);
    await expect(sql`update chore set coins = 101`).rejects.toThrow();
    await expect(sql`update routine_task set coins = -1`).rejects.toThrow();
  });
});

describe("0012: high fives", () => {
  beforeEach(reset);

  it("only adds a table, so the previous release's ticks and undos keep working", async () => {
    await migrateUpTo(sql, "0011_task_coins");
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;

    await migrateUpTo(sql, "0012_wooden_gorgon");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added).toEqual(["high_five"]);
    // The previous release, which does not know the table, ticks off and undoes as before.
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a'`;
    await sql`update chore_instance set completed_at = null, completed_by_id = null`;
    expect(await sql`select count(*)::int as n from chore_instance where completed_at is null`).toEqual([{ n: 1 }]);
  });
});

describe("0013: daily chest", () => {
  beforeEach(reset);

  it("only adds a table, so the previous release keeps working; one chest per person and day, 5 to 10 coins", async () => {
    await migrateUpTo(sql, "0012_wooden_gorgon");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;

    await migrateUpTo(sql, "0013_daily_chest");

    // The previous release, which does not know the table, still ticks.
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a', coins = 10`;

    await sql`insert into daily_chest (household_id, user_id, day, coins) values (${home!.id}, 'a', '2026-11-23', 7)`;
    await expect(
      sql`insert into daily_chest (household_id, user_id, day, coins) values (${home!.id}, 'a', '2026-11-23', 8)`,
    ).rejects.toThrow();
    await expect(
      sql`insert into daily_chest (household_id, user_id, day, coins) values (${home!.id}, 'a', '2026-11-24', 4)`,
    ).rejects.toThrow();
    await expect(
      sql`insert into daily_chest (household_id, user_id, day, coins) values (${home!.id}, 'a', '2026-11-24', 11)`,
    ).rejects.toThrow();
  });
});

describe("0014: week recap", () => {
  beforeEach(reset);

  it("only adds a table, so the previous release's ticks and undos keep working", async () => {
    await migrateUpTo(sql, "0013_daily_chest");
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;

    await migrateUpTo(sql, "0014_awesome_frank_castle");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added).toEqual(["week_recap_seen"]);
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a'`;
    await sql`update chore_instance set completed_at = null, completed_by_id = null`;
    expect(await sql`select count(*)::int as n from chore_instance where completed_at is null`).toEqual([{ n: 1 }]);
  });
});

describe("0015: the streak day", () => {
  beforeEach(reset);

  it("only adds a nullable column, so the previous release keeps working and old ticks count for no day", async () => {
    await migrateUpTo(sql, "0014_awesome_frank_castle");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;
    await sql`insert into chore_instance (chore_id, household_id, completed_at, completed_by_id, coins)
      values (${c!.id}, ${home!.id}, now(), 'a', 10)`;

    await migrateUpTo(sql, "0015_streak_day");

    expect(await sql`select ticked_on from chore_instance`).toEqual([{ ticked_on: null }]);
    // The previous release's tick, which does not know the column, still works.
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a', coins = 10 where completed_at is null`;
    expect(await sql`select count(*)::int as n from chore_instance where ticked_on is null`).toEqual([{ n: 2 }]);
  });
});

describe("0016: looks", () => {
  beforeEach(reset);

  it("only adds a table and nullable columns, so the previous release keeps working; one purchase per person and look", async () => {
    await migrateUpTo(sql, "0015_streak_day");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into membership (user_id, household_id, role) values ('a', ${home!.id}, 'adult')`;

    await migrateUpTo(sql, "0016_looks");

    // The previous release, which does not know the columns, still reads and writes memberships.
    await sql`update membership set role = 'child' where user_id = 'a'`;
    const [m] = await sql`select frame, theme, coin_look from membership where user_id = 'a'`;
    expect(m).toEqual({ frame: null, theme: null, coin_look: null });

    await sql`insert into look_purchase (household_id, user_id, kind, key, price) values (${home!.id}, 'a', 'frame', 'guld', 150)`;
    await expect(
      sql`insert into look_purchase (household_id, user_id, kind, key, price) values (${home!.id}, 'a', 'frame', 'guld', 150)`,
    ).rejects.toThrow();
    await expect(
      sql`insert into look_purchase (household_id, user_id, kind, key, price) values (${home!.id}, 'a', 'hat', 'x', 10)`,
    ).rejects.toThrow();
    await expect(
      sql`insert into look_purchase (household_id, user_id, kind, key, price) values (${home!.id}, 'a', 'theme', 'lila', -1)`,
    ).rejects.toThrow();
  });
});

describe("0017: rewards", () => {
  beforeEach(reset);

  it("only adds tables, so the previous release keeps working; prices 1 to 1 000, three purchase states", async () => {
    await migrateUpTo(sql, "0016_looks");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;

    await migrateUpTo(sql, "0017_rewards");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added.sort()).toEqual(["reward", "reward_purchase"]);
    // The previous release, which does not know the tables, still ticks.
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a', coins = 10`;

    await sql`insert into reward (household_id, name, price) values (${home!.id}, 'Glass', 1000)`;
    await expect(sql`insert into reward (household_id, name, price) values (${home!.id}, 'Gratis', 0)`).rejects.toThrow();
    await expect(sql`insert into reward (household_id, name, price) values (${home!.id}, 'Dyr', 1001)`).rejects.toThrow();
    await sql`insert into reward_purchase (household_id, buyer_id, name, price) values (${home!.id}, 'a', 'Glass', 50)`;
    await expect(
      sql`insert into reward_purchase (household_id, buyer_id, name, price, status) values (${home!.id}, 'a', 'Glass', 50, 'lost')`,
    ).rejects.toThrow();
    expect(await sql`select status from reward_purchase`).toEqual([{ status: "waiting" }]);
  });
});

describe("0018: badges", () => {
  beforeEach(reset);

  it("only adds tables, so the previous release keeps working; one badge per person and home, one epoch row made by the migration", async () => {
    await migrateUpTo(sql, "0017_rewards");
    const [home] = await sql`insert into household (name) values ('Hemma') returning id`;
    await sql`insert into "user" (id, name, email, email_verified) values ('a', 'Anna', 'a@example.com', true)`;
    await sql`insert into floor (household_id, name, position) values (${home!.id}, '1', 1)`;
    const [r] = await sql`insert into room (household_id, floor_id, name)
      select ${home!.id}, id, 'Kök' from floor returning id`;
    const [c] = await sql`insert into chore (household_id, room_id, title) values (${home!.id}, ${r!.id}, 'Diska') returning id`;
    const before = await sql`select table_name from information_schema.tables where table_schema = 'public'`;

    await migrateUpTo(sql, "0018_badges");

    const after = await sql`select table_name from information_schema.tables where table_schema = 'public'`;
    const added = after.map((t) => t.table_name).filter((n) => !before.some((b) => b.table_name === n));
    expect(added.sort()).toEqual(["badge_award", "badge_epoch"]);
    // The previous release, which does not know the tables, still ticks.
    await sql`insert into chore_instance (chore_id, household_id) values (${c!.id}, ${home!.id})`;
    await sql`update chore_instance set completed_at = now(), completed_by_id = 'a', coins = 10`;

    expect(await sql`select id from badge_epoch`).toEqual([{ id: true }]);
    await expect(sql`insert into badge_epoch (id) values (false)`).rejects.toThrow();
    await sql`insert into badge_award (household_id, user_id, key, coins) values (${home!.id}, 'a', 'first-task', 25)`;
    await expect(
      sql`insert into badge_award (household_id, user_id, key, coins) values (${home!.id}, 'a', 'first-task', 25)`,
    ).rejects.toThrow();
  });
});
