import type { Page } from "@playwright/test";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedList } from "./support/family";
import { menuItem } from "./support/menu";
import { expect, test } from "./support/test";

const parts = (page: Page) => page.getByRole("navigation", { name: "Delar" });
const rows = (page: Page) => page.getByRole("list", { name: "Listor" }).getByRole("listitem");
const field = (page: Page) => page.getByRole("textbox", { name: "Lägg till…" });
const open = (page: Page) => page.getByRole("list", { name: "Saker kvar" }).getByRole("listitem");
const klart = (page: Page) => page.getByRole("list", { name: "Klart" }).getByRole("listitem");
const toggle = (page: Page, n: number) => page.getByRole("button", { name: `Klart (${n})` });
const newList = (page: Page) => page.getByRole("button", { name: "Ny lista", exact: true });
const sortButton = (page: Page, order: string) => page.getByRole("button", { name: `Sortera listor: ${order}` });
const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

/** Opens a page and waits for React to take it over: a click before that does nothing. */
async function go(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('[data-hydrated="true"]')).toBeAttached();
}
async function reload(page: Page) {
  await page.reload();
  await expect(page.locator('[data-hydrated="true"]')).toBeAttached();
}

/** Makes a list through the window and lands on its page. */
async function makeList(page: Page, name: string) {
  await newList(page).click();
  await page.getByRole("dialog", { name: "Ny lista" }).getByRole("textbox", { name: "Namn" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

test("an adult sees no lists at first, makes one and lands in it ready to add", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await go(page, "/listor");
  await expect(page).toHaveTitle("Listor – Hemmafix");
  await expect(page.getByRole("heading", { name: "Listor", level: 1 })).toBeVisible();
  await expect(page.getByText("Familjen E2E")).toBeVisible();
  await expect(page.getByText("Inga listor ännu.")).toBeVisible();
  await expect(
    page.getByText("Tryck på + för att göra en lista för inköp, packning eller annat ni vill bocka av tillsammans."),
  ).toBeVisible();
  // The button row is gone: the sort button is icon-only, in the header, and the + is round.
  await expect(sortButton(page, "Alfabetiskt")).toHaveText("");
  await expect(page.getByRole("banner").or(page.locator("header")).first().getByRole("button", { name: /^Sortera listor/ })).toBeVisible();
  await expect(page.getByText("＋ Ny lista")).toHaveCount(0);

  // Avbryt, Esc and an empty name create nothing.
  await newList(page).click();
  const dialog = page.getByRole("dialog", { name: "Ny lista" });
  await expect(dialog.getByRole("textbox", { name: "Namn" })).toBeFocused();
  await dialog.getByRole("textbox", { name: "Namn" }).fill("   ");
  await dialog.getByRole("button", { name: "Skapa" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Namn" }).fill("Spöke");
  await expect(dialog.getByRole("button", { name: "Avbryt" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Stäng" }).click();
  await expect(dialog).toBeHidden();
  await expect(newList(page)).toBeFocused();
  await newList(page).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Inga listor ännu.")).toBeVisible();

  await makeList(page, "  Inköp ");
  await expect(page).toHaveTitle("Inköp – Hemmafix");
  await expect(field(page)).toBeFocused();
  await expect(page.getByText("Listan är tom.")).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Klart", exact: false })).toHaveCount(0);

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(rows(page)).toHaveText([/^Inköp\s*Tom/]);
  await newList(page).click();
  await page.getByRole("textbox", { name: "Namn" }).fill("Inköp");
  await page.getByRole("button", { name: "Skapa" }).click();
  await expect(page.getByRole("heading", { name: "Inköp", level: 1 })).toBeVisible();
});

test("the + opens Ny lista in a sheet or window that discards what was typed, for a child too", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await go(page, "/listor");
  const dialog = page.getByRole("dialog", { name: "Ny lista" });
  await expect(newList(page)).toBeVisible();
  await newList(page).click();
  await expect(dialog.getByRole("heading", { name: "Ny lista" })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Namn" }).fill("Spöke");
  await page.mouse.click(2, 2); // outside the sheet
  await expect(dialog).toBeHidden();
  await expect(newList(page)).toBeFocused();
  await newList(page).click();
  await expect(dialog.getByRole("textbox", { name: "Namn" })).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Inga listor ännu.")).toBeVisible();
});

test("the + floats at the lower right and never hides the last list", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  for (let i = 1; i <= 14; i++) await seedList(`Lista ${String(i).padStart(2, "0")}`, []);
  await go(page, "/listor");
  const plus = newList(page);
  const box = await plus.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  // In the lower right half of the screen, and inside the viewport.
  expect(box!.x + box!.width / 2).toBeGreaterThan(viewport!.width / 2);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  expect(box!.y).toBeGreaterThan(viewport!.height / 2);
  // On a phone it is above the bottom bar.
  const bar = await parts(page).boundingBox();
  if (bar && bar.y > viewport!.height / 2) expect(box!.y + box!.height).toBeLessThanOrEqual(bar.y);
  // Scrolled to the end, the last row is clear of the +.
  await rows(page).last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await rows(page).last().boundingBox();
  const after = await plus.boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(after!.y + 1);
});

test("items are added first, ticked into Klart, unticked and cleared with Ångra", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await go(page, "/listor");
  await makeList(page, "Inköp");

  await field(page).fill("Mjölk");
  await field(page).press("Enter");
  await expect(field(page)).toHaveValue("");
  await expect(field(page)).toBeFocused();
  await field(page).fill("   ");
  await field(page).press("Enter");
  await field(page).fill("Bröd");
  await field(page).press("Enter");
  await field(page).fill("Bröd");
  await field(page).press("Enter");
  await expect(open(page)).toHaveCount(3);
  await expect(open(page).nth(0)).toContainText("Bröd");
  await expect(open(page).nth(2)).toContainText("Mjölk");
  await expect(field(page)).toBeFocused();
  await expect(page.getByText("Listan är tom.")).toHaveCount(0);

  // Ticking moves the item at once into Klart, folded to start with, without a notice.
  await page.getByRole("button", { name: "Mjölk: bocka av" }).click();
  await expect(open(page)).toHaveCount(2);
  await expect(toggle(page, 1)).toHaveAttribute("aria-expanded", "false");
  await expect(klart(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rensa" })).toBeVisible();
  await toggle(page, 1).click();
  await expect(klart(page)).toHaveText([/Mjölk/]);
  await expect(page.getByRole("button", { name: "Mjölk: ångra avbockad" })).toBeVisible();

  // Rensa removes the ticked ones at once; Ångra puts them back.
  await page.getByRole("button", { name: "Rensa" }).click();
  await expect(page.getByText("Rensade 1 sak")).toBeVisible();
  await expect(page.getByRole("button", { name: /Klart/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Ångra" }).click();
  await expect(toggle(page, 1)).toBeVisible();
  await expect(klart(page)).toHaveText([/Mjölk/]);
  await expect(field(page)).toBeFocused();

  // Everything ticked; unticking sends an item back to the top of the open ones.
  await page.getByRole("button", { name: "Bröd: bocka av" }).first().click();
  await page.getByRole("button", { name: "Bröd: bocka av" }).first().click();
  await expect(page.getByText("Allt är avbockat.")).toBeVisible();
  await expect(toggle(page, 3)).toBeVisible();
  await page.getByRole("button", { name: "Mjölk: ångra avbockad" }).click();
  await expect(open(page)).toHaveText([/Mjölk/]);
  await expect(page.getByRole("button", { name: "Mjölk: bocka av" })).toBeFocused();
  await expect(page.getByText("Allt är avbockat.")).toHaveCount(0);

  // Klart stays folded or open as left, also after a reload.
  await reload(page);
  await expect(toggle(page, 2)).toHaveAttribute("aria-expanded", "true");
  await toggle(page, 2).click();
  await reload(page);
  await expect(toggle(page, 2)).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Rensa" }).click();
  await expect(page.getByText("Rensade 2 saker")).toBeVisible();
});

test("an item is edited in place and removed with Ångra", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const inkop = await seedList("Inköp", ["Kaffe", "Bröd", "Mjölk"]);
  await go(page, `/listor/${inkop.id}`);
  await expect(open(page)).toHaveText([/Mjölk/, /Bröd/, /Kaffe/]);

  await page.getByRole("button", { name: "Mjölk", exact: true }).click();
  const edit = page.getByRole("textbox", { name: "Ändra Mjölk" });
  await expect(edit).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" laktosfri");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Mjölk laktosfri", exact: true })).toBeVisible();

  // Esc puts it back; leaving the field saves; an empty text leaves it as it was.
  await page.getByRole("button", { name: "Bröd", exact: true }).click();
  await page.keyboard.type("x");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Bröd", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bröd", exact: true }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" surdeg");
  await field(page).click();
  await expect(page.getByRole("button", { name: "Bröd surdeg", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kaffe", exact: true }).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Kaffe", exact: true })).toBeVisible();

  // × removes at once, says so and Ångra puts it back where it was; focus moves to the next item.
  await page.getByRole("button", { name: "Ta bort Bröd surdeg" }).click();
  await expect(page.getByText("Bröd surdeg är borttagen")).toBeVisible();
  await expect(open(page)).toHaveText([/Mjölk laktosfri/, /Kaffe/]);
  await expect(page.getByRole("button", { name: "Kaffe: bocka av" })).toBeFocused();
  await page.getByRole("button", { name: "Ångra" }).click();
  await expect(open(page)).toHaveText([/Mjölk laktosfri/, /Bröd surdeg/, /Kaffe/]);
  await page.getByRole("button", { name: "Ta bort Kaffe" }).click();
  await expect(field(page)).toBeFocused();
});

test("a list is renamed, and removed after asking", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const inkop = await seedList("Inköp", ["Mjölk"]);
  await go(page, `/listor/${inkop.id}`);

  const more = page.getByRole("button", { name: "Mer för Inköp" });
  await more.click();
  await expect(page.getByRole("menuitem", { name: "Byt namn" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();

  await more.click();
  await page.getByRole("menuitem", { name: "Byt namn" }).click();
  const rename = page.getByRole("dialog", { name: "Byt namn" });
  const name = rename.getByRole("textbox", { name: "Namn" });
  await expect(name).toHaveValue("Inköp");
  await expect(name).toBeFocused();
  await name.fill("");
  await rename.getByRole("button", { name: "Spara" }).click();
  await expect(rename).toBeVisible();
  await name.fill("Matinköp");
  await page.keyboard.press("Enter");
  await expect(rename).toBeHidden();
  await expect(page.getByRole("heading", { name: "Matinköp", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("Matinköp – Hemmafix");
  await expect(page.getByRole("button", { name: "Mer för Matinköp" })).toBeFocused();

  await page.getByRole("button", { name: "Mer för Matinköp" }).click();
  await page.getByRole("menuitem", { name: "Ta bort lista" }).click();
  const ask = page.getByRole("dialog", { name: "Ta bort Matinköp?" });
  await expect(ask.getByText("Listan och allt på den tas bort för hela familjen.")).toBeVisible();
  await ask.getByRole("button", { name: "Avbryt" }).click();
  await expect(ask).toBeHidden();
  await expect(page.getByRole("heading", { name: "Matinköp", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Mer för Matinköp" }).click();
  await page.getByRole("menuitem", { name: "Ta bort lista" }).click();
  await ask.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page).toHaveURL(/\/listor$/);
  await expect(page.getByText("Matinköp är borttagen")).toBeVisible();
  await expect(page.getByText("Inga listor ännu.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ångra" })).toHaveCount(0);
});

test("the order of the lists is each person's own and is kept", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  const day = (d: number) => new Date(Date.UTC(2026, 0, d));
  await seedList("Zebra", ["a"], { createdAt: day(1), updatedAt: day(9) });
  await seedList("Ägg", ["a", { text: "b", done: true }], { createdAt: day(2), updatedAt: day(3) });
  await seedList("Anka", [], { createdAt: day(3), updatedAt: day(5) });
  await go(page, "/listor");
  await expect(rows(page)).toHaveText([/^Anka\s*Tom/, /^Zebra\s*1 kvar/, /^Ägg\s*1 kvar/]);

  await sortButton(page, "Alfabetiskt").click();
  await expect(page.getByRole("menuitemradio", { name: "Alfabetiskt" })).toBeChecked();
  await expect(page.getByRole("menuitemradio", { name: "Alfabetiskt" })).toBeFocused();
  await expect(page.getByRole("menu", { name: /Sortera listor/ }).getByText("Sortera listor", { exact: true })).toBeVisible();
  // Esc and a press outside close it without changing the order, and Esc gives focus back.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(sortButton(page, "Alfabetiskt")).toBeFocused();
  await expect(rows(page)).toHaveText([/^Anka\s*Tom/, /^Zebra\s*1 kvar/, /^Ägg\s*1 kvar/]);
  await sortButton(page, "Alfabetiskt").click();
  await page.getByRole("heading", { name: "Listor", level: 1 }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(rows(page)).toHaveText([/^Anka\s*Tom/, /^Zebra\s*1 kvar/, /^Ägg\s*1 kvar/]);
  await sortButton(page, "Alfabetiskt").click();
  await page.getByRole("menuitemradio", { name: "Senast ändrad" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(rows(page)).toHaveText([/^Zebra/, /^Anka/, /^Ägg/]);
  await expect(sortButton(page, "Senast ändrad")).toBeFocused();

  await reload(page);
  await expect(sortButton(page, "Senast ändrad")).toBeVisible();
  await expect(rows(page)).toHaveText([/^Zebra/, /^Anka/, /^Ägg/]);

  // Changing a list moves it first.
  await rows(page).nth(2).getByRole("link").click();
  await page.getByRole("button", { name: "a: bocka av" }).click();
  await expect(toggle(page, 2)).toBeVisible();
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(rows(page)).toHaveText([/^Ägg\s*Allt klart/, /^Zebra/, /^Anka/]);

  await sortButton(page, "Senast ändrad").click();
  await page.getByRole("menuitemradio", { name: "Senast skapad" }).click();
  await expect(rows(page)).toHaveText([/^Anka/, /^Ägg/, /^Zebra/]);

  // Bo has not chosen anything: alphabetical, whatever Anna did.
  const other = await browser.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  await logIn(other, "bo", "child");
  const bo = await other.newPage();
  await go(bo, "/listor");
  await expect(sortButton(bo, "Alfabetiskt")).toBeVisible();
  await expect(rows(bo)).toHaveText([/^Anka/, /^Zebra/, /^Ägg/]);
  await other.close();
});

test("lists, ticks, renames and removals from others appear without a reload", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  const inkop = await seedList("Inköp", ["Kaffe", "Mjölk"]);
  await go(page, "/listor");
  await expect(rows(page)).toHaveText([/^Inköp\s*2 kvar/]);

  const other = await browser.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  await logIn(other, "bo", "child");
  const bo = await other.newPage();
  await go(bo, `/listor/${inkop.id}`);
  await bo.getByRole("button", { name: "Mjölk: bocka av" }).click();
  await expect(rows(page)).toHaveText([/^Inköp\s*1 kvar/]);
  await bo.getByRole("button", { name: "Mer för Inköp" }).click();
  await bo.getByRole("menuitem", { name: "Byt namn" }).click();
  await bo.getByRole("textbox", { name: "Namn" }).fill("Handla");
  await bo.keyboard.press("Enter");
  await expect(rows(page)).toHaveText([/^Handla\s*1 kvar/]);

  // Anna opens the list and starts editing; Bo removes that item and then the whole list.
  await rows(page).first().getByRole("link").click();
  await page.getByRole("button", { name: "Kaffe", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Ändra Kaffe" })).toBeVisible();
  await bo.getByRole("button", { name: "Ta bort Kaffe" }).click();
  await expect(page.getByRole("textbox", { name: "Ändra Kaffe" })).toHaveCount(0);
  await expect(page.getByText("Allt är avbockat.")).toBeVisible();
  await field(page).fill("halvskrivet");
  await bo.getByRole("button", { name: "Mer för Handla" }).click();
  await bo.getByRole("menuitem", { name: "Ta bort lista" }).click();
  await bo.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page.getByText("Listan finns inte längre.")).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Till Listor" }).click();
  await expect(page.getByText("Inga listor ännu.")).toBeVisible();
  await other.close();
});

test("a link to a list that is not there says so", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/listor/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70");
  await expect(page.getByText("Listan finns inte längre.")).toBeVisible();
  await page.goto("/listor/inte-ett-id");
  await expect(page.getByText("Listan finns inte längre.")).toBeVisible();
});

test("a save that fails is undone, says so, and keeps what was typed", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const inkop = await seedList("Inköp", ["Mjölk"]);
  await go(page, `/listor/${inkop.id}`);
  await expect(open(page)).toHaveCount(1);

  await page.route("**/listor/**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await field(page).fill("Smör");
  await field(page).press("Enter");
  await expect(page.getByText("Det gick inte att spara. Försök igen.")).toBeVisible();
  await expect(open(page)).toHaveText([/Mjölk/]);
  await expect(field(page)).toHaveValue("Smör");

  await page.getByRole("button", { name: "Mjölk: bocka av" }).click();
  await expect(page.getByText("Det gick inte att spara. Försök igen.").first()).toBeVisible();
  await expect(open(page)).toHaveText([/Mjölk/]);
  await expect(page.getByRole("button", { name: /^Klart/ })).toHaveCount(0);
});

test("a child does everything an adult does, apart from Hemmet", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await go(page, "/listor");
  await expect(await menuItem(page, "Gjort")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Hemmet" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await makeList(page, "Packning");
  await field(page).fill("Tandborste");
  await field(page).press("Enter");
  await page.getByRole("button", { name: "Tandborste: bocka av" }).click();
  await expect(toggle(page, 1)).toBeVisible();
  await page.getByRole("button", { name: "Mer för Packning" }).click();
  await page.getByRole("menuitem", { name: "Ta bort lista" }).click();
  await page.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page.getByText("Packning är borttagen")).toBeVisible();
});

test("a Ny lista that fails to save shows the error and keeps the sheet open with the name", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await go(page, "/listor");
  await newList(page).click();
  const dialog = page.getByRole("dialog", { name: "Ny lista" });
  await page.route("**/listor", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await dialog.getByRole("textbox", { name: "Namn" }).fill("Inköp");
  await dialog.getByRole("button", { name: "Skapa" }).click();
  await expect(page.getByText("Det gick inte att spara. Försök igen.").first()).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Namn" })).toHaveValue("Inköp");
});

test("long names wrap, nothing overflows, and Tab goes in reading order", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const long = "Glutenfritt bröd till mormor, det som finns i frysdisken längst in i butiken ".repeat(2).trim();
  const inkop = await seedList(long, ["Kaffe", long]);
  await seedList("Packning", []);
  await page.setViewportSize({ width: 320, height: 640 });
  await go(page, "/listor");
  await noOverflow(page);
  await expect(newList(page)).toBeVisible();
  await expect(sortButton(page, "Alfabetiskt")).toBeVisible();
  // The header holds the title, ⇅ and the picture on one line.
  const tops = await Promise.all(
    [page.getByRole("heading", { name: "Listor", level: 1 }), sortButton(page, "Alfabetiskt"), page.getByRole("button", { name: "Meny" })].map(
      async (l) => {
        const b = await l.boundingBox();
        return b!.y + b!.height / 2;
      },
    ),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(12);
  await go(page, `/listor/${inkop.id}`);
  await noOverflow(page);
  await expect(page.getByRole("button", { name: `Ta bort ${long}` })).toBeVisible();

  await page.setViewportSize({ width: 800, height: 700 });
  await go(page, `/listor/${inkop.id}`);
  await page.getByRole("link", { name: "Tillbaka" }).focus();
  const order: string[] = [];
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    order.push(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? ""));
  }
  expect(order.slice(0, 6)).toEqual([
    `Mer för ${long}`,
    "Lägg till…",
    `${long}: bocka av`,
    long,
    `Ta bort ${long}`,
    "Kaffe: bocka av",
  ]);
});
