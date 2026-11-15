import type { Page } from "@playwright/test";
import { routine } from "../src/db/schema";
import { db, logIn, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const todo = (page: Page) => page.getByRole("list", { name: "Att göra" });

async function openForm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  return page.getByRole("form", { name: "Ny uppgift" });
}

test("an adult adds a whole routine to a room as separate tasks", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedRooms("Badrum", "Kök");
  const form = await openForm(page);

  // The form always opens on one task.
  await expect(form.getByRole("radio", { name: "En uppgift" })).toBeChecked();
  await form.getByText("En rutin", { exact: true }).click();
  await expect(form.getByRole("textbox", { name: "Titel" })).toHaveCount(0);

  // Nothing chosen: plain button that cannot be pressed.
  const add = form.getByRole("button", { name: /^Lägg till/ });
  await expect(add).toHaveText("Lägg till");
  await expect(add).toBeDisabled();

  await form.getByRole("combobox", { name: "Rutin" }).selectOption({ label: "Städa badrum" });
  await expect(form.getByRole("list", { name: "Uppgifter i rutinen" }).getByRole("listitem")).toHaveCount(5);
  await expect(add).toHaveText("Lägg till 5 uppgifter");
  // No room is preselected from the routine.
  await expect(form.getByRole("combobox", { name: "Rum" })).toHaveValue("");
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Badrum" });
  await form.getByRole("combobox", { name: "Vem" }).selectOption({ label: `${anna.name} (jag)` });
  await add.click();

  await expect(page.getByText("5 uppgifter är tillagda")).toBeVisible();
  await expect(page.getByRole("form", { name: "Ny uppgift" })).toHaveCount(0);
  await expect(todo(page).getByRole("listitem")).toHaveCount(5);
  await expect(todo(page).getByRole("listitem").first()).toContainText("Badrum");

  // Next time it opens empty, on one task.
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  await expect(page.getByRole("radio", { name: "En uppgift" })).toBeChecked();
});

test("flipping the switch keeps what was filled in, and the titles as they were left", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  const form = await openForm(page);

  await form.getByRole("textbox", { name: "Titel" }).fill("Egen sak");
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Badrum" });
  await form.getByText("En gång", { exact: true }).click();
  await form.getByText("En rutin", { exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Rum" })).toHaveValue(/.+/);
  await expect(form.getByRole("radio", { name: "En gång" })).toBeChecked();
  await form.getByText("En uppgift", { exact: true }).click();
  await expect(form.getByRole("textbox", { name: "Titel" })).toHaveValue("Egen sak");
});

test("a home without routines points to Hemmet", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  await page.goto("/");
  await db.delete(routine);
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  await expect(form.getByText("Inga rutiner ännu.")).toBeVisible();
  await form.getByRole("link", { name: "Skapa en rutin" }).click();
  await expect(page).toHaveURL(/\/hemmet#routines-heading$/);
});

test("a routine removed while the form is open is answered with a notice and nothing is added", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  await form.getByRole("combobox", { name: "Rutin" }).selectOption({ label: "Städa kök" });
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Badrum" });

  await db.delete(routine);
  await form.getByRole("button", { name: /^Lägg till/ }).click();
  await expect(page.getByText("Rutinen finns inte längre")).toBeVisible();
  await expect(form).toBeVisible();
  await expect(form.getByRole("combobox", { name: "Rum" })).not.toHaveValue("");
});

test("a child does not get the form", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Ny uppgift" })).toHaveCount(0);
});
