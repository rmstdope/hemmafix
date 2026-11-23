import type { Page } from "@playwright/test";
import { logIn, logInWithChestTaken, seedChore, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]')).toBeAttached();
const go = async (page: Page, url: string) => {
  await page.goto(url);
  await hydrated(page);
};
const tile = (page: Page, name: string, state: "vunnet" | "inte vunnet") => page.getByRole("button", { name: `${name}, ${state}` });
const coins = (page: Page) => page.getByRole("button", { name: /mynt$/ });
const NAMES = ["Första uppgiften", "Tio av samma", "7 dagar i rad", "Varje rum", "En vecka utan sena", "100 uppgifter", "Nivå 5", "Första köpet"];

test("a new member sees all eight badges grey, and a sheet that says what each is for and how far they are", async ({ page, context }) => {
  await logIn(context, "bo", "child", { badges: "none" });
  await seedRooms("Kök", "Badrum");
  await go(page, "/jag");
  await expect(page.getByRole("heading", { name: "Märken · 0 av 8" })).toBeVisible();
  for (const name of NAMES) await expect(tile(page, name, "inte vunnet")).toBeVisible();

  await tile(page, "Varje rum", "inte vunnet").click();
  const sheet = page.getByRole("dialog", { name: "Varje rum" });
  await expect(sheet.getByText("Gör en uppgift i varje rum i hemmet.")).toBeVisible();
  await expect(sheet.getByText("0 av 2 rum klara.")).toBeVisible();
  await sheet.getByRole("button", { name: "Stäng" }).last().click();
  await expect(sheet).toHaveCount(0);

  // Första uppgiften has nothing to count: just what it is for.
  await tile(page, "Första uppgiften", "inte vunnet").click();
  const first = page.getByRole("dialog", { name: "Första uppgiften" });
  await expect(first.getByText("Bocka av din första uppgift.")).toBeVisible();
  await expect(first.getByText(/\d+ av \d+/)).toHaveCount(0);
});

test("ticking a first task wins Första uppgiften: in colour, with its date and 25 coins in the pill", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await page.getByRole("button", { name: "Diska: markera som klar" }).click();
  // The badge's card holds its 25 coins until it is closed.
  await page.getByRole("dialog", { name: "Nytt märke!" }).getByRole("button", { name: "Fortsätt" }).click();
  await expect(coins(page)).toHaveAccessibleName("35 mynt");

  await go(page, "/jag");
  await expect(page.getByRole("heading", { name: "Märken · 1 av 8" })).toBeVisible();
  await expect(tile(page, "Första uppgiften", "vunnet")).toBeVisible();
  await expect(tile(page, "Varje rum", "inte vunnet")).toBeVisible();
  await tile(page, "Första uppgiften", "vunnet").click();
  await expect(page.getByRole("dialog", { name: "Första uppgiften" }).getByText(/^Vunnet \d{1,2} \p{L}+\.$/u)).toBeVisible();
});

test("a badge won on one device shows on another without reloading", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child", { badges: "none" });
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await go(page, "/jag");
  await expect(page.getByRole("heading", { name: "Märken · 0 av 8" })).toBeVisible();

  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Diska: markera som klar" }).click();
  await expect(other.getByRole("button", { name: "Diska: ångra klar" }).or(other.getByText(/Klart senaste veckan/))).toBeVisible();

  await expect(page.getByRole("heading", { name: "Märken · 1 av 8" })).toBeVisible();
  await expect(coins(page)).toHaveAccessibleName("35 mynt");
});

test("badges are reached with the keyboard: Enter opens a sheet, Esc closes it and focus returns", async ({ page, context }) => {
  await logIn(context, "bo", "child", { badges: "none" });
  await go(page, "/jag");
  const badge = tile(page, "Nivå 5", "inte vunnet");
  await badge.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Nivå 5" });
  await expect(sheet.getByText("Nå nivå 5.")).toBeVisible();
  await expect(sheet.getByText(/^0 av 1.000 mynt\.$/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(badge).toBeFocused();
});

test("on a 300 px phone the four-across grid fits the screen", async ({ page, context }) => {
  await logIn(context, "bo", "child", { badges: "none" });
  await page.setViewportSize({ width: 300, height: 700 });
  await go(page, "/jag");
  for (const name of NAMES) {
    const box = await tile(page, name, "inte vunnet").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(300);
  }
});
