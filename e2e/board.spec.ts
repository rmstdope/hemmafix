import { earlyDay } from "../src/lib/early-tick";
import { filterSelect, nuEmpty } from "./support/board";
import type { Page } from "@playwright/test";
import { formatDue, todayIso } from "../src/lib/dates";
import { nextDueDate } from "../src/lib/recurrence";
import { E2E_BASE_URL } from "./support/env";
import { logIn, logInWithChestTaken, seedChore, seedRooms } from "./support/family";
import { RUN_ONCE } from "./support/tags";
import { expect, test } from "./support/test";

const today = () => todayIso();
const dueLabel = (iso: string) => formatDue(iso, today())!.label;

const todo = (page: Page) => page.getByRole("tabpanel");
const item = (page: Page, title: string) => todo(page).getByRole("listitem").filter({ hasText: title });
const done = (page: Page) => page.getByRole("list", { name: "Klart" });

async function openNewTaskForm(page: Page) {
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  return page.getByRole("form", { name: "Ny uppgift" });
}

test("a visitor who is not logged in is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Logga in med Google" })).toBeVisible();
  // The icon is the file itself, not a copy through the image optimizer, which refuses SVG.
  const icon = page.locator('img[src="/icon.svg"]');
  await expect(icon).toHaveJSProperty("complete", true);
  await expect(icon).not.toHaveJSProperty("naturalWidth", 0);
  expect(await icon.boundingBox()).toMatchObject({ width: 64, height: 64 });
});

test("someone who is no longer on the allowlist is logged out at once", { tag: RUN_ONCE }, async ({ page, context }) => {
  // A valid session for an address not (or no longer) in ALLOWED_EMAILS.
  await logIn(context, "eve");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/events")).status()).toBe(401);
});

test("an adult in a home without rooms is asked to add rooms first", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/");
  await page.getByRole("button", { name: "Ny uppgift" }).click();
  await page.getByRole("link", { name: "Lägg till rum" }).click();
  await expect(page.getByRole("heading", { name: "Hemmet" })).toBeVisible();
});

test("an adult adds a recurring task from a template; ticking it off brings the next one", async ({ page, context }) => {
  // With the day's chest still to come, its card would open over the tabs after the tick-off.
  await logInWithChestTaken(context, "anna", "adult");
  await seedRooms("Kök", "Vardagsrum");
  await page.goto("/");

  const form = await openNewTaskForm(page);
  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Dammsuga" });
  // The template fills in the title, its room and how often.
  await expect(form.getByRole("textbox", { name: "Titel" })).toHaveValue("Dammsuga");
  await expect(form.getByRole("combobox", { name: "Rum" }).locator("option:checked")).toHaveText("Vardagsrum");
  await expect(form.getByRole("spinbutton", { name: "Antal" })).toHaveValue("1");
  await expect(form.getByRole("combobox", { name: "Enhet" })).toHaveValue("week");
  await form.getByRole("button", { name: "Lägg till" }).click();
  await expect(page.getByText("Uppgiften är tillagd")).toBeVisible();

  const task = item(page, "Dammsuga");
  await expect(task).toContainText("Vardagsrum");
  // It is due today, so it is in Nu, and the row says neither that nor how often it recurs.
  await expect(task).not.toContainText("Idag");
  await expect(task).not.toContainText("Varje");

  await task.getByRole("button", { name: "Markera som klar" }).click();
  // The next one is a week on, under Senare.
  await page.getByRole("tab", { name: /^Senare,/ }).click();
  await expect(item(page, "Dammsuga")).toContainText(`Inga mynt förrän ${earlyDay(nextDueDate(today(), { unit: "week", interval: 1 }), today())}`);
  await expect(item(page, "Dammsuga")).toHaveCount(1);

  // Undoing the tick removes the next one again.
  await page.getByRole("tab", { name: /^Nu,/ }).click();
  await page.getByText(/Klart senaste veckan/).click();
  const ticked = done(page).getByRole("listitem").filter({ hasText: "Dammsuga" });
  await expect(ticked).toContainText("Klar av mig");
  await ticked.getByRole("button", { name: "Ångra klar" }).click();
  await expect(item(page, "Dammsuga")).toHaveCount(1);
  await page.getByRole("tab", { name: /^Senare,/ }).click();
  await expect(item(page, "Dammsuga")).toHaveCount(0);
});

