// Kalender: the Google family calendar's coming days, and asking for the access to it.
import type { Page } from "@playwright/test";
import { CALENDAR_SCOPE } from "../src/lib/calendar";
import { grantCalendar, logIn } from "./support/family";
import { allDay, startGoogle, timed } from "./support/google";
import { RUN_ONCE } from "./support/tags";
import { expect, test as base } from "./support/test";

const test = base.extend<{ google: Awaited<ReturnType<typeof startGoogle>> }>({
  google: async ({}, provide) => {
    const google = await startGoogle();
    await provide(google);
    await google.close();
  },
});

const parts = (page: Page) => page.getByRole("navigation", { name: "Delar" });
const tab = (page: Page) => parts(page).getByRole("link", { name: "Kalender" });
const dot = (page: Page) => tab(page).locator("[data-calendar-dot]");
const card = (page: Page, title: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: title });
const heading = (page: Page, name: string) => page.getByRole("heading", { name });
const retry = (page: Page) => page.getByRole("button", { name: "Försök igen" });
/** A change in Google reaches an open page with the next look, well within this. */
const LIVE = { timeout: 25_000 };

test("someone without access is reminded everywhere, invited, and sent to Google", async ({ page, context, google }) => {
  google.events = [timed("Hemlig", 1, "10:00", "11:00")];
  await logIn(context, "bo", "child");

  for (const path of ["/", "/listor", "/jag"]) {
    await page.goto(path);
    await expect(dot(page)).toBeVisible();
  }
  await tab(page).click();
  await expect(page).toHaveTitle("Kalender – Hemmafix");
  await expect(page.getByRole("heading", { name: "Kalender", level: 1 })).toBeVisible();
  await expect(tab(page)).toHaveAttribute("aria-current", "page");
  await expect(heading(page, "Se familjens kalender här")).toBeVisible();
  await expect(
    page.getByText(
      "Ge Hemmafix tillgång till familjekalendern i ditt Google-konto, så ser du vad som händer de närmaste 14 dagarna. Hemmafix kan bara läsa, aldrig ändra.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Hemlig")).toHaveCount(0);
  await expect(dot(page)).toBeVisible();

  // Google's own page stands in for itself: the test reads where the button went.
  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ body: "Google" }));
  await page.getByRole("button", { name: "Ge tillgång med Google" }).click();
  await page.waitForURL("https://accounts.google.com/**");
  const asked = new URL(page.url()).searchParams;
  expect(asked.get("scope")!.split(" ")).toContain(CALENDAR_SCOPE);
  expect(asked.get("access_type")).toBe("offline");
  expect(asked.get("login_hint")).toBe("bo@e2e.test");

  // Back without giving access: the same card, and nothing about an error.
  await page.goto("/kalender?error=access_denied");
  await expect(heading(page, "Se familjens kalender här")).toBeVisible();
  await expect(dot(page)).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
});

for (const [person, role] of [
  ["anna", "adult"],
  ["bo", "child"],
] as const) {
  test(`${role === "adult" ? "an adult" : "a child"} sees the coming days, read only`, async ({ page, context, google }) => {
    google.events = [
      // Over as the day begins, and not over until it ends: the same at any time of day.
      timed("Simskola", 0, "00:00", "00:00", "Valhallabadet"),
      timed("Kalas hos Ali", 0, "00:01", "00:00", undefined, 1),
      allDay("Sportlov i stugan", -1, 3, "Sälen"),
      timed(undefined, 1, "12:00", "13:00"),
      timed("Luciatåg", 14, "08:00", "09:00"),
      timed("För långt bort", 15, "08:00", "09:00"),
    ];
    const me = await logIn(context, person, role);
    await grantCalendar(me.id);
    await page.goto("/kalender");

    const days = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(days).toHaveCount(3);
    await expect(days.nth(0)).toHaveText(/^Idag · \p{Ll}+dag \d+ \p{Ll}+$/u);
    await expect(days.nth(1)).toHaveText(/^Imorgon · \p{Ll}+dag \d+ \p{Ll}+/u);
    await expect(days.nth(2)).toHaveText(/^\p{Lu}\p{Ll}+dag \d+ \p{Ll}+/u);

    const today = page.getByRole("main").getByRole("list").first().getByRole("listitem");
    await expect(today).toHaveText([
      "Sportlov i stuganHeldag · dag 2 av 3 · Sälen",
      "Simskola00:00–00:00 · Valhallabadet",
      "Kalas hos Ali00:01–00:00",
    ]);
    await expect(card(page, "Sportlov")).toHaveCount(2);
    await expect(card(page, "(Ingen titel)")).toHaveText("(Ingen titel)12:00–13:00");
    await expect(card(page, "Luciatåg")).toBeVisible();
    await expect(page.getByText("För långt bort")).toHaveCount(0);
    await expect(page.getByText("Visar de närmaste 14 dagarna.")).toBeVisible();

    // What has ended today is dimmed.
    await expect(card(page, "Simskola")).toHaveCSS("opacity", "0.45");
    await expect(card(page, "Kalas hos Ali")).toHaveCSS("opacity", "1");

    // Nothing in the list can be pressed or reached with Tab.
    await expect(page.getByRole("list").locator("a, button, input, [tabindex]")).toHaveCount(0);
    await expect(dot(page)).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
    await expect(dot(page)).toHaveCount(0);
  });
}

