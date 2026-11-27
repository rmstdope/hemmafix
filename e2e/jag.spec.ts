import type { Locator, Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { choreInstance } from "../src/db/schema";
import { db, logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { chooseFromMenu } from "./support/menu";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

const parts = (page: Page) => page.getByRole("navigation", { name: "Delar" });
const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]')).toBeAttached();
const go = async (page: Page, url: string) => {
  await page.goto(url);
  await hydrated(page);
};
const switchPart = (page: Page, name: "Framsteg" | "Butik") => page.getByRole("group", { name: "Visa" }).getByRole("button", { name });

test("an adult opens Jag from the tabs and sees the header and the switch", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await parts(page).getByRole("link", { name: "Jag" }).click();
  await hydrated(page);
  await expect(page).toHaveTitle("Jag – Hemmafix");
  await expect(page.getByRole("heading", { name: "Jag" })).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Jag" })).toHaveAttribute("aria-current", "page");
  await expect(switchPart(page, "Framsteg")).toHaveAttribute("aria-pressed", "true");
  await expect(switchPart(page, "Butik")).toHaveAttribute("aria-pressed", "false");
});

test("the switch remembers its part on this device only", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  await go(page, "/jag");
  await switchPart(page, "Butik").click();
  await expect(switchPart(page, "Butik")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await hydrated(page);
  await expect(switchPart(page, "Butik")).toHaveAttribute("aria-pressed", "true");
  await parts(page).getByRole("link", { name: "Uppgifter" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await parts(page).getByRole("link", { name: "Jag" }).click();
  await hydrated(page);
  await expect(switchPart(page, "Butik")).toHaveAttribute("aria-pressed", "true");

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await other.addCookies(await context.cookies());
  await go(otherPage, "/jag");
  await expect(switchPart(otherPage, "Framsteg")).toHaveAttribute("aria-pressed", "true");
  await other.close();
});

test("the Jag tab and the switch are reached with Tab and work with Enter and Space", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await go(page, "/jag");
  // Walks forward with Tab from the top of the page until the target has focus.
  const tabTo = async (target: Locator) => {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      if (await target.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error("Tab never reached the target");
  };
  await tabTo(parts(page).getByRole("link", { name: "Jag" }));
  await tabTo(switchPart(page, "Butik"));
  await page.keyboard.press("Enter");
  await expect(switchPart(page, "Butik")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(switchPart(page, "Framsteg")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(switchPart(page, "Framsteg")).toHaveAttribute("aria-pressed", "true");
});

test("on a 300px phone the two parts stay on one line and nothing overflows", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.setViewportSize({ width: 300, height: 640 });
  await go(page, "/jag");
  const [a, b] = [(await switchPart(page, "Framsteg").boundingBox())!, (await switchPart(page, "Butik").boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a child has Jag too, and Gjort opened from Jag goes back to it", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await go(page, "/jag");
  await expect(page.getByRole("heading", { name: "Jag" })).toBeVisible();
  await chooseFromMenu(page, "Gjort");
  await expect(page.getByRole("heading", { name: "Gjort" })).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Jag" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Jag" })).toBeVisible();
});

const levelCard = (page: Page) => page.getByRole("region", { name: "Nivå" });

test("a new member is level 1 and sees what the next level takes", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await go(page, "/jag");
  await expect(levelCard(page).getByText("Nivå 1 · Nybörjare")).toBeVisible();
  await expect(levelCard(page).getByText("0 av 100 mynt till nivå 2")).toBeVisible();
  await expect(levelCard(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
});

test("the card shows the level from earned coins, and the bar fills within the level", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  const done = await seedDone({ title: "Stor", roomId: rooms["Kök"]!.id, completedById: anna.id });
  await db.update(choreInstance).set({ coins: 320 }).where(eq(choreInstance.choreId, done.id));
  await go(page, "/jag");
  await expect(levelCard(page).getByText("Nivå 3 · Fixare")).toBeVisible();
  await expect(levelCard(page).getByText("70 av 250 mynt till nivå 4")).toBeVisible();
  await expect(levelCard(page).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "28");
});

test("an open Jag follows a tick made on another device, live", async ({ page, context, browser }) => {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null, coins: 100 });
  await go(page, "/jag");
  await expect(levelCard(page).getByText("Nivå 1 · Nybörjare")).toBeVisible();

  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const otherPage = await other.newPage();
  await otherPage.goto("/");
  await otherPage.getByRole("button", { name: "Diska: markera som klar" }).click();
  await expect(otherPage.getByRole("button", { name: "Diska: markera som klar" })).toBeHidden();

  await expect(levelCard(page).getByText("Nivå 2 · Hjälpreda")).toBeVisible();
  await expect(levelCard(page).getByText("0 av 150 mynt till nivå 3")).toBeVisible();
  await other.close();
});

test("on a 300px phone the level card fits", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.setViewportSize({ width: 300, height: 640 });
  await go(page, "/jag");
  await expect(levelCard(page).getByText("Nivå 1 · Nybörjare")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
