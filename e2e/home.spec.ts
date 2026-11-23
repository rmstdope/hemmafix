import { filterSelect } from "./support/board";
import type { Page } from "@playwright/test";
import { chooseFromMenu, menuItem } from "./support/menu";
import { expect, test } from "./support/test";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedChore, seedRooms } from "./support/family";

const openHome = async (page: Page) => {
  await page.goto("/");
  await chooseFromMenu(page, "Hemmet");
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
  await logIn(context, "anna", "adult");
  const childContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const childPage = await childContext.newPage();
  const bo = await logIn(childContext, "bo", "child");
  const rooms = await seedRooms("Sovrum", "Kök");
  await seedChore({ title: "Bädda sängen", roomId: rooms["Sovrum"]!.id, assigneeId: bo.id, recurrence: null });
  await seedChore({ title: "Mata katten", roomId: rooms["Kök"]!.id });

  await childPage.goto("/");
  const todo = childPage.getByRole("tabpanel");
  const task = todo.getByRole("listitem").filter({ hasText: "Bädda sängen" });
  await expect(task).toBeVisible();
  await expect(task.getByText("Jag")).toBeVisible();
  await expect(childPage.getByRole("button", { name: "Ny uppgift" })).toHaveCount(0);
  await expect(await menuItem(childPage, "Gjort")).toBeVisible();
  await expect(childPage.getByRole("menuitem", { name: "Hemmet" })).toHaveCount(0);
  await childPage.keyboard.press("Escape");
  await expect(childPage.getByRole("button", { name: "Mer" })).toHaveCount(0);
  await expect(childPage.getByRole("combobox", { name: "Tilldela den här gången" })).toHaveCount(0);
  // Children can filter too.
  await (await filterSelect(childPage, "Person")).selectOption({ label: "Mina" });
  await expect(todo.getByRole("listitem")).toHaveCount(1);

  await task.getByRole("button", { name: "Markera som klar" }).click();
  await expect(childPage.getByRole("tabpanel").getByText("Inga uppgifter här.")).toBeVisible();

  // A child may undo their own tick.
  await childPage.getByText(/Klart senaste veckan/).click();
  await childPage
    .getByRole("list", { name: "Klart" })
    .getByRole("listitem")
    .filter({ hasText: "Bädda sängen" })
    .getByRole("button", { name: "Ångra klar" })
    .click();
  await expect(task).toBeVisible();

  await childPage.goto("/hemmet");
  await expect(childPage).toHaveURL(`${E2E_BASE_URL}/`);
  await childContext.close();
});

test("among the recently done, a child sees only their own ticks", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const childContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const childPage = await childContext.newPage();
  await logIn(childContext, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });
  await seedChore({ title: "Damma", roomId: rooms["Kök"]!.id, recurrence: null });

  // Anna ticks one, Bo the other.
  await page.goto("/");
  await page.getByRole("button", { name: "Diska: markera som klar" }).click();
  await childPage.goto("/");
  await childPage.getByRole("button", { name: "Damma: markera som klar" }).click();
  await expect(childPage.getByText("Allt i Nu är klart!")).toBeVisible();

  await childPage.getByText(/Klart senaste veckan/).click();
  const recent = childPage.getByRole("list", { name: "Klart" });
  await expect(recent.getByRole("listitem")).toHaveCount(1);
  await expect(recent).toContainText("Damma");

  // The adult sees both, with who did each.
  await page.reload();
  await page.getByText(/Klart senaste veckan/).click();
  await expect(page.getByRole("list", { name: "Klart" }).getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Klart" })).toContainText("Klar av Bo");
  await childContext.close();
});

test("a room with tasks cannot be removed", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id });
  await openHome(page);

  await page.getByRole("button", { name: "Ta bort Kök" }).click();
  await expect(page.getByText("Rummet har uppgifter. Ta bort dem först.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Rum" }).getByText("Kök")).toBeVisible();
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
  await expect(boPage.getByText("Allt i Nu är klart!")).toBeVisible();
  await expect(boPage.getByRole("button", { name: "Ny uppgift" })).toHaveCount(0);

  await openHome(page);
  await page.getByRole("combobox", { name: "Roll för Bo Andersson" }).selectOption("Vuxen");
  await expect(page.getByText("Bo är nu vuxen")).toBeVisible();

  await expect(boPage.getByRole("button", { name: "Ny uppgift" })).toBeVisible();
  await expect(await menuItem(boPage, "Hemmet")).toBeVisible();
  await boPage.keyboard.press("Escape");
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
