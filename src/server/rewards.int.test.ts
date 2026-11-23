import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { household, membership, rewardPurchase } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/permissions";
import { createFamily, createUser } from "../../test/integration/factories";
import { completeInstance, createChore, getCoinTotal, listOpenInstances } from "./chores";
import {
  addReward,
  buyReward,
  cancelPurchase,
  declineReward,
  deleteReward,
  giveReward,
  listGoldRows,
  listMyPurchases,
  listRewards,
  updateReward,
} from "./rewards";

let f: Awaited<ReturnType<typeof createFamily>>;
let pappa: typeof f.adult;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
  const u = await createUser("Pappa");
  await db.insert(membership).values({ userId: u.id, householdId: f.homeId, role: "adult" });
  pappa = { ...f.adult, userId: u.id, name: "Pappa" };
});

/** Gives `who` coins by ticking off a task worth `coins`. */
async function earn(who: typeof f.adult, total: number) {
  for (let left = total; left > 0; left -= 100) await tick(who, Math.min(left, 100));
}

async function tick(who: typeof f.adult, coins: number) {
  await createChore(f.adult, { title: `Syssla ${Math.random()}`, roomId: f.kitchen.id, kind: "once", coins });
  const open = await listOpenInstances(f.adult, {});
  const t = open.find((i) => i.coins === coins && i.completedAt === null)!;
  await completeInstance(who, t.id, { offerChest: false });
}

async function glass(price = 50) {
  await addReward(f.adult, { name: "Glass", price });
  return (await listRewards(f.adult)).at(-1)!;
}

describe("managing rewards", () => {
  it("lets adults add, change and remove, oldest first, and no one else", async () => {
    await addReward(f.adult, { name: " Glass ", price: "50" });
    await addReward(pappa, { name: "Bio", price: 200 });
    const [a, b] = await listRewards(f.child);
    expect([a!.name, a!.price, b!.name, b!.price]).toEqual(["Glass", 50, "Bio", 200]);
    await updateReward(f.adult, a!.id, { name: "Stor glass", price: 60 });
    expect((await listRewards(f.adult))[0]).toMatchObject({ name: "Stor glass", price: 60 });
    await expect(addReward(f.child, { name: "X", price: 5 })).rejects.toThrow(ForbiddenError);
    await expect(updateReward(f.child, a!.id, { name: "X", price: 5 })).rejects.toThrow(ForbiddenError);
    await expect(deleteReward(f.child, a!.id)).rejects.toThrow(ForbiddenError);
    await deleteReward(f.adult, a!.id);
    expect(await listRewards(f.adult)).toHaveLength(1);
  });

  it("validates the input and keeps homes apart", async () => {
    await expect(addReward(f.adult, { name: "", price: 5 })).rejects.toThrow("Skriv ett namn.");
    await expect(addReward(f.adult, { name: "X", price: 1001 })).rejects.toThrow("Priset ska vara 1–1 000 mynt.");
    const r = await glass();
    expect(await listRewards(f.neighbour)).toEqual([]);
    await expect(updateReward(f.neighbour, r.id, { name: "X", price: 5 })).rejects.toThrow("Belöningen finns inte längre.");
    await expect(deleteReward(f.neighbour, r.id)).rejects.toThrow("Belöningen finns inte längre.");
    await deleteReward(f.adult, r.id);
    await expect(updateReward(f.adult, r.id, { name: "X", price: 5 })).rejects.toThrow("Belöningen finns inte längre.");
  });
});

