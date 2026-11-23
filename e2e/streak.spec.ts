import type { Page } from "@playwright/test";
import { logIn, logInWithChestTaken, seedChore, seedRooms, seedStreak } from "./support/family";
import { menuButton } from "./support/menu";
import { expect, test } from "./support/test";

const flame = (page: Page, name: string | RegExp) => page.getByRole("img", { name });
const coins = (page: Page) => page.getByRole("button", { name: /mynt$/ });
const tick = (page: Page, title: string) => page.getByRole("button", { name: `${title}: markera som klar` }).click();
const undo = async (page: Page, title: string) => {
  await page.getByText(/Klart senaste veckan/).click();
  await page.getByRole("button", { name: `${title}: ångra klar` }).click();
};

test("a member with no streak sees a grey 🔥0, always there", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  await expect(flame(page, "Ingen svit just nu")).toHaveText("🔥0");
});

test("the first tick of the day starts a streak of 1, and undoing it takes the day back", async ({ page, context }) => {
  await logInWithChestTaken(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");
  await expect(flame(page, "1 dag i rad")).toHaveText("🔥1");
  await expect(coins(page)).toHaveAccessibleName("10 mynt");

  await undo(page, "Diska");
  await expect(flame(page, "Ingen svit just nu")).toHaveText("🔥0");
  await expect(coins(page)).toHaveAccessibleName("0 mynt");
});

test("from day 4 a tick gives +10 %, in the shower total and in what undo takes back", async ({ page, context }) => {
  const bo = await logInWithChestTaken(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedStreak({ roomId: rooms["Kök"]!.id, completedById: bo.id, days: 3 });
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await expect(flame(page, "3 dagar i rad")).toHaveText("🔥3");
  await expect(coins(page)).toHaveAccessibleName("30 mynt");

  await tick(page, "Diska");
  await expect(coins(page)).toHaveAccessibleName("41 mynt");
  await expect(flame(page, "4 dagar i rad")).toHaveText("🔥4");
  await expect(page.getByRole("status").filter({ hasText: "Du fick 11 mynt" })).toBeAttached();

  await undo(page, "Diska");
  await expect(coins(page)).toHaveAccessibleName("30 mynt");
  await expect(flame(page, "3 dagar i rad")).toBeVisible();
});

test("the chest's coins never take the streak's extra", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedStreak({ roomId: rooms["Kök"]!.id, completedById: bo.id, days: 6 });
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");
  const card = page.getByRole("dialog", { name: "Dagens kista" });
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.getByRole("button", { name: "Öppna kistan" }).click();
  const shown = Number(/\d+/.exec(await card.getByText(/^\+\d+ mynt$/).innerText())![0]);
  await card.getByRole("button", { name: "Fortsätt" }).click();
  // 60 from the six earlier days, 12 for the tick on day 7 (+20 %), and the chest as rolled.
  await expect(coins(page)).toHaveAccessibleName(`${72 + shown} mynt`, { timeout: 5_000 });
});

test("from day 7 the flame reads 7+ and a tick gives +20 %", async ({ page, context }) => {
  const bo = await logInWithChestTaken(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedStreak({ roomId: rooms["Kök"]!.id, completedById: bo.id, days: 6 });
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await tick(page, "Diska");
  await expect(coins(page)).toHaveAccessibleName("72 mynt");
  await expect(flame(page, "7 dagar i rad eller fler")).toHaveText("🔥7+");
});

test("a streak that missed a full day is 0 again", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedStreak({ roomId: rooms["Kök"]!.id, completedById: bo.id, days: 5, from: 2 });
  await page.goto("/");
  await expect(flame(page, "Ingen svit just nu")).toHaveText("🔥0");
});

test("the flame is not a button, and sits just left of the coin pill on every page that has it", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  // On a phone Hemmet has no coin pill (and so no flame); the desktop strip has both.
  const wide = page.viewportSize()!.width >= 640;
  for (const url of wide ? ["/", "/listor", "/jag", "/hemmet"] : ["/", "/listor", "/jag"]) {
    await page.goto(url);
    const f = flame(page, "Ingen svit just nu");
    await expect(f).toBeVisible();
    await expect(page.getByRole("button", { name: /^🔥/ })).toHaveCount(0);
    const flameBox = (await f.boundingBox())!;
    const coinBox = (await coins(page).boundingBox())!;
    expect(flameBox.x + flameBox.width).toBeLessThanOrEqual(coinBox.x + 1);
    expect(Math.abs(flameBox.y + flameBox.height / 2 - (coinBox.y + coinBox.height / 2))).toBeLessThan(4);
  }
});

test("on a narrow phone the flame, coin pill and picture stay on one row and fit", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/jag");
  const boxes = [await flame(page, "Ingen svit just nu").boundingBox(), await coins(page).boundingBox(), await menuButton(page).boundingBox()];
  for (const b of boxes) expect(b!.x + b!.width).toBeLessThanOrEqual(300);
  expect(Math.abs(boxes[0]!.y - boxes[2]!.y)).toBeLessThan(20);
});

test("the streak follows a tick made on another device", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await tick(other, "Diska");
  await expect(flame(page, "1 dag i rad")).toHaveText("🔥1");
});

test("Framsteg shows the streak card for the state", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await page.goto("/jag");
  await expect(page.getByText("Ingen svit just nu").first()).toBeVisible();
  await expect(page.getByText("Gör en uppgift idag för att starta en.")).toBeVisible();

  await seedStreak({ roomId: rooms["Kök"]!.id, completedById: bo.id, days: 5 });
  await page.reload();
  await expect(page.getByText("5 dagar i rad · +10 % mynt")).toBeVisible();
  await expect(page.getByText("Två dagar till så blir det +20 %.")).toBeVisible();
});

