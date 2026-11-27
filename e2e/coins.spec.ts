import type { Page } from "@playwright/test";
import { logIn, logInWithChestTaken, seedChore, seedDone, seedRooms } from "./support/family";
import { menuButton } from "./support/menu";
import { expect, test } from "./support/test";

/** The coin pill: a button named "<number> mynt" (the visible one: phone header or desktop strip). */
const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });
const bubble = (page: Page) => page.getByRole("dialog", { name: "Dina mynt" });
const tick = (page: Page, title: string) => page.getByRole("button", { name: `${title}: markera som klar` }).click();
const undo = async (page: Page, title: string) => {
  await page.getByText(/Klart senaste veckan/).click();
  await page.getByRole("button", { name: `${title}: ångra klar` }).click();
};

test("a tick from before coins existed earns nothing, and undoing it takes nothing", async ({ page, context }) => {
  const bo = await logInWithChestTaken(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Gammal", roomId: rooms["Kök"]!.id, completedById: bo.id });
  await seedChore({ title: "Ny", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  await expect(pill(page)).toHaveText("0");
  await tick(page, "Ny");
  await expect(pill(page)).toHaveText("10");
  await undo(page, "Gammal");
  await expect(page.getByRole("button", { name: "Gammal: markera som klar" })).toBeVisible();
  await expect(pill(page)).toHaveText("10");
});

test("the pill sits just left of the picture, and the bubble explains where coins come from", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  const pillBox = (await pill(page).boundingBox())!;
  const pictureBox = (await menuButton(page).boundingBox())!;
  expect(pillBox.x + pillBox.width).toBeLessThanOrEqual(pictureBox.x + 1);

  await pill(page).click();
  await expect(bubble(page)).toBeVisible();
  await expect(bubble(page).getByText("Du får mynt för varje uppgift du bockar av.")).toBeVisible();
  await expect(pill(page)).toHaveAttribute("aria-expanded", "true");
  const bubbleBox = (await bubble(page).boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(bubbleBox.x).toBeGreaterThanOrEqual(0);
  expect(bubbleBox.x + bubbleBox.width).toBeLessThanOrEqual(width);

  await pill(page).click();
  await expect(bubble(page)).toHaveCount(0);
});

test("Esc and a press outside close the bubble; Esc keeps focus on the pill", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  await pill(page).focus();
  await page.keyboard.press("Enter");
  await expect(bubble(page)).toBeVisible();
  await expect(pill(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(bubble(page)).toHaveCount(0);
  await expect(pill(page)).toBeFocused();

  await pill(page).click();
  await expect(bubble(page)).toBeVisible();
  await page.mouse.click(5, 400);
  await expect(bubble(page)).toHaveCount(0);
});

test("opening the picture menu closes the bubble and the other way round", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await pill(page).click();
  await expect(bubble(page)).toBeVisible();
  await menuButton(page).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(bubble(page)).toHaveCount(0);
  // The open menu swallows the press outside it, as it always has, so the pill needs a second one.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await pill(page).click();
  await expect(bubble(page)).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("large totals are written in full; the pill is on Listor and, on desktop, on Gjort", async ({ page, context }, info) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Storstädning", roomId: rooms["Kök"]!.id, completedById: bo.id, coins: 1_250 });
  await page.goto("/");
  await expect(pill(page)).toHaveAccessibleName("1 250 mynt");
  await page.goto("/listor");
  await expect(pill(page)).toHaveText("1 250");
  await page.goto("/gjort");
  if (info.project.name === "mobile") await expect(pill(page)).toHaveCount(0);
  else await expect(pill(page)).toHaveText("1 250");
});

test("the pill is reached by Tab just before the picture", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  await pill(page).focus();
  await page.keyboard.press("Tab");
  await expect(menuButton(page)).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(pill(page)).toBeFocused();
});

test("on a narrow phone the pill stays whole and the title gives way", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "the phone header only");
  await logIn(context, "bo", "child");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const pillBox = (await pill(page).boundingBox())!;
  const pictureBox = (await menuButton(page).boundingBox())!;
  expect(pillBox.width).toBeGreaterThan(30);
  expect(pictureBox.x + pictureBox.width).toBeLessThanOrEqual(320);
  await pill(page).click();
  const bubbleBox = (await bubble(page).boundingBox())!;
  expect(bubbleBox.x).toBeGreaterThanOrEqual(0);
  expect(bubbleBox.x + bubbleBox.width).toBeLessThanOrEqual(320);
});
