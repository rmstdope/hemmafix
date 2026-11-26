import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { choreInstance } from "../src/db/schema";
import { db, logIn, seedDone, seedRooms } from "./support/family";
import { chooseFromMenu } from "./support/menu";
import { expect, test } from "./support/test";

const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]')).toBeAttached();
const pill = (page: Page) => page.getByRole("button", { name: /^\d[\d\s]* mynt$/ });

/** Gives a person `coins` as one done task, the way earned coins are counted. */
async function grant(userId: string, coins: number) {
  const rooms = await seedRooms("Kök");
  const done = await seedDone({ title: "Stor", roomId: rooms["Kök"]!.id, completedById: userId });
  await db.update(choreInstance).set({ coins }).where(eq(choreInstance.choreId, done.id));
}

async function openButik(page: Page) {
  await page.goto("/jag");
  await hydrated(page);
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
}

const tile = (page: Page, name: string | RegExp) => page.getByRole("button", { name });
const sheet = (page: Page) => page.getByRole("dialog");

test("the three rows show every look with its price, the defaults in use", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 500);
  await openButik(page);
  for (const heading of ["Ramar", "Teman", "Mynt"]) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(tile(page, "Ingen ram, används")).toContainText("✓ Används");
  await expect(tile(page, "Svart, används")).toBeVisible();
  await expect(tile(page, "Guld, används")).toBeVisible();
  for (const [look, price] of [["Guldram", 150], ["Himmelsram", 300], ["Lila", 200], ["Jul", 300], ["Kalas", 300], ["Silver", 100], ["Diamant", 250], ["Stjärna", 400]] as const) {
    await expect(tile(page, `${look}, ${price} mynt`)).toBeVisible();
  }
});

test("pressing an unowned look previews it, buying uses it at once and takes the coins", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 200);
  await openButik(page);
  await expect(pill(page)).toHaveText("200");
  await tile(page, "Grön ram, 150 mynt").click();
  await expect(sheet(page).getByText("Så här ser din bild ut för hela familjen.")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Köp för 150 mynt" })).toBeFocused();
  await sheet(page).getByRole("button", { name: "Köp för 150 mynt" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(tile(page, "Grön ram, används")).toContainText("✓ Används");
  await expect(pill(page)).toHaveText("50");
  await expect(page.locator('[data-frame="gron"]:visible').first()).toBeVisible();
});

test("an owned look switches for free, back and forth, the same on another device", async ({ page, context, browser }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 150);
  await openButik(page);
  await tile(page, "Guldram, 150 mynt").click();
  await sheet(page).getByRole("button", { name: "Köp för 150 mynt" }).click();
  await expect(tile(page, "Guldram, används")).toBeVisible();
  await tile(page, "Ingen ram").click();
  await expect(tile(page, "Ingen ram, används")).toBeVisible();
  await expect(tile(page, "Guldram")).toBeVisible();
  await expect(pill(page)).toHaveText("0");

  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const otherPage = await other.newPage();
  await openButik(otherPage);
  await expect(tile(otherPage, "Guldram")).toBeVisible();
  await tile(otherPage, "Guldram").click();
  await expect(tile(otherPage, "Guldram, används")).toBeVisible();
  // The first device follows live.
  await expect(tile(page, "Guldram, används")).toBeVisible();
  await other.close();
});

test("a look you cannot afford still opens, with a disabled buy button and what is missing", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 70);
  await openButik(page);
  await tile(page, "Guldram, 150 mynt").click();
  await expect(sheet(page).getByText("80 mynt kvar")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Köp för 150 mynt" })).toBeDisabled();
  await expect(sheet(page).getByRole("button", { name: "Avbryt" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(pill(page)).toHaveText("70");
});

test("coins spent elsewhere meanwhile are caught when you press Köp", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 150);
  await openButik(page);
  await tile(page, "Guldram, 150 mynt").click();
  await db.update(choreInstance).set({ coins: 100 }).where(eq(choreInstance.completedById, bo.id));
  await sheet(page).getByRole("button", { name: "Köp för 150 mynt" }).click();
  await expect(sheet(page).getByText("Du har inte tillräckligt med mynt.")).toBeVisible();
});

