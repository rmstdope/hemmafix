import type { Page } from "@playwright/test";
import { logIn, seedChore, seedRooms } from "./support/family";
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
  await expect(parts(page).getByRole("link")).toHaveText(["Uppgifter", "Listor"]);
  await expect(parts(page).getByRole("link", { name: "Uppgifter" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("combobox", { name: "Filtrera på rum" }).selectOption({ label: "Kök" });
  await expect(page.getByText("Dammsuga")).toHaveCount(0);

  await parts(page).getByRole("link", { name: "Listor" }).click();
  await expect(page).toHaveTitle("Listor – Hemmafix");
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
  await expect(page.getByText("Här kommer familjens listor – inköp, packning och annat ni vill bocka av tillsammans.")).toBeVisible();
  await expect(page.getByText("Snart på plats.")).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Listor" })).toHaveAttribute("aria-current", "page");
  // Gjort belongs to the tasks; Hemmet and Logga ut are on every part.
  await expect(page.getByRole("link", { name: "Gjort" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Hemmet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Logga ut" })).toBeVisible();

  await parts(page).getByRole("link", { name: "Uppgifter" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Filtrera på rum" })).toHaveValue(/room:/);
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

test("Gjort keeps the bar, Hemmet and login have none, and ← from Hemmet comes back", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await page.getByRole("link", { name: "Gjort" }).click();
  await expect(page.getByRole("heading", { name: "Gjort" })).toBeVisible();
  await expect(parts(page).getByRole("link", { name: "Uppgifter" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();

  await page.getByRole("link", { name: "Hemmet" }).click();
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
  await expect(parts(page)).toHaveCount(0);

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await parts(page).getByRole("link", { name: "Listor" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
  await page.getByRole("link", { name: "Hemmet" }).click();
  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByRole("heading", { name: "Listor" })).toBeVisible();
});

test("a child gets the same tabs and no Hemmet", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/listor");
  await expect(parts(page).getByRole("link")).toHaveText(["Uppgifter", "Listor"]);
  await expect(page.getByRole("link", { name: "Hemmet" })).toHaveCount(0);
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
