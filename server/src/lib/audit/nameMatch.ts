/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // combining marks
    .toLowerCase()
    .replace(/[.,'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Exact-on-normalized match. Returns null when there is no match OR when the
 * match is ambiguous — never guesses. An ambiguous or missing match is a
 * finding for the caller to report, not something to paper over.
 */
export function matchByName<T extends { name: string }>(
  fgName: string,
  candidates: T[],
): T | null {
  const target = normalizeName(fgName);
  const hits = candidates.filter((c) => normalizeName(c.name) === target);
  return hits.length === 1 ? hits[0]! : null;
}
