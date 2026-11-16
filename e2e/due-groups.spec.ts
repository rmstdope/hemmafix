import type { Page } from "@playwright/test";
import { addDays, formatDay, todayIso } from "../src/lib/dates";
import { logIn, seedChore, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const today = () => todayIso();
const inDays = (n: number) => addDays(today(), n);

const todo = (page: Page) => page.getByRole("group", { name: "Att göra" });
const divider = (page: Page, name: string) => todo(page).getByRole("button", { name: new RegExp(`^${name} \\d+$`) });
const group = (page: Page, name: string) => todo(page).getByRole("list", { name, exact: true });
const item = (page: Page, title: string) => todo(page).getByRole("listitem").filter({ hasText: title });

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
}

test("the open tasks are divided by due date, with a count on each divider", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  const dayName = formatDay(inDays(2), today());
  const dividers = todo(page).locator("button[aria-controls]");
  await expect(dividers).toHaveText(["Försenade2", "Idag2", "Imorgon1", `${dayName}1`, "Senare1", "Utan datum1"]);
  // Days with no tasks get no divider.
  await expect(todo(page).getByRole("button", { name: new RegExp(`^${formatDay(inDays(3), today())}`) })).toHaveCount(0);

  await expect(group(page, "Försenade").getByRole("listitem")).toHaveCount(2);
  await expect(group(page, "Idag").getByRole("listitem")).toHaveCount(2);
  await expect(group(page, "Utan datum").getByRole("listitem")).toHaveCount(1);
});

test("rows show the date only under Försenade and Senare, and never how often they recur", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await expect(item(page, "Vattna")).toContainText("Igår");
  await expect(item(page, "Vattna").getByText("Igår")).toHaveClass(/text-destructive/);
  await expect(item(page, "Rensa")).toContainText(/\d+ \w+\./);
  await expect(item(page, "Diska")).toContainText("Kök");
  await expect(item(page, "Diska")).not.toContainText("Idag");
  await expect(item(page, "Torka")).not.toContainText("Imorgon");
  await expect(todo(page)).not.toContainText(/Varje|Var \d|Varannan/);
});

test("a divider folds and unfolds its tasks, and the fold is remembered on this device", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  const idag = divider(page, "Idag");
  await expect(idag).toHaveAttribute("aria-expanded", "true");
  await idag.click();
  await expect(idag).toHaveAttribute("aria-expanded", "false");
  await expect(idag).toContainText("2");
  await expect(item(page, "Diska")).toBeHidden();
  await expect(item(page, "Torka")).toBeVisible();

  await page.reload();
  await expect(divider(page, "Idag")).toHaveAttribute("aria-expanded", "false");
  await expect(item(page, "Diska")).toBeHidden();

  await divider(page, "Idag").click();
  await expect(item(page, "Diska")).toBeVisible();
  await page.reload();
  await expect(divider(page, "Idag")).toHaveAttribute("aria-expanded", "true");
});

test("a divider works from the keyboard and keeps focus", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  const senare = divider(page, "Senare");
  await senare.focus();
  await page.keyboard.press("Enter");
  await expect(senare).toHaveAttribute("aria-expanded", "false");
  await expect(senare).toBeFocused();
  await page.keyboard.press("Space");
  await expect(senare).toHaveAttribute("aria-expanded", "true");
  await expect(senare).toBeFocused();
});

test("a filter shows only the groups that have tasks, counted in the filtered list", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await page.getByRole("combobox", { name: "Filtrera på rum" }).selectOption({ label: "Hall" });
  await expect(divider(page, "Utan datum")).toBeVisible();
  await expect(divider(page, "Idag")).toHaveCount(0);
  await expect(divider(page, "Försenade")).toHaveCount(0);

  await page.getByRole("combobox", { name: "Filtrera på rum" }).selectOption({ label: "Kök" });
  await expect(divider(page, "Idag")).toContainText("2");
  await expect(divider(page, "Utan datum")).toHaveCount(0);
});

test("ticking off the last task in a group removes its divider; a child can fold too", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Mata katten", roomId: rooms["Kök"]!.id, dueDate: inDays(1), recurrence: null });
  await seedChore({ title: "Städa", roomId: rooms["Kök"]!.id, dueDate: inDays(0), recurrence: null });
  await page.goto("/");

  await divider(page, "Idag").click();
  await expect(divider(page, "Idag")).toHaveAttribute("aria-expanded", "false");

  await item(page, "Mata katten").getByRole("button", { name: "Markera som klar" }).click();
  await expect(divider(page, "Imorgon")).toHaveCount(0);
  await expect(divider(page, "Idag")).toBeVisible();
});

test("with nothing to do there are no dividers, only the message", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/");
  await expect(page.getByText("Inget att göra just nu")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Idag|Försenade|Senare) \d/ })).toHaveCount(0);
});

test("a fold stays whatever filter is chosen", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.goto("/");

  await divider(page, "Idag").click();
  await page.getByRole("combobox", { name: "Filtrera på rum" }).selectOption({ label: "Kök" });
  await expect(divider(page, "Idag")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("combobox", { name: "Filtrera på rum" }).selectOption({ label: "Alla rum" });
  await expect(divider(page, "Idag")).toHaveAttribute("aria-expanded", "false");
});

test("in a browser that cannot remember, everything starts open and folding still works", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedBoard();
  await page.addInitScript(() => {
    const fail = () => {
      throw new Error("storage unavailable");
    };
    Object.defineProperty(window, "localStorage", { get: fail });
  });
  await page.goto("/");

  const idag = divider(page, "Idag");
  await expect(idag).toHaveAttribute("aria-expanded", "true");
  await idag.click();
  await expect(idag).toHaveAttribute("aria-expanded", "false");
  await expect(item(page, "Diska")).toBeHidden();
  await idag.click();
  await expect(item(page, "Diska")).toBeVisible();
});
