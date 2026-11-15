import { createHash, randomBytes } from "node:crypto";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedConnection, seedOAuthClient } from "./support/family";

const section = (page: Page) => page.getByRole("region", { name: "Anslutna appar" });
const openHome = async (page: Page) => {
  await page.goto("/hemmet");
  await expect(page.getByRole("heading", { name: "Anslutna appar" })).toBeVisible();
};

test("with nothing connected the section says where apps will show", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);
  await expect(
    page.getByText("Du har inte anslutit några appar. När du ansluter till exempel Claude till Hemmafix syns den här."),
  ).toBeVisible();
  // Last on the page, after Familjen.
  const headings = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(headings.at(-1)).toBe("Anslutna appar");
  expect(headings.at(-2)).toBe("Familjen");
});

test("an adult sees only their own apps, newest first, with dates and a letter tile without icon", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  const bo = await logIn(await page.context().browser()!.newContext(), "bo", "adult");
  await seedConnection({ userId: anna.id, name: "Claude", connectedAt: new Date("2026-10-01T10:00:00Z"), lastUsedAt: new Date("2026-10-04T10:00:00Z") });
  await seedConnection({
    userId: anna.id,
    name: "En app med ett riktigt långt namn som måste få radbrytas inuti raden utan att knappen hamnar under",
    connectedAt: new Date("2026-11-12T10:00:00Z"),
  });
  await seedConnection({ userId: bo.id, name: "Bos hemliga app" });

  await openHome(page);

  await expect(page.getByText("Appar du har gett tillgång till hemmet. Bara du ser dina.")).toBeVisible();
  const rows = section(page).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("En app med ett riktigt långt namn");
  await expect(rows.nth(0)).toContainText("Ansluten 12 nov 2026");
  await expect(rows.nth(0)).toContainText("Inte använd ännu");
  await expect(rows.nth(1)).toContainText("Ansluten 1 okt 2026");
  await expect(rows.nth(1)).toContainText("Senast använd 4 okt 2026");
  await expect(rows.nth(1).getByText("C", { exact: true })).toBeVisible();
  await expect(page.getByText("Bos hemliga app")).toHaveCount(0);
  // The row never grows wider than the page, and the button stays on the right.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const row = await rows.nth(0).boundingBox();
  const button = await rows.nth(0).getByRole("button").boundingBox();
  expect(button!.x + button!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
});

test("Avbryt, Escape and a tap outside leave the app connected and return focus", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedConnection({ userId: anna.id, name: "Claude" });
  await openHome(page);
  const opener = page.getByRole("button", { name: "Koppla från Claude" });

  for (const close of [
    () => page.getByRole("button", { name: "Avbryt" }).click(),
    () => page.keyboard.press("Escape"),
    () => page.mouse.click(2, 2),
  ]) {
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Koppla från Claude?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Claude kan inte längre se eller ändra hemmet. För att ansluta igen måste du godkänna på nytt.");
    await expect(page.getByRole("button", { name: "Avbryt" })).toBeFocused();
    // A tap on the box itself, even at its edge, does not close it.
    await dialog.click({ position: { x: 20, y: 20 } });
    await expect(dialog).toBeVisible();
    await close();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(section(page).getByRole("listitem")).toHaveCount(1);
  }
});

