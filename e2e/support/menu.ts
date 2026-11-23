import type { Locator, Page } from "@playwright/test";

/** The picture in the corner that opens the menu (the visible one: phone header or desktop strip). */
export const menuButton = (page: Page): Locator => page.getByRole("button", { name: "Meny" });

/** Opens the menu and returns one of its items. */
export async function menuItem(page: Page, name: "Gjort" | "Hemmet" | "Logga ut"): Promise<Locator> {
  const button = menuButton(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  return page.getByRole("menuitem", { name });
}

/** Opens the menu and chooses an item. */
export async function chooseFromMenu(page: Page, name: "Gjort" | "Hemmet" | "Logga ut") {
  await (await menuItem(page, name)).click();
}
