import type { Page } from "@playwright/test";
import { PASS_MS } from "../src/lib/sky";
import { holdLooks, logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { chooseFromMenu } from "./support/menu";
import { body, flightAt, grant, hydrated, openButik, paintedMidFlight, part, pausedClock, pieceTops, wear, WHITE } from "./support/sky";
import { expect, test } from "./support/test";

const SKY = "rgb(15, 31, 61)";
const DARK_SKY = "rgb(11, 22, 48)";
const RED = "rgb(192, 38, 45)";
const GREEN = "rgb(21, 128, 61)";

const sleigh = (page: Page) => page.locator("[data-sleigh]:visible");
const sky = (page: Page) => page.locator("[data-jul-sky=page]:visible");
const plus = (page: Page) => page.getByRole("button", { name: "Ny uppgift" });
const wearJul = (userId: string) => wear(userId, "jul");

test("Jul is sold for 300, previewed with what moves, and used at once", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 320);
  await openButik(page);
  const tile = page.getByRole("button", { name: "Jul, 300 mynt" });
  await expect(tile.locator("[data-jul-sky] [data-piece=present]").first()).toBeAttached();
  await expect(tile.locator("[data-jul-swatch]")).toHaveCSS("background-color", SKY);
  await expect(body(page)).not.toHaveCSS("background-color", SKY);

  await tile.click();
  const sheet = page.getByRole("dialog", { name: "Jul" });
  await expect(sheet.getByText("Så här ser Hemmafix ut för dig.")).toBeVisible();
  await expect(sheet.getByText("Snö och paket faller, och tomtens släde flyger förbi.")).toBeVisible();
  const preview = sheet.locator("[data-jul-preview]");
  await expect(preview).toHaveCSS("background-color", SKY);
  await expect(preview.locator("[data-piece=flake]").first()).toBeAttached();
  await expect(preview.locator("[data-preview-sleigh]")).toBeVisible();
  await expect(preview.locator("[data-preview-sleigh]")).not.toHaveCSS("animation-name", "none");
  await expect(preview.locator("[data-preview-button]")).toHaveCSS("background-color", RED);
  await expect(sheet.getByRole("button", { name: "Avbryt" })).toBeVisible();

  await sheet.getByRole("button", { name: "Köp för 300 mynt" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Jul, används" })).toContainText("✓ Används");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(sky(page)).toBeAttached();

  // Switching away removes it all at once, and switching back is free.
  await page.getByRole("button", { name: "Svart" }).click();
  await expect(page.getByRole("button", { name: "Svart, används" })).toBeVisible();
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
  await expect(page.locator("[data-jul-sky=page]")).toHaveCount(0);
  await expect(page.locator("[data-sleigh]")).toHaveCount(0);
  await page.getByRole("button", { name: "Jul", exact: true }).click();
  await expect(body(page)).toHaveCSS("background-color", SKY);
});

test("the page is a night sky with white rows, light headings, red controls and a green done circle, for that person only", async ({
  page,
  context,
  browser,
}) => {
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Dammsuga", roomId: rooms["Kök"]!.id });
  await seedDone({ title: "Mata katten", roomId: rooms["Kök"]!.id, completedById: bo.id });
  await page.goto("/");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(page.getByRole("listitem").filter({ hasText: "Dammsuga" })).toHaveCSS("background-color", WHITE);
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toHaveCSS("color", "rgb(248, 250, 252)");
  await expect(page.getByRole("tablist")).toHaveCSS("background-color", WHITE);
  await expect(page.getByRole("tab", { selected: true })).toHaveCSS("border-bottom-color", RED);
  await page.getByText(/^Klart senaste veckan/).click();
  await expect(page.getByRole("button", { name: "Mata katten: ångra klar" })).toHaveCSS("background-color", GREEN);

  const lit = page.getByRole("link", { name: "Uppgifter" }).and(page.locator("[aria-current=page]")).locator("visible=true");
  if (test.info().project.name === "desktop") {
    await expect(lit).toHaveCSS("background-color", RED);
    await expect(lit).toHaveCSS("color", "rgb(255, 255, 255)");
  } else {
    await expect(lit).toHaveCSS("color", RED);
    await expect(page.locator("[data-parts-bar]")).toHaveCSS("background-color", WHITE);
  }

  // An empty day keeps its words in a white box.
  await page.getByRole("tab", { name: /Senare/ }).click();
  await expect(page.getByText("Inget planerat längre fram.")).toHaveCSS("background-color", WHITE);

  await part(page, "Jag").click();
  await hydrated(page);
  await expect(page.getByRole("button", { name: "Framsteg" })).toHaveCSS("background-color", RED);
  await expect(page.getByRole("region", { name: "Den här veckan" })).toHaveCSS("background-color", WHITE);

  const other = await browser.newContext();
  await logIn(other, "anna", "adult");
  const annaPage = await other.newPage();
  await annaPage.goto("/");
  await expect(annaPage.locator('[data-look-own="svart"]').first()).toBeAttached();
  await expect(body(annaPage)).not.toHaveCSS("background-color", SKY);
  await expect(annaPage.locator("[data-jul-sky]")).toHaveCount(0);
  await expect(annaPage.locator("[data-sleigh]")).toHaveCount(0);
  await other.close();
});

test("an open filter button is white with dark ink, and an opened section stays light on the sky", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Mata katten", roomId: rooms["Kök"]!.id, completedById: bo.id });
  await page.goto("/");
  const filter = page.getByRole("button", { name: "Filtrera" });
  await filter.click();
  await filter.hover();
  await expect(filter).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(filter).toHaveCSS("color", "rgb(24, 24, 27)");

  const summary = page.getByText(/^Klart senaste veckan/);
  await summary.click();
  await expect(summary).toHaveCSS("color", "rgb(203, 213, 225)");

  await page.goto("/listor");
  await hydrated(page);
  await page.getByRole("button", { name: "Ny lista" }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Inköp");
  await page.keyboard.press("Enter");
  const field = page.getByRole("textbox", { name: "Lägg till…" });
  await field.fill("Mjölk");
  await field.press("Enter");
  await page.getByRole("button", { name: "Mjölk: bocka av" }).click();
  const done = page.getByRole("button", { name: /^Klart \(1\)/ });
  await done.click();
  await expect(done).toHaveAttribute("aria-expanded", "true");
  await done.hover();
  await expect(done).toHaveCSS("color", "rgb(203, 213, 225)");
  await expect(page.getByRole("button", { name: "Mjölk: ångra avbockad" })).toHaveCSS("background-color", GREEN);
});

test("dark mode deepens the sky and keeps its dark rows", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Dammsuga", roomId: rooms["Kök"]!.id });
  await page.goto("/");
  await expect(body(page)).toHaveCSS("background-color", DARK_SKY);
  await expect(page.getByRole("listitem").filter({ hasText: "Dammsuga" })).not.toHaveCSS("background-color", WHITE);
});

