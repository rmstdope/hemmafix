import type { Page } from "@playwright/test";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedChore, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const DAY = 86_400_000;
const entries = (page: Page) => page.getByRole("main").getByRole("listitem").locator("p.font-medium");

test("a child sees what they have done, and only that", async ({ context }) => {
  const anna = await logIn(context, "anna", "adult");
  const boContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const page = await boContext.newPage();
  const bo = await logIn(boContext, "bo", "child");
  const rooms = await seedRooms("Kök", "Sovrum");
  await seedDone({ title: "Bädda sängen", roomId: rooms["Sovrum"]!.id, completedById: bo.id });
  await seedDone({ title: "Diska", roomId: rooms["Kök"]!.id, completedById: bo.id, completedAt: new Date(Date.now() - 3 * DAY) });
  await seedDone({ title: "Annas uppgift", roomId: rooms["Kök"]!.id, completedById: anna.id });

  await page.goto("/");
  await page.getByRole("link", { name: "Gjort" }).click();
  await expect(page.getByRole("heading", { name: "Gjort" })).toBeVisible();
  await expect(page.getByText("Du har gjort 2 uppgifter senaste månaden.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Idag" })).toContainText("Bädda sängen");
  await expect(page.getByRole("region", { name: "Idag" })).toContainText("Sovrum");
  await expect(entries(page)).toHaveText(["Bädda sängen", "Diska"]);
  await expect(page.getByRole("combobox", { name: "Vems uppgifter" })).toHaveCount(0);

  // Asking for someone else's in the URL still shows only their own.
  await page.goto(`/gjort?vem=${anna.id}`);
  await expect(entries(page)).toHaveText(["Bädda sängen", "Diska"]);
  await boContext.close();
});

test("an adult sees what anyone in the home has done, over a chosen period", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const bo = await logIn(await context.browser()!.newContext(), "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Diska", roomId: rooms["Kök"]!.id, completedById: bo.id });
  await seedDone({
    title: "Rensa kylen",
    roomId: rooms["Kök"]!.id,
    completedById: bo.id,
    completedAt: new Date(Date.now() - 60 * DAY),
  });

  await page.goto("/gjort");
  await expect(page.getByText("Du har inte bockat av något senaste månaden.")).toBeVisible();

  await page.getByRole("combobox", { name: "Vems uppgifter" }).selectOption({ label: "Bo Andersson" });
  await expect(page.getByText("Bo har gjort 1 uppgift senaste månaden.")).toBeVisible();
  await expect(entries(page)).toHaveText(["Diska"]);

  await page.getByRole("combobox", { name: "Period" }).selectOption({ label: "Senaste året" });
  await expect(entries(page)).toHaveText(["Diska", "Rensa kylen"]);
  await page.reload();
  await expect(entries(page)).toHaveText(["Diska", "Rensa kylen"]);
});

test("a tick shows up in the history, and an undone tick goes away", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, recurrence: null });

  await page.goto("/");
  await page.getByRole("button", { name: "Markera som klar" }).click();
  await expect(page.getByText("Inget att göra just nu")).toBeVisible();
  await page.getByRole("link", { name: "Gjort" }).click();
  await expect(entries(page)).toHaveText(["Diska"]);

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await page.getByText(/Klart senaste veckan/).click();
  await page.getByRole("button", { name: "Ångra klar" }).click();
  await expect(page.getByRole("list", { name: "Att göra" })).toContainText("Diska");
  await page.getByRole("link", { name: "Gjort" }).click();
  await expect(page.getByText("Du har inte bockat av något senaste månaden.")).toBeVisible();
});
