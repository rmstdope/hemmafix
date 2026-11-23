import type { Page } from "@playwright/test";
import { addDays, formatTabDay, formatTabDayLong, todayIso } from "../src/lib/dates";
import { sql } from "drizzle-orm";
import { household } from "../src/db/schema";
import { db, logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const today = () => todayIso();
const inDays = (n: number) => addDays(today(), n);

const tabs = (page: Page) => page.getByRole("tablist");
const tab = (page: Page, name: string | RegExp) => tabs(page).getByRole("tab", { name });
const panel = (page: Page) => page.getByRole("tabpanel");
const item = (page: Page, title: string) => panel(page).getByRole("listitem").filter({ hasText: title });
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 640;

async function seedBoard() {
  const rooms = await seedRooms("Kök", "Hall");
  const room = rooms["Kök"]!.id;
  const weekly = { unit: "week" as const, interval: 1 };
  await seedChore({ title: "Vattna", roomId: room, dueDate: inDays(-1), recurrence: weekly });
  await seedChore({ title: "Byta lakan", roomId: room, dueDate: inDays(-5), recurrence: null });
  await seedChore({ title: "Diska", roomId: room, dueDate: inDays(0), recurrence: { unit: "day", interval: 1 } });
  await seedChore({ title: "Tömma", roomId: room, dueDate: inDays(0), recurrence: null });
  await seedChore({ title: "Torka", roomId: room, dueDate: inDays(1), recurrence: null });
  await seedChore({ title: "Vika", roomId: room, dueDate: inDays(2), recurrence: null });
  await seedChore({ title: "Rensa", roomId: room, dueDate: inDays(5), recurrence: null });
  await seedChore({ title: "Laga", roomId: rooms["Hall"]!.id, dueDate: null, recurrence: null });
  return rooms;
}

test("five tabs with a count each; Nu is one list, overdue first and oldest first", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await expect(tabs(page).getByRole("tab")).toHaveCount(5);
  await expect(tab(page, /^Nu,/)).toHaveText("Nu4");
  await expect(tab(page, /^Imorgon,/)).toHaveText("Imorgon1");
  await expect(tab(page, /^Senare,/)).toHaveText("Senare2");
  await expect(tab(page, /^Nu,/)).toHaveAttribute("aria-selected", "true");
  await expect(tab(page, "Nu, 4 uppgifter")).toBeVisible();
  await expect(tab(page, "Imorgon, 1 uppgift")).toBeVisible();
  await expect(tab(page, new RegExp(`^${formatTabDayLong(inDays(3))}`))).toHaveText(`${formatTabDay(inDays(3))}0`);

  // No dividers, and the order is overdue (oldest first) then today's.
  await expect(panel(page).getByRole("listitem")).toHaveText([/Byta lakan/, /Vattna/, /Diska/, /Tömma/]);
  await expect(panel(page).getByRole("button", { name: /^(Idag|Försenade)/ })).toHaveCount(0);
  await expect(item(page, "Vattna").getByText("Igår")).toHaveClass(/text-destructive/);
  await expect(item(page, "Diska")).not.toContainText("Idag");
  await expect(tab(page, /^Nu,/).locator("span").last()).toHaveClass(/text-destructive/);
});

test("the other tabs show their day or everything later, with dates only under Senare", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await tab(page, /^Imorgon,/).click();
  await expect(panel(page).getByRole("listitem")).toHaveText([/Torka/]);
  await expect(item(page, "Torka")).not.toContainText("Imorgon");
  await expect(page.getByText(/Klart senaste veckan/)).toBeHidden();

  await tab(page, new RegExp(`^${formatTabDayLong(inDays(2))}`)).click();
  await expect(panel(page).getByRole("listitem")).toHaveText([/Vika/]);

  await tab(page, /^Senare,/).click();
  await expect(panel(page).getByRole("listitem")).toHaveText([/Rensa/, /Laga/]);
  await expect(item(page, "Rensa")).toContainText(/\d+ \w+\./);
  await expect(panel(page)).not.toContainText(/Varje|Var \d|Varannan/);
});

test("Nu's count is grey when nothing is overdue, and a zero is grey", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: inDays(0), recurrence: null });
  await page.goto("/");
  await expect(tab(page, /^Nu,/).locator("span").last()).not.toHaveClass(/text-destructive/);
  await expect(tab(page, /^Imorgon,/).locator("span").last()).toHaveClass(/text-muted-foreground\/50/);
});

