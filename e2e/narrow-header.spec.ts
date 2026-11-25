import type { Locator, Page } from "@playwright/test";
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
const NAME = "Familjen (verifiering)";
/** The longest a home's name can be: 60 characters. */
const LONG_NAME = "Familjen Andersson-Lindqvists sommarhus vid Västerviks skärg";

/** Too wide for the room beside the filter even on a desktop. */
const WIDE_NAME = "MMMMM ".repeat(10).trim();

async function openHome(page: Page, name: string, width: number) {
  await db.update(household).set({ name });
  await page.setViewportSize({ width, height: 700 });
  await page.goto("/");
}

/** Where the text itself is drawn, which may differ from its element's box. */
async function textBox(element: Locator) {
  return element.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}

/** The header's parts, with the name's text measured and whether anything clips it. */
async function headerParts(page: Page, name: string) {
  const heading = page.getByRole("heading", { level: 1, name: "Uppgifter" });
  const header = page.locator("header").filter({ has: heading });
  const home = header.getByText(name, { exact: true });
  await expect(home).toBeVisible();
  return {
    header: (await header.boundingBox())!,
    heading: (await heading.boundingBox())!,
    filter: (await page.getByRole("button", { name: "Filtrera" }).boundingBox())!,
    name: await textBox(home),
    lines: await home.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight))),
    clipped: await home.evaluate((el) => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        if (getComputedStyle(e).overflowX !== "visible" && e.scrollWidth > e.clientWidth) return true;
      }
      return false;
    }),
  };
}

for (const { name, lines } of [
  { name: NAME, lines: 1 },
  { name: LONG_NAME, lines: 2 },
]) {
  test(`at 390 px a ${name.length}-character home name is whole, under the header row`, async ({ page, context }) => {
    await logIn(context, "anna", "adult");
    await openHome(page, name, 390);
    const p = await headerParts(page, name);

    // The controls stay beside the heading, where they were: 2 px into the header.
    expect(p.filter.x).toBeGreaterThanOrEqual(p.heading.x + p.heading.width);
    expect(p.filter.y - p.header.y).toBe(2);
    expect(p.filter.height).toBe(44);
    // The name starts at the left edge, under the controls' row, and may run the full width.
    expect(p.name.x).toBeCloseTo(p.header.x, 0);
    expect(p.name.y).toBeGreaterThanOrEqual(p.filter.y + p.filter.height - 1);
    expect(p.name.right).toBeLessThanOrEqual(p.header.x + p.header.width);
    expect(p.lines).toBe(lines);
    expect(p.clipped).toBe(false);
    expect(p.header.height).toBe(44 + 20 * lines);
  });
}

test("on a 300 px phone a long home name wraps between the heading and the controls", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page, LONG_NAME, 300);
  const p = await headerParts(page, LONG_NAME);

  expect(p.name.y).toBeGreaterThanOrEqual(p.heading.y + p.heading.height);
  expect(p.name.y).toBeLessThan(p.heading.y + p.heading.height + 6);
  expect(p.filter.y - (p.header.y + 28 + 20 * p.lines)).toBe(4);
  expect(p.lines).toBeGreaterThanOrEqual(2);
  expect(p.name.right).toBeLessThanOrEqual(p.header.x + p.header.width);
  expect(p.clipped).toBe(false);
  expect(p.header.height).toBe(28 + 20 * p.lines + 4 + 44);
});

for (const { name, lines } of [
  { name: NAME, lines: 1 },
  { name: WIDE_NAME, lines: 2 },
]) {
  test(`from 640 px a name of ${lines} line(s) stays beside the filter`, async ({ page, context }) => {
    await logIn(context, "anna", "adult");
    await openHome(page, name, 640);
    const p = await headerParts(page, name);

    expect(p.filter.y - p.header.y).toBe(2);
    expect(p.name.y).toBeLessThan(p.heading.y + p.heading.height + 6);
    expect(p.name.right).toBeLessThanOrEqual(p.filter.x);
    expect(p.lines).toBe(lines);
    expect(p.clipped).toBe(false);
    expect(p.header.height).toBe(28 + 20 * lines);
  });
}


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

/** The home name hf-ylj was found with: 32 characters, one line across a 320 px phone. */
const VERIFY_NAME = "Familjen Andersson (verifiering)";

