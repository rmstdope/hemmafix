import type { Locator, Page } from "@playwright/test";
import { logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const LONG = "Städa badrummet ordentligt och byt alla handdukar och badmattor";

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
}

/** The coin sits to the right of the details and below the title, and nothing in the row overlaps it. */
async function expectCalm(row: Locator) {
  const title = await box(row.locator("p.font-medium").first());
  const coin = await box(row.locator("span.tabular-nums").first());
  expect(overlaps(title, coin)).toBe(false);
  expect(coin.y).toBeGreaterThanOrEqual(title.y + title.height - 1);
  const li = await box(row);
  expect(coin.x + coin.width).toBeLessThanOrEqual(li.x + li.width);
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test("task rows keep the coin clear of a long title at 300 px, for open and done rows", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Badrum");
  await seedChore({ title: LONG, roomId: rooms["Badrum"]!.id, coins: 30 });
  await seedDone({ title: LONG + " igår", roomId: rooms["Badrum"]!.id, completedById: anna.id, coins: 20 });
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/");

  const open = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: LONG }).first();
  await expect(open.locator("span.tabular-nums")).toBeVisible();
  await expectCalm(open);
  // The title wraps rather than being cut with an ellipsis.
  expect((await box(open.locator("p.font-medium").first())).height).toBeGreaterThan(30);
  expect(await noSideways(page)).toBe(true);

  await page.getByText(/Klart senaste veckan/).click();
  const klart = page.getByRole("list", { name: "Klart" }).getByRole("listitem").filter({ hasText: LONG }).first();
  await expectCalm(klart);
});

test("the panel has a switch for a recurring task only, keeps focus on the chevron and tabs in order", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id });
  await seedChore({ title: "Torka", roomId: rooms["Kök"]!.id, recurrence: null, assigneeId: anna.id });
  await page.goto("/");
  const row = (t: string) => page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: t });

  // Nobody has Diska: no name. Torka is mine: "Jag" last.
  await expect(row("Diska").getByText("Kök", { exact: true })).toBeVisible();
  await expect(row("Diska").locator("p.text-xs")).toHaveText("Kök");
  await expect(row("Torka").locator("p.text-xs")).toHaveText("Kök · Jag");

  const more = row("Torka").getByRole("button", { name: "Mer" });
  await more.click();
  await expect(more).toBeFocused();
  await expect(row("Torka").getByRole("group", { name: /gäller/ })).toHaveCount(0);
  await more.click();
  await expect(more).toBeFocused();

  const diska = row("Diska");
  await diska.getByRole("button", { name: "Mer" }).click();
  await diska.getByRole("button", { name: "Mer" }).focus();
  const days = diska.getByRole("group", { name: /skjut upp/ }).getByRole("button");
  await expect(days).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    await expect(days.nth(i)).toBeFocused();
  }
  for (const name of ["Den här gången", "Alla gånger"]) {
    await page.keyboard.press("Tab");
    await expect(diska.getByRole("button", { name })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(diska.getByRole("combobox", { name: "vem gör den?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(diska.getByRole("button", { name: "Ändra" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(diska.getByRole("button", { name: "Ta bort uppgiften" })).toBeFocused();
});

test("a child's open row has no panel button and Gjort shows the coin of each tick", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Badrum");
  await seedChore({ title: LONG, roomId: rooms["Badrum"]!.id, coins: 30, assigneeId: bo.id });
  await seedDone({ title: "Dammsuga", roomId: rooms["Badrum"]!.id, completedById: bo.id, coins: 20 });
  await seedDone({ title: "Gammal", roomId: rooms["Badrum"]!.id, completedById: bo.id });
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/");
  const row = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: LONG }).first();
  await expect(row).toContainText("Badrum · Jag");
  await expect(row.getByRole("button", { name: "Mer" })).toHaveCount(0);
  await expectCalm(row);

  await page.goto("/gjort");
  const dammsuga = page.getByRole("listitem").filter({ hasText: "Dammsuga" });
  await expect(dammsuga.locator("span.tabular-nums")).toContainText("20");
  await expectCalm(dammsuga);
  await expect(page.getByRole("listitem").filter({ hasText: "Gammal" }).locator("span.tabular-nums")).toHaveCount(0);
  expect(await noSideways(page)).toBe(true);
});

test("a routine's task puts the coin below its name", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/hemmet");
  await page.getByRole("region", { name: "Rutiner" }).getByRole("list", { name: "Rutiner" }).getByRole("link").first().click();
  const row = page.getByRole("list", { name: "Uppgifter" }).getByRole("listitem").first();
  await expectCalm(row);
  expect(await noSideways(page)).toBe(true);
});