test("the home settings pages wear it too, and switching away afterwards removes it", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await wearJul(anna.id);
  await page.goto("/jag");
  await hydrated(page);
  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toHaveCSS("color", "rgb(248, 250, 252)");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(page.getByRole("textbox", { name: "Hemmets namn" })).toHaveCSS("background-color", WHITE);
  await page.getByRole("link", { name: "Tillbaka" }).locator("visible=true").click();
  await hydrated(page);
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
  await page.getByRole("button", { name: "Svart" }).click();
  await expect(page.getByRole("button", { name: "Svart, används" })).toBeVisible();
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
});

test("a page left before its marks arrived does not keep the sky once the person switches away", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await wearJul(anna.id);
  await page.goto("/jag");
  await hydrated(page);
  // Hemmet opens, but its marks cannot arrive until the person has left it again: Next keeps the
  // page in the document, hidden, and the marks stream into it there.
  const release = await holdLooks();
  const landed = page.waitForEvent("requestfinished", (r) => r.url().includes("/hemmet?") && !r.headers()["next-router-prefetch"]);
  await chooseFromMenu(page, "Hemmet");
  await expect(page.locator("main [aria-busy=true]").locator("visible=true")).toBeVisible();
  await page.goBack();
  await hydrated(page);
  await release();
  await landed;
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
  await page.getByRole("button", { name: "Svart" }).click();
  await expect(page.getByRole("button", { name: "Svart, används" })).toBeVisible();
  await expect(page.locator('[data-look-own="jul"]')).toHaveCount(0);
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
});

test("the sky is there before the person's choice has arrived, and never on the login page", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-sky", "jul");

  // Without the app's scripts nothing but the inline one can mark the page.
  await page.route("**/_next/static/**/*.js", (route) => route.abort());
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-sky", "jul");
  // As the page is before the streamed marks arrive.
  await page.evaluate(() => document.querySelectorAll("[data-look-own]").forEach((el) => el.removeAttribute("data-look-own")));
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await page.unroute("**/_next/static/**/*.js");

  await context.clearCookies();
  await page.goto("/login");
  await expect(body(page)).not.toHaveCSS("background-color", SKY);

  // The next person on this device: their own marks decide, and the hint goes.
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-sky", "jul");
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
});

test("a session that ended sends the person to a login page without the sky", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-sky", "jul");
  await context.clearCookies();
  // A press inside the app: the redirect to /login happens without a new document.
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  await part(page, "Listor").click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
  expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
  await expect(body(page)).not.toHaveCSS("background-color", SKY);
});

test("signing out forgets the sky on this device", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-sky", "jul");
  await chooseFromMenu(page, "Logga ut");
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem("hemmafix-sky"))).toBeNull();
});

test("snow and presents fall behind the content, spread over the window from the start", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
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
  await expect(sky(page).locator("[data-piece=present]")).toHaveCount(12);
  await expect(sky(page).locator("[data-fall]").first()).toHaveCSS("animation-name", "sky-fall");
  const tops = await pieceTops(sky(page));
  expect(tops.filter((t) => t > size.height / 2).length).toBeGreaterThan(10);

  // The rows stream in after the sky: only then is there anything to scroll.
  await expect(page.getByRole("listitem").filter({ hasText: /^Syssla/ })).toHaveCount(20);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await sky(page).boundingBox()).toEqual({ x: 0, y: 0, ...size });
});

