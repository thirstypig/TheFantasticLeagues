// client/src/lib/playerDisplay.ts
// Re-export isPitcher from centralized sportConfig
export { isPitcher } from "./sportConfig";

export function normalizePosition(pos: any): string {
  const s = String(pos ?? "").trim();
  if (!s) return "";
  return s.toUpperCase();
}

export function formatAvg(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

export function getMlbTeamAbbr(row: any): string {
  const v =
    row?.mlb_team ??
    row?.mlbTeam ??
    row?.mlb_team_abbr ??
    row?.mlbTeamAbbr ??
    row?.team_mlb ??
    row?.mlbTeamName ??
    "";
  return String(v ?? "").trim();
}

export function getGrandSlams(row: any): number | "" {
  const v = row?.GS ?? row?.grandSlams ?? row?.grand_slams ?? row?.gslams ?? "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}

export function getShutouts(row: any): number | "" {
  const v = row?.SO ?? row?.SHO ?? row?.shutouts ?? row?.shut_outs ?? "";
  const n = Number(v);
  return Number.isFinite(n) ? n : "";
}
