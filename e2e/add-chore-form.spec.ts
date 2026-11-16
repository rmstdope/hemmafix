import type { Locator, Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { routine } from "../src/db/schema";
import { db, logIn, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

async function openForm(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  return page.getByRole("form", { name: "Ny uppgift" });
}

/** The second room, a unit other than the first, and a person: none of them a select's first option. */
async function chooseNonDefaults(form: Locator, me: string) {
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
  // The unit only exists for a recurring task, and a new one starts as a one-off.
  await form.getByText("Återkommande", { exact: true }).click();
  await form.getByRole("combobox", { name: "Enhet" }).selectOption({ label: "vecka" });
  await form.getByRole("combobox", { name: "Vem" }).selectOption({ label: `${me} (jag)` });
}

/** What each select shows once the save has settled, read from the page rather than from React's draft. */
async function expectChosenShown(form: Locator, me: string) {
  // The notice comes from inside the action; the form is reset when it settles, as pending ends.
  await expect(form.getByRole("button", { name: /^Lägg till/ })).toBeEnabled();
  for (const [name, label] of [
    ["Rum", "Kök"],
    ["Enhet", "vecka"],
    ["Vem", `${me} (jag)`],
  ] as const) {
    await expect(form.getByRole("combobox", { name })).toHaveValue(
      await form.getByRole("combobox", { name }).getByRole("option", { name: label, exact: true }).getAttribute("value") ?? "",
    );
  }
}

test("a task the server refuses leaves the form showing what was chosen", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedRooms("Badrum", "Kök");
  const form = await openForm(page);

  // The browser caps the title at 200; lift the cap so the server's own check answers.
  const title = form.getByRole("textbox", { name: "Titel" });
  await title.evaluate((el) => el.removeAttribute("maxlength"));
  await title.fill("x".repeat(201));
  await chooseNonDefaults(form, anna.name);
  await form.getByRole("button", { name: "Lägg till" }).click();

  await expect(page.getByText("Max 200 tecken")).toBeVisible();
  await expect(form).toBeVisible();
  await expectChosenShown(form, anna.name);
});

test("a routine removed before the save leaves the form showing what was chosen", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedRooms("Badrum", "Kök");
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  await form.getByRole("combobox", { name: "Rutin" }).selectOption({ label: "Städa kök" });
  await chooseNonDefaults(form, anna.name);

  await db.delete(routine).where(eq(routine.name, "Städa kök"));
  await form.getByRole("button", { name: /^Lägg till/ }).click();

  await expect(page.getByText("Rutinen finns inte längre")).toBeVisible();
  await expect(form).toBeVisible();
  await expectChosenShown(form, anna.name);
});