test("an adult adds a one-off task of their own; once done it is gone", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  await page.goto("/");

  const form = await openNewTaskForm(page);
  await form.getByRole("textbox", { name: "Titel" }).fill("Laga cykeln");
  await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
  await form.getByText("En gång").click();
  await form.getByLabel("Klart senast").fill("2030-06-01");
  await form.getByRole("combobox", { name: "Vem" }).selectOption({ label: "Anna Andersson (jag)" });
  await form.getByRole("button", { name: "Lägg till" }).click();

  await page.getByRole("tab", { name: /^Senare,/ }).click();
  const task = item(page, "Laga cykeln");
  await expect(task).toContainText("Kök");
  await expect(task).toContainText(dueLabel("2030-06-01"));
  await expect(task).not.toContainText("Varje");
  await expect(task).toContainText("Jag");

  await task.getByRole("button", { name: "Markera som klar" }).click();
  await expect(todo(page).getByText("Inget planerat längre fram.")).toBeVisible();
});

test("a new task starts as a one-off, and the form opens that way every time", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök", "Vardagsrum");
  await page.goto("/");

  let form = await openNewTaskForm(page);
  await expect(form.getByRole("radio", { name: "En gång" })).toBeChecked();
  await expect(form.getByLabel("Klart senast")).toHaveValue("");
  await expect(form.getByText("Var", { exact: true })).toHaveCount(0);

  await form.getByText("Återkommande", { exact: true }).click();
  await expect(form.getByLabel("Första gången")).toHaveValue(today());
  await expect(form.getByText("Vem (alla gånger)")).toBeVisible();
  await form.getByText("En gång", { exact: true }).click();
  await expect(form.getByLabel("Klart senast")).toHaveValue("");

  // A common repeating task still sets how often, and stays so when the person goes back to a task of their own.
  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Dammsuga" });
  await expect(form.getByRole("radio", { name: "Återkommande" })).toBeChecked();
  await expect(form.getByLabel("Första gången")).toHaveValue(today());
  await form.getByRole("combobox", { name: "Fördefinierad uppgift" }).selectOption({ label: "Egen uppgift" });
  await expect(form.getByRole("radio", { name: "Återkommande" })).toBeChecked();

  // Closing and opening again starts over on "En gång".
  await page.getByRole("dialog", { name: "Ny uppgift" }).getByRole("button", { name: "Stäng" }).click();
  form = await openNewTaskForm(page);
  await expect(form.getByRole("radio", { name: "En gång" })).toBeChecked();
  await expect(form.getByLabel("Klart senast")).toHaveValue("");
});

test("the open tasks can be filtered on room and on person, and the filter survives a reload", async ({
  page,
  context,
}) => {
  const anna = await logIn(context, "anna", "adult");
  const bo = await logIn(await context.browser()!.newContext(), "bo", "child");
  const rooms = await seedRooms("Kök", "Badrum");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, assigneeId: bo.id });
  await seedChore({ title: "Torka bänken", roomId: rooms["Kök"]!.id });
  await seedChore({ title: "Städa toaletten", roomId: rooms["Badrum"]!.id, assigneeId: anna.id });
  await page.goto("/");
  const titles = () => todo(page).getByRole("listitem").locator("p.font-medium");

  await (await filterSelect(page, "Rum")).selectOption({ label: "Kök" });
  await expect(titles()).toHaveText(["Diska", "Torka bänken"]);

  await (await filterSelect(page, "Person")).selectOption({ label: "Ingen tilldelad" });
  await expect(titles()).toHaveText(["Torka bänken"]);

  await page.reload();
  await expect(titles()).toHaveText(["Torka bänken"]);

  await (await filterSelect(page, "Rum")).selectOption({ label: "Alla rum" });
  await (await filterSelect(page, "Person")).selectOption({ label: "Bo Andersson" });
  await expect(titles()).toHaveText(["Diska"]);

  await (await filterSelect(page, "Person")).selectOption({ label: "Mina" });
  await expect(titles()).toHaveText(["Städa toaletten"]);
});

