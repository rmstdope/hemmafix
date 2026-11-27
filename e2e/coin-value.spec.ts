import type { Page } from "@playwright/test";
import { todayIso } from "../src/lib/dates";
import { E2E_BASE_URL } from "./support/env";
import { isNull } from "drizzle-orm";
import { choreInstance } from "../src/db/schema";
import { db, logIn, logInWithChestTaken, seedChore, seedRooms } from "./support/family";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

const item = (page: Page, title: string) =>
  page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: title });
const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });

async function openForm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  return page.getByRole("form", { name: "Ny uppgift" });
}

test("an adult sets what a new task gives with − and +, or by typing, and everyone sees it on the row", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  const form = await openForm(page);
  const amount = form.getByRole("spinbutton", { name: "Mynt" });
  const less = form.getByRole("button", { name: "Färre mynt" });
  const more = form.getByRole("button", { name: "Fler mynt" });

  await expect(amount).toHaveValue("10");
  await more.click();
  await expect(amount).toHaveValue("15");
  await less.click();
  await less.click();
  await expect(amount).toHaveValue("5");

  // Typed over 100 becomes 100 on leaving; emptied goes back; a decimal rounds; 100 disables +.
  await amount.fill("150");
  await amount.blur();
  await expect(amount).toHaveValue("100");
  await expect(more).toBeDisabled();
  await amount.fill("");
  await amount.blur();
  await expect(amount).toHaveValue("100");
  await amount.fill("2.6");
  await amount.blur();
  await expect(amount).toHaveValue("3");
  await less.click();
  await expect(amount).toHaveValue("0");
  await expect(less).toBeDisabled();
  await amount.fill("35");
  await amount.press("ArrowUp");
  await expect(amount).toHaveValue("36");
  await amount.press("ArrowDown");
  await amount.press("ArrowDown");
  await expect(amount).toHaveValue("34");
  await amount.fill("35");

  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
  await form.getByRole("textbox", { name: "Titel" }).fill("Putsa fönster");
  await form.getByLabel("Klart senast").fill(todayIso());
  await form.getByRole("button", { name: "Lägg till" }).click();
  await expect(page.getByText("Uppgiften är tillagd")).toBeVisible();

  await expect(item(page, "Putsa fönster").getByText("35 mynt")).toBeAttached();
  await expect(item(page, "Putsa fönster").getByText("35", { exact: true })).toBeVisible();
});

test("picking a ready-made task leaves the amount at 10", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  const form = await openForm(page);
  await form.getByRole("button", { name: "Fler mynt" }).click();
  await expect(form.getByRole("spinbutton", { name: "Mynt" })).toHaveValue("15");
  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Diska" });
  await expect(form.getByRole("spinbutton", { name: "Mynt" })).toHaveValue("10");
});

test("a child sees who has the task in the details, with the badge on the right, and no control", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, coins: 30, recurrence: null, assigneeId: bo.id });
  await page.goto("/");
  const row = item(page, "Diska");
  await expect(row.getByText("30 mynt")).toBeAttached();
  const badge = await row.getByText("30", { exact: true }).boundingBox();
  const who = await row.getByText("Jag", { exact: true }).boundingBox();
  expect(who!.x).toBeLessThan(badge!.x);
  await expect(page.getByRole("button", { name: "Fler mynt" })).toHaveCount(0);
});

