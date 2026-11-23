import type { Locator, Page } from "@playwright/test";
import { logIn } from "./support/family";
import { chooseFromMenu } from "./support/menu";
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

test("on a 300px phone the two parts stay on one line and nothing overflows", async ({ page, context }) => {
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
