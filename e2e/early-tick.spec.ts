import type { Page } from "@playwright/test";
import { addDays, todayIso } from "../src/lib/dates";
import { logIn, seedChore, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /mynt$/ });

async function seedComeback() {
  const rooms = await seedRooms("Kök");
  const daily = { unit: "day" as const, interval: 1 };
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: addDays(todayIso(), 1), recurrence: daily, coins: 20 });
  await seedChore({ title: "Köp mjölk", roomId: rooms["Kök"]!.id, dueDate: addDays(todayIso(), 1), recurrence: null });
}

test("a child sees a locked tick on a repeating chore before its day, and pressing it ticks nothing", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await seedComeback();
  await page.goto("/?flik=imorgon");

  const lock = page.getByRole("button", { name: "Diska: kan bockas av imorgon" });
  const row = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: "Diska" });
  await expect(row).toContainText("Kök · Kan bockas av imorgon");
  await expect(row.getByText("20 mynt")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Köp mjölk: markera som klar" })).toBeVisible();

  await lock.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Diska kan bockas av imorgon.")).toBeVisible();
  await expect(lock).toBeFocused();
  await expect(row).toBeVisible();
  await expect(pill(page)).toHaveText("0");
});

test("an adult may tick it early: the row says no coins first, and the tick gives none", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedComeback();
  await page.goto("/?flik=imorgon");

  const row = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: "Diska" });
  await expect(row).toContainText("Kök · Inga mynt förrän imorgon");
  await page.getByRole("button", { name: "Diska: markera som klar" }).click();

  await expect(page.getByText("Diska är klar. Inga mynt, eftersom den inte är dags förrän imorgon.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Diska" }).getByRole("button", { name: "Diska: markera som klar" })).toHaveCount(1);
  await expect(pill(page)).toHaveText("0");
  await page.goto("/");
  await page.getByText(/Klart senaste veckan/).click();
  await expect(page.getByRole("list", { name: "Klart" }).getByRole("listitem").filter({ hasText: "Diska" }).getByText("0 mynt", { exact: true })).toBeAttached();
});

test("a screen left open over midnight asks the server for the new day, which moves the rows to Nu", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await seedComeback();
  await page.clock.install({ time: new Date() });
  await page.goto("/?flik=imorgon");
  await expect(page.getByRole("button", { name: "Diska: kan bockas av imorgon" })).toBeVisible();
  // Let the refresh the event stream makes on connecting happen first, so only a midnight one counts.
  await page.clock.resume();
  await page.waitForTimeout(1_000);

  const refreshed = page.waitForRequest((r) => r.url().includes("_rsc") && r.headers()["next-router-prefetch"] === undefined);
  await page.clock.fastForward("25:00:00");
  await refreshed;
});

test("further ahead, on Senare, the row names the day once", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Damma", roomId: rooms["Kök"]!.id, dueDate: addDays(todayIso(), 6), recurrence: { unit: "week", interval: 1 } });
  await page.goto("/?flik=senare");

  const row = page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: "Damma" });
  await expect(row.getByRole("button", { name: /^Damma: kan bockas av \S{3} \d+ \S+$/ })).toBeVisible();
  const details = (await row.locator("p.text-xs").innerText()).trim();
  expect(details).toMatch(/^Kök · Kan bockas av \S{3} \d+ \S+$/);
});
