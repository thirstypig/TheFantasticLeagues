// client/src/pages/CategoryStandings.tsx
import React, { useEffect, useMemo, useState } from "react";
import { getPeriodStandings, fmtRate } from "../../../api";
import PageHeader from "../../../components/ui/PageHeader";
import { ThemedTable, ThemedThead, ThemedTr, ThemedTh, ThemedTd } from "../../../components/ui/ThemedTable";
import { Input } from "../../../components/ui/Input";

// Categories used in PeriodStandingsResponse points/stats
type CategoryId = "R" | "HR" | "RBI" | "SB" | "AVG" | "W" | "S" | "K" | "ERA" | "WHIP";

type UiRow = {
  teamId?: number;
  teamName?: string;
  team?: string; // back-compat in case something returns `team`
  stats?: Partial<Record<CategoryId, number>>;
  points?: Partial<Record<CategoryId, number>>;
  totalPoints?: number;
};

const CATS: Array<{ id: CategoryId; label: string; higherIsBetter: boolean }> = [
  { id: "R", label: "R", higherIsBetter: true },
  { id: "HR", label: "HR", higherIsBetter: true },
  { id: "RBI", label: "RBI", higherIsBetter: true },
  { id: "SB", label: "SB", higherIsBetter: true },
  { id: "AVG", label: "AVG", higherIsBetter: true },
  { id: "W", label: "W", higherIsBetter: true },
  { id: "S", label: "S", higherIsBetter: true },
  { id: "K", label: "K", higherIsBetter: true },
  { id: "ERA", label: "ERA", higherIsBetter: false },
  { id: "WHIP", label: "WHIP", higherIsBetter: false },
];

function fmtStat(cat: CategoryId, v: number) {
  if (!Number.isFinite(v)) return "—";
  if (cat === "AVG") return fmtRate(v);
  if (cat === "ERA" || cat === "WHIP") return v.toFixed(2);
  return String(Math.round(v));
}

function fmtPts(v: number) {
  if (!Number.isFinite(v)) return "—";
  // roto ties can yield halves
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function getPeriodIdFromUrl(): number {
  const sp = new URLSearchParams(window.location.search);
  const raw = sp.get("periodId") || sp.get("pid") || "1";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default function CategoryStandings() {
  const [periodId, setPeriodId] = useState<number>(() => getPeriodIdFromUrl());
  const [rows, setRows] = useState<UiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const resp = await getPeriodStandings(periodId);
        if (!alive) return;
        setRows((resp?.rows ?? []) as UiRow[]);
      } catch (e: unknown) {
        if (!alive) return;
        const errMsg = e instanceof Error ? e.message : String(e);
        setErr(errMsg);
        setRows([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [periodId]);

  const sorted = useMemo(() => {
    // already sorted by totalPoints in api.ts, but keep it safe
    const copy = [...rows];
    copy.sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0));
    return copy;
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="mb-10">
        <PageHeader 
          title="Category Standings"
          subtitle="Points distribution across all statistical categories for the current period."
          rightElement={
              <div className="flex items-center gap-4">
                 <span className="text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">Period</span>
                 <Input
                   type="number"
                   className="w-24 h-10 px-3 text-sm text-[var(--lg-text-primary)] font-bold"
                   value={String(periodId)}
                   onChange={(e) => setPeriodId(Number(e.target.value) || 1)}
                   inputMode="numeric"
                 />
              </div>
          }
        />
      </div>



      {err ? (
        <div className="mb-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-6 py-4 text-sm font-medium text-rose-300 flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
          Error: {err}
        </div>
      ) : null}

      <div className="lg-card overflow-hidden">
        <div className="bg-[var(--lg-tint)] border-b border-[var(--lg-border-subtle)] px-8 py-4 text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-60">
          {loading ? "Loading stats..." : `Teams: ${sorted.length}`}
        </div>

      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh className="px-8 py-5">Team</ThemedTh>
            {CATS.map((c) => (
              <ThemedTh key={c.id} align="center">
                {c.label}
              </ThemedTh>
            ))}
            <ThemedTh align="center" className="px-8">Total</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody className="divide-y divide-[var(--lg-divide)]">
          {sorted.map((r, idx) => {
            const name = r.teamName ?? r.team ?? `Team ${idx + 1}`;
            return (
              <ThemedTr key={idx} className="hover:bg-[var(--lg-tint)]">
                <ThemedTd className="px-8 py-4">{name}</ThemedTd>
                {CATS.map((c) => {
                  const stat = r.stats?.[c.id] ?? 0;
                  const pts = r.points?.[c.id] ?? 0;
                  return (
                    <ThemedTd key={c.id} align="center" className="py-4">
                      <div className="font-bold text-[var(--lg-text-primary)] text-sm tabular-nums brightness-110">{fmtStat(c.id, stat)}</div>
                      <div className="text-xs font-bold text-[var(--lg-text-muted)] opacity-40 tabular-nums mt-0.5">{fmtPts(pts)}</div>
                    </ThemedTd>
                  );
                })}
                <ThemedTd align="center" className="px-8 py-4">
                  {fmtPts(r.totalPoints ?? 0)}
                </ThemedTd>
              </ThemedTr>
            );
          })}
          {!loading && sorted.length === 0 && (
            <ThemedTr>
              <ThemedTd colSpan={CATS.length + 2} align="center" className="py-16 italic font-medium">
                No data available.
              </ThemedTd>
            </ThemedTr>
          )}
        </tbody>
      </ThemedTable>
    </div>
    <div className="px-8 py-4 text-xs font-medium uppercase text-[var(--lg-text-muted)] opacity-30 mt-4 text-center">
      Stat Value (Top) | Roto Points (Bottom)
    </div>
    </div>
  );
}
