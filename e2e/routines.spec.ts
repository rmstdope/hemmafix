import type { Page } from "@playwright/test";
import { logIn } from "./support/family";
import { expect, test } from "./support/test";

const section = (page: Page) => page.getByRole("region", { name: "Rutiner" });
const openHome = async (page: Page) => {
  await page.goto("/hemmet");
  await expect(page.getByRole("heading", { name: "Rutiner", level: 2 })).toBeVisible();
};
const addRoutine = async (page: Page, name: string) => {
  await section(page).getByRole("textbox", { name: "Ny rutin" }).fill(name);
  await section(page).getByRole("button", { name: "Lägg till", exact: true }).click();
};
const tasks = (page: Page) => page.getByRole("list", { name: "Uppgifter" }).getByRole("listitem");
const newTask = (page: Page) => page.getByRole("textbox", { name: "Ny uppgift" });

test("every home starts with three ready-made routines, between Familjen and Anslutna appar", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);

  await expect(page.getByText("Uppgifter som brukar göras tillsammans, till exempel när ni städar badrummet.")).toBeVisible();
  const rows = section(page).getByRole("list", { name: "Rutiner" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Städa badrum");
  await expect(rows.nth(0)).toContainText("5 uppgifter");
  await expect(rows.nth(1)).toContainText("Städa kök");
  await expect(rows.nth(1)).toContainText("6 uppgifter");
  await expect(rows.nth(2)).toContainText("Städa sovrum");
  await expect(rows.nth(2)).toContainText("4 uppgifter");
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings.slice(-3)).toEqual(["Familjen", "Rutiner", "Anslutna appar"]);

  await rows.nth(1).getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Städa kök", level: 1 })).toBeVisible();
  await expect(tasks(page)).toHaveText(["Diska", "Torka köksbänken", "Torka av spisen", "Ta ut soporna", "Dammsuga golvet", "Moppa golvet"].map((t) => new RegExp(`^${t}`)));
});

test("an adult makes a routine, fills it with tasks and keeps it tidy", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);

  // Creating opens the empty page, ready for tasks.
  await addRoutine(page, "  Storstädning ");
  await expect(page.getByRole("heading", { name: "Storstädning", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga uppgifter ännu. Lägg till det som brukar göras tillsammans.")).toBeVisible();

  // A typed task with Enter; focus stays for the next one. A suggestion adds at once and goes away.
  await newTask(page).fill("Moppa hallen");
  await newTask(page).press("Enter");
  await expect(tasks(page)).toHaveCount(1);
  await expect(newTask(page)).toBeFocused();
  await expect(newTask(page)).toHaveValue("");
  await page.getByRole("button", { name: "+ Diska" }).click();
  await expect(tasks(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "+ Diska" })).toHaveCount(0);
  await expect(newTask(page)).toBeFocused();
  await expect(tasks(page).nth(0)).toContainText("Moppa hallen");
  await expect(tasks(page).nth(1)).toContainText("Diska");

  // Duplicates in any case, and the text typed stays.
  await newTask(page).fill("moppa HALLEN");
  await newTask(page).press("Enter");
  await expect(page.getByText("moppa HALLEN finns redan i rutinen")).toBeVisible();
  await expect(newTask(page)).toHaveValue("moppa HALLEN");
  await newTask(page).fill("");
  await newTask(page).press("Enter");
  await expect(page.getByText("Skriv vad som ska göras")).toBeVisible();

  // Change a task: Escape cancels, Spara saves.
  await page.getByRole("button", { name: "Ändra Moppa hallen" }).click();
  const field = page.getByRole("textbox", { name: "Ändra Moppa hallen" });
  await expect(field).toBeFocused();
  await field.fill("Aldrig sparad");
  await field.press("Escape");
  await expect(tasks(page).nth(0)).toContainText("Moppa hallen");
  await page.getByRole("button", { name: "Ändra Moppa hallen" }).click();
  await page.getByRole("textbox", { name: "Ändra Moppa hallen" }).fill("Moppa hela hallen");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(tasks(page).nth(0)).toContainText("Moppa hela hallen");

  // Remove a task at once, with a notice.
  await page.getByRole("button", { name: "Ta bort Diska" }).click();
  await expect(page.getByText("Diska är borttagen")).toBeVisible();
  await expect(tasks(page)).toHaveCount(1);

  // Rename the routine; a name already taken is refused.
  await page.getByRole("button", { name: "Byt namn på Storstädning" }).click();
  await expect(page.getByRole("textbox", { name: "Nytt namn för Storstädning" })).toBeFocused();
  await page.getByRole("textbox", { name: "Nytt namn för Storstädning" }).fill("städa kök");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByText("Det finns redan en rutin som heter Städa kök")).toBeVisible();
  await page.getByRole("textbox", { name: "Nytt namn för Storstädning" }).fill("Stor städning");
  await page.getByRole("button", { name: "Spara" }).click();
  await expect(page.getByRole("heading", { name: "Stor städning", level: 1 })).toBeVisible();

  // The 31st task is refused.
  for (let i = 1; i <= 29; i++) {
    await newTask(page).fill(`Uppgift ${i}`);
    await newTask(page).press("Enter");
    await expect(tasks(page)).toHaveCount(i + 1);
  }
  await newTask(page).fill("En för mycket");
  await newTask(page).press("Enter");
  await expect(page.getByText("En rutin kan ha högst 30 uppgifter")).toBeVisible();
});

