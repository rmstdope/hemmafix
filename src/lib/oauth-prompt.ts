/**
 * Hemmafix asks the adult to approve every time an app connects. The OAuth provider skips the
 * approval for an app the person approved before unless the request says `prompt=consent`, so
 * the authorization request gets that added on its way in. `prompt=none` is the app asking not
 * to show anything, and keeps its meaning.
 */
export function alwaysAskConsent(url: URL): URL {
  const prompts = (url.searchParams.get("prompt") ?? "").split(" ").filter(Boolean);
  if (prompts.includes("none") || prompts.includes("consent")) return url;
  const next = new URL(url);
  next.searchParams.set("prompt", [...prompts, "consent"].join(" "));
  return next;
}
