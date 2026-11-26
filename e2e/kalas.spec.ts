import type { Page } from "@playwright/test";
import { PASS_EVERY_MS, PASS_MS } from "../src/lib/sky";
import { logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { chooseFromMenu } from "./support/menu";
import { body, flightAt, grant, hydrated, openButik, paintedMidFlight, part, pausedClock, pieceTops, wear, WHITE } from "./support/sky";
import { expect, test } from "./support/test";

const SKY = "rgb(42, 24, 70)";
const DARK_SKY = "rgb(26, 14, 46)";
const PINK = "rgb(224, 48, 122)";
const LIGHT_TEXT = "rgb(248, 250, 252)";
const MOVES = "Glitter faller, ballonger stiger och ett ballongknippe flyger förbi.";

const sky = (page: Page) => page.locator("[data-kalas-sky=page]:visible");
const bunch = (page: Page) => page.locator("[data-bunch]:visible");
const plus = (page: Page) => page.getByRole("button", { name: "Ny uppgift" });

test("Kalas is sold last among the themes for 300, previewed with what moves, and used at once", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 320);
  await openButik(page);
  const themes = page.getByRole("region", { name: "Teman" }).getByRole("button");
  await expect(themes.nth(4)).toHaveAccessibleName("Jul, 300 mynt");
  await expect(themes.last()).toHaveAccessibleName("Kalas, 300 mynt");
  const tile = page.getByRole("button", { name: "Kalas, 300 mynt" });
  await expect(tile).toContainText("Kalas");
  await expect(tile).toContainText("300");
  await expect(tile.locator("[data-kalas-swatch]")).toHaveCSS("background-color", SKY);
  await expect(tile.locator("[data-kalas-sky] [data-piece=square]").first()).toBeAttached();
  await expect(tile.locator("[data-kalas-sky] [data-piece=balloon]")).toHaveCount(2);
  await expect(tile.locator("[data-fall]").first()).toHaveCSS("animation-name", "sky-fall");
  await expect(body(page)).not.toHaveCSS("background-color", SKY);

  await tile.click();
  const sheet = page.getByRole("dialog", { name: "Kalas" });
  await expect(sheet.getByText("Så här ser Hemmafix ut för dig.")).toBeVisible();
  await expect(sheet.getByText(MOVES)).toBeVisible();
  const preview = sheet.locator("[data-kalas-preview]");
  await expect(preview).toHaveCSS("background-color", SKY);
  await expect(preview.locator("[data-piece=square]").first()).toBeAttached();
  await expect(preview.locator("[data-rise]").first()).toHaveCSS("animation-name", "sky-rise");
  await expect(preview.locator("[data-preview-bunch]")).toBeVisible();
  await expect(preview.locator("[data-preview-bunch]")).not.toHaveCSS("animation-name", "none");
  await expect(preview.locator("[data-preview-row]").first()).toHaveCSS("background-color", WHITE);
  await expect(preview.locator("[data-preview-button]")).toHaveCSS("background-color", PINK);
  await expect(sheet.getByRole("button", { name: "Avbryt" })).toBeVisible();

  await sheet.getByRole("button", { name: "Köp för 300 mynt" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Kalas, används" })).toContainText("✓ Används");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(sky(page)).toBeAttached();

  // Switching away removes it all at once, and switching back is free.
  await page.getByRole("button", { name: "Svart" }).click();
  await expect(page.getByRole("button", { name: "Svart, används" })).toBeVisible();
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
  await expect(page.locator("[data-kalas-sky=page]")).toHaveCount(0);
  await expect(page.locator("[data-bunch]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-sky", /./);
  const owned = page.getByRole("button", { name: "Kalas", exact: true });
  await expect(owned).toContainText("Använd");
  await owned.click();
  await expect(body(page)).toHaveCSS("background-color", SKY);
});

test("the page is a party sky with white rows, light headings and pink controls, for that person only", async ({
  page,
  context,
  browser,
}) => {
  const bo = await logIn(context, "bo", "child");
  await wear(bo.id, "kalas");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Dammsuga", roomId: rooms["Kök"]!.id });
  await seedDone({ title: "Mata katten", roomId: rooms["Kök"]!.id, completedById: bo.id });
  await page.goto("/");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(page.getByRole("listitem").filter({ hasText: "Dammsuga" })).toHaveCSS("background-color", WHITE);
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toHaveCSS("color", LIGHT_TEXT);
  await expect(page.getByRole("tablist")).toHaveCSS("background-color", WHITE);
  await expect(page.getByRole("tab", { selected: true })).toHaveCSS("border-bottom-color", PINK);
  const open = page.getByRole("button", { name: "Dammsuga: markera som klar" });
  await expect(open).toHaveCSS("border-top-color", PINK);
  await expect(open).toHaveCSS("border-top-width", "2px");
  await page.getByText(/^Klart senaste veckan/).click();
  const done = page.getByRole("button", { name: "Mata katten: ångra klar" });
  await expect(done).toHaveCSS("border-top-color", PINK);
  await expect(done).toHaveCSS("border-top-width", "2px");

  const lit = page.getByRole("link", { name: "Uppgifter" }).and(page.locator("[aria-current=page]")).locator("visible=true");
  if (test.info().project.name === "desktop") {
    await expect(lit).toHaveCSS("background-color", PINK);
    await expect(lit).toHaveCSS("color", "rgb(255, 255, 255)");
  } else {
    await expect(lit).toHaveCSS("color", PINK);
    await expect(page.locator("[data-parts-bar]")).toHaveCSS("background-color", WHITE);
  }

  // An empty day keeps its words in a white box.
  await page.getByRole("tab", { name: /Senare/ }).click();
  await expect(page.getByText("Inget planerat längre fram.")).toHaveCSS("background-color", WHITE);

  await part(page, "Listor").click();
  await hydrated(page);
  await page.getByRole("button", { name: "Ny lista" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Inköp");
  await page.keyboard.press("Enter");
  const field = page.getByRole("textbox", { name: "Lägg till…" });
  await field.fill("Mjölk");
  await field.press("Enter");
  const box = page.getByRole("button", { name: "Mjölk: bocka av" });
  await expect(box.locator("span")).toHaveCSS("border-top-color", PINK);
  await box.click();
  await page.getByRole("button", { name: /^Klart \(1\)/ }).click();
  await expect(page.getByRole("button", { name: "Mjölk: ångra avbockad" })).toHaveCSS("border-top-color", PINK);

  await part(page, "Jag").click();
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Framsteg" })).toHaveCSS("background-color", PINK);
  await expect(page.getByRole("region", { name: "Den här veckan" })).toHaveCSS("background-color", WHITE);

  const other = await browser.newContext();
  await logIn(other, "anna", "adult");
  const annaPage = await other.newPage();
  await annaPage.goto("/");
  await expect(annaPage.locator('[data-look-own="svart"]').first()).toBeAttached();
  await expect(body(annaPage)).not.toHaveCSS("background-color", SKY);
  await expect(annaPage.locator("[data-kalas-sky]")).toHaveCount(0);
  await expect(annaPage.locator("[data-bunch]")).toHaveCount(0);
  await other.close();
});

test("the home settings pages wear it, deeper in dark mode, and Jul takes its place without a trace", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const anna = await logIn(context, "anna", "adult");
  // Wearing Kalas costs 300 of these; the rest buys Jul.
  await grant(anna.id, 600);
  await wear(anna.id, "kalas");
  await page.goto("/jag");
  await hydrated(page);
  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toHaveCSS("color", LIGHT_TEXT);
  await expect(body(page)).toHaveCSS("background-color", DARK_SKY);
  await expect(sky(page)).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "Hemmets namn" })).not.toHaveCSS("background-color", WHITE);

  await page.getByRole("link", { name: "Tillbaka" }).locator("visible=true").click();
  await hydrated(page);
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
  await page.getByRole("button", { name: "Jul, 300 mynt" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Köp för 300 mynt" }).click();
  await expect(page.getByRole("button", { name: "Jul, används" })).toBeVisible();
  await expect(body(page)).not.toHaveCSS("background-color", DARK_SKY);
  await expect(page.locator("[data-jul-sky=page]:visible")).toHaveCount(1);
  // The Hemmet page left behind is still in the document, hidden: nothing of Kalas shows.
  await expect(sky(page)).toHaveCount(0);
  await expect(bunch(page)).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-sky", "jul");
});

test("the sky is there before the person's choice has arrived", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wear(bo.id, "kalas");
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-sky", "kalas");

  // Without the app's scripts nothing but the inline one can mark the page.
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sky", "kalas");
  // As the page is before the streamed marks arrive.
  await page.evaluate(() => document.querySelectorAll("[data-look-own]").forEach((el) => el.removeAttribute("data-look-own")));
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await page.unroute("**/_next/static/**/*.js");

  await context.clearCookies();
  await page.goto("/login");
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
});

/** Where a rising or falling piece's track has it at two moments of one crossing. */
const travel = (page: Page, selector: string) =>
  sky(page)
    .locator(selector)
    .first()
    .evaluate((track) => {
      const [animation] = track.getAnimations();
      const { delay, duration } = animation!.effect!.getTiming();
      animation!.pause();
      return [0.2, 0.8].map((progress) => {
        animation!.currentTime = delay! + (duration as number) * (1 + progress);
        return track.firstElementChild!.getBoundingClientRect().top;
      });
    });

test("glitter falls and balloons rise behind the content, spread over the window from the start", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wear(bo.id, "kalas");
  const rooms = await seedRooms("Kök");
  for (let i = 0; i < 20; i++) await seedChore({ title: `Syssla ${i}`, roomId: rooms["Kök"]!.id });
  await page.goto("/");
  await expect(sky(page)).toHaveCount(1);
  await expect(sky(page)).toHaveAttribute("aria-hidden", "true");
  await expect(sky(page)).toHaveCSS("position", "fixed");
  await expect(sky(page)).toHaveCSS("z-index", "-10");
  await expect(sky(page)).toHaveCSS("pointer-events", "none");
  const size = page.viewportSize()!;
  expect(await sky(page).boundingBox()).toEqual({ x: 0, y: 0, ...size });
  await expect(sky(page).locator("[data-piece=square]")).toHaveCount(34);
  await expect(sky(page).locator("[data-piece=dot]")).toHaveCount(22);
  await expect(sky(page).locator("[data-piece=balloon]")).toHaveCount(7);
  await expect(sky(page).locator("[data-fall]").first()).toHaveCSS("animation-name", "sky-fall");
  await expect(sky(page).locator("[data-rise]").first()).toHaveCSS("animation-name", "sky-rise");
  await expect(sky(page).locator("[data-piece=balloon]").first()).toHaveCSS("animation-name", "balloon-sway");
  const balloonTops = await sky(page)
    .locator("[data-piece=balloon]")
    .evaluateAll((all) => all.map((el) => el.getBoundingClientRect().top));
  expect(balloonTops.filter((t) => t > size.height / 2).length).toBeGreaterThan(1);
  expect(balloonTops.filter((t) => t < size.height / 2).length).toBeGreaterThan(1);

  const [glitterThen, glitterNow] = await travel(page, "[data-fall]");
  expect(glitterNow!).toBeGreaterThan(glitterThen! + size.height / 3);
  const [balloonThen, balloonNow] = await travel(page, "[data-rise]");
  expect(balloonNow!).toBeLessThan(balloonThen! - size.height / 3);

  // The rows stream in after the sky: only then is there anything to scroll.
  await expect(page.getByRole("listitem").filter({ hasText: /^Syssla/ })).toHaveCount(20);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await sky(page).boundingBox()).toEqual({ x: 0, y: 0, ...size });
});

