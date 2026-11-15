import type { Page } from "@playwright/test";
import { floors, logIn, seedChore, seedFloor, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const openHome = async (page: Page) => {
  await page.goto("/hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
};
const floorSection = (page: Page, label: string) => page.getByRole("region", { name: label, exact: true });
const floorHeadings = (page: Page) => page.getByRole("heading", { level: 3 });

test("a home with one floor shows no floors until a second is added", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök", "Badrum");
  await openHome(page);
  await expect(page.getByRole("heading", { name: "Rum", exact: true })).toBeVisible();
  await expect(floorHeadings(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Lägg till våning" }).click();
  await expect(page.getByRole("heading", { name: "Våningar och rum" })).toBeVisible();
  // The new floor goes on top; the existing rooms are on floor 1.
  await expect(floorHeadings(page)).toHaveText(["Plan 2", "Plan 1"]);
  await expect(floorSection(page, "Plan 1").getByRole("list", { name: "Rum på Plan 1" })).toContainText("Kök");
  await expect(floorSection(page, "Plan 2")).toContainText("Inga rum på Plan 2 ännu.");
});

test("an adult names, orders and removes floors, with a bathroom on each", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum");
  await seedFloor("2");
  await openHome(page);

  // Badrum on floor 2 as well, but not twice on the same floor.
  const upstairs = floorSection(page, "Plan 2");
  await upstairs.getByRole("textbox", { name: "Nytt rum på Plan 2" }).fill("Badrum");
  await upstairs.getByRole("button", { name: "Lägg till rum på Plan 2" }).click();
  await expect(upstairs.getByRole("list", { name: "Rum på Plan 2" })).toContainText("Badrum");
  await upstairs.getByRole("textbox", { name: "Nytt rum på Plan 2" }).fill("badrum");
  await upstairs.getByRole("button", { name: "Lägg till rum på Plan 2" }).click();
  await expect(page.getByText("Det rummet finns redan på våningen")).toBeVisible();

  // A basement: added on top, renamed, moved below floor 1.
  await page.getByRole("button", { name: "Lägg till våning" }).click();
  await expect(floorHeadings(page)).toHaveText(["Plan 3", "Plan 2", "Plan 1"]);
  await page.getByRole("button", { name: "Byt namn på Plan 3" }).click();
  await page.getByRole("textbox", { name: "Nytt namn för Plan 3" }).fill("Suterräng");
  await page.getByRole("button", { name: "Spara namnet på Plan 3" }).click();
  await expect(floorHeadings(page)).toHaveText(["Suterräng", "Plan 2", "Plan 1"]);
  await page.getByRole("button", { name: "Flytta Suterräng ner en våning" }).click();
  await expect(floorHeadings(page)).toHaveText(["Plan 2", "Suterräng", "Plan 1"]);
  await page.getByRole("button", { name: "Flytta Suterräng ner en våning" }).click();
  await expect(floorHeadings(page)).toHaveText(["Plan 2", "Plan 1", "Suterräng"]);
  await expect(page.getByRole("button", { name: "Flytta Suterräng ner en våning" })).toBeDisabled();

  // A floor with rooms stays; an empty one can go.
  await page.getByRole("button", { name: "Ta bort Plan 2" }).click();
  await expect(page.getByText("Våningen har rum. Ta bort dem först.")).toBeVisible();
  await page.getByRole("button", { name: "Ta bort Suterräng" }).click();
  await expect(floorHeadings(page)).toHaveText(["Plan 2", "Plan 1"]);
});

test("with several floors, tasks show their floor and can be filtered on a whole floor", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const ground = await seedRooms("Badrum", "Kök");
  const upstairs = await seedFloor("2");
  const upper = await seedRooms("Badrum", { floorId: upstairs.id });
  await seedChore({ title: "Toa nere", roomId: ground["Badrum"]!.id });
  await seedChore({ title: "Toa uppe", roomId: upper["Badrum"]!.id });
  await seedChore({ title: "Diska", roomId: ground["Kök"]!.id });
  await page.goto("/");
  const todo = page.getByRole("list", { name: "Att göra" });
  const titles = () => todo.getByRole("listitem").locator("p.font-medium");

  await expect(todo.getByRole("listitem").filter({ hasText: "Toa uppe" })).toContainText("Badrum · Plan 2");
  await expect(todo.getByRole("listitem").filter({ hasText: "Toa nere" })).toContainText("Badrum · Plan 1");

  const place = page.getByRole("combobox", { name: "Filtrera på rum" });
  await place.selectOption({ label: "Hela plan 1" });
  await expect(titles()).toHaveText(["Toa nere", "Diska"]);
  await place.selectOption(`room:${upper["Badrum"]!.id}`);
  await expect(titles()).toHaveText(["Toa uppe"]);
  await page.reload();
  await expect(titles()).toHaveText(["Toa uppe"]);
});

test("a template leaves the room to the person when the home has two of that room", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Badrum", "Kök");
  const upstairs = await seedFloor("2");
  const upper = await seedRooms("Badrum", { floorId: upstairs.id });
  await page.goto("/");

  await page.getByRole("button", { name: "Ny uppgift" }).click();
  const form = page.getByRole("form", { name: "Ny uppgift" });
  const room = form.getByRole("combobox", { name: "Rum" });
  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Städa toaletten" });
  await expect(room).toHaveValue("");
  // A unique room is still filled in.
  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Diska" });
  await expect(room.locator("option:checked")).toHaveText("Kök (Plan 1)");

  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Städa toaletten" });
  await room.selectOption(upper["Badrum"]!.id);
  await form.getByRole("button", { name: "Lägg till" }).click();
  await expect(page.getByRole("list", { name: "Att göra" })).toContainText("Badrum · Plan 2");
});

test("a home with one floor shows rooms without a floor", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id });
  expect(await floors()).toHaveLength(1);
  await page.goto("/");
  const row = page.getByRole("list", { name: "Att göra" }).getByRole("listitem").filter({ hasText: "Diska" });
  await expect(row).toContainText("Kök");
  await expect(row).not.toContainText("Plan");
});
