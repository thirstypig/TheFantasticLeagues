import React, { useMemo, useState } from "react";
import { TransactionEvent } from "../../../api";
import { TradeProposal } from "../../trades/api";
import {
  ThemedTable,
  ThemedThead,
  ThemedTh,
  ThemedTr,
  ThemedTd,
} from "../../../components/ui/ThemedTable";

type HistoryItem =
  | { type: "trade"; date: Date; data: TradeProposal }
  | { type: "transaction"; date: Date; data: TransactionEvent };

interface Props {
  completedTrades: TradeProposal[];
  transactions: TransactionEvent[];
}

export default function ActivityHistoryTab({ completedTrades, transactions }: Props) {
  const [historyRange, setHistoryRange] = useState<string>("30");
  const [historyType, setHistoryType] = useState<string>("all");

  const mergedHistory = useMemo<HistoryItem[]>(() => {
    const tradeEvents: HistoryItem[] = completedTrades.map((t) => ({
      type: "trade" as const,
      date: new Date(t.createdAt),
      data: t,
    }));
    const txEvents: HistoryItem[] = transactions.map((tx) => ({
      type: "transaction" as const,
      date: tx.effDate ? new Date(tx.effDate) : new Date(tx.submittedAt || 0),
      data: tx,
    }));
    return [...tradeEvents, ...txEvents].sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [completedTrades, transactions]);

  const filteredHistory = useMemo(() => {
    let items = mergedHistory;

    if (historyType === "trades") items = items.filter((i) => i.type === "trade");
    else if (historyType === "transactions") items = items.filter((i) => i.type === "transaction");

    if (historyRange !== "all") {
      const days = Number(historyRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      items = items.filter((i) => i.date >= cutoff);
    }

    return items;
  }, [mergedHistory, historyRange, historyType]);

  return (
    <div className="space-y-4">
      {/* History Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={historyRange}
          onChange={(e) => setHistoryRange(e.target.value)}
          className="lg-input w-auto min-w-[160px] text-xs font-medium py-2"
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
          <option value="all">All Time</option>
        </select>
        <select
          value={historyType}
          onChange={(e) => setHistoryType(e.target.value)}
          className="lg-input w-auto min-w-[160px] text-xs font-medium py-2"
        >
          <option value="all">All Types</option>
          <option value="trades">Trades Only</option>
          <option value="transactions">Roster Moves Only</option>
        </select>
        <span className="text-xs text-[var(--lg-text-muted)] font-medium ml-2">
          {filteredHistory.length} {filteredHistory.length === 1 ? "event" : "events"}
        </span>
      </div>

      <div className="lg-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <ThemedTable bare>
            <ThemedThead>
              <ThemedTr>
                <ThemedTh className="pl-8">Date</ThemedTh>
                <ThemedTh>Type</ThemedTh>
                <ThemedTh>Team</ThemedTh>
                <ThemedTh className="pr-8">Details</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
            {filteredHistory.map((item) => {
              if (item.type === "trade") {
                const t = item.data as TradeProposal;
                return (
                  <ThemedTr key={`trade-${t.id}`} className="group hover:bg-[var(--lg-tint)]">
                    <ThemedTd className="pl-8">
                      {item.date.toLocaleDateString()}
                    </ThemedTd>
                    <ThemedTd>
                      <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-400">
                        Trade
                      </span>
                    </ThemedTd>
                    <ThemedTd>
                      {t.proposingTeam?.name ?? "—"} ↔ {t.acceptingTeam?.name ?? "—"}
                    </ThemedTd>
                    <ThemedTd className="pr-8">
                      <span className="text-xs font-mono uppercase text-[var(--lg-text-muted)]">
                        {t.status}
                      </span>
                    </ThemedTd>
                  </ThemedTr>
                );
              } else {
                const tx = item.data as TransactionEvent;
                return (
                  <ThemedTr key={`tx-${tx.id}`} className="group hover:bg-[var(--lg-tint)]">
                    <ThemedTd className="pl-8">
                      {tx.effDate
                        ? new Date(tx.effDate).toLocaleDateString()
                        : tx.effDateRaw}
                    </ThemedTd>
                    <ThemedTd>
                      <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                        {tx.transactionRaw || "Roster"}
                      </span>
                    </ThemedTd>
                    <ThemedTd>{tx.team?.name || tx.ogbaTeamName}</ThemedTd>
                    <ThemedTd className="pr-8">
                      {tx.player?.name || tx.playerAliasRaw}
                    </ThemedTd>
                  </ThemedTr>
                );
              }
            })}
            {filteredHistory.length === 0 && (
              <ThemedTr>
                <ThemedTd colSpan={4} className="py-32 text-center">
                  {mergedHistory.length === 0 ? "No activity found." : "No events match your filters."}
                </ThemedTd>
              </ThemedTr>
            )}
            </tbody>
          </ThemedTable>
        </div>
      </div>
    </div>
  );
}
