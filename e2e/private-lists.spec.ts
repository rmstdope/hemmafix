import type { Browser, Page } from "@playwright/test";
import { E2E_BASE_URL } from "./support/env";
import { addMember, logIn, seedList } from "./support/family";
import { wear } from "./support/sky";
import { expect, test } from "./support/test";

const rows = (page: Page) => page.getByRole("list", { name: "Listor" }).getByRole("listitem");
const heading = (page: Page, name: string) => page.getByRole("heading", { name, level: 1 });
const privacy = (page: Page) => page.getByTestId("list-privacy");
const change = (page: Page) => page.getByRole("button", { name: "Ändra", exact: true });
const newList = (page: Page) => page.getByRole("button", { name: "Ny lista", exact: true });
const toggle = (page: Page) => page.getByRole("switch", { name: "Privat lista" });
const chip = (page: Page, name: string) => page.getByRole("dialog").getByRole("button", { name, exact: true });
const save = (page: Page) => page.getByRole("dialog").getByRole("button", { name: "Spara" });
const sheet = (page: Page) => page.getByRole("dialog", { name: "Vem ser listan?" });
const gone = (page: Page, name: string) => page.getByText(`${name} delas inte längre med dig.`);

/** Opens a page and waits for React to take it over: a click before that does nothing. */
async function go(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
}

/** Bo, a child, on a screen of his own. */
async function boScreen(browser: Browser) {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const user = await logIn(context, "bo", "child");
  return { context, user, page: await context.newPage() };
}

test("a private list is made with the people picked, who see it and say so", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  await addMember("Sara Andersson");
  const bo = await boScreen(browser);

  await go(page, "/listor");
  await newList(page).click();
  const dialog = page.getByRole("dialog", { name: "Ny lista" });
  await expect(dialog.getByRole("textbox", { name: "Namn" })).toBeFocused();
  await expect(toggle(page)).not.toBeChecked();
  await expect(dialog.getByText("Alla i hemmet ser listan.")).toBeVisible();
  await expect(chip(page, "Bo")).toHaveCount(0);
  await toggle(page).press("Space");
  await expect(dialog.getByText("Bara du ser listan. Dela med:")).toBeVisible();
  // Everyone else, A–Ö, none chosen; a chip is a toggle that works from the keyboard.
  await expect(dialog.getByRole("group").getByRole("button")).toHaveText([/Bo$/, /Sara$/]);
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "false");
  await chip(page, "Bo").press("Enter");
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "true");
  await chip(page, "Sara").press("Space");
  await chip(page, "Sara").press("Space");
  await expect(chip(page, "Sara")).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("textbox", { name: "Namn" }).fill("Julklappar");
  await dialog.getByRole("textbox", { name: "Namn" }).press("Enter");

  await expect(heading(page, "Julklappar")).toBeVisible();
  await expect(privacy(page)).toHaveText("Privat · du och Bo");
  await expect(change(page)).toBeVisible();

  await go(bo.page, "/listor");
  await expect(rows(bo.page)).toHaveText([/Julklappar\s*Privat · Anna och du\s*Tom/]);
  await rows(bo.page).getByRole("link").click();
  await expect(privacy(bo.page)).toHaveText("Privat · Anna och du");
  await expect(change(bo.page)).toHaveCount(0);
  await bo.page.getByRole("button", { name: "Mer för Julklappar" }).click();
  await expect(bo.page.getByRole("menuitem", { name: "Byt namn" })).toBeVisible();
  await expect(bo.page.getByRole("menuitem", { name: "Ta bort lista" })).toHaveCount(0);
  await bo.context.close();
});

