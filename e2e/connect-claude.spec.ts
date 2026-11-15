import { createHash, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedOAuthClient } from "./support/family";

const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

/** Claude's side of the connection: a registered client and the authorization link it sends the person to. */
async function claudeStartsConnecting() {
  const client_id = await seedOAuthClient({ name: "Claude", redirectUri: REDIRECT_URI });
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("/api/auth/oauth2/authorize", E2E_BASE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT_URI,
    scope: "openid offline_access",
    state: "xyz",
    resource: `${E2E_BASE_URL}/mcp`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  return { clientId: client_id as string, verifier, url: url.toString() };
}

/** Claude's redirect address is not served here: capture where the browser is sent instead. */
async function captureRedirectToClaude(page: Page) {
  const sent: URL[] = [];
  await page.route(`${REDIRECT_URI}**`, (route) => {
    sent.push(new URL(route.request().url()));
    return route.fulfill({ status: 200, contentType: "text/html", body: "Claude" });
  });
  return sent;
}

test("an adult approves, and Claude can then list what is left to do", async ({ page, context, request }) => {
  await logIn(context, "anna", "adult");
  const sent = await captureRedirectToClaude(page);
  const claude = await claudeStartsConnecting();

  await page.goto(claude.url);

  await expect(page.getByRole("heading", { name: "Claude vill ansluta till Hemmafix" })).toBeVisible();
  await expect(page.getByText("i hemmet Familjen E2E:")).toBeVisible();
  for (const line of [
    "se våningar, rum, sysslor och familjen",
    "lägga till, ändra, ta bort och tilldela sysslor",
    "bocka av sysslor",
    "ändra hemmet, rummen och familjens roller",
  ]) {
    await expect(page.getByRole("listitem").filter({ hasText: line })).toBeVisible();
  }
  await expect(page.getByText("Inloggad som Anna")).toBeVisible();
  await expect(page.getByText("Du kan koppla från Claude när som helst.")).toBeVisible();
  // A stray Enter must never approve: nothing is focused on Godkänn.
  await expect(page.getByRole("button", { name: "Godkänn" })).not.toBeFocused();

  await page.getByRole("button", { name: "Godkänn" }).click();
  await expect.poll(() => sent.length).toBe(1);
  const code = sent[0]!.searchParams.get("code");
  expect(code).toBeTruthy();
  expect(sent[0]!.searchParams.get("state")).toBe("xyz");

  const token = await request.post("/api/auth/oauth2/token", {
    form: {
      grant_type: "authorization_code",
      code: code!,
      code_verifier: claude.verifier,
      client_id: claude.clientId,
      redirect_uri: REDIRECT_URI,
      resource: `${E2E_BASE_URL}/mcp`,
    },
  });
  expect(token.status()).toBe(200);
  const { access_token } = await token.json();

  const call = await request.post("/mcp", {
    headers: { authorization: `Bearer ${access_token}`, accept: "application/json, text/event-stream" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "lista_oppna_sysslor", arguments: {} } },
  });
  expect(call.status()).toBe(200);
  expect(await call.text()).toContain("Inget är kvar att göra just nu.");

  // The approval is asked every time someone connects, never remembered.
  await page.goto((await claudeStartsConnecting()).url);
  await expect(page.getByRole("heading", { name: "Claude vill ansluta till Hemmafix" })).toBeVisible();
});

test("Avbryt sends the adult back to Claude with nothing granted", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const sent = await captureRedirectToClaude(page);
  await page.goto((await claudeStartsConnecting()).url);

  await page.getByRole("button", { name: "Avbryt" }).click();

  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]!.searchParams.get("error")).toBe("access_denied");
  expect(sent[0]!.searchParams.get("code")).toBeNull();
});

test("a child cannot connect an app", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  const sent = await captureRedirectToClaude(page);
  await page.goto((await claudeStartsConnecting()).url);

  await expect(page.getByRole("heading", { name: "Bara vuxna kan ansluta appar" })).toBeVisible();
  await expect(page.getByText("Du är inloggad som Bo, som är barn i hemmet. Be en vuxen i familjen om hjälp.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Godkänn" })).toHaveCount(0);

  await page.getByRole("button", { name: "Tillbaka till Claude" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]!.searchParams.get("error")).toBe("access_denied");
});

test("someone not logged in is asked to log in to connect Claude", async ({ page }) => {
  await page.goto((await claudeStartsConnecting()).url);

  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByText("Logga in för att ansluta Claude till ditt hem.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Logga in med Google" })).toBeVisible();
});

test("a broken or expired link shows an explanation and no buttons", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto("/consent?client_id=nope&exp=1&sig=bad");

  await expect(page.getByRole("heading", { name: "Anslutningen gick inte att slutföra" })).toBeVisible();
  await expect(
    page.getByText("Länken har gått ut eller är felaktig. Börja om genom att ansluta Hemmafix i Claude igen."),
  ).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("the MCP address refuses a call without an access token", async ({ request }) => {
  const res = await request.post("/mcp", { data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(res.status()).toBe(401);
  expect(res.headers()["www-authenticate"]).toContain("resource_metadata");
});

test("the login page is the plain app login when nobody is connecting an app", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Logga in för att ansluta")).toHaveCount(0);
});
