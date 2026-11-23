import type { Page } from "@playwright/test";
import { lookPurchase, reward } from "../src/db/schema";
import { E2E_BASE_URL } from "./support/env";
import { db, logIn, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });
const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]')).toBeAttached();

/** `userId` ticked a 150-coin task earlier and has since spent `spent` on a look. */
async function spentAfterTick(userId: string, spent: number) {
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Städa rummet", roomId: rooms["Kök"]!.id, completedById: userId, coins: 150 });
  const m = await db.query.membership.findFirst({ where: (t, { eq }) => eq(t.userId, userId) });
  await db.insert(lookPurchase).values({ householdId: m!.householdId, userId, kind: "frame", key: "guld", price: spent });
  return m!.householdId;
}

const openKlart = async (page: Page) => {
  await page.goto("/");
  await page.getByText(/Klart senaste veckan/).click();
};

test("undoing a tick whose coins are spent asks first, and Ångra ändå leaves a red minus", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const home = await spentAfterTick(bo.id, 150);
  await db.insert(reward).values({ householdId: home, name: "Glass", price: 50 });
  await openKlart(page);
  await expect(pill(page)).toHaveText("0");

  const undo = page.getByRole("button", { name: "Städa rummet: ångra klar" });
  await undo.click();
  const dialog = page.getByRole("dialog", { name: "Mynten är redan använda" });
  await expect(dialog.getByText("Ångra ändå? Du får −150 mynt och kan inte köpa något förrän du har tjänat ihop dem igen.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Avbryt" })).toBeFocused();

  await dialog.getByRole("button", { name: "Avbryt" }).click();
  await expect(dialog).toBeHidden();
  await expect(undo).toBeFocused();
  await expect(pill(page)).toHaveText("0");

  await undo.click();
  await page.getByRole("dialog", { name: "Mynten är redan använda" }).getByRole("button", { name: "Ångra ändå" }).click();
  await expect(pill(page)).toHaveText("−150");
  await expect(pill(page)).toHaveClass(/bg-red-100/);

  await page.goto("/jag");
  await hydrated(page);
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
  await expect(page.getByText("Du har −150 mynt")).toBeVisible();
  await expect(page.getByText("Tjäna 150 mynt till innan du kan köpa något.")).toBeVisible();
  await expect(page.getByText("200 mynt kvar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Köp Glass för 50 mynt" })).toBeDisabled();
});

test("an adult undoing a child's spent tick is asked in the child's name", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const boContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const bo = await logIn(boContext, "bo", "child");
  await spentAfterTick(bo.id, 30);
  await openKlart(page);

  await page.getByRole("button", { name: "Städa rummet: ångra klar" }).click();
  const dialog = page.getByRole("dialog", { name: "Bo har redan använt mynten" });
  await expect(dialog.getByText("Ångra ändå? Bo får −30 mynt och kan inte köpa något förrän Bo har tjänat ihop dem igen.")).toBeVisible();
  await dialog.getByRole("button", { name: "Ångra ändå" }).click();
  await expect(page.getByRole("button", { name: "Städa rummet: ångra klar" })).toHaveCount(0);

  // The child's red pill appears live, on their own device.
  const boPage = await boContext.newPage();
  await boPage.goto("/");
  await expect(pill(boPage)).toHaveText("−30");
  await boContext.close();
});

test("the question fits a 300 px phone", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await spentAfterTick(bo.id, 150);
  await page.setViewportSize({ width: 300, height: 700 });
  await openKlart(page);
  await page.getByRole("button", { name: "Städa rummet: ångra klar" }).click();
  const dialog = page.getByRole("dialog", { name: "Mynten är redan använda" });
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(300);
  await expect(dialog.getByRole("button", { name: "Avbryt" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Ångra ändå" })).toBeInViewport();
});
