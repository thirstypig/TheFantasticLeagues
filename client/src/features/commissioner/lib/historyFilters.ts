// History filter chips: maps audit actions to a chip. Unmatched actions show
// under All only.
export const HISTORY_CHIPS = ["All", "Periods", "Money", "Rules", "Trades", "Rosters", "Owners"] as const;
export type HistoryChip = (typeof HISTORY_CHIPS)[number];

/** The chip an action belongs to, or null when it only appears under All. */
export function historyChipFor(action: string): Exclude<HistoryChip, "All"> | null {
  if (action.startsWith("PERIOD_")) return "Periods";
  // Named prefixes win over the substring FEE/BILL checks below.
  if (action === "COMMISSIONER_TRADE_EXECUTE") return "Trades";
  if (action.startsWith("TRANSACTION_") || action.startsWith("COMMISSIONER_")) return "Rosters";
  if (action.startsWith("IL_FEE_") || action.startsWith("FINANCE_") || action.includes("FEE") || action.includes("BILL")) return "Money";
  if (action === "RULES_UPDATE" || action === "LEAGUE_UPDATE") return "Rules";
  if (action.startsWith("TRADE_")) return "Trades";
  if (action.startsWith("ROSTER_") || action.startsWith("WIRE_LIST_")) return "Rosters";
  if (action.startsWith("MEMBER_") || action.startsWith("INVITE_") || action.startsWith("TEAM_")) return "Owners";
  return null;
}

export function matchesChip(action: string, chip: HistoryChip): boolean {
  return chip === "All" || historyChipFor(action) === chip;
}