test("a change in Google reaches the open page, and a withdrawn access asks again", async ({ page, context, google }) => {
  test.setTimeout(90_000);
  const training = timed("Fotboll", 1, "18:00", "19:00");
  google.events = [training];
  const me = await logIn(context, "anna", "adult");
  await grantCalendar(me.id);
  await page.goto("/kalender");
  await expect(card(page, "Fotboll")).toBeVisible();
  // A mark that a reload would lose.
  await page.evaluate(() => document.body.setAttribute("data-open", "same"));

  google.events = [{ ...training, summary: "Innebandy" }, timed("Tandläkare", 2, "08:15", "09:00")];
  await expect(card(page, "Innebandy")).toBeVisible(LIVE);
  await expect(card(page, "Tandläkare")).toBeVisible();
  await expect(card(page, "Fotboll")).toHaveCount(0);

  google.withdrawn = true;
  await expect(heading(page, "Se familjens kalender här")).toBeVisible(LIVE);
  await expect(dot(page)).toBeVisible();
  await expect(card(page, "Innebandy")).toHaveCount(0);
  await expect(page.locator("body")).toHaveAttribute("data-open", "same");
});

test("an account without a family calendar is told so, and can try again", async ({ page, context, google }) => {
  google.hasFamilyCalendar = false;
  const me = await logIn(context, "anna", "adult");
  await grantCalendar(me.id);
  await page.goto("/kalender");

  await expect(heading(page, "Ingen familjekalender hittades")).toBeVisible();
  await expect(
    page.getByText("Ditt Google-konto har ingen familjekalender. Den finns när du är med i en familjegrupp i Google."),
  ).toBeVisible();
  await expect(dot(page)).toHaveCount(0);

  google.hasFamilyCalendar = true;
  await retry(page).click();
  await expect(heading(page, "Inget i kalendern")).toBeVisible();
  await expect(page.getByText("Familjekalendern är tom de närmaste 14 dagarna.")).toBeVisible();
  await expect(page.getByText("Visar de närmaste 14 dagarna.")).toHaveCount(0);
});

test("a Google that does not answer is said, and Försök igen tries again", async ({ page, context, google }) => {
  google.down = true;
  google.events = [timed("Fotboll", 1, "18:00", "19:00")];
  const me = await logIn(context, "anna", "adult");
  await grantCalendar(me.id);
  await page.goto("/kalender");

  await expect(heading(page, "Kunde inte hämta kalendern")).toBeVisible();
  await expect(page.getByText("Google svarar inte just nu.")).toBeVisible();
  await expect(dot(page)).toHaveCount(0);

  google.down = false;
  await retry(page).click();
  await expect(card(page, "Fotboll")).toBeVisible();
});

test("the loading blocks show while the calendar is read", async ({ page, context, google }) => {
  google.events = [timed("Fotboll", 1, "18:00", "19:00")];
  const me = await logIn(context, "anna", "adult");
  await grantCalendar(me.id);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/calendar", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/kalender");

  await expect(page.getByRole("main").getByLabel("Laddar")).toBeVisible();
  release();
  await expect(card(page, "Fotboll")).toBeVisible();
  await expect(page.getByRole("main").getByLabel("Laddar")).toHaveCount(0);
});

test("the calendar is not given to someone who is not logged in", { tag: RUN_ONCE }, async ({ request }) => {
  expect((await request.get("/api/calendar")).status()).toBe(401);
  expect((await request.get("/api/calendar/access")).status()).toBe(401);
});

test("at 320px long titles and places wrap and nothing is cut off", { tag: RUN_ONCE }, async ({ page, context, google }) => {
  const title = "Farmor fyller 70 — middag på Restaurang Sjöbaren med hela släkten, ta med present";
  google.events = [timed(title, 1, "18:00", "22:00", "Sjöbaren,HagaNygata25ÄrEttMycketLångtOrdUtanMellanslagSomMåsteBrytas")];
  const me = await logIn(context, "anna", "adult");
  await grantCalendar(me.id);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/kalender");

  await expect(card(page, "Farmor")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const cut = await card(page, "Farmor").evaluate((el) =>
    [el, ...el.querySelectorAll("*")].some((n) => n.scrollWidth > n.clientWidth + 1),
  );
  expect(cut).toBe(false);
});
