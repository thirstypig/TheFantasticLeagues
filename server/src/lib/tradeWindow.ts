// server/src/lib/tradeWindow.ts
// Enforces the `transactions.trade_window` league rule.
//   "anytime"     (default, or rule row missing) — trades always open.
//   "meeting_day" — trades open only BETWEEN periods: no Period for the
//                   league has status "active". With no active period at all
//                   (preseason / first period pending) trades are open.
import { prisma } from "../db/prisma.js";
import { getLeagueRules } from "./leagueRuleCache.js";

export type TradeWindow = { open: true } | { open: false; message: string };

export async function getTradeWindow(leagueId: number): Promise<TradeWindow> {
  const rules = await getLeagueRules(prisma, leagueId);
  const mode = rules.transactions?.trade_window ?? "anytime";
  if (mode !== "meeting_day") return { open: true };

  const active = await prisma.period.findFirst({
    where: { leagueId, status: "active" },
    select: { name: true },
  });
  if (!active) return { open: true };
  return {
    open: false,
    message: `Trades open at the next meeting, after ${active.name} closes.`,
  };
}
