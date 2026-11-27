import { filterSelect } from "./support/board";
import type { Page } from "@playwright/test";
import { logIn, seedChore, seedRooms } from "./support/family";
import { chooseFromMenu, menuButton, menuItem } from "./support/menu";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

const parts = (page: Page) => page.getByRole("navigation", { name: "Delar" });
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 640;

test("an adult moves between Uppgifter and Listor, and the filter is kept", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const { Kök, Hall } = await seedRooms("Kök", "Hall");
  await seedChore({ title: "Diska", roomId: Kök!.id, assigneeId: anna.id });
  await seedChore({ title: "Dammsuga", roomId: Hall!.id });

  await page.goto("/");
  await expect(page).toHaveTitle("Uppgifter – Hemmafix");
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await expect(parts(page).getByRole("link")).toHaveText(["Uppgifter", "Listor", "Jag"]);
  await expect(parts(page).getByRole("link", { name: "Uppgifter" })).toHaveAttribute("aria-current", "page");

  await (await filterSelect(page, "Rum")).selectOption({ label: "Kök" });
  await expect(page.getByText("Dammsuga")).toHaveCount(0);

  await parts(page).getByRole("link", { name: "Listor" }).click();
  await expect(page).toHaveTitle("Listor – Hemmafix");
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
  await expect(page.getByText("Inga listor ännu.")).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  // The menu is the same on every part: Gjort, Hemmet and Logga ut.
  for (const name of ["Gjort", "Hemmet", "Logga ut"] as const) await expect(await menuItem(page, name)).toBeVisible();
  await page.keyboard.press("Escape");

  await parts(page).getByRole("link", { name: "Uppgifter" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await expect(await filterSelect(page, "Rum")).toHaveValue(/room:/);
  await expect(page.getByText("Diska")).toBeVisible();
  await expect(page.getByText("Dammsuga")).toHaveCount(0);
});

test("the bar is at the bottom on a phone and in the top strip on a desktop", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  const box = (await parts(page).boundingBox())!;
  const height = page.viewportSize()!.height;
  if (isPhone(page)) expect(box.y + box.height).toBeGreaterThan(height - 2);
  else expect(box.y).toBeLessThan(80);
  await expect(parts(page)).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("Gjort keeps the bar, Hemmet has the strip only on a desktop, and ← from Hemmet comes back", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await chooseFromMenu(page, "Gjort");
  await expect(page.getByRole("heading", { name: "Gjort" })).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Uppgifter" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();

  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  // The tabs are the desktop strip's; a phone has no bottom bar here.
  await expect(parts(page)).toHaveCount(isPhone(page) ? 0 : 1);

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await parts(page).getByRole("link", { name: "Listor" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
  await chooseFromMenu(page, "Hemmet");
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
});

test("a child gets the same tabs and no Hemmet", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/listor");
  await expect(parts(page).getByRole("link")).toHaveText(["Uppgifter", "Listor", "Jag"]);
  await expect(await menuItem(page, "Gjort")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Hemmet" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Logga ut" })).toBeVisible();
});

test("a notice sits above the bar on a phone", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const { Kök } = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: Kök!.id });
  await page.goto("/");
  await page.getByRole("button", { name: "Mer" }).click();
  await page.getByRole("button", { name: "Ta bort uppgiften" }).click();
  const notice = page.locator("[data-sonner-toast]").first();
  await expect(notice).toBeVisible();
  if (isPhone(page)) {
    const bar = (await parts(page).boundingBox())!;
    // Once it has slid into place.
    await expect
      .poll(async () => {
        const n = (await notice.boundingBox())!;
        return n.y + n.height;
      })
      .toBeLessThanOrEqual(bar.y + 1);
  }
});

