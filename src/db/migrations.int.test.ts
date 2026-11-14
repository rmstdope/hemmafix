// Migrations that change existing data, tested against data in the previous shape.
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
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

describe("0001: admin/member become adult/child", () => {
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
});
