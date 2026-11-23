import type { Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { chore, household, room } from "../src/db/schema";
import { formatDue, todayIso } from "../src/lib/dates";
import { E2E_BASE_URL } from "./support/env";
import { db, logIn, seedChore, seedRooms } from "./support/family";
import { chooseFromMenu } from "./support/menu";
import { expect, test } from "./support/test";

const item = (page: Page, title: string) =>
  page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: title });

test("an adult edits a task's title, room, how often and next date", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: todayIso() });
  await page.goto("/");

  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ändra" }).click();
  const form = page.getByRole("form", { name: "Ändra Diska" });
  await form.getByRole("textbox", { name: "Titel" }).fill("Torka handfatet");
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Badrum" });
  await form.getByRole("spinbutton", { name: "Antal" }).fill("3");
  await form.getByRole("combobox", { name: "Enhet" }).selectOption("day");
  await form.getByLabel("Nästa gång").fill("2030-06-01");
  await form.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("Uppgiften är ändrad")).toBeVisible();

  // The new date is far off, so the task moved to Senare.
  await page.getByRole("tab", { name: /^Senare,/ }).click();
  const edited = item(page, "Torka handfatet");
  await expect(edited).toContainText("Badrum");
  await expect(edited).not.toContainText("Var 3:e dag");
  await expect(edited).toContainText(formatDue("2030-06-01", todayIso())!.label);
  // How often it recurs is no longer on the row; it is still in Ändra.
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Senare,/ })).toHaveAttribute("aria-selected", "true");
  await item(page, "Torka handfatet").getByRole("button", { name: "Mer" }).click();
  await item(page, "Torka handfatet").getByRole("button", { name: "Ändra" }).click();
  await expect(page.getByRole("form", { name: "Ändra Torka handfatet" }).getByRole("spinbutton", { name: "Antal" })).toHaveValue("3");
});

test("a task ticked off before an edit keeps its old name in the history", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: todayIso() });
  await page.goto("/");

  await item(page, "Diska").getByRole("button", { name: "Markera som klar" }).click();
  // The next time is on the list, under Senare; rename the task from there.
  await page.getByRole("tab", { name: /^Senare,/ }).click();
  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ändra" }).click();
  await page.getByRole("form", { name: "Ändra Diska" }).getByRole("textbox", { name: "Titel" }).fill("Handdiska");
  await page.getByRole("form", { name: "Ändra Diska" }).getByRole("button", { name: "Spara" }).click();
  await expect(item(page, "Handdiska")).toBeVisible();

  await chooseFromMenu(page, "Gjort");
  await expect(page.getByRole("main").getByRole("listitem").locator("p.font-medium")).toHaveText(["Diska"]);
});

test("a child cannot edit tasks or rename rooms", async ({ context }) => {
  await logIn(context, "anna", "adult");
  const childContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const childPage = await childContext.newPage();
  await logIn(childContext, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id });

  await childPage.goto("/");
  await expect(item(childPage, "Diska")).toBeVisible();
  await expect(childPage.getByRole("button", { name: "Ändra" })).toHaveCount(0);
  await childPage.goto("/hemmet");
  await expect(childPage).toHaveURL(`${E2E_BASE_URL}/`);
  await childContext.close();
});

test("an adult renames a room, and tasks follow", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id });
  await page.goto("/hemmet");

  await page.getByRole("button", { name: "Byt namn på Kök" }).click();
  await page.getByRole("textbox", { name: "Nytt namn för Kök" }).fill("badrum");
  await page.getByRole("button", { name: "Spara namnet på Kök" }).click();
  await expect(page.getByText("Det rummet finns redan på våningen")).toBeVisible();

  await page.getByRole("textbox", { name: "Nytt namn för Kök" }).fill("Kokvrå");
  await page.getByRole("button", { name: "Spara namnet på Kök" }).click();
  await expect(page.getByRole("list", { name: "Rum" })).toContainText("Kokvrå");

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(item(page, "Diska")).toContainText("Kokvrå");
});

test("a room chosen in Ändra and removed elsewhere meanwhile has to be chosen again", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Badrum", "Kök", "Tvättstuga");
  const diska = await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: todayIso() });
  await page.goto("/");
  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ändra" }).click();
  const form = page.getByRole("form", { name: "Ändra Diska" });
  const roomSelect = form.getByRole("combobox", { name: "Rum" });
  await roomSelect.selectOption({ label: "Tvättstuga" });

  // Another adult removes Tvättstuga; the live refresh takes its option out of the open form.
  await db.delete(room).where(eq(room.id, rooms["Tvättstuga"]!.id));
  const [home] = await db.select({ id: household.id }).from(household);
  await db.execute(sql`select pg_notify('hemmafix_tasks', ${home!.id})`);
  await expect(roomSelect.locator("option", { hasText: "Tvättstuga" })).toHaveCount(0);

  // Not quietly another room: back to "Välj rum", and Spara does not save until one is picked.
  await expect(roomSelect).toHaveValue("");
  await form.getByRole("button", { name: "Spara" }).click();
  await expect(form).toBeVisible();
  await expect(page.getByText("Uppgiften är ändrad")).toHaveCount(0);
  const [saved] = await db.select({ roomId: chore.roomId }).from(chore).where(eq(chore.id, diska.id));
  expect(saved!.roomId).toBe(rooms["Kök"]!.id);

  await roomSelect.selectOption({ label: "Badrum" });
  await form.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("Uppgiften är ändrad")).toBeVisible();
  await expect(item(page, "Diska")).toContainText("Badrum");
});