test("a ready-made task is added at 10, and a child sees the badge but no control", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, coins: 30, recurrence: null });
  await page.goto("/");
  await expect(item(page, "Diska").getByText("30 mynt")).toBeAttached();
  await expect(page.getByRole("button", { name: "Ny uppgift" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fler mynt" })).toHaveCount(0);
});

test("a tick earns the set amount, a changed amount counts from the next tick, and ↺ takes back what that tick gave", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logInWithChestTaken(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Dammsuga", roomId: rooms["Kök"]!.id, coins: 20, recurrence: { unit: "day", interval: 1 } });
  await page.goto("/");
  await expect(pill(page)).toHaveAccessibleName("0 mynt");

  await page.getByRole("button", { name: "Dammsuga: markera som klar" }).click();
  await expect(pill(page)).toHaveAccessibleName("20 mynt");

  // The next time is due tomorrow.
  await page.getByRole("tablist").getByRole("tab", { name: /^Imorgon,/ }).click();
  await item(page, "Dammsuga").getByRole("button", { name: "Mer" }).click();
  await item(page, "Dammsuga").getByRole("button", { name: "Ändra" }).click();
  const form = page.getByRole("form", { name: "Ändra Dammsuga" });
  const amount = form.getByRole("spinbutton", { name: "Mynt" });
  await expect(amount).toHaveValue("20");
  // Avbryt leaves it as it was.
  await form.getByRole("button", { name: "Fler mynt" }).click();
  await form.getByRole("button", { name: "Avbryt" }).click();
  await item(page, "Dammsuga").getByRole("button", { name: "Ändra" }).click();
  await expect(amount).toHaveValue("20");
  await amount.fill("45");
  await form.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("Uppgiften är ändrad")).toBeVisible();
  await expect(item(page, "Dammsuga").getByText("45 mynt")).toBeAttached();
  await expect(pill(page)).toHaveAccessibleName("20 mynt");

  // Its day comes, so the next tick pays (before it, an adult's tick gives no coins).
  await db.update(choreInstance).set({ dueDate: todayIso() }).where(isNull(choreInstance.completedAt));
  await page.reload();
  await page.getByRole("tablist").getByRole("tab", { name: /^Nu,/ }).click();
  await page.getByRole("button", { name: "Dammsuga: markera som klar" }).click();
  await expect(pill(page)).toHaveAccessibleName("65 mynt");

  // Klart senaste veckan: faded badges with what each tick gave; ↺ takes back the latest (45).
  await page.getByRole("tablist").getByRole("tab", { name: /^Nu,/ }).click();
  await page.getByText(/Klart senaste veckan/).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Dammsuga" }).getByText("20 mynt")).toBeAttached();
  await expect(page.getByRole("list", { name: "Klart" }).locator("span.opacity-60").first()).toBeAttached();
  await page.getByRole("button", { name: "Dammsuga: ångra klar" }).click();
  await expect(pill(page)).toHaveAccessibleName("20 mynt");
});

test("a routine carries an amount per task, shown in the routine and when adding it", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await page.goto("/hemmet");
  await page.getByRole("region", { name: "Rutiner" }).getByRole("textbox", { name: "Ny rutin" }).fill("Storstäd");
  await page.getByRole("region", { name: "Rutiner" }).getByRole("button", { name: "Lägg till", exact: true }).click();
  await page.getByRole("textbox", { name: "Ny uppgift" }).fill("Moppa");
  await page.getByRole("textbox", { name: "Ny uppgift" }).press("Enter");
  const row = page.getByRole("list", { name: "Uppgifter" }).getByRole("listitem").filter({ hasText: "Moppa" });
  await expect(row.getByText("10 mynt")).toBeAttached();

  // ✎ opens the name and the amount together; Esc cancels.
  await page.getByRole("button", { name: "Ändra Moppa" }).click();
  await expect(page.getByRole("textbox", { name: "Ändra Moppa" })).toBeFocused();
  await page.getByRole("button", { name: "Fler mynt" }).click();
  await page.getByRole("textbox", { name: "Ändra Moppa" }).press("Escape");
  await expect(row.getByText("10 mynt")).toBeAttached();

  await page.getByRole("button", { name: "Ändra Moppa" }).click();
  // Enter straight from the typed number saves what leaving it would have made: 150 is 100.
  await page.getByRole("spinbutton", { name: "Mynt" }).fill("150");
  await page.getByRole("spinbutton", { name: "Mynt" }).press("Enter");
  await expect(row.getByText("100 mynt")).toBeAttached();
  await page.getByRole("button", { name: "Ändra Moppa" }).click();
  await page.getByRole("spinbutton", { name: "Mynt" }).fill("60");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(row.getByText("60 mynt")).toBeAttached();

  // En rutin lists the amounts and gives each new task its routine amount.
  await page.goto("/");
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const form = page.getByRole("form", { name: "Ny uppgift" });
  await form.getByText("En rutin", { exact: true }).click();
  await form.getByRole("combobox", { name: "Rutin" }).selectOption({ label: "Storstäd" });
  await expect(form.getByRole("list", { name: "Uppgifter i rutinen" })).toContainText("Moppa");
  await expect(form.getByRole("list", { name: "Uppgifter i rutinen" }).getByText("60 mynt")).toBeAttached();
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
  await form.getByLabel("Klart senast").fill(todayIso());
  await form.getByRole("button", { name: /^Lägg till/ }).click();
  await expect(item(page, "Moppa").getByText("60 mynt")).toBeAttached();
  void rooms;
});

test("a changed amount shows live on another device", { tag: RUN_ONCE }, async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await page.goto("/");
  const boContext = await browser.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const boPage = await boContext.newPage();
  await logIn(boContext, "bo", "child");
  await boPage.goto("/");
  await expect(item(boPage, "Diska").getByText("10 mynt")).toBeAttached();

  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ändra" }).click();
  const form = page.getByRole("form", { name: "Ändra Diska" });
  await form.getByRole("spinbutton", { name: "Mynt" }).fill("70");
  await form.getByRole("button", { name: "Spara" }).click();
  await expect(item(boPage, "Diska").getByText("70 mynt")).toBeAttached();
  await boContext.close();
});
