import { describe, expect, it } from "vitest";
import { alwaysAskConsent } from "./oauth-prompt";

const prompt = (url: string) => alwaysAskConsent(new URL(url)).searchParams.get("prompt");

describe("asking for approval every time", () => {
  it("adds prompt=consent when the app sent no prompt", () => {
    expect(prompt("https://h.example/api/auth/oauth2/authorize?client_id=a")).toBe("consent");
  });

  it("keeps what the app asked for and adds consent", () => {
    expect(prompt("https://h.example/api/auth/oauth2/authorize?prompt=login")).toBe("login consent");
  });

  it("leaves a prompt that already asks for consent alone", () => {
    expect(prompt("https://h.example/api/auth/oauth2/authorize?prompt=consent")).toBe("consent");
  });

  it("leaves prompt=none alone: that request must fail rather than show a page", () => {
    expect(prompt("https://h.example/api/auth/oauth2/authorize?prompt=none")).toBe("none");
  });
});
