import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { badgeAward, badgeEpoch, choreInstance, household, room } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import { createFamily } from "../../test/integration/factories";
import { completeInstance, createChore, getCoinTotal, getLifetimeCoins, listOpenInstances, uncompleteInstance } from "./chores";
import { getBadges } from "./badges";
import { buyLook } from "./looks";
import { addReward, buyReward, declineReward, listMyPurchases, listRewards } from "./rewards";
import { weekCounts } from "./weeks";
import { weekStart } from "@/lib/weeks";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily({ badges: "none" });
  // Badges began long ago, so what these tests make counts; one test moves it to the future.
  await db.update(badgeEpoch).set({ startedAt: new Date("2000-01-01T00:00:00Z") });
});

let n = 0;
/** Ticks off a fresh one-off task worth `coins` in `roomId` as `by`. */
async function tick(by = f.child, roomId = f.kitchen.id, coins = 10) {
  const title = `Uppgift ${++n}`;
  await createChore(f.adult, { title, roomId, kind: "once", coins: String(coins) });
  const [t] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === title);
  await completeInstance(by, t!.id);
  return t!.id;
}
const won = async (by = f.child) => (await getBadges(by)).filter((b) => b.won).map((b) => b.key);
const awardRows = async (by = f.child) => db.select().from(badgeAward).where(eq(badgeAward.userId, by.userId));

describe("winning badges", () => {
  it("a new member has won none, and each shows the agreed words", async () => {
    const all = await getBadges(f.child);
    expect(all).toHaveLength(8);
    expect(all.every((b) => !b.won)).toBe(true);
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("the first tick wins Första uppgiften: +25 coins, once, in balance and lifetime coins", async () => {
    await tick();
    expect(await won()).toEqual(["first-task"]);
    expect(await getCoinTotal(f.child)).toBe(10 + 25);
    expect(await getLifetimeCoins(f.child)).toBe(10 + 25);
    await tick();
    expect(await awardRows()).toHaveLength(1);
    expect(await getCoinTotal(f.child)).toBe(20 + 25);
  });

  it("gives plain 25 coins even when the streak adds to the tick", async () => {
    // Three earlier days in a row, made straight in the database so no badge was awarded for them.
    for (const d of [1, 2, 3]) {
      const title = `Gammal ${++n}`;
      await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once" });
      const [t] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === title);
      const day = addDays(todayIso(), -d);
      await db
        .update(choreInstance)
        .set({ completedAt: new Date(`${day}T10:00:00Z`), completedById: f.child.userId, coins: 10, tickedOn: day })
        .where(eq(choreInstance.id, t!.id));
    }
    await tick(); // streak day 4: 10 + 10 % = 11
    // Depending on the weekday the three earlier days may also have made a quiet week.
    const rows = await awardRows();
    expect(rows.map((r) => r.key)).toContain("first-task");
    expect(rows.every((r) => r.coins === 25)).toBe(true);
    expect(await getCoinTotal(f.child)).toBe(30 + 11 + 25 * rows.length);
  });

  /** `days` earlier days in a row, each with one tick, made straight in the database (no badge awarded). */
  async function earlierDays(days: number) {
    for (let d = 1; d <= days; d++) {
      const title = `Tidigare ${++n}`;
      await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once", coins: "0" });
      const [t] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === title);
      const day = addDays(todayIso(), -d);
      await db
        .update(choreInstance)
        .set({ completedAt: new Date(`${day}T10:00:00Z`), completedById: f.child.userId, coins: 0, tickedOn: day })
        .where(eq(choreInstance.id, t!.id));
    }
  }

  it("7 dagar i rad is won by the seventh day in a row, not the sixth", async () => {
    await earlierDays(5);
    await tick(f.child, f.kitchen.id, 0); // day 6
    expect(await won()).not.toContain("week-streak");
    expect((await getBadges(f.child)).find((b) => b.key === "week-streak")!.progress?.text).toBe("6 av 7 dagar.");
  });

  it("7 dagar i rad is won on day 7", async () => {
    await earlierDays(6);
    await tick(f.child, f.kitchen.id, 0);
    expect(await won()).toContain("week-streak");
  });

  it("days before badges began do not count towards 7 dagar i rad", async () => {
    await earlierDays(6);
    await db.update(badgeEpoch).set({ startedAt: new Date(`${addDays(todayIso(), -3)}T00:00:00Z`) });
    await tick(f.child, f.kitchen.id, 0);
    expect(await won()).not.toContain("week-streak");
  });

  it("a won badge stays when the tick that won it is undone, and its coins stay", async () => {
    const id = await tick();
    await uncompleteInstance(f.child, id);
    expect(await won()).toEqual(["first-task"]);
    expect(await getCoinTotal(f.child)).toBe(25);
  });

  it("Tio av samma needs the same task ten times, not ten tasks", async () => {
    await createChore(f.adult, { title: "Diska", roomId: f.kitchen.id, kind: "recurring", interval: "1", unit: "day" });
    for (let i = 0; i < 9; i++) {
      const [t] = (await listOpenInstances(f.adult, {})).filter((x) => x.title === "Diska");
      await completeInstance(f.child, t!.id);
    }
    expect(await won()).toEqual(["first-task"]);
    const view = (await getBadges(f.child)).find((b) => b.key === "ten-same")!;
    expect(view.progress).toEqual({ have: 9, need: 10, text: "9 av 10 gånger." });
    const [t] = (await listOpenInstances(f.adult, {})).filter((x) => x.title === "Diska");
    await completeInstance(f.child, t!.id);
    expect(await won()).toContain("ten-same");
  });

  it("Varje rum counts the home's current rooms only", async () => {
    await tick(f.child, f.kitchen.id);
    expect((await getBadges(f.child)).find((b) => b.key === "every-room")!.progress?.text).toBe("1 av 2 rum klara.");
    await db.update(room).set({ archivedAt: new Date() }).where(eq(room.id, f.bathroom.id));
    await tick(f.child, f.kitchen.id);
    expect(await won()).toContain("every-room");
  });

  it("Varje rum is not won by another member's ticks in the rooms", async () => {
    await tick(f.adult, f.kitchen.id);
    await tick(f.adult, f.bathroom.id);
    expect(await won()).toEqual([]);
    expect(await won(f.adult)).toContain("every-room");
  });

  it("100 uppgifter is won on the hundredth tick", async () => {
    for (let i = 0; i < 99; i++) await tick(f.child, f.kitchen.id, 0);
    expect(await won()).not.toContain("hundred");
    await tick(f.child, f.kitchen.id, 0);
    expect(await won()).toContain("hundred");
  });

  it("Nivå 5 is won at 1 000 lifetime coins, and the coins of the badges won on the way count", async () => {
    // 9 × 100 = 900 plus first-task 25 and every-room 25 (the bathroom is archived) = 950.
    await db.update(room).set({ archivedAt: new Date() }).where(eq(room.id, f.bathroom.id));
    for (let i = 0; i < 9; i++) await tick(f.child, f.kitchen.id, 100);
    expect(await getLifetimeCoins(f.child)).toBe(950);
    expect(await won()).not.toContain("level-5");
    await tick(f.child, f.kitchen.id, 50); // 1 000 lifetime coins, plus the 25 of the badge it wins
    expect(await won()).toContain("level-5");
    expect(await getLifetimeCoins(f.child)).toBe(1025);
  });

  it("Första köpet is won by buying a look", async () => {
    for (let i = 0; i < 3; i++) await tick(f.child, f.kitchen.id, 100);
    expect(await won()).not.toContain("first-buy");
    await buyLook(f.child, "frame", "guld");
    expect(await won()).toContain("first-buy");
  });

  it("Första köpet through a reward stays after the reward is declined or cancelled (a badge is never taken back)", async () => {
    await tick(f.child, f.kitchen.id, 100);
    await addReward(f.adult, { name: "Glass", price: 50 });
    const [r] = await listRewards(f.adult);
    await buyReward(f.child, r!.id);
    expect(await won()).toContain("first-buy");
    const [p] = await listMyPurchases(f.child);
    await declineReward(f.adult, p!.id);
    expect(await won()).toContain("first-buy");
    expect(await getCoinTotal(f.child)).toBe(100 + 25 + 25 + 0); // tick, first-task, first-buy; the 50 came back
  });

  it("ticks made before badges began count for nothing", async () => {
    await db.update(badgeEpoch).set({ startedAt: new Date(Date.now() + 3600_000) });
    await tick();
    expect(await won()).toEqual([]);
  });

  it("another member's ticks do not win it for me", async () => {
    await tick(f.adult);
    expect(await won(f.child)).toEqual([]);
    expect(await won(f.adult)).toEqual(["first-task"]);
  });

  it("a badge won in one home does not show in another home of the same person", async () => {
    await tick();
    expect(await won()).toEqual(["first-task"]);
    expect(await won({ ...f.child, householdId: f.neighbour.householdId })).toEqual([]);
  });

  it("nothing is won twice when the page is read again", async () => {
    await tick();
    await getBadges(f.child);
    await getBadges(f.child);
    expect(await awardRows()).toHaveLength(1);
  });
});

