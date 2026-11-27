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
  const comeBack = () => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  // Twice, each time until the refresh has found the server gone: only a page that stayed can ask
  // again, and a fallback navigation after the first has by then had time to replace it.
  for (let i = 0; i < 2; i++) {
    const refused = page.waitForEvent("requestfailed", (r) => r.url().endsWith("/healthz"));
    await comeBack();
    await refused;
  }

  await expect(page).toHaveURL(/\/hemmet$/);
  await expect(field).toHaveValue("Gäst");

  // Meanwhile someone adds a room; once the server answers again the page shows it.
  await seedRooms("Tvättstuga");
  await page.unroute("**/*");
  await comeBack();

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
    // The stream must have failed before the server answers again, or it would simply open.
    let failed!: () => void;
    const streamFailed = new Promise<void>((resolve) => (failed = resolve));
    await page.route("**/api/events", async (route) => {
      await refuse(route);
      failed();
    });
    // The page's own wait before it opens a new stream is run by hand below.
    await page.clock.install();
    await page.goto("/hemmet");
    await streamFailed;
    const field = page.getByRole("textbox", { name: "Nytt rum" });
    await field.fill("Gäst");

    await seedRooms("Tvättstuga");
    await page.unroute("**/api/events");

    // Nothing is clicked and the tab never leaves view: only the stream coming back refreshes.
    // The clock is moved past the 5 s reconnect delay until it does, since the page may not have
    // seen the failure yet; a refused connection is retried by the browser, in its own time.
    await expect(async () => {
      await page.clock.runFor(5_000);
      await expect(page.getByRole("list", { name: "Rum" }).getByText("Tvättstuga")).toBeVisible({
        timeout: 500,
      });
    }).toPass({ timeout: 15_000 });
    await expect(field).toHaveValue("Gäst");
  });
}
