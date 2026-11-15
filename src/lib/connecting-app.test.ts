import { describe, expect, it } from "vitest";
import { appDisplayName, describeAddress } from "./connecting-app";

describe("describeAddress", () => {
  it("knows claude.ai over https", () => {
    expect(describeAddress("https://claude.ai/api/mcp/auth_callback")).toEqual({ label: "claude.ai", known: true, local: false });
  });

  it("calls a loopback address the person's own computer, on any port", () => {
    for (const uri of ["http://localhost:54321/callback", "http://127.0.0.1:8080/cb", "http://[::1]:9/cb"]) {
      expect(describeAddress(uri)).toEqual({ label: "den här datorn", known: true, local: true });
    }
  });

  it("does not know look-alikes", () => {
    for (const uri of ["https://claude.ai.evil.com/cb", "http://claude.ai/cb", "https://evilclaude.ai/cb", "https://app.claude.ai/cb"]) {
      expect(describeAddress(uri)?.known).toBe(false);
    }
    expect(describeAddress("https://claude-hjalp.app/cb")).toEqual({ label: "claude-hjalp.app", known: false, local: false });
  });

  it("shows the scheme of a custom-scheme address, so it never reads as a web address", () => {
    expect(describeAddress("evil://claude.ai/cb")).toEqual({ label: "evil://claude.ai", known: false, local: false });
    expect(describeAddress("myapp://callback")).toEqual({ label: "myapp://callback", known: false, local: false });
    expect(describeAddress("com.example.app:/oauth")).toEqual({ label: "com.example.app:", known: false, local: false });
  });

  it("has no address for unparsable input", () => {
    expect(describeAddress("not a url")).toBeNull();
  });
});

describe("appDisplayName", () => {
  const web = describeAddress("https://claude-hjalp.app/cb")!;
  const local = describeAddress("http://localhost:1/cb")!;

  it("keeps a given name, trimmed", () => {
    expect(appDisplayName("  Claude ", web)).toEqual({ heading: "Claude", inline: "Claude" });
  });

  it("names a nameless app after its address", () => {
    expect(appDisplayName(null, web)).toEqual({ heading: "claude-hjalp.app", inline: "claude-hjalp.app" });
    expect(appDisplayName("   ", web).heading).toBe("claude-hjalp.app");
  });

  it("names a nameless app on the person's own computer", () => {
    expect(appDisplayName("", local)).toEqual({ heading: "En app på den här datorn", inline: "en app på den här datorn" });
  });
});
