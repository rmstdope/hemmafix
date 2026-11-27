import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { chore, choreInstance } from "../src/db/schema";
import { addDays, formatShortDay, formatTabDay, formatTabDayLong, todayIso } from "../src/lib/dates";
import { nuEmpty } from "./support/board";
import { db, logIn, seedChore, seedRooms } from "./support/family";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

const SAVE_FAILED = "Det gick inte att spara. Försök igen.";
const inDays = (n: number) => addDays(todayIso(), n);

const panel = (page: Page) => page.getByRole("tabpanel");
const rows = (page: Page) => panel(page).getByRole("listitem");
const item = (page: Page, title: string) => rows(page).filter({ hasText: title });
const tab = (page: Page, name: string) => page.getByRole("tab", { name: new RegExp(`^${name},`) });
const dayTab = (page: Page, n: number) => (n === 1 ? tab(page, "Imorgon") : tab(page, formatTabDayLong(inDays(n))));
const more = (page: Page, title: string) => item(page, title).getByRole("button", { name: `${title}: mer` });
const quickDay = (page: Page, title: string, n: number) =>
  item(page, title).getByRole("button", { name: n === 1 ? "Imorgon" : formatTabDay(inDays(n)), exact: true });
const pickDay = (page: Page, title: string) => item(page, title).getByRole("button", { name: "Välj dag…" });
const dateField = (page: Page, title: string) => item(page, title).locator('input[type="date"]');
const moved = (title: string, n: number) => `"${title}" flyttad till ${formatShortDay(inDays(n))}`;
const back = (title: string, n: number) => `"${title}" är tillbaka på ${formatShortDay(inDays(n))}`;
const notice = (page: Page, text: string) => page.locator("[data-sonner-toast]").filter({ hasText: text });
const undo = (page: Page, text: string) => notice(page, text).getByRole("button", { name: "Ångra", exact: true });

async function dueDateOf(title: string) {
  const [row] = await db
    .select({ dueDate: choreInstance.dueDate })
    .from(choreInstance)
    .innerJoin(chore, eq(chore.id, choreInstance.choreId))
    .where(eq(chore.title, title));
  return row?.dueDate;
}

/** Nu: Dammsuga (late), Bädda and Vattna (today). Senare: the undated Frosta, then Rensa, Byta and Putsa. */
async function seedBoard() {
  const room = (await seedRooms("Kök"))["Kök"]!.id;
  await seedChore({ title: "Dammsuga", roomId: room, dueDate: inDays(-2) });
  await seedChore({ title: "Bädda", roomId: room, dueDate: inDays(0), recurrence: null });
  await seedChore({ title: "Vattna", roomId: room, dueDate: inDays(0) });
  await seedChore({ title: "Rensa", roomId: room, dueDate: inDays(4), recurrence: null });
  await seedChore({ title: "Byta", roomId: room, dueDate: inDays(5) });
  await seedChore({ title: "Putsa", roomId: room, dueDate: inDays(7), recurrence: null });
  await seedChore({ title: "Frosta", roomId: room, dueDate: null, recurrence: null });
}

test("one tap moves a chore off the tab: the adult stays, the count lights, the message says where", async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await more(page, "Dammsuga").click();
  await expect(item(page, "Dammsuga").getByText("Skjut upp", { exact: true })).toBeVisible();
  await quickDay(page, "Dammsuga", 2).click();

  await expect(rows(page)).toHaveText([/Bädda/, /Vattna/]);
  await expect(dayTab(page, 2).locator("[data-lit]")).toHaveText("1");
  await expect(tab(page, "Nu")).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Nu")).toHaveText("Nu2");
  await expect(more(page, "Bädda")).toBeFocused();
  await expect(notice(page, moved("Dammsuga", 2))).toBeVisible();
  await expect(page.locator("[data-lit]")).toHaveCount(0);

  await page.reload();
  await dayTab(page, 2).click();
  await expect(rows(page)).toHaveText([/Dammsuga/]);
  await expect(more(page, "Dammsuga")).toHaveAttribute("aria-expanded", "false");
  expect(await dueDateOf("Dammsuga")).toBe(inDays(2));
});

