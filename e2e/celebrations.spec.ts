import type { Page } from "@playwright/test";
import { logIn, logInWithChestTaken, seedChore, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });
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
