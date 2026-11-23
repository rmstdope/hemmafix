import { chooseFromMenu, menuButton, menuItem } from "./support/menu";
import { logIn } from "./support/family";
import { expect, test } from "./support/test";

test("the corner is only the picture; an adult's menu holds name, role, Gjort, Hemmet and Logga ut", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  for (const name of ["Gjort", "Hemmet", "Logga ut"]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await menuButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Vuxen");
  await expect(menu.getByRole("menuitem")).toHaveText(["Gjort", "Hemmet", "Logga ut"]);
  for (const item of await menu.getByRole("menuitem").all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("a child's menu has no Hemmet", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/");
  await menuButton(page).click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Barn");
  await expect(menu.getByRole("menuitem")).toHaveText(["Gjort", "Logga ut"]);
});

test("Esc and a press outside close the menu; Esc gives focus back to the picture", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await menuButton(page).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
  await menuButton(page).click();
  await page.mouse.click(5, 300);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("the keyboard opens the menu on Gjort, moves with the arrows and activates with Enter", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await menuButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Gjort" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Hemmet" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
});

test("Logga ut logs out at once", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await chooseFromMenu(page, "Logga ut");
  await expect(page).toHaveURL(/\/login/);
});

test("on Gjort the menu is there and Gjort is the current page", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/gjort");
  if ((page.viewportSize()?.width ?? 0) < 640) return; // Phone Gjort has its own ← header and no picture.
  await expect(await menuItem(page, "Gjort")).toHaveAttribute("aria-current", "page");
});

test("the menu stays inside a 320px screen", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await menuButton(page).click();
  const box = (await page.getByRole("menu").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
});

test("choosing Gjort while on Gjort closes the menu, and Hemmet from Gjort still goes back to Listor", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  if ((page.viewportSize()?.width ?? 0) < 640) return; // Phone Gjort has no picture.
  await page.goto("/listor");
  await chooseFromMenu(page, "Gjort");
  await expect(page.getByRole("heading", { name: "Gjort" })).toBeVisible();
  await chooseFromMenu(page, "Gjort");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
});
