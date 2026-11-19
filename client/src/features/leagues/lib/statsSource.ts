/**
 * Plain-English stats source, shared by the Overview tile and the Settings editor.
 * The server filters only "NL" and "AL"; every other stored value ("MLB", "ALL")
 * counts all players (server/src/lib/mlbTeams.ts).
 */
export function statsSourceLabel(source: string): string {
  if (source === "NL") return "NL players only";
  if (source === "AL") return "AL players only";
  return "All MLB players";
}
