import type { Locator, Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { room } from "../src/db/schema";
import { todayIso } from "../src/lib/dates";
import { db, logIn, seedChore, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

// React resets a form submitted through `action` once the action settles, errors included. These
// pin that a refused save leaves each form showing what the family member typed and chose.

const item = (page: Page, title: string) =>
  page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: title });

/** The browser caps a field's length; lift the cap so the server's own check answers. */
const liftCap = (field: Locator) => field.evaluate((el) => el.removeAttribute("maxlength"));

async function openEdit(page: Page) {
  await page.goto("/");
  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ändra" }).click();
  return page.getByRole("form", { name: "Ändra Diska" });
}

async function changeEverything(form: Locator, title: string) {
  await form.getByRole("textbox", { name: "Titel" }).fill(title);
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Badrum" });
  await form.getByRole("combobox", { name: "Enhet" }).selectOption("day");
  await form.getByLabel("Nästa gång").fill("2030-06-01");
}

async function expectEverythingShown(form: Locator, title: string, badrumId: string) {
  // The form is reset when the action settles, as pending ends.
  await expect(form.getByRole("button", { name: "Spara" })).toBeEnabled();
  await expect(form.getByRole("textbox", { name: "Titel" })).toHaveValue(title);
  await expect(form.getByRole("combobox", { name: "Rum" })).toHaveValue(badrumId);
  await expect(form.getByRole("combobox", { name: "Enhet" })).toHaveValue("day");
  await expect(form.getByLabel("Nästa gång")).toHaveValue("2030-06-01");
}

test("an edit the server refuses leaves Ändra showing what was typed and chosen", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: todayIso() });
  const form = await openEdit(page);

  const long = "x".repeat(201);
  await liftCap(form.getByRole("textbox", { name: "Titel" }));
  await changeEverything(form, long);
  await form.getByRole("button", { name: "Spara" }).click();

  await expect(page.getByText("Max 200 tecken")).toBeVisible();
  await expect(form).toBeVisible();
  await expectEverythingShown(form, long, rooms["Badrum"]!.id);
});

test("an edit to a room removed meanwhile leaves Ändra showing what was typed and chosen", async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: todayIso() });
  // The server's refusal is what is pinned here, so no live refresh may reach this page: one that
  // lands before Spara takes the removed room out of Rum, which edit.spec.ts covers. A 204 makes
  // EventSource give up for good rather than reconnect.
  await page.route("**/api/events", (route) => route.fulfill({ status: 204 }));
  const form = await openEdit(page);
  await changeEverything(form, "Torka handfatet");

  await db.delete(room).where(eq(room.id, rooms["Badrum"]!.id));
  await form.getByRole("button", { name: "Spara" }).click();

  await expect(page.getByText("Rummet finns inte")).toBeVisible();
  await expect(form.getByRole("button", { name: "Spara" })).toBeEnabled();
  await expect(form.getByRole("textbox", { name: "Titel" })).toHaveValue("Torka handfatet");
  await expect(form.getByRole("combobox", { name: "Rum" })).toHaveValue(rooms["Badrum"]!.id);
  await expect(form.getByRole("combobox", { name: "Enhet" })).toHaveValue("day");
  await expect(form.getByLabel("Nästa gång")).toHaveValue("2030-06-01");
});

test("a home name the server refuses stays in the field", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/hemmet");

  const name = page.getByRole("textbox", { name: "Hemmets namn" });
  const long = "x".repeat(61);
  await liftCap(name);
  await name.fill(long);
  await page.getByRole("button", { name: "Spara", exact: true }).click();

  await expect(page.getByText("Max 60 tecken")).toBeVisible();
  await expect(page.getByRole("button", { name: "Spara", exact: true })).toBeEnabled();
  await expect(name).toHaveValue(long);
});

test("a room the server refuses stays in the add-room field, and a saved one clears it", async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/hemmet");
  const field = page.getByRole("textbox", { name: "Nytt rum" });

  await field.fill("kök");
  await page.getByRole("button", { name: "Lägg till rum" }).click();
  await expect(page.getByText("Det rummet finns redan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lägg till rum" })).toBeEnabled();
  await expect(field).toHaveValue("kök");

  await field.fill("Gästrum");
  await page.getByRole("button", { name: "Lägg till rum" }).click();
  await expect(page.getByRole("list", { name: "Rum" }).getByText("Gästrum")).toBeVisible();
  await expect(field).toHaveValue("");
});
