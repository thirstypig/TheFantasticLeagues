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

type ActivityTone =
  | "add"
  | "drop"
  | "il-stash"
  | "il-activate"
  | "trade"
  | "commish"
  | "other";

interface DerivedActivity {
  label: string;
  tone: ActivityTone;
  detail?: string;
}

const TONE_CLASS: Record<ActivityTone, string> = {
  add: "bg-emerald-500/10 text-emerald-400",
  drop: "bg-red-500/10 text-red-400",
  "il-stash": "bg-amber-500/10 text-amber-400",
  "il-activate": "bg-cyan-500/10 text-cyan-400",
  trade: "bg-blue-500/10 text-blue-400",
  commish: "bg-violet-500/10 text-violet-400",
  other: "bg-zinc-500/10 text-zinc-400",
};

export function deriveActivity(item: HistoryItem): DerivedActivity {
  if (item.type === "trade") {
    const status = item.data.status || "";
    return {
      label: "Trade",
      tone: "trade",
      detail: status ? status.toLowerCase() : undefined,
    };
  }

  const tx = item.data;
  const raw = tx.transactionRaw || "";

  // "IL activate — returned <name> to <slot>" → extract destination slot
  const ilActivateToSlot = raw.match(/IL activate.*?to\s+([A-Za-z0-9/]+)/i);
  if (ilActivateToSlot) {
    return {
      label: "IL Activate",
      tone: "il-activate",
      detail: `→ ${ilActivateToSlot[1]}`,
    };
  }
  if (/IL activate/i.test(raw)) {
    return { label: "IL Activate", tone: "il-activate" };
  }

  if (/IL stash/i.test(raw)) {
    return { label: "IL Stash", tone: "il-stash" };
  }

  if (/Commissioner reassign/i.test(raw)) {
    return { label: "Reassigned", tone: "commish" };
  }

  if (/^Claimed/i.test(raw)) return { label: "Claimed", tone: "add" };
  if (/^Dropped/i.test(raw)) return { label: "Dropped", tone: "drop" };

  if (tx.type === "ADD") return { label: "Claimed", tone: "add" };
  if (tx.type === "DROP") return { label: "Dropped", tone: "drop" };
  if (tx.type === "TRADE") return { label: "Traded", tone: "trade" };
  if (tx.type === "COMMISSIONER") return { label: "Commissioner", tone: "commish" };

  return { label: raw || tx.type || "Activity", tone: "other" };
}

function summarizeTradePlayers(t: TradeProposal): string {
  const items = t.items || [];
  const names = items
    .map((i) => (i as unknown as { player?: { name?: string } }).player?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return "—";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
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
                <ThemedTh>Team</ThemedTh>
                <ThemedTh>Player</ThemedTh>
                <ThemedTh className="pr-8">Activity</ThemedTh>
              </ThemedTr>
            </ThemedThead>
            <tbody className="divide-y divide-[var(--lg-divide)]">
              {filteredHistory.map((item) => {
                const activity = deriveActivity(item);
                const toneClass = TONE_CLASS[activity.tone];

                if (item.type === "trade") {
                  const t = item.data as TradeProposal;
                  return (
                    <ThemedTr key={`trade-${t.id}`} className="group hover:bg-[var(--lg-tint)]">
                      <ThemedTd className="pl-8">{item.date.toLocaleDateString()}</ThemedTd>
                      <ThemedTd>
                        {t.proposingTeam?.name ?? "—"} ↔ {t.acceptingTeam?.name ?? "—"}
                      </ThemedTd>
                      <ThemedTd>{summarizeTradePlayers(t)}</ThemedTd>
                      <ThemedTd className="pr-8">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass}`}
                        >
                          {activity.label}
                        </span>
                        {activity.detail && (
                          <span className="ml-2 text-xs font-mono uppercase text-[var(--lg-text-muted)]">
                            {activity.detail}
                          </span>
                        )}
                      </ThemedTd>
                    </ThemedTr>
                  );
                }

                const tx = item.data as TransactionEvent;
                return (
                  <ThemedTr key={`tx-${tx.id}`} className="group hover:bg-[var(--lg-tint)]">
                    <ThemedTd className="pl-8">
                      {tx.effDate ? new Date(tx.effDate).toLocaleDateString() : tx.effDateRaw}
                    </ThemedTd>
                    <ThemedTd>{tx.team?.name || tx.ogbaTeamName || "—"}</ThemedTd>
                    <ThemedTd>{tx.player?.name || tx.playerAliasRaw || "—"}</ThemedTd>
                    <ThemedTd className="pr-8">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${toneClass}`}
                      >
                        {activity.label}
                      </span>
                      {activity.detail && (
                        <span className="ml-2 text-xs text-[var(--lg-text-muted)]">
                          {activity.detail}
                        </span>
                      )}
                    </ThemedTd>
                  </ThemedTr>
                );
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
