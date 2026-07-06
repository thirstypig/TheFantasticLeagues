// Email validation + normalization for the public marketing signup.
// The double opt-in confirmation is the REAL proof an address works; this is a
// cheap first filter (format + obvious throwaway domains).

/** Lowercase + trim. The DB stores the normalized form; uniqueness is on it. */
export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

/**
 * Pragmatic format check — one @, a dot in the domain, no spaces, sane length.
 * Deliberately NOT a full RFC 5322 parser (those reject valid addresses and
 * accept junk). Confirmation email is the authoritative validity test.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

/**
 * Small block-list of obvious disposable/throwaway domains. Not exhaustive —
 * just stops the most common inbox-trash providers. Keep short; the cooldown +
 * double opt-in do the heavy lifting.
 */
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "temp-mail.org", "throwawaymail.com", "yopmail.com", "trashmail.com",
  "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc",
  "fakeinbox.com", "mailnesia.com", "mintemail.com", "spamgourmet.com",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1] ?? "";
  return DISPOSABLE_DOMAINS.has(domain);
}
