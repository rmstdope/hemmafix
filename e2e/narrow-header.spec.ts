import type { Locator } from "@playwright/test";
import { household } from "../src/db/schema";
import { db, logIn, seedDone, seedRooms, seedStreak } from "./support/family";
import { expect, test } from "./support/test";

/** Room the select's own arrow takes inside its padding box, in Chromium. */
const ARROW = 20;

/** Whether the select shows its chosen option's text whole, measured in the select's own font. */
async function showsWholeText(select: Locator) {
  return select.evaluate((el: HTMLSelectElement, arrow) => {
    const style = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = el.selectedOptions[0]!.text;
    const room = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - arrow;
    return { text, fits: ctx.measureText(text).width <= room };
  }, ARROW);
}

/**
 * A home name long enough that a control beside it cuts it, and short enough that it fits whole on
 * a 300 px phone's row of its own (the narrow layout gives it that row).
 */
const LONG_HOME = "Familjen Andersson (sommarstugan)";

const PAGES = [
  { path: "/", heading: "Uppgifter", controls: 2 }, // the filter and the picture at least
  { path: "/listor", heading: "Listor", controls: 2 }, // the sort and the picture
  { path: "/jag", heading: "Jag", controls: 1 }, // the picture
  { path: "/listor/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70", heading: "Listor", controls: 1, label: "a removed list" }, // the picture
];

for (const { path, heading: name, controls: least, label = name } of PAGES) {
  test(`on a 300 px phone the ${label} header keeps the heading clear and the home name whole`, async ({ page, context }) => {
    const anna = await logIn(context, "anna", "adult");
    await db.update(household).set({ name: LONG_HOME });
    // A long streak and a big balance make the picture's pills as wide as a real family's.
    const room = (await seedRooms("Kök"))["Kök"]!.id;
    await seedStreak({ roomId: room, completedById: anna.id, days: 12 });
    await seedDone({ title: "Storstädning", roomId: room, completedById: anna.id, coins: 98_000 });
    await page.setViewportSize({ width: 300, height: 700 });
    await page.goto(path);

    const heading = page.getByRole("heading", { level: 1, name });
    // The heading's text, not its box, is what a control may not cover.
    const text = await heading.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    expect(text.x).toBeGreaterThanOrEqual(0);
    const controls = page.locator("header").filter({ has: heading }).getByRole("button");
    expect(await controls.count()).toBeGreaterThanOrEqual(least);
    for (const control of await controls.all()) {
      const box = (await control.boundingBox())!;
      const apart =
        box.x >= text.x + text.width || box.x + box.width <= text.x || box.y >= text.y + text.height || box.y + box.height <= text.y;
      expect(apart, `${await control.getAttribute("aria-label")} overlaps the heading`).toBe(true);
      expect(box.x + box.width).toBeLessThanOrEqual(300);
    }

    const home = page.getByText(LONG_HOME, { exact: true });
    await expect(home).toBeVisible();
    const cut = await home.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(cut, `the home name is cut on ${label}`).toBe(false);
  });
}

test("on a 300 px phone Gjort's two filters show their whole choice", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await logIn(await context.browser()!.newContext(), "bo", "child");
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/gjort");

  const person = page.getByRole("combobox", { name: "Vems uppgifter" });
  const period = page.getByRole("combobox", { name: "Period" });
  await expect(person).toBeVisible();
  expect(await showsWholeText(person)).toEqual({ text: "Anna Andersson (jag)", fits: true });
  expect(await showsWholeText(period)).toEqual({ text: "Senaste månaden", fits: true });
});

test("on a wider screen the Uppgifter header stays one row", async ({ page, context }) => {
  // The project's own width: a Pixel 7 on mobile, a desktop window on desktop.
  await logIn(context, "anna", "adult");
  await page.goto("/");
  const heading = (await page.getByRole("heading", { level: 1, name: "Uppgifter" }).boundingBox())!;
  const filter = (await page.getByRole("button", { name: "Filtrera" }).boundingBox())!;
  expect(filter.y).toBeLessThan(heading.y + heading.height);
  expect(filter.x).toBeGreaterThanOrEqual(heading.x + heading.width);
});
