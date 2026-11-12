// The auction's sales, read from the state log. Dependency-free so the draft
// report route and the regen script share one definition.
import type { AuctionLogEvent } from "../types.js";

export interface SaleLogEntry {
  playerName: string;
  teamName: string;
  price: number;
  order: number;
}

/**
 * WIN entries (lot sales and commissioner assigns) oldest first, numbered in
 * order. Sales the commissioner undid (`undone: true`) are not sales.
 */
export function saleEntriesFromLog(log: readonly AuctionLogEvent[] | null | undefined): SaleLogEntry[] {
  return (log ?? [])
    .filter(l => l.type === "WIN" && !l.undone && l.playerName && l.teamName && l.amount != null)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((l, i) => ({
      playerName: l.playerName!,
      teamName: l.teamName!,
      price: l.amount!,
      order: i + 1,
    }));
}
