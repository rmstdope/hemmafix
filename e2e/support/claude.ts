// Claude's side of a connection, as the browser sees it.
import { expect, type Page } from "@playwright/test";

export const REDIRECT_URI = "https://claude.ai/api/mcp/auth_callback";

/**
 * Every time the page sends the browser to Claude's redirect address, in order.
 *
 * Counted from the Navigation API's `navigate` event, which fires once for every navigation
 * the page starts, even one a second navigation cancels a moment later. A count of network
 * requests would miss such a cancelled navigation on some runs and not others. Claude's
 * address is not served here, so the request is answered with a stub page.
 *
 * Call it once per page: it registers a page function under a fixed name, which Playwright
 * refuses to register twice.
 */
export async function captureRedirectToClaude(page: Page) {
  const sent: URL[] = [];
  await page.exposeFunction("__e2eSentToClaude", (url: string) => {
    sent.push(new URL(url));
  });
  await page.addInitScript((prefix) => {
    const w = window as unknown as {
      navigation: EventTarget;
      __e2eSentToClaude: (url: string) => void;
    };
    w.navigation.addEventListener("navigate", (event) => {
      const url = (event as unknown as { destination: { url: string } }).destination.url;
      if (url.startsWith(prefix)) w.__e2eSentToClaude(url);
    });
  }, REDIRECT_URI);
  await page.route(`${REDIRECT_URI}**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Claude" }),
  );
  return sent;
}

/**
 * Waits until the browser has arrived at Claude, so nothing on the page that sent it can start
 * another navigation, and checks it was sent there exactly once.
 */
export async function expectSentToClaudeOnce(page: Page, sent: URL[], opts: { timeout?: number } = {}) {
  await page.waitForURL(`${REDIRECT_URI}**`, opts);
  await expect(page.locator("body")).toHaveText("Claude");
  expect(sent).toHaveLength(1);
}
