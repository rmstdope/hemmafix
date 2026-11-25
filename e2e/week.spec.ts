import type { Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import type { BadgeKey } from "../src/lib/badges";
import { addDays, todayIso } from "../src/lib/dates";
import { weekStart } from "../src/lib/weeks";
import * as schema from "../src/db/schema";
import { E2E_BASE_URL } from "./support/env";
import { db, logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]')).toBeAttached();
const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const card = (page: Page) => page.getByRole("region", { name: "Den här veckan" });

/** A person whose first open was in an earlier week, so the Monday sheet is due. */
const seenLastWeek = (userId: string) =>
  db.insert(schema.weekRecapSeen).values({ userId, weekStart: addDays(weekStart(todayIso()), -7) });

test("a new member sees a week of zeros that says to get going", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/jag");
  await hydrated(page);
  const week = card(page);
  await expect(week.getByRole("columnheader", { name: "Nu" })).toBeVisible();
  await expect(week.getByRole("columnheader", { name: "Förra" })).toBeVisible();
  for (const row of ["Uppgifter", "Mynt", "Märken"]) {
    await expect(week.getByRole("row", { name: new RegExp(`^${row} 0 0$`) })).toBeVisible();
  }
  await expect(week.getByText("Ny vecka – nu kör vi!")).toBeVisible();
  // The very first open never brings the Monday sheet.
  await expect(page.getByRole("dialog", { name: "Din vecka" })).toHaveCount(0);
});

test("the week card sets this week against last, for a child too", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  const roomId = rooms["Kök"]!.id;
  for (const t of ["A", "B", "C", "D"]) await seedDone({ title: t, roomId, completedById: bo.id, coins: 10 });
  for (const t of ["E", "F", "G"]) await seedDone({ title: t, roomId, completedById: bo.id, coins: 5, completedAt: dayAgo(7) });
  await page.goto("/jag");
  await hydrated(page);
  await expect(card(page).getByRole("row", { name: /^Uppgifter 4 3$/ })).toBeVisible();
  await expect(card(page).getByRole("row", { name: /^Mynt 40 15$/ })).toBeVisible();
  await expect(card(page).getByText("1 fler uppgift än förra veckan!")).toBeVisible();
  // The card is the first thing under the switch.
  const switchBox = await page.getByRole("group", { name: "Visa" }).boundingBox();
  const cardBox = await card(page).boundingBox();
  expect(cardBox!.y).toBeGreaterThan(switchBox!.y);
  expect(cardBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

/** A 9-coin chest and 25-coin badges for `userId`, on the day `days` days ago. */
async function seedChestAndBadges(userId: string, days: number, keys: BadgeKey[]) {
  const [home] = await db.select({ id: schema.household.id }).from(schema.household);
  const day = addDays(todayIso(), -days);
  await db.insert(schema.dailyChest).values({ householdId: home!.id, userId, day, coins: 9, openedAt: new Date() });
  for (const key of keys) {
    await db
      .update(schema.badgeAward)
      .set({ coins: 25, wonAt: dayAgo(days) })
      .where(and(eq(schema.badgeAward.userId, userId), eq(schema.badgeAward.key, key)));
  }
}

test("the week's Mynt counts chests and badges too, and four digits fit a 300 px phone", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  const roomId = rooms["Kök"]!.id;
  await seedDone({ title: "A", roomId, completedById: bo.id, coins: 1209 });
  await seedDone({ title: "B", roomId, completedById: bo.id, coins: 1000, completedAt: dayAgo(7) });
  await seedChestAndBadges(bo.id, 0, ["first-task", "ten-same"]);
  await seedChestAndBadges(bo.id, 7, ["week-streak"]);
  await page.setViewportSize({ width: 300, height: 640 });
  await page.goto("/jag");
  await hydrated(page);
  const mynt = card(page).getByRole("row", { name: /^Mynt 1268 1034$/ });
  await expect(mynt).toBeVisible();
  // One line each: the row is as high as the row of one-digit numbers, and the card stays on screen.
  const tasks = await card(page).getByRole("row", { name: /^Uppgifter 1 1$/ }).boundingBox();
  expect((await mynt.boundingBox())!.height).toBe(tasks!.height);
  const box = (await card(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(300);
});

test("the Monday sheet counts chests and badges in both weeks", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await seedChestAndBadges(anna.id, 7, ["first-task", "ten-same"]);
  await seedChestAndBadges(anna.id, 14, ["week-streak"]);
  await seenLastWeek(anna.id);
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: "Din vecka" });
  await expect(sheet.getByRole("row", { name: /^Mynt 59 34$/ })).toBeVisible();
});

test("the Monday sheet shows last week once, and does not come back", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seenLastWeek(anna.id);
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: "Din vecka" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(/^\d{1,2}.*\d{1,2} \p{L}+$/u)).toBeVisible();
  await expect(sheet.getByRole("columnheader", { name: "Veckan", exact: true })).toBeVisible();
  await expect(sheet.getByRole("columnheader", { name: "Veckan före" })).toBeVisible();
  await expect(sheet.getByText("Ny vecka – nu kör vi!")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Fortsätt" })).toBeFocused();
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await sheet.getByRole("button", { name: "Fortsätt" }).click();
  await expect(sheet).toHaveCount(0);
  await saved;
  await page.reload();
  await page.getByRole("heading", { name: "Uppgifter" }).waitFor();
  await expect(sheet).toHaveCount(0);
});

test("Esc also closes the Monday sheet for good", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seenLastWeek(anna.id);
  await page.goto("/");
  const sheet = page.getByRole("dialog", { name: "Din vecka" });
  await expect(sheet).toBeVisible();
  const saved = page.waitForResponse((r) => r.request().method() === "POST");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await saved;
  await page.goto("/jag");
  await hydrated(page);
  await expect(page.getByRole("dialog", { name: "Din vecka" })).toHaveCount(0);
});

test("a child gets the Monday sheet too", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await seenLastWeek(bo.id);
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Din vecka" })).toBeVisible();
});

test("the card follows a tick made on another device, with no reload", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/jag");
  await hydrated(page);
  await expect(card(page).getByRole("row", { name: /^Uppgifter 0 0$/ })).toBeVisible();

  const other = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  await other.addCookies(await context.cookies());
  const phone = await other.newPage();
  await phone.goto("/");
  await phone.getByRole("button", { name: "Diska: markera som klar" }).click();
  await expect(phone.getByRole("button", { name: "Diska: markera som klar" })).toHaveCount(0);

  await expect(card(page).getByRole("row", { name: /^Uppgifter 1 0$/ })).toBeVisible();
  await other.close();
});