test("a refused new name's notice leaves the field and Spara free to try again", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);
  await section(page).getByRole("link", { name: /Städa badrum/ }).click();
  await page.getByRole("button", { name: "Byt namn på Städa badrum" }).click();
  const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "Nytt namn för Städa badrum" }) });
  await form.getByRole("textbox").fill("städa kök");
  await form.getByRole("button", { name: "Spara" }).click();

  const notice = page.locator("[data-sonner-toast]").filter({ hasText: "Det finns redan en rutin som heter Städa kök" });
  await expect(notice).toHaveAttribute("data-mounted", "true");
  // Wait for the notice to slide in fully, so its box is where it stays.
  await notice.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const [n, f] = [await notice.boundingBox(), await form.boundingBox()];
  if (!n || !f) throw new Error("the notice or the rename field is not on screen");
  const overlaps = n.x < f.x + f.width && f.x < n.x + n.width && n.y < f.y + f.height && f.y < n.y + n.height;
  expect(overlaps, `notice ${JSON.stringify(n)} covers the rename field ${JSON.stringify(f)}`).toBe(false);
});

test("removing a routine asks first and never brings it back", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);
  await section(page).getByRole("link", { name: /Städa badrum/ }).click();
  await expect(page.getByRole("heading", { name: "Städa badrum", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Ta bort rutinen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ta bort Städa badrum?" })).toBeVisible();
  await expect(dialog).toContainText("Rutinen och dess 5 uppgifter tas bort. Uppgifter som redan finns i hemmet påverkas inte.");
  await expect(dialog.getByRole("button", { name: "Avbryt" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Städa badrum", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Ta bort rutinen" }).click();
  await dialog.getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hemmet", level: 1 })).toBeVisible();
  await expect(page.getByText("Städa badrum är borttagen")).toBeVisible();
  await expect(section(page).getByRole("listitem")).toHaveCount(2);

  // It does not come back.
  await page.reload();
  await expect(section(page).getByRole("listitem")).toHaveCount(2);
});

test("a child is sent to the main list, and a routine that is gone says so", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/hemmet/rutiner/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70");
  await expect(page).toHaveURL(/\/$/);

  const adult = await context.browser()!.newContext();
  const adultPage = await adult.newPage();
  await logIn(adult, "anna", "adult");
  await adultPage.goto("/hemmet/rutiner/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70");
  await expect(adultPage.getByRole("heading", { name: "Rutin", level: 1 })).toBeVisible();
  await expect(adultPage.getByText("Den här rutinen finns inte längre.")).toBeVisible();
  await adultPage.getByRole("link", { name: "Tillbaka till Hemmet" }).click();
  await expect(adultPage.getByRole("heading", { name: "Hemmet", level: 1 })).toBeVisible();
  await adult.close();
});

test("another adult's changes show up live, also when the routine is removed", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await logIn(other, "bo", "adult");

  await openHome(page);
  await section(page).getByRole("link", { name: /Städa sovrum/ }).click();
  await expect(tasks(page)).toHaveCount(4);

  await otherPage.goto("/hemmet");
  await otherPage.getByRole("link", { name: /Städa sovrum/ }).click();
  await otherPage.getByRole("textbox", { name: "Ny uppgift" }).fill("Byta kuddar");
  await otherPage.getByRole("textbox", { name: "Ny uppgift" }).press("Enter");
  await expect(tasks(page)).toHaveCount(5);

  await otherPage.getByRole("button", { name: "Ta bort rutinen" }).click();
  await otherPage.getByRole("dialog").getByRole("button", { name: "Ta bort", exact: true }).click();
  await expect(page.getByText("Den här rutinen finns inte längre.")).toBeVisible();
  await other.close();
});

test("with no routines the list says so, and a new routine shows live on another adult's Hemmet", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const other = await context.browser()!.newContext();
  const otherPage = await other.newPage();
  await logIn(other, "bo", "adult");

  await openHome(page);
  for (const name of ["Städa badrum", "Städa kök", "Städa sovrum"]) {
    await section(page).getByRole("link", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Ta bort rutinen" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Ta bort", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hemmet", level: 1 })).toBeVisible();
  }
  await expect(page.getByText("Inga rutiner ännu.")).toBeVisible();

  await otherPage.goto("/hemmet");
  await expect(otherPage.getByText("Inga rutiner ännu.")).toBeVisible();
  await addRoutine(page, "Ny rutin hemma");
  await expect(page.getByRole("heading", { name: "Ny rutin hemma", level: 1 })).toBeVisible();
  await expect(otherPage.getByRole("link", { name: /Ny rutin hemma/ })).toContainText("Inga uppgifter");
  await other.close();
});
