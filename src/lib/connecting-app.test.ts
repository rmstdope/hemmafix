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
      expect(describeAddress(uri).known).toBe(false);
    }
    expect(describeAddress("https://claude-hjalp.app/cb")).toEqual({ label: "claude-hjalp.app", known: false, local: false });
  });

  it("shows the scheme when there is no host, and never knows unparsable input", () => {
    expect(describeAddress("myapp://callback")).toMatchObject({ known: false });
    expect(describeAddress("not a url")).toEqual({ label: "okänd", known: false, local: false });
  });
});

describe("appDisplayName", () => {
  const web = describeAddress("https://claude-hjalp.app/cb");
  const local = describeAddress("http://localhost:1/cb");

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
