import { E2E_BASE_URL } from "./support/env";
import { logIn, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

test("an adult cheers a child's tick; the child sees the count, who, and a note that stays closed", async ({
  page,
  context,
}) => {
  await logIn(context, "anna", "adult");
  const boContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const boPage = await boContext.newPage();
  const bo = await logIn(boContext, "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Tömma diskmaskinen", roomId: rooms["Kök"]!.id, completedById: bo.id });

  await boPage.goto("/");
  await boPage.getByText(/Klart senaste veckan/).click();
  await expect(boPage.getByRole("button", { name: /^👏/ })).toHaveCount(0);

  await page.goto("/");
  await page.getByText(/Klart senaste veckan/).click();
  const cheer = page.getByRole("button", { name: "Ge high five" });
  await cheer.click();
  await expect(page.getByRole("button", { name: "Ta tillbaka high five" })).toBeVisible();

  // Live on the child's open page: the note and the count, with no reload.
  await expect(boPage.getByText("Anna gav dig en high five för Tömma diskmaskinen")).toBeVisible();
  await boPage.getByRole("button", { name: "👏 1" }).click();
  await expect(boPage.getByText("Anna", { exact: true })).toBeVisible();
  // The child cannot cheer anything: no cheer button, and none on their own row.
  await expect(boPage.getByRole("button", { name: "Ge high five" })).toHaveCount(0);

  await boPage.getByRole("button", { name: "Stäng" }).click();
  await boPage.reload();
  await expect(boPage.getByText(/gav dig en high five/)).toHaveCount(0);
  await expect(boPage.getByText(/Klart senaste veckan/)).toBeVisible();

  // Taking it back removes the count live.
  await page.getByRole("button", { name: "Ta tillbaka high five" }).click();
  await boPage.getByText(/Klart senaste veckan/).click();
  await expect(boPage.getByRole("button", { name: /^👏/ })).toHaveCount(0);
});

test("a person has no cheer button on their own tick", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedDone({ title: "Diska", roomId: rooms["Kök"]!.id, completedById: anna.id });
  await page.goto("/");
  await page.getByText(/Klart senaste veckan/).click();
  await expect(page.getByRole("button", { name: "Diska: ångra klar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ge high five" })).toHaveCount(0);
});
