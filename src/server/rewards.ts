import "server-only";
import { and, asc, desc, eq, gt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reward, rewardPurchase, user } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { ForbiddenError, assertCan, can } from "@/lib/permissions";
import { giveRecipients, rewardInput, type RewardInput } from "@/lib/rewards";
import { balanceOf, listFamily } from "./chores";
import type { Actor } from "./household";
import { changeAndAward, type Won } from "./badges";

const GONE_REWARD = "Belöningen finns inte längre.";
const GONE_PURCHASE = "Köpet finns inte längre.";
const NOT_ENOUGH = "Du har inte tillräckligt med mynt.";

function idOrGone(id: string, message: string): string {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new UserError(message);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Rewards (adults add, change and remove; everyone sees them)
// ---------------------------------------------------------------------------

export type RewardView = { id: string; name: string; price: number };

/** The home's rewards in the order they were added. */
export async function listRewards(actor: Actor): Promise<RewardView[]> {
  return db
    .select({ id: reward.id, name: reward.name, price: reward.price })
    .from(reward)
    .where(eq(reward.householdId, actor.householdId))
    .orderBy(asc(reward.createdAt), asc(reward.id));
}

export async function addReward(actor: Actor, input: { name: string; price: unknown }) {
  assertCan(actor, "reward:manage");
  const { name, price } = rewardInput.parse(input);
  await db.insert(reward).values({ householdId: actor.householdId, name, price });
}

export async function updateReward(actor: Actor, id: string, input: { name: string; price: unknown }) {
  assertCan(actor, "reward:manage");
  const target = idOrGone(id, GONE_REWARD);
  const data: RewardInput = rewardInput.parse(input);
  const changed = await db
    .update(reward)
    .set(data)
    .where(and(eq(reward.id, target), eq(reward.householdId, actor.householdId)))
    .returning({ id: reward.id });
  if (changed.length === 0) throw new UserError(GONE_REWARD);
}

/** Removing a reward never touches purchases already made: they keep their own name and price. */
export async function deleteReward(actor: Actor, id: string) {
  assertCan(actor, "reward:manage");
  const target = idOrGone(id, GONE_REWARD);
  const removed = await db
    .delete(reward)
    .where(and(eq(reward.id, target), eq(reward.householdId, actor.householdId)))
    .returning({ id: reward.id });
  if (removed.length === 0) throw new UserError(GONE_REWARD);
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

/** Spends the actor's coins on a reward; an adult is asked to give it. Exactly enough is enough. */
export async function buyReward(actor: Actor, id: string): Promise<Won> {
  assertCan(actor, "coins:spend");
  const target = idOrGone(id, GONE_REWARD);
  return db.transaction(async (tx) => {
    // One spend at a time per person, whatever it buys (looks take the same lock, src/server/looks.ts).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hemmafix:coins:' || ${actor.userId}))`);
    const [r] = await tx
      .select({ name: reward.name, price: reward.price })
      .from(reward)
      .where(and(eq(reward.id, target), eq(reward.householdId, actor.householdId)));
    if (!r) throw new UserError(GONE_REWARD);
    if ((await balanceOf(actor.householdId, actor.userId, tx)) < r.price) throw new UserError(NOT_ENOUGH);
    return changeAndAward(tx, actor, async () => {
      await tx
        .insert(rewardPurchase)
        .values({ householdId: actor.householdId, buyerId: actor.userId, name: r.name, price: r.price });
    });
  });
}

/** The buyer takes a waiting purchase back: the row goes and the coins return. */
export async function cancelPurchase(actor: Actor, id: string) {
  assertCan(actor, "purchase:cancel");
  const target = idOrGone(id, GONE_PURCHASE);
  const removed = await db
    .delete(rewardPurchase)
    .where(
      and(
        eq(rewardPurchase.id, target),
        eq(rewardPurchase.householdId, actor.householdId),
        eq(rewardPurchase.buyerId, actor.userId),
        eq(rewardPurchase.status, "waiting"),
      ),
    )
    .returning({ id: rewardPurchase.id });
  if (removed.length === 0) throw new UserError(GONE_PURCHASE);
}

export type PurchaseView = {
  id: string;
  name: string;
  price: number;
  status: "waiting" | "given" | "declined";
  createdAt: Date;
  resolvedAt: Date | null;
};

const DAYS_SHOWN = 30;

/** The actor's own purchases from the last 30 days (and any still waiting), newest first. */
export async function listMyPurchases(actor: Actor): Promise<PurchaseView[]> {
  const rows = await db
    .select({
      id: rewardPurchase.id,
      name: rewardPurchase.name,
      price: rewardPurchase.price,
      status: rewardPurchase.status,
      createdAt: rewardPurchase.createdAt,
      resolvedAt: rewardPurchase.resolvedAt,
    })
    .from(rewardPurchase)
    .where(
      and(
        eq(rewardPurchase.householdId, actor.householdId),
        eq(rewardPurchase.buyerId, actor.userId),
        // A purchase still waiting stays, so its buyer can always take it back.
        or(
          eq(rewardPurchase.status, "waiting"),
          gt(rewardPurchase.createdAt, sql`now() - interval '${sql.raw(String(DAYS_SHOWN))} days'`),
        ),
      ),
    )
    .orderBy(desc(rewardPurchase.createdAt), desc(rewardPurchase.id));
  return rows as PurchaseView[];
}

// ---------------------------------------------------------------------------
// Giving (adults)
// ---------------------------------------------------------------------------

export type GoldRow = { id: string; buyerName: string; name: string; price: number; createdAt: Date };

/** Waiting purchases the actor is asked to give, the newest last; empty if they may give none. */
export async function listGoldRows(actor: Actor): Promise<GoldRow[]> {
  if (!can(actor.role, "reward:give")) return [];
  const [waiting, family] = await Promise.all([
    db
      .select({
        id: rewardPurchase.id,
        buyerId: rewardPurchase.buyerId,
        buyerName: user.name,
        name: rewardPurchase.name,
        price: rewardPurchase.price,
        createdAt: rewardPurchase.createdAt,
      })
      .from(rewardPurchase)
      .innerJoin(user, eq(user.id, rewardPurchase.buyerId))
      .where(and(eq(rewardPurchase.householdId, actor.householdId), eq(rewardPurchase.status, "waiting")))
      .orderBy(asc(rewardPurchase.createdAt), asc(rewardPurchase.id)),
    listFamily(actor.householdId),
  ]);
  return waiting
    .filter((p) => giveRecipients(p.buyerId, family).includes(actor.userId))
    .map((p) => ({
      id: p.id,
      buyerName: p.buyerName.split(" ")[0] ?? p.buyerName,
      name: p.name,
      price: p.price,
      createdAt: p.createdAt,
    }));
}

async function resolve(actor: Actor, id: string, status: "given" | "declined") {
  assertCan(actor, "reward:give");
  const target = idOrGone(id, GONE_PURCHASE);
  const [p] = await db
    .select({ buyerId: rewardPurchase.buyerId, status: rewardPurchase.status })
    .from(rewardPurchase)
    .where(and(eq(rewardPurchase.id, target), eq(rewardPurchase.householdId, actor.householdId)));
  if (!p || p.status !== "waiting") throw new UserError(GONE_PURCHASE);
  if (!giveRecipients(p.buyerId, await listFamily(actor.householdId)).includes(actor.userId)) {
    throw new ForbiddenError("En annan vuxen ger den här belöningen.");
  }
  const changed = await db
    .update(rewardPurchase)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(rewardPurchase.id, target), eq(rewardPurchase.status, "waiting")))
    .returning({ id: rewardPurchase.id });
  if (changed.length === 0) throw new UserError(GONE_PURCHASE);
}

/** The reward was given: the coins stay spent. It earns nothing, and counts for no streak. */
export const giveReward = (actor: Actor, id: string) => resolve(actor, id, "given");

/** "Ge inte": the buyer gets the coins back. */
export const declineReward = (actor: Actor, id: string) => resolve(actor, id, "declined");
