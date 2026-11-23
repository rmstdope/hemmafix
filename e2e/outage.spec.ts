import type { Page } from "@playwright/test";
import { logIn, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

// During a deploy the server is briefly unreachable. A live refresh then fails, and Next's router
// falls back to a full navigation, which turns the open page into the browser's error page and
// loses what was being typed. These pin that the page stays and catches up afterwards.

test("an open page stays as it was while the server is unreachable, and catches up after", async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/hemmet");
  const field = page.getByRole("textbox", { name: "Nytt rum" });
  await field.fill("Gäst");

  // The server stops answering: every new request is refused, as during a restart.
  await page.route("**/*", (route) => route.abort("connectionrefused"));
  // Coming back to the tab is one of the things that asks for fresh data.
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  // A refresh fires 150 ms after the event; give a fallback navigation ample time to happen.
  await page.waitForTimeout(2000);

  await expect(page).toHaveURL(/\/hemmet$/);
  await expect(field).toHaveValue("Gäst");

  // Meanwhile someone adds a room; once the server answers again the page shows it.
  await seedRooms("Tvättstuga");
  await page.unroute("**/*");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  await expect(page.getByRole("list", { name: "Rum" }).getByText("Tvättstuga")).toBeVisible();
  await expect(field).toHaveValue("Gäst");
});

// While the app is down its event stream fails too: behind the production proxy as a 502, which
// ends EventSource's own retries for good, and locally as a refused connection, which it retries.
for (const [down, refuse] of [
  ["answers 502", (route) => route.fulfill({ status: 502 })],
  ["refuses the connection", (route) => route.abort("connectionrefused")],
] as const satisfies readonly (readonly [string, Parameters<Page["route"]>[1]])[]) {
  test(`a page whose event stream failed while the server ${down} catches up once it answers`, async ({
    page,
    context,
  }) => {
    await logIn(context, "anna", "adult");
    await seedRooms("Kök");
    await page.route("**/api/events", refuse);
    await page.goto("/hemmet");
    const field = page.getByRole("textbox", { name: "Nytt rum" });
    await field.fill("Gäst");

    await seedRooms("Tvättstuga");
    await page.unroute("**/api/events");

    // Nothing is clicked and the tab never leaves view: only the stream coming back refreshes.
    await expect(page.getByRole("list", { name: "Rum" }).getByText("Tvättstuga")).toBeVisible({
      timeout: 15_000,
    });
    await expect(field).toHaveValue("Gäst");
  });
}
