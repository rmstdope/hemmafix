import type { Page } from "@playwright/test";
import { logIn, seedChore, seedRooms } from "./support/family";
import { menuButton } from "./support/menu";
import { expect, test } from "./support/test";

const tick = (page: Page, title: string) => page.getByRole("button", { name: `${title}: markera som klar` }).click();
const sw = (page: Page) => page.getByRole("menuitemcheckbox", { name: "Ljud och vibration" });

/** Counts clinks and vibration taps from before the page loads. */
async function watch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { clinks: number; taps: number };
    w.clinks = 0;
    w.taps = 0;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      createOscillator() {
        w.clinks += 1;
        return super.createOscillator();
      }
    };
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: () => {
        w.taps += 1;
        return true;
      },
    });
  });
}
const seen = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { clinks: number; taps: number };
    return { clinks: w.clinks, taps: w.taps };
  });

async function setUp(page: Page, context: Parameters<typeof logIn>[0], role: "adult" | "child" = "child") {
  await logIn(context, role === "adult" ? "anna" : "bo", role);
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await watch(page);
  await page.goto("/");
}

test("the switch sits between Hemmet and Logga ut for an adult, and before Logga ut for a child", async ({ page, context }) => {
  await setUp(page, context, "adult");
  await menuButton(page).click();
  await expect(page.getByRole("menu").locator("[role^=menuitem]")).toHaveText(["Gjort", "Hemmet", "Ljud och vibration", "Logga ut"]);
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
  expect((await sw(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("a child's menu has the switch too", async ({ page, context }) => {
  await setUp(page, context);
  await menuButton(page).click();
  await expect(page.getByRole("menu").locator("[role^=menuitem]")).toHaveText(["Gjort", "Ljud och vibration", "Logga ut"]);
});

test("turned off it stays off after a reload, keeps the menu open, and works from the keyboard", async ({ page, context }) => {
  await setUp(page, context);
  await menuButton(page).click();
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.reload();
  await menuButton(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
  await sw(page).focus();
  await page.keyboard.press("Enter");
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Space");
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
});

test("on, every coin clinks and vibrates; off, nothing", async ({ page, context }) => {
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(page.getByRole("status")).toHaveText("Du fick 10 mynt");
  await expect.poll(async () => (await seen(page)).clinks, { timeout: 5_000 }).toBe(5);
  expect(await seen(page)).toEqual({ clinks: 5, taps: 5 });
});

test("off, a tick-off makes no sound and no vibration", async ({ page, context }) => {
  await setUp(page, context);
  await menuButton(page).click();
  await sw(page).click();
  await page.keyboard.press("Escape");
  await tick(page, "Diska");
  await expect(page.getByRole("status")).toHaveText("Du fick 10 mynt");
  await page.waitForTimeout(1_500);
  expect(await seen(page)).toEqual({ clinks: 0, taps: 0 });
});

test("off, reduced motion is quiet too; the setting belongs to the device, not the person", async ({ page, browser, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setUp(page, context);
  await menuButton(page).click();
  await sw(page).click();
  await page.keyboard.press("Escape");
  await tick(page, "Diska");
  await expect(page.getByRole("status")).toHaveText("Du fick 10 mynt");
  expect(await seen(page)).toEqual({ clinks: 0, taps: 0 });
  const other = await browser.newContext();
  await logIn(other, "anna", "adult");
  const fresh = await other.newPage();
  await fresh.goto("/");
  await menuButton(fresh).click();
  await expect(sw(fresh)).toHaveAttribute("aria-checked", "true");
  await other.close();
});
