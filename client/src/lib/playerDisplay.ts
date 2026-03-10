// client/src/lib/playerDisplay.ts
export function isPitcher(v: any): boolean {
  if (typeof v === "string") {
    const s = v.trim().toUpperCase();
    return s === "P" || s === "SP" || s === "RP";
  }
  if (v && typeof v === "object") {
    // Handle both boolean and numeric (1/0) is_pitcher values
    if (v.is_pitcher != null) return !!v.is_pitcher;
    if (v.isPitcher != null) return !!v.isPitcher;

    const group = String(v.group ?? "").trim().toUpperCase();
    if (group === "P") return true;
    if (group === "H") return false;

    const pos = String(v.positions ?? v.pos ?? v.posPrimary ?? "").trim().toUpperCase();
    if (pos === "P" || pos === "SP" || pos === "RP") return true;
  }
  return false;
}

export function normalizePosition(pos: any): string {
  const s = String(pos ?? "").trim();
  if (!s) return "";
  // If multiple, keep as-is but uppercase
  return s.toUpperCase();
}

export function formatAvg(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(3);
  // show .289 instead of 0.289
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
