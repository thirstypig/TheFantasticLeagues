/**
 * Short player names for the team board (Style Bible screen 11).
 *  - 'last':    "Bryce Harper" -> "Harper"; desktop cells
 *  - 'initial': "William Contreras" -> "W. Contreras"; phone card
 * Suffixes stay with the last name ("Lourdes Gurriel Jr." -> "Gurriel Jr."),
 * and lowercase-able particles join it ("Elly De La Cruz" -> "De La Cruz").
 * A single-word name is returned as is.
 */
const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v']);
const PARTICLES = new Set(['de', 'la', 'del', 'della', 'der', 'van', 'von', 'da', 'das', 'do', 'dos', 'di', 'du', 'le', 'st.', 'st']);

export function shortName(name: string, style: 'last' | 'initial'): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return tokens[0] ?? '';

  let end = tokens.length;
  const suffix: string[] = [];
  while (end > 1 && SUFFIXES.has(tokens[end - 1].toLowerCase())) suffix.unshift(tokens[--end]);
  if (end <= 1) return tokens.join(' '); // e.g. "Ichiro Jr." — nothing sensible to shorten

  // Last name = final token plus any particles before it (never the first token).
  let start = end - 1;
  while (start > 1 && PARTICLES.has(tokens[start - 1].toLowerCase())) start--;
  const last = [...tokens.slice(start, end), ...suffix].join(' ');
  if (style === 'last') return last;
  return `${tokens[0].charAt(0).toUpperCase()}. ${last}`;
}
