import type { Locator, Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { choreInstance, lookPurchase, membership } from "../../src/db/schema";
import { PASS_MS, passStart, type SkyTheme } from "../../src/lib/sky";
import { db, seedDone, seedRooms } from "./family";
import { expect } from "./test";

// What the specs of the sky themes (Jul and Kalas) share.

export const WHITE = /^(rgb\(255, 255, 255\)|lab\(100 .*|oklch\(1 0 0\))$/;

// Only the shown page's: Next keeps a page that was left in the document, hidden.
export const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]:visible')).toHaveCount(1);
export const body = (page: Page) => page.locator("body");
export const part = (page: Page, name: "Uppgifter" | "Listor" | "Jag") =>
  page.getByRole("link", { name, exact: true }).locator("visible=true");

/** Makes the person own the theme and use it, as buying it does. */
export async function wear(userId: string, theme: SkyTheme) {
  const [m] = await db.select({ householdId: membership.householdId }).from(membership).where(eq(membership.userId, userId));
  await db.insert(lookPurchase).values({ householdId: m!.householdId, userId, kind: "theme", key: theme, price: 300 });
  await db.update(membership).set({ theme }).where(eq(membership.userId, userId));
}

/** Gives a person `coins` as one done task, the way earned coins are counted. */
export async function grant(userId: string, coins: number) {
  const rooms = await seedRooms("Hall");
  const done = await seedDone({ title: "Stor", roomId: rooms["Hall"]!.id, completedById: userId });
  await db.update(choreInstance).set({ coins }).where(eq(choreInstance.choreId, done.id));
}

export async function openButik(page: Page) {
  await page.goto("/jag");
  await hydrated(page);
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
}

export const pieceTops = (box: Locator) =>
  box.locator("[data-piece]").evaluateAll((all) => all.map((el) => el.getBoundingClientRect().top));

/** Stops the page's clock, and answers how long it is until the next pass starts (and a little in). */
export async function pausedClock(page: Page) {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  const now = await page.evaluate(() => performance.now());
  let start = passStart(now);
  if (start <= now) {
    await page.clock.runFor(start + PASS_MS - now + 100);
    start = passStart(start + PASS_MS);
  }
  return async () => start - (await page.evaluate(() => performance.now()));
}

/** Holds a flyer's flight at `ms` and answers where it then is, and the window's size. */
export const flightAt = (flyer: Locator, ms: number) =>
  flyer.evaluate((el, time) => {
    for (const a of el.getAnimations()) {
      a.pause();
      a.currentTime = time;
    }
    const { left, right, top, bottom } = el.getBoundingClientRect();
    return { left, right, top, bottom, width: window.innerWidth, height: window.innerHeight };
  }, ms);

/** The colour painted on `shape`, a part of the flyer's drawing, with the flight held mid-way. */
export async function paintedMidFlight(page: Page, flyer: Locator, shape: Locator, at: { x: number; y: number }) {
  await flightAt(flyer, PASS_MS / 2);
  const box = (await shape.boundingBox())!;
  const shot = await page.screenshot({ clip: { x: box.x + box.width * at.x, y: box.y + box.height * at.y, width: 1, height: 1 } });
  return page.evaluate(async (data) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height).getContext("2d")!;
    canvas.drawImage(image, 0, 0);
    return Array.from(canvas.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, shot.toString("base64"));
}
