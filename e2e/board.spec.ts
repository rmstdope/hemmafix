import { expect, test } from "@playwright/test";
import { E2E_BASE_URL } from "./support/env";
import { closeDatabase, logIn, resetDatabase } from "./support/family";

test.beforeEach(async () => {
  await resetDatabase();
});
test.afterAll(async () => {
  await closeDatabase();
});

test("a visitor who is not logged in is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Logga in med Google" })).toBeVisible();
});

test("a member adds a task, ticks it off and can undo it", async ({ page, context }) => {
  await logIn(context, "anna", "admin");
  await page.goto("/");
  await expect(page.getByText("Inget att göra just nu")).toBeVisible();

  await page.getByRole("textbox", { name: "Ny uppgift" }).fill("Dammsuga vardagsrummet");
  await page.getByRole("button", { name: "Lägg till" }).click();
  const task = page.getByRole("listitem").filter({ hasText: "Dammsuga vardagsrummet" });
  await expect(task).toBeVisible();

  await task.getByRole("button", { name: "Markera som klar" }).click();
  await expect(page.getByText("Inget att göra just nu")).toBeVisible();

  await page.getByText(/Klart senaste veckan/).click();
  await task.getByRole("button", { name: "Ångra klar" }).click();
  await expect(task.getByRole("button", { name: "Markera som klar" })).toBeVisible();
});

test("the 'Mina' filter shows only the current member's tasks", async ({ page, context }) => {
  await logIn(context, "anna", "admin");
  await page.goto("/");
  const title = page.getByRole("textbox", { name: "Ny uppgift" });

  await title.fill("Ingens uppgift");
  await page.getByRole("button", { name: "Lägg till" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Ingens uppgift" })).toBeVisible();

  await page.getByRole("button", { name: "Fler val" }).click();
  await page.getByRole("combobox", { name: "Vem" }).selectOption({ label: "Anna Andersson (jag)" });
  await title.fill("Annas uppgift");
  await page.getByRole("button", { name: "Lägg till" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Annas uppgift" })).toBeVisible();

  await page.getByRole("link", { name: "Mina" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Annas uppgift" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ingens uppgift" })).toHaveCount(0);
});

test("a change on one device shows up on another without reloading", async ({ page, context, browser }) => {
  await logIn(context, "anna", "admin");
  // A second device: a context of its own, with its own session.
  const boContext = await browser.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const boPage = await boContext.newPage();
  await logIn(boContext, "bo");

  await boPage.goto("/");
  await expect(boPage.getByText("Inget att göra just nu")).toBeVisible();

  await page.goto("/");
  await page.getByRole("textbox", { name: "Ny uppgift" }).fill("Tömma diskmaskinen");
  await page.getByRole("button", { name: "Lägg till" }).click();

  await expect(boPage.getByRole("listitem").filter({ hasText: "Tömma diskmaskinen" })).toBeVisible();
  await boContext.close();
});