test("an adult gives a recurring task to someone every time, or just this time", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await logIn(await context.browser()!.newContext(), "bo", "child");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id, dueDate: today() });
  await page.goto("/");

  const task = item(page, "Diska");
  await expect(task).not.toContainText("Bo");
  await task.getByRole("button", { name: "Mer" }).click();
  const group = task.getByRole("group", { name: /gäller/ });
  const who = task.getByRole("combobox", { name: "vem gör den?" });
  await expect(group.getByRole("button", { name: "Den här gången" })).toHaveAttribute("aria-pressed", "true");

  await group.getByRole("button", { name: "Alla gånger" }).click();
  await who.selectOption({ label: "Bo" });
  await expect(page.getByText('Bo gör "Diska" alla gånger')).toBeVisible();
  await expect(task).toContainText("Bo");

  // The switch is not remembered: closed and opened again it is on "Den här gången".
  await task.getByRole("button", { name: "Mer" }).click();
  await task.getByRole("button", { name: "Mer" }).click();
  await expect(group.getByRole("button", { name: "Den här gången" })).toHaveAttribute("aria-pressed", "true");

  // This time Anna does it; the next time it is Bo's again.
  await who.selectOption({ label: "Jag" });
  await expect(task).toContainText("Jag");
  await task.getByRole("button", { name: "Markera som klar" }).click();
  await page.getByRole("tab", { name: /^Senare,/ }).click();
  const next = item(page, "Diska");
  await expect(next).toContainText(`Inga mynt förrän ${earlyDay(nextDueDate(today(), { unit: "week", interval: 1 }), today())}`);
  await expect(next).toContainText("Bo");
});

test("an adult deletes a task", { tag: RUN_ONCE }, async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const rooms = await seedRooms("Kök");
  await seedChore({ title: "Diska", roomId: rooms["Kök"]!.id });
  await page.goto("/");

  await item(page, "Diska").getByRole("button", { name: "Mer" }).click();
  await item(page, "Diska").getByRole("button", { name: "Ta bort uppgiften" }).click();
  await expect(page.getByText('"Diska" togs bort')).toBeVisible();
  await page.reload();
  await expect(nuEmpty(page)).toBeVisible();
});

test("a change on one device shows up on another without reloading", async ({ page, context, browser }) => {
  await logIn(context, "anna", "adult");
  await seedRooms("Kök");
  // A second device: a context of its own, with its own session.
  const boContext = await browser.newContext({ baseURL: E2E_BASE_URL, locale: "sv-SE" });
  const boPage = await boContext.newPage();
  await logIn(boContext, "bo");
  const add = async (title: string) => {
    const form = await openNewTaskForm(page);
    await form.getByRole("textbox", { name: "Titel" }).fill(title);
    await form.getByRole("combobox", { name: "Rum" }).selectOption({ label: "Kök" });
    await form.getByLabel("Klart senast").fill(today());
    await form.getByRole("button", { name: "Lägg till" }).click();
    await expect(item(page, title)).toBeVisible();
  };

  await boPage.goto("/");
  await expect(nuEmpty(boPage)).toBeVisible();
  await page.goto("/");

  // Bo's page also refreshes once when its event stream opens, which could deliver the first
  // task even with notifications broken. Once that has shown up the stream is open, so the
  // second task can only arrive through a live notification.
  await add("Tömma diskmaskinen");
  await expect(item(boPage, "Tömma diskmaskinen")).toBeVisible();
  await add("Vattna blommorna");
  await expect(item(boPage, "Vattna blommorna")).toBeVisible();
  await boContext.close();
});