describe("buying", () => {
  it("takes the coins at once, allows exactly enough and refuses too few", async () => {
    await earn(f.child, 80);
    const r = await glass(50);
    await buyReward(f.child, r.id);
    expect(await getCoinTotal(f.child)).toBe(30);
    await expect(buyReward(f.child, r.id)).rejects.toThrow("Du har inte tillräckligt med mynt.");
    const cheap = await glass(30);
    await buyReward(f.child, cheap.id);
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("lets adults buy like anyone else, and refuses a removed or foreign reward", async () => {
    await earn(f.adult, 60);
    const r = await glass(50);
    await buyReward(f.adult, r.id);
    expect(await getCoinTotal(f.adult)).toBe(10);
    await expect(buyReward(f.neighbour, r.id)).rejects.toThrow("Belöningen finns inte längre.");
    await deleteReward(f.adult, r.id);
    await expect(buyReward(f.adult, r.id)).rejects.toThrow("Belöningen finns inte längre.");
  });

  it("cannot overspend when two devices buy at once", async () => {
    await earn(f.child, 50);
    const r = await glass(50);
    const results = await Promise.allSettled([buyReward(f.child, r.id), buyReward(f.child, r.id)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("keeps a purchase as bought when the reward is changed or removed", async () => {
    await earn(f.child, 80);
    const r = await glass(50);
    await buyReward(f.child, r.id);
    await updateReward(f.adult, r.id, { name: "Dyrare", price: 70 });
    await deleteReward(f.adult, r.id);
    expect(await listMyPurchases(f.child)).toMatchObject([{ name: "Glass", price: 50, status: "waiting" }]);
    expect(await getCoinTotal(f.child)).toBe(30);
  });
});

describe("cancelling", () => {
  it("lets the buyer take a waiting purchase back, and no one else", async () => {
    await earn(f.child, 80);
    await buyReward(f.child, (await glass()).id);
    const [p] = await listMyPurchases(f.child);
    await expect(cancelPurchase(f.adult, p!.id)).rejects.toThrow("Köpet finns inte längre.");
    await cancelPurchase(f.child, p!.id);
    expect(await getCoinTotal(f.child)).toBe(80);
    expect(await listMyPurchases(f.child)).toEqual([]);
    expect(await listGoldRows(f.adult)).toEqual([]);
  });

  it("cannot cancel what was already given", async () => {
    await earn(f.child, 80);
    await buyReward(f.child, (await glass()).id);
    const [p] = await listMyPurchases(f.child);
    await giveReward(f.adult, p!.id);
    await expect(cancelPurchase(f.child, p!.id)).rejects.toThrow("Köpet finns inte längre.");
    expect(await getCoinTotal(f.child)).toBe(30);
  });
});

describe("giving and declining", () => {
  it("shows a child's purchase to every adult as a gold row, never to a child", async () => {
    await earn(f.child, 80);
    await buyReward(f.child, (await glass()).id);
    expect(await listGoldRows(f.adult)).toMatchObject([{ buyerName: "Bo", name: "Glass", price: 50 }]);
    expect(await listGoldRows(pappa)).toHaveLength(1);
    expect(await listGoldRows(f.child)).toEqual([]);
    expect(await listGoldRows(f.neighbour)).toEqual([]);
  });

  it("sends an adult's purchase to the other adults, or to the only adult", async () => {
    await earn(pappa, 80);
    await buyReward(pappa, (await glass()).id);
    expect(await listGoldRows(f.adult)).toHaveLength(1);
    expect(await listGoldRows(pappa)).toEqual([]);
    await expect(giveReward(pappa, (await listGoldRows(f.adult))[0]!.id)).rejects.toThrow(ForbiddenError);

    await db.delete(membership).where(eq(membership.userId, pappa.userId));
    expect(await listGoldRows(f.adult)).toHaveLength(1);
    await earn(f.adult, 80);
    await buyReward(f.adult, (await listRewards(f.adult)).at(-1)!.id);
    expect(await listGoldRows(f.adult)).toHaveLength(2);
  });

  it("gives: the buyer's row becomes given, coins stay spent, nothing is earned", async () => {
    await earn(f.child, 80);
    await buyReward(f.child, (await glass()).id);
    const [row] = await listGoldRows(f.adult);
    await expect(giveReward(f.child, row!.id)).rejects.toThrow(ForbiddenError);
    const before = await getCoinTotal(f.adult);
    await giveReward(f.adult, row!.id);
    expect(await getCoinTotal(f.adult)).toBe(before);
    expect(await getCoinTotal(f.child)).toBe(30);
    expect(await listMyPurchases(f.child)).toMatchObject([{ status: "given" }]);
    expect(await listGoldRows(f.adult)).toEqual([]);
    await expect(giveReward(pappa, row!.id)).rejects.toThrow("Köpet finns inte längre.");
  });

  it("declines: the coins go back and the row says so", async () => {
    await earn(f.child, 80);
    await buyReward(f.child, (await glass()).id);
    const [row] = await listGoldRows(f.adult);
    await declineReward(f.adult, row!.id);
    expect(await getCoinTotal(f.child)).toBe(80);
    expect(await listMyPurchases(f.child)).toMatchObject([{ status: "declined", price: 50 }]);
    await expect(declineReward(f.child, row!.id)).rejects.toThrow(ForbiddenError);
    await expect(declineReward(pappa, row!.id)).rejects.toThrow("Köpet finns inte längre.");
  });

  it("only lists the last 30 days, newest first", async () => {
    await earn(f.child, 200);
    const r = await glass(10);
    await buyReward(f.child, r.id);
    await buyReward(f.child, r.id);
    const ps = await listMyPurchases(f.child);
    expect(ps).toHaveLength(2);
    expect(ps[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(ps[1]!.createdAt.getTime());
    await giveReward(f.adult, ps[1]!.id);
    await db.update(rewardPurchase).set({ createdAt: sql`now() - interval '31 days'` }).where(eq(rewardPurchase.id, ps[1]!.id));
    expect(await listMyPurchases(f.child)).toHaveLength(1);
    // A purchase still waiting stays, however old, so it can be taken back.
    await db.update(rewardPurchase).set({ createdAt: sql`now() - interval '40 days'` }).where(eq(rewardPurchase.id, ps[0]!.id));
    expect(await listMyPurchases(f.child)).toHaveLength(1);
    await giveReward(f.adult, ps[0]!.id);
    expect(await listMyPurchases(f.child)).toHaveLength(0);
  });

  it("throws UserError (not a crash) for a made-up id", async () => {
    await expect(cancelPurchase(f.child, "nope")).rejects.toThrow(UserError);
    await expect(giveReward(f.adult, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("Köpet finns inte längre.");
  });
});