/** The streak pill's accessible name, with a streak or without. */
const STREAK = /i rad|Ingen svit/;

const REMOVED_LIST = "/listor/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70";

/** A 7-day streak and 1 320 coins: pills too wide to share a 320 px row with Listor's heading. */
async function seedRichMember(userId: string) {
  const room = (await seedRooms("Kök"))["Kök"]!.id;
  await seedStreak({ roomId: room, completedById: userId, days: 7 });
  await seedDone({ title: "Storstädning", roomId: room, completedById: userId, coins: 1_250 });
}

/**
 * A page header as drawn: the heading's and the name's text, the controls, the words of the name
 * broken over two lines, and any control lying over the heading or the name.
 */
async function pageHeader(page: Page, title: string, name: string) {
  const heading = page.getByRole("heading", { level: 1, name: title });
  const header = page.locator("header").filter({ has: heading });
  const home = header.getByText(name, { exact: true });
  await expect(home).toBeVisible();
  await expect(header.getByRole("button", { name: "Meny" })).toBeVisible();
  const measured = await home.evaluate((el) => {
    const head = el.closest("header")!;
    const textOf = (node: Node, from = 0, to?: number) => {
      const range = document.createRange();
      if (to === undefined) range.selectNodeContents(node);
      else {
        range.setStart(node, from);
        range.setEnd(node, to);
      }
      return range;
    };
    const box = (r: DOMRect) => ({ x: r.left, y: r.top, right: r.right, bottom: r.bottom });
    const text = el.firstChild!;
    const broken = [...text.textContent!.matchAll(/\S+/g)]
      .filter((m) => textOf(text, m.index, m.index + m[0].length).getClientRects().length > 1)
      .map((m) => m[0]);
    const words = [head.querySelector("h1")!, el].map((e) => box(textOf(e).getBoundingClientRect()));
    // The sort button, the coin pill and the picture are buttons; the streak pill is only a sign (img).
    const controls = [...head.querySelectorAll('button, a, [role="img"][aria-label]')]
      .map((c) => ({ label: c.getAttribute("aria-label") ?? c.textContent, ...box(c.getBoundingClientRect()) }))
      .filter((c) => c.right > c.x);
    const overlapping = controls
      .filter((c) => words.some((w) => c.x < w.right && c.right > w.x && c.y < w.bottom && c.bottom > w.y))
      .map((c) => c.label);
    return {
      header: box(head.getBoundingClientRect()),
      headerHeight: head.getBoundingClientRect().height,
      heading: words[0]!,
      name: words[1]!,
      nameBox: box(el.getBoundingClientRect()),
      lines: Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
      clipped: el.scrollWidth > el.clientWidth,
      broken,
      controls,
      overlapping,
    };
  });
  return {
    ...measured,
    top: Math.min(...measured.controls.map((c) => c.y)),
    bottom: Math.max(...measured.controls.map((c) => c.bottom)),
    left: Math.min(...measured.controls.map((c) => c.x)),
    right: Math.max(...measured.controls.map((c) => c.right)),
  };
}

type Header = Awaited<ReturnType<typeof pageHeader>>;

/** The name is on a full-width line of its own, whole, and nothing covers it or the heading. */
function expectWholeName(h: Header, lines: number) {
  expect(h.nameBox.x).toBeCloseTo(h.header.x, 0);
  expect(h.nameBox.right).toBeCloseTo(h.header.right, 0);
  expect(h.lines).toBe(lines);
  expect(h.broken).toEqual([]);
  expect(h.clipped).toBe(false);
  expect(h.overlapping).toEqual([]);
}

/** The streak pill is the one control that is no button, so it is checked to be among those measured. */
function expectStreakMeasured(h: Header) {
  expect(h.controls.map((c) => c.label)).toContainEqual(expect.stringMatching(STREAK));
}

/** One row of heading and controls, the name under it. */
function expectOneRow(h: Header, lines = 1) {
  expectWholeName(h, lines);
  expectStreakMeasured(h);
  expect(h.top).toBe(h.header.y);
  expect(h.left).toBeGreaterThanOrEqual(h.heading.right);
  expect(h.nameBox.y - h.header.y).toBe(44);
  expect(h.headerHeight).toBe(44 + 20 * lines);
}