test("each empty tab says its own words; with a filter on they all say Inga uppgifter här.", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/");
  await expect(panel(page).getByText("🎉 Allt i Nu är klart!")).toBeVisible();
  await tab(page, /^Imorgon,/).click();
  await expect(panel(page).getByText("Inget att göra den här dagen.")).toBeVisible();
  await tab(page, /^Senare,/).click();
  await expect(panel(page).getByText("Inget planerat längre fram.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny uppgift" })).toBeVisible();

  await page.getByRole("button", { name: "Filtrera" }).click();
  await page.getByRole("combobox", { name: "Person" }).selectOption({ label: "Mina" });
  await expect(panel(page).getByText("Inga uppgifter här.")).toBeVisible();
  await tab(page, "Nu, inga uppgifter").click();
  await expect(panel(page).getByText("Inga uppgifter här.")).toBeVisible();
});

test("the tab is kept on reload and when going to Listor and back; a fresh opening is on Nu", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await tab(page, /^Senare,/).click();
  await expect(item(page, "Rensa")).toBeVisible();

  await page.reload();
  await expect(tab(page, /^Senare,/)).toHaveAttribute("aria-selected", "true");

  const parts = page.getByRole("navigation", { name: "Delar" });
  await parts.getByRole("link", { name: "Listor" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
  await parts.getByRole("link", { name: "Uppgifter" }).click();
  await expect(tab(page, /^Senare,/)).toHaveAttribute("aria-selected", "true");

  await page.goto("/");
  await expect(tab(page, /^Nu,/)).toHaveAttribute("aria-selected", "true");
});

test("Klart senaste veckan is a fold on Nu only", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Dammsuga", roomId: rooms["Kök"]!.id, completedById: anna.id });
  await page.goto("/");
  await expect(page.getByText("Klart senaste veckan (1)")).toBeVisible();
  await tab(page, /^Imorgon,/).click();
  await expect(page.getByText(/Klart senaste veckan/)).toBeHidden();
});

test("ticking off drops the count; a recurring task's next occurrence raises another tab's", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: inDays(0), recurrence: { unit: "day", interval: 1 } });
  await page.goto("/");
  await expect(tab(page, /^Nu,/)).toHaveText("Nu1");
  await expect(tab(page, /^Imorgon,/)).toHaveText("Imorgon0");

  await item(page, "Diska").getByRole("button", { name: "Markera som klar" }).click();
  await expect(tab(page, /^Nu,/)).toHaveText("Nu0");
  await expect(tab(page, /^Imorgon,/)).toHaveText("Imorgon1");
  await tab(page, /^Imorgon,/).click();
  await expect(item(page, "Diska")).toBeVisible();
});

test("a change from another device updates the tabs without leaving the tab you are on", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await page.goto("/");
  await tab(page, /^Senare,/).click();
  await seedChore({ title: "Nytt", roomId: rooms["Kök"]!.id, dueDate: inDays(0), recurrence: null });
  // Another device's change arrives as a notification; pg_notify stands in for it.
  const [home] = await db.select({ id: household.id }).from(household);
  await db.execute(sql`select pg_notify('hemmafix_tasks', ${home!.id})`);
  await expect(tab(page, /^Nu,/)).toHaveText("Nu1");
  await expect(tab(page, /^Senare,/)).toHaveAttribute("aria-selected", "true");
});

test("the tabs work from the keyboard: one tab stop, arrows move between them", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await tab(page, /^Nu,/).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, /^Imorgon,/)).toBeFocused();
  await expect(tab(page, /^Imorgon,/)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tab(page, /^Senare,/)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab(page, /^Nu,/)).toBeFocused();
  await expect(tabs(page).getByRole("tab", { selected: false }).first()).toHaveAttribute("tabindex", "-1");
});