describe("En vecka utan sena", () => {
  const lastMonday = () => addDays(weekStart(todayIso()), -7);
  /** An instance of Bo's due on `due`, ticked on `tickedOn` (null: still open). */
  async function bosTask(due: string, tickedOn: string | null) {
    const title = `Sen ${++n}`;
    await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once", assigneeId: f.child.userId });
    const [t] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === title);
    await db.update(choreInstance).set({ dueDate: due }).where(eq(choreInstance.id, t!.id));
    if (tickedOn) {
      await db
        .update(choreInstance)
        .set({ completedAt: new Date(`${tickedOn}T10:00:00Z`), completedById: f.child.userId, coins: 10, tickedOn })
        .where(eq(choreInstance.id, t!.id));
    }
  }

  it("is won by a finished week with a tick and nothing late", async () => {
    const mon = lastMonday();
    await bosTask(addDays(mon, 1), addDays(mon, 1));
    expect(await won()).toContain("quiet-week");
  });

  it("is not won when a task was done after its due date", async () => {
    const mon = lastMonday();
    await bosTask(addDays(mon, 1), addDays(mon, 3));
    expect(await won()).not.toContain("quiet-week");
  });

  it("is not won when a task due that week is still open", async () => {
    const mon = lastMonday();
    await bosTask(addDays(mon, 1), addDays(mon, 1));
    await bosTask(addDays(mon, 2), null);
    expect(await won()).not.toContain("quiet-week");
  });

  it("is not won by a week with no ticks, or by the running week", async () => {
    expect(await won()).toEqual([]);
    await bosTask(todayIso(), todayIso());
    expect(await won()).not.toContain("quiet-week");
  });

  it("is not won by a week that began before badges did", async () => {
    const mon = lastMonday();
    await db.update(badgeEpoch).set({ startedAt: new Date(`${addDays(mon, 2)}T00:00:00Z`) });
    await bosTask(addDays(mon, 3), addDays(mon, 3));
    expect(await won()).not.toContain("quiet-week");
  });
});

describe("the week card", () => {
  it("counts badges won in the week", async () => {
    await tick();
    const thisWeek = weekStart(todayIso());
    expect((await weekCounts(f.child, thisWeek)).badges).toBe(1);
    expect((await weekCounts(f.child, addDays(thisWeek, -7))).badges).toBe(0);
  });
});