test("Ångra puts the chore back on its old day and focuses its ⌄", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await more(page, "Dammsuga").click();
  await quickDay(page, "Dammsuga", 1).click();

  // By keyboard: the message closes under the focus, which must still end on the chore.
  await undo(page, moved("Dammsuga", 1)).press("Enter");

  await expect(notice(page, back("Dammsuga", -2))).toBeVisible();
  await expect(rows(page)).toHaveText([/Dammsuga/, /Bädda/, /Vattna/]);
  await expect(tab(page, "Nu")).toHaveAttribute("aria-selected", "true");
  await expect(more(page, "Dammsuga")).toBeFocused();
  await expect(notice(page, moved("Dammsuga", 1))).toHaveCount(0);
  await expect(more(page, "Dammsuga")).toBeFocused();
  expect(await dueDateOf("Dammsuga")).toBe(inDays(-2));
});

test("focus goes to the row above after the last row, and to the tab when nothing is left", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await more(page, "Vattna").click();
  await quickDay(page, "Vattna", 1).click();
  await expect(more(page, "Bädda")).toBeFocused();

  await more(page, "Bädda").press("Enter");
  await quickDay(page, "Bädda", 1).press("Space");
  await expect(more(page, "Dammsuga")).toBeFocused();

  await more(page, "Dammsuga").press("Enter");
  await quickDay(page, "Dammsuga", 1).press("Enter");
  await expect(tab(page, "Nu")).toBeFocused();
  await expect(nuEmpty(panel(page))).toBeVisible();
});

test("within Senare the chore moves to its new place and keeps focus", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/?flik=senare");
  await expect(rows(page)).toHaveText([/Frosta/, /Rensa/, /Byta/, /Putsa/]);

  await more(page, "Byta").click();
  await quickDay(page, "Byta", 8).click();

  await expect(rows(page)).toHaveText([/Frosta/, /Rensa/, /Putsa/, /Byta/]);
  const [, day, month] = formatShortDay(inDays(8)).split(" ");
  await expect(item(page, "Byta")).toContainText(`${day} ${month}`);
  await expect(more(page, "Byta")).toBeFocused();
  await expect(more(page, "Byta")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-lit]")).toHaveCount(0);
  await expect(notice(page, moved("Byta", 8))).toBeVisible();

  await undo(page, moved("Byta", 8)).click();
  await expect(rows(page)).toHaveText([/Frosta/, /Rensa/, /Byta/, /Putsa/]);
  await expect(more(page, "Byta")).toBeFocused();
});

test("a tapped tab survives a postponement and a reload", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await tab(page, "Senare").click();
  await expect(page).toHaveURL(/[?&]flik=senare\b/);

  await more(page, "Byta").click();
  await quickDay(page, "Byta", 8).click();
  await expect(notice(page, moved("Byta", 8))).toBeVisible();
  await expect.poll(() => dueDateOf("Byta")).toBe(inDays(8));
  await expect(rows(page)).toHaveText([/Frosta/, /Rensa/, /Putsa/, /Byta/]);
  await expect(page).toHaveURL(/[?&]flik=senare\b/);

  await page.reload();
  await expect(tab(page, "Senare")).toHaveAttribute("aria-selected", "true");
});

test("Välj dag… opens the device's picker, from the day after the chore's own", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  // Headless Chromium has no picker to look at, so count the asks for it.
  await page.addInitScript(() => {
    HTMLInputElement.prototype.showPicker = function () {
      document.body.dataset.pickers = String(Number(document.body.dataset.pickers ?? 0) + 1);
    };
  });
  await page.goto("/");

  await more(page, "Dammsuga").click();
  await expect(dateField(page, "Dammsuga")).toHaveAttribute("min", inDays(1));
  // The field lies over the button, so a tap lands on it and a phone opens its picker by itself.
  await dateField(page, "Dammsuga").click();
  await expect(page.locator("body")).toHaveAttribute("data-pickers", "1");
  await pickDay(page, "Dammsuga").press("Enter");
  await expect(page.locator("body")).toHaveAttribute("data-pickers", "2");

  // The field is unseen, so nothing typed into it may move the chore.
  await dateField(page, "Dammsuga").focus();
  await page.keyboard.type(inDays(20).replaceAll("-", ""));
  await page.keyboard.press("ArrowUp");
  await expect(dateField(page, "Dammsuga")).toHaveValue("");
  await expect(item(page, "Dammsuga").getByText("Skjut upp")).toBeVisible();

  // A picker that lets a day through anyway moves nothing.
  await dateField(page, "Dammsuga").fill(inDays(0));
  await expect(item(page, "Dammsuga").getByText("Skjut upp")).toBeVisible();
  await expect(notice(page, "flyttad")).toHaveCount(0);

  await dateField(page, "Dammsuga").fill(inDays(10));
  await expect(notice(page, moved("Dammsuga", 10))).toBeVisible();
  await expect(rows(page)).toHaveText([/Bädda/, /Vattna/]);
  expect(await dueDateOf("Dammsuga")).toBe(inDays(10));

  await tab(page, "Senare").click();
  await more(page, "Byta").click();
  await expect(dateField(page, "Byta")).toHaveAttribute("min", inDays(6));
});

