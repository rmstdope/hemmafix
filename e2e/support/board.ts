import type { Locator, Page } from "@playwright/test";

/** One of the filter panel's two selects ("Rum" or "Person"), opening the panel when it is closed. */
export async function filterSelect(page: Page, label: "Rum" | "Person"): Promise<Locator> {
  const select = page.getByRole("group", { name: "Filter" }).getByRole("combobox", { name: label });
  if (!(await select.isVisible())) await page.getByRole("button", { name: /^Filtrera/ }).click();
  return select;
}

/** What the Nu tab says once nothing in it is left to do; most specs wait for it as a sign the page has settled. */
export function nuEmpty(scope: Page | Locator): Locator {
  return scope.getByText("🎉 Allt i Nu är klart!");
}
