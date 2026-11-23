import type { Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { household, routine, routineTask } from "../src/db/schema";
import { db, logIn, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const todo = (page: Page) => page.getByRole("tabpanel");

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
  // Routine tasks have no date, so they are under Senare.
  await page.getByRole("tab", { name: /^Senare,/ }).click();
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

test("following Skapa en rutin scrolls Hemmet to Rutiner", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  // Enough rooms that Rutiner is below the fold on phone and desktop.
  await seedRooms(...Array.from({ length: 20 }, (_, i) => `Rum ${i + 1}`));
  await page.goto("/");
  await db.delete(routine);
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  await form.getByRole("link", { name: "Skapa en rutin" }).click();
  await expect(page.getByRole("heading", { name: "Rutiner" })).toBeInViewport();
});

test("a routine removed while the form is open is answered with a notice and nothing is added", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  await form.getByRole("combobox", { name: "Rutin" }).selectOption({ label: "Städa kök" });
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Badrum" });

  // Only the chosen one: a live refresh may or may not have arrived, the form stays filled in either way.
  await db.delete(routine).where(eq(routine.name, "Städa kök"));
  await form.getByRole("button", { name: /^Lägg till/ }).click();
  await expect(page.getByText("Rutinen finns inte längre")).toBeVisible();
  await expect(form).toBeVisible();
  await expect(form.getByRole("combobox", { name: "Rum" })).not.toHaveValue("");
});

/** Tells the open browsers something changed, as an action by another adult would. */
const notifyOthers = async () => {
  const [home] = await db.select({ id: household.id }).from(household);
  await db.execute(sql`select pg_notify('hemmafix_tasks', ${home!.id})`);
};

test("a routine without tasks says so and cannot be added", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  await page.goto("/");
  await db.insert(routine).values({ householdId: (await db.select().from(household))[0]!.id, name: "Ny och tom" });
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  await form.getByRole("combobox", { name: "Rutin" }).selectOption({ label: "Ny och tom" });
  await expect(form.getByText("Ny och tom har inga uppgifter ännu.")).toBeVisible();
  await expect(form.getByRole("button", { name: /^Lägg till/ })).toHaveText("Lägg till");
  await expect(form.getByRole("button", { name: /^Lägg till/ })).toBeDisabled();
});

test("the routine list follows another adult's changes live", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  const form = await openForm(page);
  await form.getByText("En rutin", { exact: true }).click();
  const choice = form.getByRole("combobox", { name: "Rutin" });
  await choice.selectOption({ label: "Städa sovrum" });
  await expect(form.getByRole("list", { name: "Uppgifter i rutinen" }).getByRole("listitem")).toHaveCount(4);

  // A task is removed from the chosen routine: the list and the button count follow.
  await db.delete(routineTask).where(eq(routineTask.title, "Byta lakan"));
  await notifyOthers();
  await expect(form.getByRole("list", { name: "Uppgifter i rutinen" }).getByRole("listitem")).toHaveCount(3);
  await expect(form.getByRole("button", { name: /^Lägg till/ })).toHaveText("Lägg till 3 uppgifter");

  // The chosen routine is removed: back to "Välj rutin", the button stays pressable so the server answers.
  await db.delete(routine).where(eq(routine.name, "Städa sovrum"));
  await notifyOthers();
  await expect(choice.locator("option")).toHaveCount(3);
  await expect(form.getByRole("button", { name: /^Lägg till/ })).toHaveText("Lägg till");
  await expect(form.getByRole("button", { name: /^Lägg till/ })).toBeEnabled();

  // The last ones go: the form points to Hemmet.
  await db.delete(routine);
  await notifyOthers();
  await expect(form.getByText("Inga rutiner ännu.")).toBeVisible();
});

test("the switch is changed with the arrow keys and keeps focus", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  const form = await openForm(page);
  const oneTask = form.getByRole("radio", { name: "En uppgift" });
  await oneTask.focus();
  await page.keyboard.press("ArrowRight");
  const routineRadio = form.getByRole("radio", { name: "En rutin" });
  await expect(routineRadio).toBeChecked();
  await expect(routineRadio).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(oneTask).toBeChecked();
  await expect(oneTask).toBeFocused();
});

test("a child does not get the form", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Ny uppgift" })).toHaveCount(0);
});