test("the four buttons share a 300 px row and stay narrow on a wide window", { tag: RUN_ONCE }, async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/");
  await more(page, "Dammsuga").click();

  const buttons = [1, 2, 3].map((n) => quickDay(page, "Dammsuga", n)).concat(pickDay(page, "Dammsuga"));
  await expect(buttons[3]!).toBeVisible();
  const boxes = await Promise.all(buttons.map(async (b) => (await b.boundingBox())!));
  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
  expect(Math.max(...boxes.map((b) => b.width)) - Math.min(...boxes.map((b) => b.width))).toBeLessThan(1);
  for (const button of buttons) expect(await button.evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  const first = (await buttons[0]!.boundingBox())!;
  const last = (await buttons[3]!.boundingBox())!;
  const row = (await item(page, "Dammsuga").boundingBox())!;
  expect(last.x + last.width - first.x).toBeLessThanOrEqual(420);
  expect(first.x - row.x).toBeLessThan(20);
});

test("a chore without a day has no Skjut upp, and a child has no ⌄ at all", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/?flik=senare");
  await more(page, "Frosta").click();
  await expect(item(page, "Frosta").getByRole("button", { name: "Ändra" })).toBeVisible();
  await expect(item(page, "Frosta").getByText("Skjut upp")).toHaveCount(0);

  const childContext = await browser.newContext();
  await logIn(childContext, "bo", "child");
  const child = await childContext.newPage();
  await child.goto("/");
  await expect(item(child, "Bädda")).toBeVisible();
  await expect(child.getByRole("button", { name: /: mer$/ })).toHaveCount(0);
  await childContext.close();
});

test("the move shows at once and reaches the family's other devices", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  const childContext = await browser.newContext();
  await logIn(childContext, "bo", "child");
  const child = await childContext.newPage();
  await child.goto("/");
  await page.goto("/");
  await expect(tab(child, "Nu")).toHaveText("Nu3");

  // Held until the row is seen gone, so what moves it is the page and not the answer.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  await more(page, "Dammsuga").click();
  await quickDay(page, "Dammsuga", 1).click();
  await expect(rows(page)).toHaveText([/Bädda/, /Vattna/]);
  await expect(tab(page, "Imorgon")).toHaveText("Imorgon1");
  await expect(notice(page, moved("Dammsuga", 1))).toHaveCount(0);
  release();

  await expect(notice(page, moved("Dammsuga", 1))).toBeVisible();
  await expect(tab(child, "Nu")).toHaveText("Nu2");
  await expect(tab(child, "Imorgon")).toHaveText("Imorgon1");
  await childContext.close();
});

test("a failed save puts the chore back and says so", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await page.route("**/*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));

  await more(page, "Dammsuga").click();
  await quickDay(page, "Dammsuga", 1).click();

  await expect(notice(page, SAVE_FAILED)).toBeVisible();
  await expect(rows(page)).toHaveText([/Dammsuga/, /Bädda/, /Vattna/]);
  await expect(notice(page, "flyttad")).toHaveCount(0);
});

test("a chore removed meanwhile is said so and the list catches up", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  // No live refresh: the page must learn this from the refused move itself.
  await page.route("**/api/events", (route) => route.fulfill({ status: 204 }));
  await page.goto("/");
  await more(page, "Dammsuga").click();
  await db.delete(chore).where(eq(chore.title, "Dammsuga"));

  await quickDay(page, "Dammsuga", 1).click();

  await expect(notice(page, "Uppgiften finns inte längre")).toBeVisible();
  await expect(rows(page)).toHaveText([/Bädda/, /Vattna/]);
  await expect(tab(page, "Imorgon")).toHaveText("Imorgon0");
});

test("Ångra after a change elsewhere changes nothing", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await more(page, "Dammsuga").click();
  await quickDay(page, "Dammsuga", 1).click();
  await expect(notice(page, moved("Dammsuga", 1))).toBeVisible();
  await db.update(chore).set({ title: "Dammsuga trappan" }).where(eq(chore.title, "Dammsuga"));

  await undo(page, moved("Dammsuga", 1)).click();

  await expect(notice(page, SAVE_FAILED)).toBeVisible();
  await expect(rows(page)).toHaveText([/Bädda/, /Vattna/]);
  expect(await dueDateOf("Dammsuga trappan")).toBe(inDays(1));
});
