import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { lookPurchase, membership } from "../src/db/schema";
import { db, logIn } from "./support/family";
import { chooseFromMenu } from "./support/menu";
import { hydrated, part, wear } from "./support/sky";
import { expect, test } from "./support/test";

// Next keeps a page that was left in the document, hidden, and `:has()` in globals.css still sees
// it. Every mark such a selector reads must therefore come off the page when it is left.

/** Every attribute a `:has()` in globals.css reads. */
const MARKS = ["data-look-own", "data-look-own-coin", "data-look-scope", "data-parts-bar"];

/** How many elements carry each mark, those of hidden pages included. */
const marked = (page: Page) =>
  page.evaluate((marks) => Object.fromEntries(marks.map((m) => [m, document.querySelectorAll(`[${m}]`).length])), MARKS);

/** The tab bars in the document, those of hidden pages included. */
const tabBars = (page: Page) => page.locator('nav[aria-label="Delar"]');

const barHeight = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).getPropertyValue("--parts-bar-h").trim());

/** The attributes named inside the `:has()` selectors of globals.css. */
function readByCss() {
  const css = readFileSync("src/app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = css.match(/:has\((?:[^()]|\([^()]*\))*\)/g) ?? [];
  return [...new Set(selectors.flatMap((s) => [...s.matchAll(/\[([\w-]+)/g)].map((m) => m[1]!)))].sort();
}

test("a page left by soft navigation stops matching every page-wide mark", async ({ page, context }) => {
  // A new mark in globals.css fails here until it is proved below.
  expect(readByCss()).toEqual(MARKS);
  const anna = await logIn(context, "anna", "adult");
  await wear(anna.id, "jul");
  const [m] = await db.select({ householdId: membership.householdId }).from(membership).where(eq(membership.userId, anna.id));
  await db.insert(lookPurchase).values({ householdId: m!.householdId, userId: anna.id, kind: "coin", key: "silver", price: 100 });
  await db.update(membership).set({ coinLook: "silver" }).where(eq(membership.userId, anna.id));
  const bar = test.info().project.name === "mobile" ? "4rem" : "0px";
  const onAPart = { "data-look-own": 1, "data-look-own-coin": 1, "data-look-scope": 1, "data-parts-bar": 1 };

  // No live updates: a refresh still on its way when the session ends, below, would redirect
  // before the press.
  await page.route("**/api/events", (route) => route.abort());
  await page.goto("/jag");
  await hydrated(page);
  await expect(page.locator('[data-look-own="jul"][data-look-own-coin="silver"]')).toHaveCount(1);
  await expect.poll(() => marked(page)).toEqual(onAPart);
  expect(await barHeight(page)).toBe(bar);
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));

  // To Hemmet, which has the looks but no tab bar of its own.
  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  await expect(page.locator('[data-look-own="jul"]')).toHaveCount(1);
  await expect.poll(() => marked(page)).toEqual({ ...onAPart, "data-parts-bar": 0 });
  expect(await barHeight(page)).toBe("0px");
  // Hemmet's strip, and the left page's strip and bar.
  await expect(tabBars(page)).toHaveCount(3);

  // Back on a part the bar is marked again.
  await page.getByRole("link", { name: "Tillbaka" }).locator("visible=true").click();
  await expect(page).toHaveURL(/\/jag$/);
  await expect.poll(() => marked(page)).toEqual(onAPart);
  expect(await barHeight(page)).toBe(bar);

  // An ended session: the next press goes to a page with no marks at all, in the same document.
  await context.clearCookies();
  await part(page, "Listor").click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
  expect(await tabBars(page).count()).toBeGreaterThan(0);
  await expect.poll(() => marked(page)).toEqual(Object.fromEntries(MARKS.map((mark) => [mark, 0])));
  expect(await barHeight(page)).toBe("0px");
});
