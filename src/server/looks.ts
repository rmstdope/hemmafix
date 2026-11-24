import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { lookPurchase, membership } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { chooseLookInput, defaultLook, findLook, LOOK_KINDS, type LookKind } from "@/lib/looks";
import { balanceOf } from "./chores";
import type { Actor } from "./household";
import { changeAndAward, type Won } from "./badges";

const COLUMN = { frame: "frame", theme: "theme", coin: "coinLook" } as const;

export type MyLooks = {
  /** The paid-for looks, as "kind:key"; the free defaults are always the person's. */
  owned: string[];
  chosen: Record<LookKind, string>;
};

/** Once per request: the layout, the corner and the Jag page all ask. */
export const getLooks = (actor: Actor) => cachedLooks(actor.userId, actor.householdId);

const cachedLooks = cache(async (userId: string, householdId: string): Promise<MyLooks> => {
  const actor = { userId, householdId };
  const [[m], bought] = await Promise.all([
    db
      .select({ frame: membership.frame, theme: membership.theme, coin: membership.coinLook })
      .from(membership)
      .where(and(eq(membership.userId, actor.userId), eq(membership.householdId, actor.householdId))),
    db
      .select({ kind: lookPurchase.kind, key: lookPurchase.key })
      .from(lookPurchase)
      .where(and(eq(lookPurchase.userId, actor.userId), eq(lookPurchase.householdId, actor.householdId))),
  ]);
  const chosen = Object.fromEntries(LOOK_KINDS.map((k) => [k, m?.[k] ?? defaultLook(k).key])) as Record<LookKind, string>;
  return { owned: bought.map((b) => `${b.kind}:${b.key}`).sort(), chosen };
});

type Executor = Pick<typeof db, "select" | "update" | "insert">;

async function selectLook(tx: Executor, actor: Actor, kind: LookKind, key: string) {
  await tx
    .update(membership)
    .set({ [COLUMN[kind]]: key })
    .where(and(eq(membership.userId, actor.userId), eq(membership.householdId, actor.householdId)));
}

const ownedBy = (tx: Executor, actor: Actor, kind: string, key: string) =>
  tx
    .select({ id: lookPurchase.id })
    .from(lookPurchase)
    .where(and(eq(lookPurchase.userId, actor.userId), eq(lookPurchase.kind, kind), eq(lookPurchase.key, key)));

/** Buys a look with the actor's coins, exactly enough being enough, and starts using it. */
export async function buyLook(actor: Actor, kind: string, key: string): Promise<Won> {
  const input = chooseLookInput.parse({ kind, key });
  const look = findLook(input.kind, input.key)!;
  if (look.price === 0) throw new UserError("Utseendet är gratis.");
  return db.transaction(async (tx) => {
    // One spend at a time per person, whatever it buys (rewards take the same lock), so two
    // devices cannot spend the same coins twice.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hemmafix:coins:' || ${actor.userId}))`);
    if ((await ownedBy(tx, actor, look.kind, look.key)).length > 0) throw new UserError("Du har redan det utseendet.");
    if ((await balanceOf(actor.householdId, actor.userId, tx)) < look.price) {
      throw new UserError("Du har inte tillräckligt med mynt.");
    }
    return changeAndAward(tx, actor, async () => {
      await tx
        .insert(lookPurchase)
        .values({ householdId: actor.householdId, userId: actor.userId, kind: look.kind, key: look.key, price: look.price });
      await selectLook(tx, actor, look.kind, look.key);
    });
  });
}

/** Switches to a look the actor owns, or to the free default of its kind. */
export async function chooseLook(actor: Actor, kind: string, key: string) {
  const input = chooseLookInput.parse({ kind, key });
  const look = findLook(input.kind, input.key)!;
  if (look.price > 0 && (await ownedBy(db, actor, look.kind, look.key)).length === 0) {
    throw new UserError("Du äger inte det utseendet.");
  }
  await selectLook(db, actor, look.kind, look.key);
}