/** Whether the sleigh's red is what is painted where its body is, with the flight held mid-way. */
const sleighOnTop = (page: Page) =>
  paintedMidFlight(page, page.locator("[data-sleigh]"), page.locator("[data-sleigh] [data-sleigh-body]"), { x: 0.4, y: 0.75 });

test("the sleigh flies four seconds every thirty, over everything, and presses go through it", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await wearJul(anna.id);
  await page.clock.install();
  await page.goto("/");
  await expect(sky(page)).toBeAttached();
  const untilNext = await pausedClock(page);
  await page.clock.runFor((await untilNext()) - 200);
  await expect(sleigh(page)).toHaveCount(0);
  await page.clock.runFor(700);
  await expect(sleigh(page)).toHaveCount(1);
  await expect(sleigh(page)).toHaveAttribute("aria-hidden", "true");
  await expect(sleigh(page)).toHaveCSS("pointer-events", "none");

  // It crosses the whole window, left to right.
  const at = (ms: number) => flightAt(sleigh(page), ms);
  expect((await at(0)).right).toBeLessThanOrEqual(1);
  expect((await at(PASS_MS - 1)).left).toBeGreaterThanOrEqual((await at(0)).width - 2);
  const mid = await at(2000);
  expect(mid.left).toBeGreaterThan(0);
  expect(
    await sleigh(page).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
    }),
  ).toBe(false);

  // A sheet opened while it flies: it stays on top, and what is under it can still be pressed.
  await plus(page).click();
  await expect(page.getByRole("dialog", { name: "Ny uppgift" })).toBeVisible();
  await expect(sleigh(page)).toHaveCount(1);
  await expect.poll(() => sleighOnTop(page)).toEqual([220, 38, 38]);

  // Gone after the pass; the next one, thirty seconds on, crosses the already open sheet.
  await page.clock.runFor(PASS_MS);
  await expect(sleigh(page)).toHaveCount(0);
  await page.clock.runFor(30_000 - PASS_MS - 1500);
  await expect(sleigh(page)).toHaveCount(0);
  await page.clock.runFor(1500);
  await expect(sleigh(page)).toHaveCount(1);
  await expect.poll(() => sleighOnTop(page)).toEqual([220, 38, 38]);
  await page.getByRole("button", { name: "Stäng" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("moving between the parts and Hemmet neither restarts nor interrupts the rhythm", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await wearJul(anna.id);
  await page.clock.install();
  await page.goto("/");
  await expect(sky(page)).toBeAttached();
  const untilNext = await pausedClock(page);
  await page.clock.runFor((await untilNext()) + 500);
  await expect(sleigh(page)).toHaveCount(1);

  // A reload would start the rhythm over: every step below must stay in this document.
  await page.evaluate(() => Object.assign(window, { sameDocument: true }));
  for (const go of [
    () => part(page, "Listor").click(),
    () => part(page, "Jag").click(),
    () => chooseFromMenu(page, "Hemmet"),
  ]) {
    await page.clock.resume();
    await go();
    await expect(sky(page)).toHaveCount(1);
    const next = await pausedClock(page);
    expect(await page.evaluate(() => "sameDocument" in window)).toBe(true);
    // The passes still come at 4 s, 34 s, 64 s...
    await page.clock.runFor((await next()) - 200);
    await expect(sleigh(page)).toHaveCount(0);
    await page.clock.runFor(700);
    await expect(sleigh(page)).toHaveCount(1);
  }
});

test("under reduced motion the sky stands still with everything scattered over it, and no sleigh comes", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const bo = await logIn(context, "bo", "child");
  await wearJul(bo.id);
  await page.clock.install();
  await page.goto("/");
  await expect(body(page)).toHaveCSS("background-color", SKY);
  await expect(sky(page).locator("[data-fall]").first()).toHaveCSS("animation-name", "none");
  const size = page.viewportSize()!;
  const tops = await pieceTops(sky(page));
  expect(tops.filter((t) => t > 0 && t < size.height).length).toBeGreaterThan(40);
  expect(tops.filter((t) => t > size.height / 2).length).toBeGreaterThan(10);
  await page.clock.runFor(70_000);
  await expect(page.locator("[data-sleigh]:visible")).toHaveCount(0);

  await openButik(page);
  await page.getByRole("button", { name: "Jul, används" }).waitFor();
  expect(await pieceTops(sky(page))).toHaveLength(52);
});

test("under reduced motion the preview is still too", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const bo = await logIn(context, "bo", "child");
  await grant(bo.id, 100);
  await openButik(page);
  await page.getByRole("button", { name: "Jul, 300 mynt" }).click();
  const sheet = page.getByRole("dialog", { name: "Jul" });
  await expect(sheet.getByText("200 mynt kvar")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Köp för 300 mynt" })).toBeDisabled();
  await expect(sheet.locator("[data-preview-sleigh]")).toBeHidden();
  await expect(sheet.locator("[data-fall]").first()).toHaveCSS("animation-name", "none");
});