test("a theme changes only the buyer's colours, and a coin look only the buyer's coin", async ({ page, context, browser }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 450);
  await openButik(page);
  await tile(page, "Lila, 200 mynt").click();
  await sheet(page).getByRole("button", { name: "Köp för 200 mynt" }).click();
  await expect(page.locator('[data-look-own="lila"]').first()).toBeAttached();
  await expect(page.getByRole("link", { name: "Jag" }).and(page.locator("[aria-current=page]")).first()).toHaveCSS("color", "rgb(124, 58, 237)");
  await tile(page, "Silver, 100 mynt").click();
  await sheet(page).getByRole("button", { name: "Köp för 100 mynt" }).click();
  await expect(tile(page, "Silver, används")).toBeVisible();
  await expect(pill(page).locator("[data-coin]")).toHaveCSS("background-image", /rgb\(203, 213, 225\)/);

  const other = await browser.newContext();
  const anna = await logIn(other, "anna", "adult");
  expect(anna.id).not.toBe(bo.id);
  const annaPage = await other.newPage();
  await annaPage.goto("/");
  await expect(pill(annaPage)).toBeVisible();
  await expect(annaPage.locator('[data-look-own="svart"]').first()).toBeAttached();
  await expect(annaPage.locator('[data-look-own="lila"]')).toHaveCount(0);
  await expect(annaPage.getByRole("link", { name: "Uppgifter" }).and(annaPage.locator("[aria-current=page]")).first()).not.toHaveCSS("color", "rgb(124, 58, 237)");
  await expect(pill(annaPage).locator("[data-coin]")).not.toHaveCSS("background-image", /rgb\(203, 213, 225\)/);
  await other.close();
});

test("a frame bought by a child shows on their picture in an adult's member list", async ({ page, context, browser }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 150);
  await openButik(page);
  await tile(page, "Rosa ram, 150 mynt").click();
  await sheet(page).getByRole("button", { name: "Köp för 150 mynt" }).click();
  await expect(tile(page, "Rosa ram, används")).toBeVisible();

  const other = await browser.newContext();
  await logIn(other, "anna", "adult");
  const annaPage = await other.newPage();
  await annaPage.goto("/");
  await chooseFromMenu(annaPage, "Hemmet");
  await expect(annaPage.locator('[data-frame="rosa"]')).toBeVisible();
  await other.close();
});

test("on a 300px phone the rows scroll sideways and the sheet fits", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 500);
  await page.setViewportSize({ width: 300, height: 640 });
  await openButik(page);
  await tile(page, "Himmelsram, 300 mynt").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await tile(page, "Himmelsram, 300 mynt").click();
  const box = (await sheet(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(300);
});

test("under a bought theme every theme tile keeps its own colour, and the lit day tab takes the theme", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 200);
  await openButik(page);
  await tile(page, "Lila, 200 mynt").click();
  await sheet(page).getByRole("button", { name: "Köp för 200 mynt" }).click();
  await expect(tile(page, "Lila, används")).toBeVisible();
  const swatch = (name: string | RegExp) => tile(page, name).locator(".bg-primary");
  await expect(swatch("Lila, används")).toHaveCSS("background-color", "rgb(124, 58, 237)");
  // The app's own near-black --primary, oklch(0.205 0 0) in globals.css, as the build compiles it.
  await expect(swatch("Svart")).not.toHaveCSS("background-color", "rgb(124, 58, 237)");
  await expect(swatch("Svart")).toHaveCSS("background-color", /^lab\(7\.78/);
  await expect(swatch("Skog, 200 mynt")).toHaveCSS("background-color", "rgb(5, 150, 105)");
  await expect(swatch("Hallon, 200 mynt")).toHaveCSS("background-color", "rgb(225, 29, 72)");

  await page.goto("/");
  await expect(page.getByRole("tab", { selected: true })).toHaveCSS("border-bottom-color", "rgb(124, 58, 237)");
});
