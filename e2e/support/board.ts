import type { Locator, Page } from "@playwright/test";

/** One of the filter panel's two selects ("Rum" or "Person"), opening the panel when it is closed. */
export async function filterSelect(page: Page, label: "Rum" | "Person"): Promise<Locator> {
  const select = page.getByRole("group", { name: "Filter" }).getByRole("combobox", { name: label });
  if (!(await select.isVisible())) await page.getByRole("button", { name: /^Filtrera/ }).click();
  return select;
}