test("sharing, stopping and making public show up at once, and a lost list sends its reader to Listor", async ({
  page,
  context,
  browser,
}) => {
  const anna = await logIn(context, "anna", "adult");
  const bo = await boScreen(browser);
  const list = await seedList("Kalaset", [], undefined, { creatorId: anna.id, isPrivate: true });
  await seedList("Handla");

  await go(bo.page, "/listor");
  await expect(rows(bo.page)).toHaveText([/^Handla/]);
  // A list he never saw tells him nothing, not even its name.
  await go(page, `/listor/${list.id}`);
  await bo.page.goto(`/listor/${list.id}`);
  await expect(bo.page.getByText("Listan finns inte längre.")).toBeVisible();
  await expect(bo.page.getByText("Kalaset")).toHaveCount(0);
  await go(bo.page, "/listor");

  await expect(privacy(page)).toHaveText("Privat · bara du");
  await change(page).click();
  await expect(toggle(page)).toBeChecked();
  await expect(toggle(page)).toBeFocused();
  await chip(page, "Bo").click();
  await save(page).click();
  await expect(sheet(page)).toBeHidden();
  await expect(change(page)).toBeFocused();
  await expect(privacy(page)).toHaveText("Privat · du och Bo");
  await expect(rows(bo.page)).toHaveText([/^Handla/, /^Kalaset\s*Privat · Anna och du/]);

  // Closing without Spara changes nothing.
  await change(page).click();
  await expect(chip(page, "Bo")).toHaveAttribute("aria-pressed", "true");
  await chip(page, "Bo").click();
  await page.keyboard.press("Escape");
  await expect(change(page)).toBeFocused();
  await expect(privacy(page)).toHaveText("Privat · du och Bo");

  // Taken back while he reads it: he is back in Listor, told why.
  await rows(bo.page).getByRole("link", { name: /Kalaset/ }).click();
  await expect(heading(bo.page, "Kalaset")).toBeVisible();
  await change(page).click();
  await chip(page, "Bo").click();
  await save(page).click();
  await expect(bo.page).toHaveURL(/\/listor$/);
  await expect(gone(bo.page, "Kalaset")).toBeVisible();
  await expect(rows(bo.page)).toHaveText([/^Handla/]);
  // Going back does not bring it up again.
  await bo.page.goBack();
  await expect(rows(bo.page)).toHaveText([/^Handla/]);
  await expect(heading(bo.page, "Kalaset")).toHaveCount(0);

  // An old link says the same.
  await bo.page.goto(`/listor/${list.id}`);
  await expect(bo.page).toHaveURL(/\/listor$/);
  await expect(gone(bo.page, "Kalaset")).toBeVisible();

  // Public again: everyone's.
  await change(page).click();
  await toggle(page).click();
  await expect(sheet(page).getByText("Alla i hemmet ser listan.")).toBeVisible();
  await expect(chip(page, "Bo")).toHaveCount(0);
  await save(page).click();
  await expect(privacy(page)).toHaveText("Alla i hemmet");
  await expect(rows(bo.page)).toHaveText([/^Handla/, /^Kalaset\s*Tom/]);
  await bo.context.close();
});

test("an older list is public, and an adult but no child may make it private", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  const bo = await boScreen(browser);
  const list = await seedList("Handla");

  await go(bo.page, `/listor/${list.id}`);
  await expect(privacy(bo.page)).toHaveText("Alla i hemmet");
  await expect(change(bo.page)).toHaveCount(0);

  await go(page, `/listor/${list.id}`);
  await expect(privacy(page)).toHaveText("Alla i hemmet");
  await change(page).click();
  await toggle(page).click();
  await save(page).click();
  await expect(privacy(page)).toHaveText("Privat · bara du");
  await expect(gone(bo.page, "Handla")).toBeVisible();
  await expect(bo.page.getByText("Inga listor ännu.")).toBeVisible();
  await bo.context.close();
});

test("a failed save keeps the sheet and the choice", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await addMember("Sara Andersson");
  const list = await seedList("Kalaset", [], undefined, { creatorId: anna.id });
  // Server actions are the page's POSTs; none gets through.
  const refuse = () =>
    page.route("**/listor**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));

  await go(page, "/listor");
  await refuse();
  await newList(page).click();
  await toggle(page).click();
  await chip(page, "Sara").click();
  await page.getByRole("textbox", { name: "Namn" }).fill("Hemlig");
  await page.getByRole("button", { name: "Skapa" }).click();
  await expect(page.getByText("Det gick inte att spara. Försök igen.")).toBeVisible();
  await expect(toggle(page)).toBeChecked();
  await expect(chip(page, "Sara")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("textbox", { name: "Namn" })).toHaveValue("Hemlig");
  await page.unrouteAll();
  await page.keyboard.press("Escape");

  await go(page, `/listor/${list.id}`);
  await refuse();
  await change(page).click();
  await toggle(page).click();
  await chip(page, "Sara").click();
  await save(page).click();
  await expect(page.getByText("Det gick inte att spara. Försök igen.").first()).toBeVisible();
  await expect(sheet(page)).toBeVisible();
  await expect(chip(page, "Sara")).toHaveAttribute("aria-pressed", "true");
});

test("many names wrap under the list name in a narrow window, and alone at home there is nobody to pick", async ({
  page,
  context,
}) => {
  const anna = await logIn(context, "anna", "adult");
  await go(page, "/listor");
  await newList(page).click();
  await toggle(page).click();
  await expect(page.getByRole("dialog").getByText("Bara du ser listan.", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("group")).toHaveCount(0);
  await page.keyboard.press("Escape");

  const others = [];
  for (const name of ["Alexandra", "Benjamin", "Charlotta", "Dominika", "Emanuel", "Filippa"]) {
    others.push((await addMember(name)).id);
  }
  const list = await seedList("Kalaset", [], undefined, { creatorId: anna.id, isPrivate: true, shareWith: others });
  const words = "Privat · du, Alexandra, Benjamin, Charlotta, Dominika, Emanuel och Filippa";
  await page.setViewportSize({ width: 320, height: 700 });
  const fits = async () => {
    await expect(page.getByText(words)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Every letter shows: nothing is clipped.
    expect(await page.getByText(words).evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  };
  await go(page, "/listor");
  await fits();
  await go(page, `/listor/${list.id}`);
  await fits();
  await change(page).click();
  const last = await chip(page, "Filippa").boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(320);
});

test("Ändra reads light on a sky theme, like the words beside it", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await wear(anna.id, "jul");
  const list = await seedList("Handla");
  await go(page, `/listor/${list.id}`);
  await expect(change(page)).toHaveCSS("color", "rgb(248, 250, 252)");
});
