export type AppAddress = { label: string; known: boolean; local: boolean };

const LOCAL_LABEL = "den här datorn";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Where an approval sends the person back to, in words they can check; unknown unless claude.ai or their own computer. */
export function describeAddress(redirectUri: string): AppAddress | null {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return null;
  }
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return { label: LOCAL_LABEL, known: true, local: true };
  if (url.protocol === "https:" && url.hostname === "claude.ai") return { label: "claude.ai", known: true, local: false };
  // A custom scheme's "host" is no web address: show the scheme too, so evil://claude.ai never reads as claude.ai.
  if (url.protocol === "https:" || url.protocol === "http:") return { label: url.hostname, known: false, local: false };
  return { label: url.host ? `${url.protocol}//${url.host}` : url.protocol, known: false, local: false };
}

/** The name to show for an app: its own, else its address (or "En app på den här datorn"). */
export function appDisplayName(name: string | null | undefined, address: AppAddress): { heading: string; inline: string } {
  const own = name?.trim();
  if (own) return { heading: own, inline: own };
  if (address.local) return { heading: "En app på den här datorn", inline: "en app på den här datorn" };
  return { heading: address.label, inline: address.label };
}
