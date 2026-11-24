import type { Page } from "@playwright/test";
import { reward } from "../src/db/schema";
import { db, logIn, logInWithChestTaken, seedChore, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /^[\d\s\u00a0]+ mynt$/ });
const tick = (page: Page, title: string) => page.getByRole("button", { name: `${title}: markera som klar` }).click();
const badgeCard = (page: Page) => page.getByRole("dialog", { name: "Nytt märke!" });
const levelCard = (page: Page, level: number) => page.getByRole("dialog", { name: `Nivå ${level}!` });
const confetti = (page: Page) => page.locator("[data-confetti]");

async function oneTask(page: Page, context: Parameters<typeof logIn>[0], titles = ["Diska"]) {
  await logInWithChestTaken(context, "bo", "child");
  const rooms = await seedRooms("Kök", "Badrum");
  for (const title of titles) await seedChore({ title, roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  return rooms;
}

test("ticking off the last task in Nu drops confetti for about two seconds and says so", async ({ page, context }) => {
  await oneTask(page, context);
  await tick(page, "Diska");
  await expect(page.getByText("🎉 Allt i Nu är klart!")).toBeVisible();
  await expect(confetti(page)).toBeVisible();
  await expect(confetti(page)).toBeHidden({ timeout: 4_000 });
});

test("ticking off a task while others are left in Nu gives no confetti", async ({ page, context }) => {
  await oneTask(page, context, ["Diska", "Damma"]);
  await tick(page, "Diska");
  await expect(pill(page)).toHaveText("10", { timeout: 5_000 });
  await expect(confetti(page)).toHaveCount(0);
});

test("with less motion Nu says it is cleared but nothing falls", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await oneTask(page, context);
  await tick(page, "Diska");
  await expect(page.getByText("🎉 Allt i Nu är klart!")).toBeVisible();
  await expect(confetti(page)).toHaveCount(0);
});

test("a badge won is a card that waits for the coins, closes with Esc and sends its 25 coins to the pill", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await seedChore({ title: "Damma", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");

  const card = badgeCard(page);
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card.getByText("Första uppgiften", { exact: true })).toBeVisible();
  await expect(card.getByText("+25 mynt")).toBeVisible();
  await expect(card.getByRole("button", { name: "Fortsätt" })).toBeFocused();
  await expect(confetti(page)).toBeVisible();
  await expect(card.getByRole("status")).toHaveText("Nytt märke: Första uppgiften, 25 mynt");
  // The shower has landed, but the badge's coins are not in the pill until the card closes.
  await expect(pill(page)).toHaveText("10");

  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await expect(pill(page)).toHaveText("35", { timeout: 5_000 });
  await page.reload();
  await expect(pill(page)).toHaveText("35");
});

test("a press outside and Fortsätt close a badge card too", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");
  await expect(badgeCard(page)).toBeVisible({ timeout: 5_000 });
  await badgeCard(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(badgeCard(page)).toBeHidden();
  await expect(pill(page)).toHaveText("35", { timeout: 5_000 });
});

test("the order is shower, chest, badge, then level", async ({ page, context }) => {
  await logIn(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");

  const chest = page.getByRole("dialog", { name: "Dagens kista" });
  await expect(chest).toBeVisible({ timeout: 5_000 });
  await expect(badgeCard(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(chest).toBeHidden();
  await expect(badgeCard(page)).toBeVisible();
});

test("a level reached comes after the badge, with the new title", async ({ page, context }) => {
  const user = await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  // Long before badges began, so it counts towards the level but wins no badge by itself.
  await seedDone({ title: "Gammal", roomId: rooms["Kök"]!.id, completedById: user.id, coins: 70, completedAt: new Date("2001-01-01T10:00:00Z") });
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");

  await expect(badgeCard(page)).toBeVisible({ timeout: 5_000 });
  await expect(levelCard(page, 2)).toHaveCount(0);
  await badgeCard(page).getByRole("button", { name: "Fortsätt" }).click();

  const card = levelCard(page, 2);
  await expect(card).toBeVisible();
  await expect(card.getByText("Du är nu Hjälpreda")).toBeVisible();
  await expect(card.getByRole("button", { name: "Fortsätt" })).toBeFocused();
  await expect(card.getByRole("status")).toHaveText("Nivå 2, Hjälpreda");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await expect(pill(page)).toHaveText("105", { timeout: 5_000 });
});

test("celebrations happen only on the device that ticked: another page of the same person shows no card", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await tick(page, "Diska");
  await expect(badgeCard(page)).toBeVisible({ timeout: 5_000 });
  await expect(pill(other)).toHaveText("35", { timeout: 5_000 });
  await expect(badgeCard(other)).toHaveCount(0);
});

test("a badge card fits a 300 px screen", async ({ page, context }) => {
  await page.setViewportSize({ width: 300, height: 640 });
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");
  const card = badgeCard(page);
  await expect(card).toBeVisible({ timeout: 5_000 });
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("two badges at once are two cards, one after the other, and the coins of both arrive", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  // One room only, so the first tick wins Varje rum as well as Första uppgiften.
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");

  await expect(badgeCard(page)).toBeVisible({ timeout: 5_000 });
  await expect(pill(page)).toHaveText("10");
  const first = await badgeCard(page).locator("p.font-semibold").innerText();
  await badgeCard(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(badgeCard(page)).toBeVisible();
  await expect(badgeCard(page).locator("p.font-semibold")).not.toHaveText(first);
  await expect(page.locator("main")).not.toBeFocused();
  await badgeCard(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(badgeCard(page)).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await expect(pill(page)).toHaveText("60", { timeout: 5_000 });
});

test("with a filter on, emptying the list is not clearing Nu: no confetti", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child");
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await seedChore({ title: "Damma", roomId: rooms["Badrum"]!.id, recurrence: null });
  await page.goto(`/?rum=${rooms["Kök"]!.id}`);
  await tick(page, "Diska");
  await expect(page.getByRole("tabpanel", { name: /^Nu/ }).getByText("Inga uppgifter här.")).toBeVisible();
  await expect(pill(page)).toHaveText("10", { timeout: 5_000 });
  await expect(confetti(page)).toHaveCount(0);
});

test("with less motion a badge still gets its card, without confetti, and its coins still arrive", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");
  await expect(badgeCard(page)).toBeVisible({ timeout: 5_000 });
  await expect(confetti(page)).toHaveCount(0);
  await badgeCard(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(pill(page)).toHaveText("35", { timeout: 5_000 });
});

test("two ticks made at once clear Nu once", async ({ page, context }) => {
  await oneTask(page, context, ["Diska", "Damma"]);
  await page.getByRole("button", { name: "Diska: markera som klar" }).click();
  await tick(page, "Damma");
  await expect(page.getByText("🎉 Allt i Nu är klart!")).toBeVisible();
  await expect(confetti(page)).toHaveCount(1);
});

test("buying a reward wins Första köpet and reaches a level: badge card, then level card, then the coins arrive", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök");
  // Long before badges began: counts towards the level, wins no badge by itself (80 + 25 = 105 reaches level 2).
  await seedDone({ title: "Gammal", roomId: rooms["Kök"]!.id, completedById: bo.id, coins: 80, completedAt: new Date("2001-01-01T10:00:00Z") });
  const home = await db.query.membership.findFirst({ where: (t, { eq }) => eq(t.userId, bo.id) });
  await db.insert(reward).values({ householdId: home!.householdId, name: "Glass", price: 50 });
  await page.goto("/jag");
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
  await page.getByRole("button", { name: "Köp Glass för 50 mynt" }).click();
  await page.getByRole("dialog", { name: "Köpa Glass?" }).getByRole("button", { name: "Köp för 50 mynt" }).click();

  const card = badgeCard(page);
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card.getByText("Första köpet", { exact: true })).toBeVisible();
  // The 25 coins wait for the card: 80 - 50 = 30.
  await expect(pill(page)).toHaveText("30");
  await card.getByRole("button", { name: "Fortsätt" }).click();
  const level = levelCard(page, 2);
  await expect(level).toBeVisible();
  await level.getByRole("button", { name: "Fortsätt" }).click();
  await expect(pill(page)).toHaveText("55", { timeout: 5_000 });
});

test("buying a look that wins Första köpet gets its badge card", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Gammal", roomId: rooms["Kök"]!.id, completedById: bo.id, coins: 200, completedAt: new Date("2001-01-01T10:00:00Z") });
  await page.goto("/jag");
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
  await page.getByRole("button", { name: "Guldram, 150 mynt" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Köp för 150 mynt" }).click();
  await expect(badgeCard(page).getByText("Första köpet", { exact: true })).toBeVisible({ timeout: 5_000 });
});

test("scrolled down on a phone, no pill shows the badge's coins while its card is open", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "the top strip of the desktop stays in view");
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  for (let i = 1; i <= 14; i++) await seedChore({ title: `Syssla ${i}`, roomId: rooms["Kök"]!.id, recurrence: null });
  // Every number the real pill or its sliding copy shows while a badge card is open.
  await page.addInitScript(() => {
    const w = window as unknown as { duringCard: string[] };
    w.duringCard = [];
    new MutationObserver(() => {
      if (!document.querySelector("dialog[open]")) return;
      const real = [...document.querySelectorAll("button")].find((b) => /mynt$/.test(b.getAttribute("aria-label") ?? "") && b.getClientRects().length > 0);
      for (const el of [real, document.querySelector("[data-coin-float]")]) {
        const text = el?.textContent?.trim();
        if (text) w.duringCard.push(text);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  await page.goto("/");
  await expect(pill(page)).toHaveText("0");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(pill(page)).not.toBeInViewport();
  await tick(page, "Syssla 14");

  await expect(badgeCard(page)).toBeVisible({ timeout: 5_000 });
  // Long enough for the tick's save to answer and the shower to hand back to the server's total.
  await page.waitForTimeout(2_500);
  const duringCard = await page.evaluate(() => (window as unknown as { duringCard: string[] }).duringCard);
  expect(duringCard).toContain("10");
  expect(duringCard).not.toContain("35");

  await badgeCard(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(badgeCard(page)).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(pill(page)).toHaveText("35", { timeout: 5_000 });
});
