import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { createFamily } from "../../test/integration/factories";
import { completeInstance, createChore, getCoinTotal, getLifetimeCoins, listOpenInstances } from "./chores";
import { listMembersWithRoles } from "./household";
import { buyLook, chooseLook, getLooks } from "./looks";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

/** Gives Bo `coins` (a multiple of 50) by ticking off tasks worth 50 each. */
async function earn(coins: number) {
  for (let i = 0; i < coins / 50; i++) {
    const title = `Uppgift ${i}-${coins}-${Math.random()}`;
    await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once", coins: "50" });
    const [t] = (await listOpenInstances(f.adult, {})).filter((x) => x.title === title);
    await completeInstance(f.child, t!.id);
  }
}

describe("getLooks", () => {
  it("starts on the free defaults, owning nothing", async () => {
    expect(await getLooks(f.child)).toEqual({ owned: [], chosen: { frame: "none", theme: "svart", coin: "guld" } });
  });
});

describe("buyLook", () => {
  it("takes the price off the balance, keeps the level's lifetime coins and uses the look at once", async () => {
    await earn(200);
    await buyLook(f.child, "frame", "guld");
    expect(await getCoinTotal(f.child)).toBe(50);
    expect(await getLifetimeCoins(f.child)).toBe(200);
    expect(await getLooks(f.child)).toEqual({
      owned: ["frame:guld"],
      chosen: { frame: "guld", theme: "svart", coin: "guld" },
    });
  });

  it("allows exactly enough, leaving nothing", async () => {
    await earn(100);
    await buyLook(f.child, "coin", "silver");
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("refuses too few coins and leaves everything as it was", async () => {
    await earn(50);
    await expect(buyLook(f.child, "coin", "silver")).rejects.toThrow(new UserError("Du har inte tillräckligt med mynt."));
    expect(await getCoinTotal(f.child)).toBe(50);
    expect((await getLooks(f.child)).owned).toEqual([]);
  });

  it("never charges an owned look again", async () => {
    await earn(300);
    await buyLook(f.child, "theme", "lila");
    await expect(buyLook(f.child, "theme", "lila")).rejects.toThrow(UserError);
    expect(await getCoinTotal(f.child)).toBe(100);
  });

  it("cannot overspend with two devices pressing at once", async () => {
    await earn(150);
    const results = await Promise.allSettled([buyLook(f.child, "frame", "guld"), buyLook(f.child, "frame", "gron")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("refuses an unknown look and a free default", async () => {
    await earn(500);
    await expect(buyLook(f.child, "frame", "nope")).rejects.toThrow("Utseendet finns inte.");
    await expect(buyLook(f.child, "frame", "none")).rejects.toThrow(UserError);
  });

  it("is each person's own, and an adult buys like a child", async () => {
    await earn(200);
    await buyLook(f.child, "theme", "skog");
    expect((await getLooks(f.adult)).owned).toEqual([]);
    await expect(buyLook(f.adult, "theme", "skog")).rejects.toThrow(new UserError("Du har inte tillräckligt med mynt."));
  });
});

describe("chooseLook", () => {
  it("switches between owned looks and back to the default for free", async () => {
    await earn(300);
    await buyLook(f.child, "frame", "guld");
    await buyLook(f.child, "frame", "gron");
    await chooseLook(f.child, "frame", "guld");
    expect((await getLooks(f.child)).chosen.frame).toBe("guld");
    await chooseLook(f.child, "frame", "none");
    expect((await getLooks(f.child)).chosen.frame).toBe("none");
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("refuses a look you do not own and an unknown one", async () => {
    await expect(chooseLook(f.child, "frame", "guld")).rejects.toThrow(UserError);
    await expect(chooseLook(f.child, "frame", "nope")).rejects.toThrow("Utseendet finns inte.");
  });
});

describe("the frame, which the family sees", () => {
  it("shows on a member in the home's member list", async () => {
    await earn(150);
    await buyLook(f.child, "frame", "guld");
    const family = await listMembersWithRoles(f.homeId);
    expect(family.find((m) => m.name === "Bo")?.frame).toBe("guld");
    expect(family.find((m) => m.name === "Anna")?.frame).toBe("none");
  });
});
