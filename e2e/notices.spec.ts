import { logIn } from "./support/family";
import { expect, test } from "./support/test";

test("the notices region has a Swedish accessible name", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  const region = page.locator("section[aria-live='polite']");
  await expect(region).toHaveAttribute("aria-label", /^Notiser/);
  await expect(region).not.toHaveAttribute("aria-label", /Notifications/);
});
