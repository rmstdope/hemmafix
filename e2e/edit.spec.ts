import type { Page } from "@playwright/test";
import { formatDue, todayIso } from "../src/lib/dates";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedChore, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const item = (page: Page, title: string) =>
  page.getByRole("list", { name: "Att göra" }).getByRole("listitem").filter({ hasText: title });

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

  const edited = item(page, "Torka handfatet");
  await expect(edited).toContainText("Badrum");
  await expect(edited).toContainText("Var 3:e dag");
  await expect(edited).toContainText(formatDue("2030-06-01", todayIso())!.label);
  await page.reload();
  await expect(item(page, "Torka handfatet")).toContainText("Var 3:e dag");
});

test("a task ticked off before an edit keeps its old name in the history", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: todayIso() });
  await page.goto("/");

  await item(page, "Diska").getByRole("button", { name: "Markera som klar" }).click();
  // The next time is on the list; rename the task from there.
  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ändra" }).click();
  await page.getByRole("form", { name: "Ändra Diska" }).getByRole("textbox", { name: "Titel" }).fill("Handdiska");
  await page.getByRole("form", { name: "Ändra Diska" }).getByRole("button", { name: "Spara" }).click();
  await expect(item(page, "Handdiska")).toBeVisible();

  await page.getByRole("link", { name: "Gjort" }).click();
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
