import type { Locator } from "@playwright/test";
import { logIn } from "./support/family";
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

test("on a 300 px phone the Uppgifter header keeps the heading clear and the home name whole", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.setViewportSize({ width: 300, height: 700 });
  await page.goto("/");

  const heading = page.getByRole("heading", { level: 1, name: "Uppgifter" });
  // The heading's text, not its box, is what a control may not cover.
  const text = await heading.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  expect(text.x).toBeGreaterThanOrEqual(0);
  const controls = page.locator("header").filter({ has: heading }).getByRole("button");
  expect(await controls.count()).toBeGreaterThanOrEqual(2); // the filter and the picture at least
  for (const control of await controls.all()) {
    const box = (await control.boundingBox())!;
    const apart =
      box.x >= text.x + text.width || box.x + box.width <= text.x || box.y >= text.y + text.height || box.y + box.height <= text.y;
    expect(apart, `${await control.getAttribute("aria-label")} overlaps the heading`).toBe(true);
    expect(box.x + box.width).toBeLessThanOrEqual(300);
  }

  const home = page.getByText("Familjen E2E", { exact: true });
  await expect(home).toBeVisible();
  const cut = await home.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(cut).toBe(false);
});

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
