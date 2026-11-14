/** Parses a comma/whitespace separated list of e-mail addresses. */
export function parseAllowedEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string | null | undefined, allowed: Set<string>): boolean {
  return !!email && allowed.has(email.trim().toLowerCase());
}
