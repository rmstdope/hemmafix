import { toNextJsHandler } from "better-auth/next-js";
import { alwaysAskConsent } from "@/lib/oauth-prompt";
import { auth } from "@/server/auth";

const handler = toNextJsHandler(auth);

export const { POST } = handler;

export const GET = (request: Request) => {
  const url = new URL(request.url);
  // An app connecting is always shown the approval page, never waved through on an old approval.
  if (url.pathname.endsWith("/oauth2/authorize")) return handler.GET(new Request(alwaysAskConsent(url), request));
  return handler.GET(request);
};