test("a notice leaves the + free", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const { Kök } = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: Kök!.id });
  await page.goto("/");
  await page.getByRole("button", { name: "Mer" }).click();
  await page.getByRole("button", { name: "Ta bort uppgiften" }).click();
  const notice = page.locator("[data-sonner-toast]").first();
  await expect(notice).toBeVisible();
  // Once it has slid into place: it rises from below, so it settles when it stops moving.
  let last = -1;
  await expect
    .poll(async () => {
      const y = (await notice.boundingBox())!.y;
      const settled = y === last;
      last = y;
      return settled;
    })
    .toBe(true);
  // Above the + rather than over it: covered, it cannot be tapped until the notice fades, and a
  // notice under the pointer never fades.
  const n = (await notice.boundingBox())!;
  const plus = (await page.getByRole("button", { name: "Ny uppgift" }).boundingBox())!;
  const overlaps = n.x < plus.x + plus.width && plus.x < n.x + n.width && n.y < plus.y + plus.height && plus.y < n.y + n.height;
  expect(overlaps).toBe(false);
});

test("← from Hemmet still returns to Listor after a visit to a routine page", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/listor");
  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  await page.goto("/hemmet/rutiner/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70");
  await page.getByRole("link", { name: "Tillbaka till Hemmet" }).click();
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  await page.getByRole("link", { name: "Tillbaka", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
});

test("the bar is only on the parts: not on login", async ({ page }) => {
  await page.goto("/login");
  await expect(parts(page)).toHaveCount(0);
});

test("at 320px the three tabs share the bar and nothing overflows", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const [a, b, c] = await parts(page).getByRole("link").all();
  const [ba, bb, bc] = [(await a!.boundingBox())!, (await b!.boundingBox())!, (await c!.boundingBox())!];
  expect(Math.abs(ba.width - bb.width)).toBeLessThan(2);
  expect(Math.abs(ba.width - bc.width)).toBeLessThan(2);
  expect(ba.height).toBeLessThan(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("a notice sits above the bar at 620px, where sonner's own phone mode is off", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const { Kök } = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: Kök!.id });
  await page.setViewportSize({ width: 620, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Mer" }).click();
  await page.getByRole("button", { name: "Ta bort uppgiften" }).click();
  const notice = page.locator("[data-sonner-toast]").first();
  await expect(notice).toBeVisible();
  const bar = (await parts(page).boundingBox())!;
  await expect
    .poll(async () => {
      const n = (await notice.boundingBox())!;
      return n.y + n.height;
    })
    .toBeLessThanOrEqual(bar.y + 1);
});

test("tapping the lit tab takes you to the top", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const { Kök } = await seedRooms("Kök");
  for (let i = 0; i < 25; i++) await seedChore({ title: `Syssla ${i}`, roomId: Kök!.id });
  await page.goto("/");
  await expect(page.getByText("Syssla 0", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await parts(page).getByRole("link", { name: "Uppgifter" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("Gjort opened from Listor goes back to Listor and lights it, also after a reload", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/listor");
  await chooseFromMenu(page, "Gjort");
  await expect(page.getByRole("heading", { name: "Gjort" })).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();

  await parts(page).getByRole("link", { name: "Uppgifter" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await chooseFromMenu(page, "Gjort");
  await expect(parts(page).getByRole("link", { name: "Uppgifter" })).toHaveAttribute("aria-current", "page");
});

test("desktop Hemmet and a routine's page have the strip with the lit tab, the coin pill and the marked menu", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/hemmet");
  // Opened by a link with nothing remembered: Uppgifter is lit.
  if (!isPhone(page)) {
    await expect(parts(page).getByRole("link", { name: "Uppgifter" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: /mynt/ })).toBeVisible();
    await expect(menuButton(page)).toBeVisible();
  } else {
    await expect(menuButton(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /mynt/ })).toHaveCount(0);
  }

  await page.goto("/listor");
  await chooseFromMenu(page, "Hemmet");
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  if (isPhone(page)) return;
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  // The Hemmet item is marked, pressing it only closes the menu, and ← still goes to Listor.
  const hemmet = await menuItem(page, "Hemmet");
  await expect(hemmet).toHaveAttribute("aria-current", "page");
  await hemmet.click();
  await expect(page.getByRole("menuitem", { name: "Hemmet" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  await page.getByRole("link", { name: "Tillbaka", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
  await chooseFromMenu(page, "Hemmet");

  await page.goto("/hemmet/rutiner/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70");
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  await expect(await menuItem(page, "Hemmet")).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /mynt/ })).toBeVisible();
});
