import type { BrowserContext, Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { choreInstance, reward } from "../src/db/schema";
import { E2E_BASE_URL } from "./support/env";
import { db, logIn, seedDone, seedRooms } from "./support/family";
import { expect, test } from "./support/test";

const pill = (page: Page) => page.getByRole("button", { name: /^[\d\s\u00a0]+ mynt$/ });
const hydrated = (page: Page) => expect(page.locator('[data-hydrated="true"]')).toBeAttached();
const butik = async (page: Page) => {
  await page.goto("/jag");
  await hydrated(page);
  await page.getByRole("group", { name: "Visa" }).getByRole("button", { name: "Butik" }).click();
};

/** Gives `userId` coins by a tick made earlier. */
async function earn(userId: string, coins: number) {
  const rooms = await seedRooms("Kök");
  const c = await seedDone({ title: `Gammal ${coins}`, roomId: rooms["Kök"]!.id, completedById: userId });
  await db.update(choreInstance).set({ coins }).where(eq(choreInstance.choreId, c.id));
}

async function addGlass(householdId: string, price = 50) {
  await db.insert(reward).values({ householdId, name: "Glass", price });
}

async function homeOf(userId: string) {
  const m = await db.query.membership.findFirst({ where: (t, { eq }) => eq(t.userId, userId) });
  return m!.householdId;
}

test("an adult adds, changes and removes a reward, and sees why a form is refused", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await butik(page);
  await expect(page.getByText("Inga belöningar än.")).toBeVisible();
  await expect(page.getByText("Lägg till något familjen kan köpa för sina mynt.")).toBeVisible();

  await page.getByRole("button", { name: "＋ Ny belöning" }).click();
  const sheet = page.getByRole("dialog", { name: "Ny belöning" });
  await expect(sheet.getByLabel("Namn")).toBeFocused();
  await sheet.getByRole("button", { name: "Lägg till" }).click();
  await expect(sheet.getByText("Skriv ett namn.")).toBeVisible();
  await sheet.getByLabel("Namn").fill("Glass");
  await sheet.getByLabel("Pris i mynt").fill("1001");
  await sheet.getByRole("button", { name: "Lägg till" }).click();
  await expect(sheet.getByText("Priset ska vara 1–1 000 mynt.")).toBeVisible();
  await sheet.getByLabel("Pris i mynt").fill("50");
  await sheet.getByRole("button", { name: "Lägg till" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Glass", { exact: true })).toBeVisible();
  // Nothing is earned yet, so it cannot be bought.
  await expect(page.getByText("50 mynt kvar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Köp Glass för 50 mynt" })).toBeDisabled();

  await page.getByRole("button", { name: "Glass", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Ändra belöning" });
  await edit.getByLabel("Namn").fill("Stor glass");
  await edit.getByLabel("Pris i mynt").fill("60");
  await edit.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByRole("button", { name: "Stor glass", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Stor glass", exact: true }).click();
  await page.getByRole("button", { name: "Ta bort belöning" }).click();
  await expect(page.getByText("Inga belöningar än.")).toBeVisible();
});

test("a child sees no way to change rewards, and the child's empty text", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await butik(page);
  await expect(page.getByText("Inga belöningar än.")).toBeVisible();
  await expect(page.getByText("Be en vuxen lägga till några.")).toBeVisible();
  await expect(page.getByRole("button", { name: "＋ Ny belöning" })).toHaveCount(0);
});

test("buying takes the coins at once, shows a waiting purchase, and Ångra köpet gives them back", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await earn(bo.id, 80);
  await addGlass(await homeOf(bo.id));
  await butik(page);
  await expect(pill(page)).toHaveAccessibleName("80 mynt");

  await page.getByRole("button", { name: "Köp Glass för 50 mynt" }).click();
  const sheet = page.getByRole("dialog", { name: "Köpa Glass?" });
  await expect(sheet.getByText("Det kostar 50 mynt. Du har 80 och får 30 kvar. En vuxen ger dig belöningen.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Köp för 50 mynt" })).toBeFocused();
  await sheet.getByRole("button", { name: "Köp för 50 mynt" }).click();
  await expect(pill(page)).toHaveAccessibleName("30 mynt");
  const kopt = page.getByRole("region", { name: "Köpt" });
  await expect(kopt.getByText("Glass")).toBeVisible();
  await expect(kopt.getByText(/^Köpt idag \d\d:\d\d$/)).toBeVisible();
  await expect(kopt.getByText("Väntar")).toBeVisible();
  // 30 left: the 50 coin reward is now out of reach.
  await expect(page.getByText("20 mynt kvar")).toBeVisible();

  await kopt.getByRole("button", { name: "Ångra köpet" }).click();
  await expect(pill(page)).toHaveAccessibleName("80 mynt");
  await expect(page.getByRole("region", { name: "Köpt" })).toHaveCount(0);
});

/** Bo buys a Glass, and Anna (adult) has Nu open in another browser. */
async function boBuysWhileAnnaWatches(page: Page, context: BrowserContext) {
  const anna = await logIn(context, "anna", "adult");
  const boContext = await context.browser()!.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const bo = await logIn(boContext, "bo", "child");
  await earn(bo.id, 80);
  await addGlass(await homeOf(anna.id));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  const boPage = await boContext.newPage();
  await butik(boPage);
  await boPage.getByRole("button", { name: "Köp Glass för 50 mynt" }).click();
  await boPage.getByRole("button", { name: "Köp för 50 mynt" }).click();
  await expect(pill(boPage)).toHaveAccessibleName("30 mynt");
  return { boContext, boPage };
}

test("an adult gives a bought reward from the gold row in Nu, and the buyer's row says Fått", async ({ page, context }) => {
  const { boContext, boPage } = await boBuysWhileAnnaWatches(page, context);
  const gold = page.getByRole("list", { name: "Belöningar att ge" });
  await expect(gold.getByText("Ge Bo: Glass")).toBeVisible();
  await expect(gold.getByText(/^🎁 Belöning · köpt idag \d\d:\d\d$/)).toBeVisible();
  // The child never sees the gold row.
  await boPage.goto("/");
  await expect(boPage.getByRole("heading", { name: "Uppgifter" })).toBeVisible();
  await expect(boPage.getByRole("list", { name: "Belöningar att ge" })).toHaveCount(0);

  const annaCoins = await pill(page).getAttribute("aria-label");
  await gold.getByRole("button", { name: "Ge Bo: Glass: markera som given" }).click();
  await expect(gold).toHaveCount(0);
  await expect(pill(page)).toHaveAccessibleName(annaCoins!);

  await butik(boPage);
  const kopt = boPage.getByRole("region", { name: "Köpt" });
  await expect(kopt.getByText("✓ Fått")).toBeVisible();
  await expect(kopt.getByText("Fick idag")).toBeVisible();
  await expect(pill(boPage)).toHaveAccessibleName("30 mynt");
  await boContext.close();
});

test("an adult who does not give gives the coins back, and the buyer's row says so", async ({ page, context }) => {
  const { boContext, boPage } = await boBuysWhileAnnaWatches(page, context);
  const gold = page.getByRole("list", { name: "Belöningar att ge" });
  await gold.getByRole("button", { name: "Ge inte" }).click();
  const sheet = page.getByRole("dialog", { name: "Ge inte Glass till Bo?" });
  await expect(sheet.getByText("Bo får tillbaka 50 mynt.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Avbryt" })).toBeFocused();
  await sheet.getByRole("button", { name: "Ge inte" }).click();
  await expect(gold).toHaveCount(0);

  // Bo's open page follows live, with no reload.
  const kopt = boPage.getByRole("region", { name: "Köpt" });
  await expect(kopt.getByText("Inte given · mynten tillbaka")).toBeVisible();
  await expect(kopt.getByText("↩ 50")).toBeVisible();
  await expect(pill(boPage)).toHaveAccessibleName("80 mynt");
  await boContext.close();
});

test("on a 300px phone a long reward name wraps and nothing overflows", async ({ page, context }) => {
  const bo = await logIn(context, "bo", "child");
  await db.insert(reward).values({
    householdId: await homeOf(bo.id),
    name: "En riktigt lång belöning med många ord som måste få plats på två rader",
    price: 1000,
  });
  await page.setViewportSize({ width: 300, height: 640 });
  await butik(page);
  const price = page.getByRole("button", { name: /^Köp En riktigt/ });
  await expect(price).toBeVisible();
  const box = (await price.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(300);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
