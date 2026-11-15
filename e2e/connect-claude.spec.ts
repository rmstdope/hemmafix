import { createHash, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./support/test";
import { E2E_BASE_URL } from "./support/env";
import { logIn, seedOAuthClient } from "./support/family";

const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

/** Claude's side of the connection: a registered client and the authorization link it sends the person to. */
async function claudeStartsConnecting(
  opts: { clientId?: string; prompt?: string; name?: string | null; redirectUri?: string } = {},
) {
  const redirectUri = opts.redirectUri ?? REDIRECT_URI;
  const client_id =
    opts.clientId ?? (await seedOAuthClient({ name: opts.name === undefined ? "Claude" : opts.name, redirectUri }));
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL("/api/auth/oauth2/authorize", E2E_BASE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: redirectUri,
    scope: "openid offline_access",
    state: "xyz",
    resource: `${E2E_BASE_URL}/mcp`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...(opts.prompt ? { prompt: opts.prompt } : {}),
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

});

test("the approval is asked every time, also of an app that was approved before", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const sent = await captureRedirectToClaude(page);
  const first = await claudeStartsConnecting();
  await page.goto(first.url);
  await page.getByRole("button", { name: "Godkänn" }).click();
  await expect.poll(() => sent.length).toBe(1);

  // The same app connects again: the person is asked again.
  await page.goto((await claudeStartsConnecting({ clientId: first.clientId })).url);
  await expect(page.getByRole("heading", { name: "Claude vill ansluta till Hemmafix" })).toBeVisible();

  // An app that asks not to show anything is refused rather than waved through on the old approval.
  const silent = await context.request.get((await claudeStartsConnecting({ clientId: first.clientId, prompt: "none" })).url, {
    maxRedirects: 0,
  });
  const location = new URL(silent.headers()["location"]!);
  expect(location.searchParams.get("code")).toBeNull();
  expect(location.searchParams.get("error")).toBe("consent_required");
});

test("a child cannot get a code by calling the approval directly", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto((await claudeStartsConnecting()).url);
  await expect(page.getByRole("heading", { name: "Bara vuxna kan ansluta appar" })).toBeVisible();

  const answer = await page.evaluate(async () => {
    const res = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accept: true, oauth_query: window.location.search.slice(1) }),
    });
    return { status: res.status, body: await res.text() };
  });
  expect(answer.status).toBeGreaterThanOrEqual(400);
  expect(answer.body).not.toContain("code=");
});

test("the approval page tabs through Byt konto, Godkänn, Avbryt", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto((await claudeStartsConnecting()).url);
  await expect(page.getByRole("button", { name: "Godkänn" })).toBeVisible();
  for (const name of ["Byt konto", "Godkänn", "Avbryt"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name })).toBeFocused();
  }
});

test("the child page tabs through the account switch, then back to Claude", async ({ page, context }) => {
  await logIn(context, "bo", "child");
  await page.goto((await claudeStartsConnecting()).url);
  await expect(page.getByRole("button", { name: "Tillbaka till Claude" })).toBeVisible();
  for (const name of ["Logga in med ett annat konto", "Tillbaka till Claude"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name })).toBeFocused();
  }
});

test("an approval the server no longer accepts shows the explanation", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto((await claudeStartsConnecting()).url);
  // The signed link only lasts a few minutes: the server then refuses the approval.
  await page.route("**/api/auth/oauth2/consent", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_signature" }) }),
  );

  await page.getByRole("button", { name: "Godkänn" }).click();

  await expect(page.getByRole("heading", { name: "Anslutningen gick inte att slutföra" })).toBeVisible();
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
  expect(res.headers()["www-authenticate"]).toContain(`${E2E_BASE_URL}/.well-known/oauth-protected-resource/mcp`);
});

test("the MCP address refuses an access token it did not issue", async ({ request }) => {
  const res = await request.post("/mcp", {
    headers: { authorization: "Bearer not-a-real-token" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect(res.status()).toBe(401);
});

test("the login page is the plain app login when nobody is connecting an app", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Logga in för att ansluta")).toHaveCount(0);
});

const WARNING = /Hemmafix känner inte igen den här adressen\./;

test("the real Claude shows where the approval goes, with no warning and Godkänn first", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto((await claudeStartsConnecting()).url);

  await expect(page.getByText("Skickar dig tillbaka till claude.ai")).toBeVisible();
  await expect(page.getByText(WARNING)).toHaveCount(0);
  const buttons = page.getByRole("button", { name: /^(Godkänn|Avbryt)$/ });
  await expect(buttons).toHaveText(["Godkänn", "Avbryt"]);
});

test("an app on the person's own computer is called that, with no warning", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto((await claudeStartsConnecting({ name: "Claude Code", redirectUri: "http://localhost:54321/callback" })).url);

  await expect(page.getByText("Skickar dig tillbaka till den här datorn")).toBeVisible();
  await expect(page.getByText(WARNING)).toHaveCount(0);
});

test("an impostor calling itself Claude at an unknown address gets a warning and Avbryt first", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto((await claudeStartsConnecting({ redirectUri: "https://claude-hjalp.app/cb" })).url);

  await expect(page.getByRole("heading", { name: "Claude vill ansluta till Hemmafix" })).toBeVisible();
  await expect(page.getByText("Skickar dig tillbaka till claude-hjalp.app")).toBeVisible();
  await expect(page.getByText("Hemmafix känner inte igen den här adressen. Godkänn bara om du själv nyss anslöt Hemmafix från claude-hjalp.app.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^(Godkänn|Avbryt)$/ })).toHaveText(["Avbryt", "Godkänn"]);
  for (const name of ["Byt konto", "Avbryt", "Godkänn"]) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name })).toBeFocused();
  }
});

test("a nameless app is named after its address everywhere, also on the login step", async ({ page, context }) => {
  const claude = await claudeStartsConnecting({ name: null, redirectUri: "https://claude-hjalp.app/cb" });
  await page.goto(claude.url);
  await expect(page.getByText("Logga in för att ansluta claude-hjalp.app till ditt hem.")).toBeVisible();

  await logIn(context, "anna", "adult");
  await page.goto(claude.url);
  await expect(page.getByRole("heading", { name: "claude-hjalp.app vill ansluta till Hemmafix" })).toBeVisible();
  await expect(page.getByText("Du kan koppla från claude-hjalp.app när som helst.")).toBeVisible();
  await expect(page.getByText(WARNING)).toBeVisible();
});

test("a nameless app on the person's own computer", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  await page.goto((await claudeStartsConnecting({ name: null, redirectUri: "http://127.0.0.1:5000/cb" })).url);

  await expect(page.getByRole("heading", { name: "En app på den här datorn vill ansluta till Hemmafix" })).toBeVisible();
  await expect(page.getByText("Om du godkänner kan en app på den här datorn, i hemmet")).toBeVisible();
  await expect(page.getByText("Du kan koppla från en app på den här datorn när som helst.")).toBeVisible();
  await expect(page.getByText(WARNING)).toHaveCount(0);
});

test("a very long address wraps inside the card", async ({ page, context }) => {
  await logIn(context, "anna", "adult");
  const host = `${"a".repeat(60)}.${"b".repeat(60)}.example.com`;
  await page.goto((await claudeStartsConnecting({ redirectUri: `https://${host}/cb` })).url);

  await expect(page.getByText(`Skickar dig tillbaka till ${host}`)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