/** Heading, name, then the controls on a row of their own, right-aligned. */
function expectDropped(h: Header, lines = 1) {
  expectWholeName(h, lines);
  expectStreakMeasured(h);
  expect(h.nameBox.y - h.header.y).toBe(28);
  expect(h.top - h.nameBox.bottom).toBe(4);
  expect(h.right).toBeCloseTo(h.header.right, 0);
  expect(h.headerHeight).toBe(28 + 20 * lines + 4 + 44);
}

async function openPage(page: Page, path: string, name: string, width: number) {
  await db.update(household).set({ name });
  await page.setViewportSize({ width, height: 700 });
  await page.goto(path);
}

for (const width of [320, 390]) {
  test(`at ${width} px a new member's Listor header is one row, with the home name under it`, async ({ page, context }) => {
    await logIn(context, "anna", "adult");
    await openPage(page, "/listor", VERIFY_NAME, width);
    expectOneRow(await pageHeader(page, "Listor", VERIFY_NAME));
  });
}

for (const { who, width, rich } of [
  { who: "a rich member", width: 320, rich: true },
  { who: "a new member", width: 300, rich: false },
]) {
  test(`at ${width} px ${who}'s Listor controls drop under the home name`, async ({ page, context }) => {
    const anna = await logIn(context, "anna", "adult");
    if (rich) await seedRichMember(anna.id);
    await openPage(page, "/listor", VERIFY_NAME, width);
    expectDropped(await pageHeader(page, "Listor", VERIFY_NAME));
  });
}

test("at 320 px the longest home name wraps between words on Listor", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openPage(page, "/listor", LONG_NAME, 320);
  expectOneRow(await pageHeader(page, "Listor", LONG_NAME), 2);
});

for (const rich of [false, true]) {
  test(`from 300 to 400 px a ${rich ? "rich" : "new"} member's Listor header never breaks a word or overlaps`, async ({ page, context }) => {
    const anna = await logIn(context, "anna", "adult");
    if (rich) await seedRichMember(anna.id);
    await openPage(page, "/listor", VERIFY_NAME, 300);
    for (let width = 300; width <= 400; width++) {
      await page.setViewportSize({ width, height: 700 });
      const h = await pageHeader(page, "Listor", VERIFY_NAME);
      const at = `at ${width} px`;
      expect(h.broken, at).toEqual([]);
      expect(h.overlapping, at).toEqual([]);
      expect(h.clipped, at).toBe(false);
      expect(h.right, at).toBeLessThanOrEqual(h.header.right + 0.5);
      // One of the two forms, never anything between.
      if (h.top === h.header.y) expectOneRow(h, h.lines);
      else expectDropped(h, h.lines);
    }
  });
}

for (const { path, title, label } of [
  { path: "/jag", title: "Jag", label: "Jag" },
  { path: REMOVED_LIST, title: "Listor", label: "a removed list" },
]) {
  test(`at 320 px ${label} has the home name under its header row`, async ({ page, context }) => {
    await logIn(context, "anna", "adult");
    await openPage(page, path, VERIFY_NAME, 320);
    expectOneRow(await pageHeader(page, title, VERIFY_NAME));
  });
}

for (const { name, lines } of [
  { name: NAME, lines: 1 },
  { name: WIDE_NAME, lines: 2 },
]) {
  test(`from 640 px a Listor name of ${lines} line(s) stays beside the sort button`, async ({ page, context }) => {
    await logIn(context, "anna", "adult");
    await openPage(page, "/listor", name, 640);
    const heading = page.getByRole("heading", { level: 1, name: "Listor" });
    const header = page.locator("header").filter({ has: heading });
    const sort = (await header.getByRole("button", { name: /^Sortera listor/ }).boundingBox())!;
    const home = header.getByText(name, { exact: true });
    const box = (await header.boundingBox())!;
    const text = await textBox(home);

    expect(sort.y).toBe(box.y);
    expect(text.y).toBeLessThan((await heading.boundingBox())!.y + 28 + 6);
    expect(text.right).toBeLessThanOrEqual(sort.x);
    expect(await home.evaluate((el) => Math.round(el.getBoundingClientRect().height / 20))).toBe(lines);
    expect(box.height).toBe(Math.max(44, 28 + 20 * lines));
  });
}
