import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { E2E_BASE_URL } from "./support/env";
import { db, logIn } from "./support/family";
import * as schema from "../src/db/schema";

const openHome = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Hemmet" }).click();
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
};

test("an adult renames the home", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);

  await page.getByRole("textbox", { name: "Hemmets namn" }).fill("Villa Kulla");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("Namnet är sparat")).toBeVisible();

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByText("Villa Kulla")).toBeVisible();
});

test("an adult adds rooms, typed or suggested, and removes one", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);
  const rooms = page.getByRole("list", { name: "Rum" });

  await page.getByRole("textbox", { name: "Nytt rum" }).fill("Gästrum");
  await page.getByRole("button", { name: "Lägg till rum" }).click();
  await expect(rooms.getByText("Gästrum")).toBeVisible();

  await page.getByRole("button", { name: "+ Kök" }).click();
  await expect(rooms.getByText("Kök")).toBeVisible();
  // A suggestion disappears once the room exists.
  await expect(page.getByRole("button", { name: "+ Kök" })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Nytt rum" }).fill("kök");
  await page.getByRole("button", { name: "Lägg till rum" }).click();
  await expect(page.getByText("Det rummet finns redan")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort Gästrum" }).click();
  await expect(rooms.getByText("Gästrum")).toHaveCount(0);
  await expect(rooms.getByRole("listitem")).toHaveCount(1);
});

test("a child sees the tasks and ticks them off, but cannot manage anything", async ({ context }) => {
  const anna = await logIn(context, "anna", "adult");
  const childContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const childPage = await childContext.newPage();
  const bo = await logIn(childContext, "bo", "child");
  const [home] = await db.select().from(schema.household);
  await db.insert(schema.task).values([
    { householdId: home!.id, title: "Bädda sängen", assigneeId: bo.id, createdById: anna.id },
    { householdId: home!.id, title: "Mata katten", createdById: anna.id },
  ]);

  await childPage.goto("/");
  const task = childPage.getByRole("listitem").filter({ hasText: "Bädda sängen" });
  await expect(task).toBeVisible();
  await expect(task.getByText("Jag")).toBeVisible();
  await expect(childPage.getByRole("textbox", { name: "Ny uppgift" })).toHaveCount(0);
  await expect(childPage.getByRole("link", { name: "Hemmet" })).toHaveCount(0);
  await expect(childPage.getByRole("button", { name: "Ta bort" })).toHaveCount(0);
  await expect(childPage.getByRole("combobox", { name: "Tilldela" })).toHaveCount(0);

  await task.getByRole("button", { name: "Markera som klar" }).click();
  await expect(childPage.getByRole("listitem").filter({ hasText: "Bädda sängen" })).toHaveCount(0);

  await childPage.goto("/hemmet");
  await expect(childPage).toHaveURL(`${E2E_BASE_URL}/`);
  await childContext.close();
});

test("an adult makes a child an adult, which takes effect on the child's device at once", async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  const boContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const boPage = await boContext.newPage();
  await logIn(boContext, "bo", "child");
  await boPage.goto("/");
  await expect(boPage.getByText("Inget att göra just nu")).toBeVisible();
  await expect(boPage.getByRole("textbox", { name: "Ny uppgift" })).toHaveCount(0);

  await openHome(page);
  await page.getByRole("combobox", { name: "Roll för Bo Andersson" }).selectOption("Vuxen");
  await expect(page.getByText("Bo är nu vuxen")).toBeVisible();

  await expect(boPage.getByRole("textbox", { name: "Ny uppgift" })).toBeVisible();
  await expect(boPage.getByRole("link", { name: "Hemmet" })).toBeVisible();
  await boContext.close();
});

test("the only adult cannot make themself a child", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);
  const role = page.getByRole("combobox", { name: "Roll för Anna Andersson" });

  await role.selectOption("Barn");
  await expect(page.getByText("Hemmet måste ha minst en vuxen")).toBeVisible();
  await expect(role).toHaveValue("adult");
});