test("all five tabs fit across a narrow phone", async ({ page, context }) => {
  test.skip(!isPhone(page), "phone only");
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  for (const t of await tabs(page).getByRole("tab").all()) {
    const box = (await t.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  // The names are given in full, never cut off with an ellipsis (Imorgon is the widest, and bold when open).
  await tab(page, /^Imorgon,/).click();
  for (const name of await tabs(page).getByRole("tab").locator("span:first-child").all()) {
    expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});

test("the filter panel: labels, applies at once, badge and chips, Rensa filter, Esc", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  const button = page.getByRole("button", { name: /^Filtrera/ });
  await expect(page.getByRole("combobox", { name: "Rum" })).toBeHidden();
  await button.click();
  await expect(page.getByRole("combobox", { name: "Rum" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Person" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rensa filter" })).toHaveCount(0);

  await page.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Hall" });
  await expect(tab(page, /^Nu,/)).toHaveText("Nu0");
  await expect(tab(page, /^Senare,/)).toHaveText("Senare1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Rum" })).toBeHidden();
  await expect(button).toBeFocused();

  const filtered = page.getByRole("button", { name: "Filtrera, 1 filter på" });
  await expect(filtered).toBeVisible();
  await expect(page.getByRole("button", { name: "Ta bort filtret Hall" })).toBeVisible();

  await filtered.click();
  await page.getByRole("combobox", { name: "Person" }).selectOption({ label: "Ingen tilldelad" });
  await expect(page.getByRole("button", { name: "Filtrera, 2 filter på" })).toBeVisible();
  await page.getByRole("button", { name: "Rensa filter" }).click();
  await expect(page.getByRole("button", { name: "Filtrera", exact: true })).toBeVisible();
  await expect(tab(page, /^Nu,/)).toHaveText("Nu4");

  // The panel is still open after Rensa filter.
  await page.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
  await page.getByRole("button", { name: "Filtrera, 1 filter på" }).click();
  await page.getByRole("button", { name: "Ta bort filtret Kök" }).click();
  await expect(tab(page, /^Senare,/)).toHaveText("Senare2");
});

test("changing the filter keeps the tab", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await tab(page, /^Senare,/).click();
  await page.getByRole("button", { name: "Filtrera" }).click();
  await page.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Hall" });
  await expect(tab(page, /^Senare,/)).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("listitem")).toHaveText([/Laga/]);
});

test("a child has the filters and no +", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await seedBoard();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Filtrera" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ny uppgift" })).toHaveCount(0);
});

test("the + opens the add form in a sheet or dialog; closing discards the draft and returns focus", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/");

  const plus = page.getByRole("button", { name: "Ny uppgift" });
  const box = (await plus.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x + box.width).toBeGreaterThan(view.width / 2);
  if (isPhone(page)) {
    const bar = (await page.getByRole("navigation", { name: "Delar" }).boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
  } else {
    const column = (await page.locator("main").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width);
  }

  await plus.click();
  const dialog = page.getByRole("dialog", { name: "Ny uppgift" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Titel" }).fill("Utkast");
  await dialog.getByRole("button", { name: "Stäng" }).click();
  await expect(dialog).toBeHidden();
  await expect(plus).toBeFocused();

  await plus.click();
  await expect(dialog.getByRole("textbox", { name: "Titel" })).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await plus.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});

test("a task added in the sheet appears in its tab", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/");
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const dialog = page.getByRole("dialog", { name: "Ny uppgift" });
  await dialog.getByRole("textbox", { name: "Titel" }).fill("Torka bänken");
  await dialog.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
  await dialog.getByLabel("Klart senast").fill(inDays(1));
  await dialog.getByRole("button", { name: "Lägg till" }).click();
  await expect(dialog).toBeHidden();
  await expect(tab(page, /^Imorgon,/)).toHaveText("Imorgon1");
  await tab(page, /^Imorgon,/).click();
  await expect(item(page, "Torka bänken")).toBeVisible();
});

test("in a home without rooms the sheet asks for rooms first, and Avbryt closes it", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  const plus = page.getByRole("button", { name: "Ny uppgift" });
  await plus.click();
  const dialog = page.getByRole("dialog", { name: "Ny uppgift" });
  await expect(dialog.getByText("Varje uppgift hör till ett rum. Lägg till hemmets rum först.")).toBeVisible();
  await dialog.getByRole("button", { name: "Avbryt" }).click();
  await expect(dialog).toBeHidden();
  await expect(plus).toBeFocused();
});

test("Esc closes the filter panel even when focus has moved into the list", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");
  await page.getByRole("button", { name: "Filtrera" }).click();
  await expect(page.getByRole("combobox", { name: "Rum" })).toBeVisible();
  await item(page, "Diska").getByRole("button", { name: "Markera som klar" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Rum" })).toBeHidden();
});
