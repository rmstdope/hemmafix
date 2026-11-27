import type { Page } from "@playwright/test";
import { dailyChest } from "../src/db/schema";
import { nuEmpty } from "./support/board";
import { db, logIn, seedChore, seedRooms } from "./support/family";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });
const tick = (page: Page, title: string) => page.getByRole("button", { name: `${title}: markera som klar` }).click();
const card = (page: Page) => page.getByRole("dialog", { name: "Dagens kista" });

async function setUp(page: Page, context: Parameters<typeof logIn>[0], titles = ["Diska", "Damma"]) {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  for (const title of titles) await seedChore({ title, roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await expect(pill(page)).toHaveText("0");
}

/** The coins the opened chest shows, from "+7 mynt". */
async function coinsShown(page: Page) {
  const text = await card(page).getByText(/^\+\d+ mynt$/).innerText();
  return Number(/\d+/.exec(text)![0]);
}

test("the first tick-off of the day offers a chest, opened with a press, and its coins go to the pill", async ({ page, context }) => {
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(card(page)).toBeVisible({ timeout: 5_000 });
  // Only once the shower has landed: the pill already shows every coin of the tick-off.
  expect(await pill(page).innerText()).toBe("10");
  await expect(card(page).getByText("Dagens kista")).toBeVisible();
  await expect(card(page).getByText("Tryck för att öppna")).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Öppna kistan" })).toBeFocused();

  await card(page).getByRole("button", { name: "Öppna kistan" }).click();
  const coins = await coinsShown(page);
  expect(coins).toBeGreaterThanOrEqual(5);
  expect(coins).toBeLessThanOrEqual(10);
  await expect(card(page).getByText("Ny kista i morgon")).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Fortsätt" })).toBeFocused();

  await card(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(card(page)).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  await expect(pill(page)).toHaveText(String(10 + coins), { timeout: 5_000 });
  await expect(page.getByRole("status")).toHaveText(`Du fick ${coins} mynt`);

  // One chest a day: the second tick-off offers none, and the total survives a reload.
  await tick(page, "Damma");
  await expect(pill(page)).toHaveText(String(20 + coins), { timeout: 5_000 });
  await expect(card(page)).toBeHidden();
  await page.reload();
  await expect(pill(page)).toHaveText(String(20 + coins));
});

test("a chest closed unopened with Esc opens itself and its coins are credited anyway", async ({ page, context }) => {
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(card(page)).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press("Escape");
  await expect(card(page)).toBeHidden();
  await expect(page.locator("main")).toBeFocused();
  const said = page.getByRole("status");
  await expect(said).toHaveText(/^Du fick (5|6|7|8|9|10) mynt$/);
  // The total comes from what is said: the pill is still counting while the coins fly.
  const total = 10 + Number(/\d+/.exec(await said.innerText())![0]);
  await expect(pill(page)).toHaveText(String(total), { timeout: 5_000 });
  // The pill counts before the server has answered, and a reload would drop a request still unsent.
  await expect.poll(async () => (await db.select().from(dailyChest))[0]?.openedAt).toBeTruthy();
  await page.reload();
  await expect(pill(page)).toHaveText(String(total));
});

test("undoing the first tick-off does not take the chest back", { tag: RUN_ONCE }, async ({ page, context }) => {
  await setUp(page, context);
  await tick(page, "Diska");
  await card(page).getByRole("button", { name: "Öppna kistan" }).click();
  const coins = await coinsShown(page);
  await card(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(pill(page)).toHaveText(String(10 + coins), { timeout: 5_000 });

  await page.getByText(/Klart senaste veckan/).click();
  await page.getByRole("button", { name: "Diska: ångra klar" }).click();
  await expect(pill(page)).toHaveText(String(coins), { timeout: 5_000 });
  await tick(page, "Diska");
  await expect(pill(page)).toHaveText(String(10 + coins), { timeout: 5_000 });
  await expect(card(page)).toBeHidden();
});

test("a task worth 0 coins offers no chest", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Gratis", roomId: rooms["Kök"]!.id, recurrence: null, coins: 0 });
  await page.goto("/");
  await tick(page, "Gratis");
  await expect(nuEmpty(page)).toBeVisible();
  await expect(pill(page)).toHaveText("0");
  await expect(card(page)).toBeHidden();
});

test("with reduced motion the chest still shows and opens, without sparkles", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(card(page)).toBeVisible({ timeout: 5_000 });
  await card(page).getByRole("button", { name: "Öppna kistan" }).click();
  await expect(card(page).getByText("Ny kista i morgon")).toBeVisible();
  await expect(card(page).locator("[data-sparkle]")).toHaveCount(0);
  const coins = await coinsShown(page);
  await card(page).getByRole("button", { name: "Fortsätt" }).click();
  await expect(pill(page)).toHaveText(String(10 + coins));
});
