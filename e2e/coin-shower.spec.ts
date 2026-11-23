import type { Page } from "@playwright/test";
import { choreInstance } from "../src/db/schema";
import { db, logIn, seedChore, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });
const tick = (page: Page, title: string) => page.getByRole("button", { name: `${title}: markera som klar` }).click();

/** Counts coins taking off, pill numbers shown and clinks played, from before the page loads. */
async function watch(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { coinsFlown: number; numbers: string[]; clinks: number };
    w.coinsFlown = 0;
    w.numbers = [];
    w.clinks = 0;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      createOscillator() {
        w.clinks += 1;
        return super.createOscillator();
      }
    };
    new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && n.hasAttribute("data-flying-coin")) w.coinsFlown += 1;
        });
      }
      const button = [...document.querySelectorAll("button")].find((b) => /mynt$/.test(b.getAttribute("aria-label") ?? "") && b.getClientRects().length > 0);
      const text = button?.textContent?.trim();
      if (text && w.numbers.at(-1) !== text) w.numbers.push(text);
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

const seen = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { coinsFlown: number; numbers: string[]; clinks: number };
    return { coinsFlown: w.coinsFlown, numbers: w.numbers, clinks: w.clinks };
  });

async function setUp(page: Page, context: Parameters<typeof logIn>[0], titles = ["Diska"]) {
  const person = await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  for (const title of titles) await seedChore({ title, roomId: rooms["Kök"]!.id, recurrence: null });
  await watch(page);
  await page.goto("/");
  await expect(pill(page)).toHaveText("0");
  return person;
}

test("ticking a task off sends five coins, the number climbs coin by coin, with a clink each", async ({ page, context }) => {
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(pill(page)).toHaveText("10", { timeout: 5_000 });
  await expect(page.getByRole("status")).toHaveText("Du fick 10 mynt");
  await page.waitForTimeout(500);
  const { coinsFlown, numbers, clinks } = await seen(page);
  expect(coinsFlown).toBe(5);
  expect(numbers).toEqual(["0", "2", "4", "6", "8", "10"]);
  expect(clinks).toBe(5);
  await expect(page.locator("[data-flying-coin]")).toHaveCount(0);
});

test("undoing a tick-off is quiet: no coins, no sound, no announcement", async ({ page, context }) => {
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(pill(page)).toHaveText("10", { timeout: 5_000 });
  await page.waitForTimeout(2_000);
  const before = await seen(page);
  await page.getByText(/Klart senaste veckan/).click();
  await page.getByRole("button", { name: "Diska: ångra klar" }).click();
  await expect(pill(page)).toHaveText("0");
  const after = await seen(page);
  expect(after.coinsFlown).toBe(before.coinsFlown);
  expect(after.clinks).toBe(before.clinks);
});

test("a tick on another device of the same person updates quietly, with no coins and no sound", async ({ page, context }) => {
  await setUp(page, context);
  const other = await context.newPage();
  await other.goto("/");
  await tick(other, "Diska");
  await expect(pill(page)).toHaveText("10");
  expect(await seen(page)).toMatchObject({ coinsFlown: 0, clinks: 0 });
  await expect(page.getByRole("status")).toHaveText("");
});

test("with reduced motion no coins fly: the number changes at once, glows and clinks once", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setUp(page, context);
  await tick(page, "Diska");
  await expect(pill(page)).toHaveText("10");
  await expect(pill(page)).toHaveAttribute("data-glow", "");
  await expect(page.getByRole("status")).toHaveText("Du fick 10 mynt");
  await expect(pill(page)).not.toHaveAttribute("data-glow", "", { timeout: 3_000 });
  expect(await seen(page)).toMatchObject({ coinsFlown: 0, clinks: 1 });
});

test("when the tick-off is refused the number drops back and the error shows", async ({ page, context }) => {
  await setUp(page, context);
  // Someone else has ticked it already, which this page does not know yet.
  await db.update(choreInstance).set({ completedAt: new Date() });
  await tick(page, "Diska");
  await expect(page.getByText("Någon har redan bockat av den")).toBeVisible();
  await expect(pill(page)).toHaveText("0", { timeout: 5_000 });
  await page.waitForTimeout(1_500);
  await expect(pill(page)).toHaveText("0");
});

test("scrolled down on a phone, a copy of the pill slides in to catch the coins, then leaves", async ({ page, context }, info) => {
  test.skip(info.project.name !== "mobile", "the top strip of the desktop stays in view");
  await setUp(
    page,
    context,
    Array.from({ length: 14 }, (_, i) => `Syssla ${i + 1}`),
  );
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(pill(page)).not.toBeInViewport();
  await tick(page, "Syssla 14");
  const copy = page.locator("[data-coin-float]");
  await expect(copy).toBeVisible();
  await expect(copy).toHaveText("10", { timeout: 5_000 });
  await expect(copy).toHaveCount(0, { timeout: 5_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(pill(page)).toHaveText("10");
});