/** Whether the bunch's red balloon is what is painted where it is, with the flight held mid-way. */
const bunchOnTop = (page: Page) =>
  paintedMidFlight(page, page.locator("[data-bunch]"), page.locator("[data-bunch] [data-bunch-red]"), { x: 0.7, y: 0.6 });

test("the bunch rises four seconds every thirty, from a new place, over everything, and presses go through it", async ({
  page,
  context,
}) => {
  const anna = await logIn(context, "anna", "adult");
  await wear(anna.id, "kalas");
  await page.clock.install();
  await page.goto("/");
  await expect(sky(page)).toBeAttached();
  const untilNext = await pausedClock(page);
  await page.clock.runFor((await untilNext()) - 200);
  await expect(bunch(page)).toHaveCount(0);
  await page.clock.runFor(700);
  await expect(bunch(page)).toHaveCount(1);
  await expect(bunch(page)).toHaveAttribute("aria-hidden", "true");
  await expect(bunch(page)).toHaveCSS("pointer-events", "none");

  // It rises from the bottom of the window to above its top.
  const start = await flightAt(bunch(page), 0);
  expect(start.top).toBeGreaterThanOrEqual(start.height - 8);
  expect(start.left).toBeGreaterThanOrEqual(0);
  expect(start.right).toBeLessThanOrEqual(start.width);
  expect((await flightAt(bunch(page), PASS_MS - 1)).bottom).toBeLessThanOrEqual(1);
  const mid = await flightAt(bunch(page), PASS_MS / 2);
  expect(mid.top).toBeGreaterThan(0);
  expect(mid.bottom).toBeLessThan(mid.height);
  expect(
    await bunch(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }),
  ).toBe(false);

  // A sheet opened while it rises: it stays on top, and what is under it can still be pressed.
  await plus(page).click();
  await expect(page.getByRole("dialog", { name: "Ny uppgift" })).toBeVisible();
  await expect(bunch(page)).toHaveCount(1);
  await expect.poll(() => bunchOnTop(page)).toEqual([230, 57, 70]);

  // Gone after the pass; the next one, thirty seconds on, crosses the already open sheet.
  await page.clock.runFor(PASS_MS);
  await expect(bunch(page)).toHaveCount(0);
  await page.clock.runFor(PASS_EVERY_MS - PASS_MS - 1500);
  await expect(bunch(page)).toHaveCount(0);
  await page.clock.runFor(1500);
  await expect(bunch(page)).toHaveCount(1);
  await expect.poll(() => bunchOnTop(page)).toEqual([230, 57, 70]);
  const next = await flightAt(bunch(page), 0);
  expect(Math.abs(next.left - start.left)).toBeGreaterThan((start.width - 150) * 0.3);
  await page.getByRole("button", { name: "Stäng" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("under reduced motion the party sky stands still, and no bunch comes", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const bo = await logIn(context, "bo", "child");
  await wear(bo.id, "kalas");
  await page.clock.install();
  await page.goto("/");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(sky(page).locator("[data-fall]").first()).toHaveCSS("animation-name", "none");
  await expect(sky(page).locator("[data-rise]").first()).toHaveCSS("animation-name", "none");
  await expect(sky(page).locator("[data-piece=balloon]").first()).toHaveCSS("animation-name", "none");
  const size = page.viewportSize()!;
  const tops = await pieceTops(sky(page));
  expect(tops.filter((t) => t > 0 && t < size.height).length).toBeGreaterThan(55);
  expect(tops.filter((t) => t > size.height / 2).length).toBeGreaterThan(15);
  await page.clock.runFor(70_000);
  await expect(bunch(page)).toHaveCount(0);
});

test("a preview that cannot be afforded says what is missing, and stands still under reduced motion", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 180);
  await openButik(page);
  await page.getByRole("button", { name: "Kalas, 300 mynt" }).click();
  const sheet = page.getByRole("dialog", { name: "Kalas" });
  await expect(sheet.getByText("120 mynt kvar")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Köp för 300 mynt" })).toBeDisabled();
  await expect(sheet.locator("[data-preview-bunch]")).toBeHidden();
  await expect(sheet.locator("[data-rise]").first()).toHaveCSS("animation-name", "none");
});