test("disconnecting removes the row, says so, and moves focus to the empty line", async ({ page, context }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedConnection({ userId: anna.id, name: "Claude" });
  await openHome(page);

  await page.getByRole("button", { name: "Koppla från Claude" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Koppla från", exact: true }).click();

  await expect(page.getByText("Claude är frånkopplad")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Du har inte anslutit några appar.")).toBeFocused();
});

test("a disconnect on one device removes the row on the person's other device, without a notice", async ({ page, context, browser }) => {
  const anna = await logIn(context, "anna", "adult");
  await seedConnection({ userId: anna.id, name: "Claude" });
  await openHome(page);
  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const second = await other.newPage();
  await second.goto("/hemmet");
  await expect(second.getByText("Claude", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Koppla från Claude" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Koppla från", exact: true }).click();

  await expect(second.getByText("Du har inte anslutit några appar.")).toBeVisible();
  await expect(second.getByText("Claude är frånkopplad")).toHaveCount(0);
  await other.close();
});

test("a child never sees the section", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto("/hemmet");
  await expect(page.getByRole("heading", { name: "Anslutna appar" })).toHaveCount(0);
});

const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

/** Claude's side: the adult approves in `page`, and Claude trades the code for its tokens. */
async function connectClaude(page: Page, request: APIRequestContext) {
  const clientId = await seedOAuthClient({ name: "Claude", redirectUri: REDIRECT_URI });
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("/api/auth/oauth2/authorize", E2E_BASE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access",
    state: "xyz",
    resource: `${E2E_BASE_URL}/mcp`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const sent: URL[] = [];
  await page.route(`${REDIRECT_URI}**`, (route) => {
    sent.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: "text/html", body: "Claude" });
  });
  return {
    clientId,
    async approve() {
      await page.goto(url.toString());
      await page.getByRole("button", { name: "Godkänn" }).click();
      // The first approval after the server starts is slow (cold route compilation on CI).
      await expect.poll(() => sent.length, { timeout: 20_000 }).toBe(1);
      const token = await request.post("/api/auth/oauth2/token", {
        form: {
          grant_type: "authorization_code",
          code: sent[0]!.searchParams.get("code")!,
          code_verifier: verifier,
          client_id: clientId,
          redirect_uri: REDIRECT_URI,
          resource: `${E2E_BASE_URL}/mcp`,
        },
      });
      return (await token.json()) as { access_token: string; refresh_token: string };
    },
    async refresh(refreshToken: string) {
      const token = await request.post("/api/auth/oauth2/token", {
        form: { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, resource: `${E2E_BASE_URL}/mcp` },
      });
      expect(token.status(), await token.text()).toBe(200);
      return (await token.json()) as { access_token: string; refresh_token: string };
    },
  };
}

const callMcp = (request: APIRequestContext, accessToken: string) =>
  request.post("/mcp", {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "lista_oppna_sysslor", arguments: {} } },
  });

const disconnectClaude = async (page: Page) => {
  await page.getByRole("button", { name: "Koppla från Claude" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Koppla från", exact: true }).click();
  await expect(page.getByText("Claude är frånkopplad")).toBeVisible();
};

test("a connected app is listed, and stops working at once when it is disconnected", async ({ page, context, request }) => {
  await logIn(context, "anna", "adult");
  const claude = await connectClaude(page, request);
  const { access_token } = await claude.approve();
  const first = await callMcp(request, access_token);
  expect(first.status(), await first.text()).toBe(200);

  await openHome(page);
  await expect(section(page).getByRole("listitem")).toHaveCount(1);
  await expect(section(page).getByRole("listitem")).toContainText("Senast använd i dag");

  await disconnectClaude(page);

  expect((await callMcp(request, access_token)).status()).toBe(401);
});

test("an app keeps working after it refreshes its token, and a disconnect stops the refreshed token too", async ({ page, context, request }) => {
  await logIn(context, "anna", "adult");
  const claude = await connectClaude(page, request);
  const { refresh_token } = await claude.approve();

  const refreshed = await claude.refresh(refresh_token);
  const call = await callMcp(request, refreshed.access_token);
  expect(call.status(), await call.text()).toBe(200);

  await openHome(page);
  await expect(section(page).getByRole("listitem")).toHaveCount(1);
  await disconnectClaude(page);

  expect((await callMcp(request, refreshed.access_token)).status()).toBe(401);
});

test("a new connection shows up on an open Hemmet page without a reload", async ({ page, context, request, browser }) => {
  await logIn(context, "anna", "adult");
  await openHome(page);
  await expect(page.getByText("Du har inte anslutit några appar.")).toBeVisible();

  const other = await browser.newContext();
  await other.addCookies(await context.cookies());
  const claude = await connectClaude(await other.newPage(), request);
  await claude.approve();

  await expect(section(page).getByRole("listitem")).toContainText("Claude");
  await other.close();
});
