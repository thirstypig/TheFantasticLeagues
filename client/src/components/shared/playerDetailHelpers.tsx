// Pure helpers and small tables shared by the /players/:mlbId full profile page,
// Roster Moves and the roster hub. (Extracted from the retired PlayerDetailModal.)
import React from "react";

import {
  type HOrP,
  type PlayerSeasonStat,
  type CareerHittingRow,
  type CareerPitchingRow,
  type RecentHittingRow,
  type RecentPitchingRow,
} from "../../api";
import { toNum } from "../../api/base";
import { resolveRealMlbId } from "../../lib/sportConfig";
import { ThemedTable, ThemedThead, ThemedTh, ThemedTr, ThemedTd } from "../ui/ThemedTable";

/**
 * Numeric mlbId to hand to usePlayerCard().open(), or null when the row has no
 * usable id. Applies the same placeholder resolution the old modal used
 * (Ohtani's pitcher row resolves to his real id).
 */
export function cardMlbId(raw: unknown): number | null {
  const n = Number(resolveRealMlbId(String(raw ?? "").trim()));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function norm(v: any) {
  return String(v ?? "").trim();
}

function isPitcherRow(p: PlayerSeasonStat): boolean {
  const v = (p as any).is_pitcher;
  if (typeof v === "boolean") return v;
  const g = norm((p as any).group).toUpperCase();
  if (g === "P") return true;
  if (g === "H") return false;
  return Boolean((p as any).isPitcher);
}

function fmt3(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const s = x.toFixed(3);
  return s.startsWith("0") ? s.slice(1) : s;
}

function fmt2(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(2);
}

function deriveMode(p: PlayerSeasonStat): HOrP {
  return isPitcherRow(p) ? "pitching" : "hitting";
}

function transactionBadgeClass(typeDesc: string): string {
  const t = typeDesc.toLowerCase();
  if (t.includes("trade")) return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
  if (t.includes("injured") || t.includes("il") || t.includes("disabled")) return "bg-red-500/10 text-red-400 border border-red-500/20";
  if (t.includes("recalled") || t.includes("selected") || t.includes("call")) return "bg-green-500/10 text-green-400 border border-green-500/20";
  if (t.includes("option") || t.includes("assign") || t.includes("designat") || t.includes("dfa")) return "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20";
  if (t.includes("sign") || t.includes("free agent")) return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  return "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border border-[var(--lg-border-faint)]";
}

function formatTransactionDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatRelativeDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export {
  RecentTable,
  CareerTable,
  ProfileField,
  formatTransactionDate,
  formatRelativeDate,
  transactionBadgeClass,
  isPitcherRow,
  deriveMode,
};

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-[var(--lg-text-muted)] mb-1">{label}</div>
      <div className="text-sm font-semibold text-[var(--lg-text-primary)]">{value || "—"}</div>
    </div>
  );
}

function RecentTable({
  rows,
  mode,
}: {
  rows: Array<RecentHittingRow | RecentPitchingRow>;
  mode: HOrP;
}) {
  if (mode === "hitting") {
    const r = rows as RecentHittingRow[];
    return (
      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh>Period</ThemedTh>
            <ThemedTh align="center">AB</ThemedTh>
            <ThemedTh align="center">H</ThemedTh>
            <ThemedTh align="center">R</ThemedTh>
            <ThemedTh align="center">HR</ThemedTh>
            <ThemedTh align="center">RBI</ThemedTh>
            <ThemedTh align="center">SB</ThemedTh>
            <ThemedTh align="center">AVG</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody>
          {r.map((x) => (
            <ThemedTr key={x.label}>
              <ThemedTd>{x.label}</ThemedTd>
              <ThemedTd align="center">{toNum(x.AB)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.H)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.R)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.HR)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.RBI)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.SB)}</ThemedTd>
              <ThemedTd align="center">
                {x.AVG ?? fmt3(toNum(x.H) / Math.max(1, toNum(x.AB)))}
              </ThemedTd>
            </ThemedTr>
          ))}
        </tbody>
      </ThemedTable>
    );
  }

  const p = rows as RecentPitchingRow[];
  return (
    <ThemedTable bare>
      <ThemedThead>
        <ThemedTr>
          <ThemedTh>Period</ThemedTh>
          <ThemedTh align="center">IP</ThemedTh>
          <ThemedTh align="center">W</ThemedTh>
          <ThemedTh align="center">SV</ThemedTh>
          <ThemedTh align="center">K</ThemedTh>
          <ThemedTh align="center">ERA</ThemedTh>
          <ThemedTh align="center">WHIP</ThemedTh>
        </ThemedTr>
      </ThemedThead>
      <tbody>
        {p.map((x) => (
          <ThemedTr key={x.label}>
            <ThemedTd>{x.label}</ThemedTd>
            <ThemedTd align="center">{x.IP ?? 0}</ThemedTd>
            <ThemedTd align="center">{toNum(x.W)}</ThemedTd>
            <ThemedTd align="center">{toNum(x.SV)}</ThemedTd>
            <ThemedTd align="center">{toNum(x.K)}</ThemedTd>
            <ThemedTd align="center">{x.ERA ?? fmt2(0)}</ThemedTd>
            <ThemedTd align="center">{x.WHIP ?? fmt2(0)}</ThemedTd>
          </ThemedTr>
        ))}
      </tbody>
    </ThemedTable>
  );
}

function CareerTable({
  rows,
  mode,
}: {
  rows: Array<CareerHittingRow | CareerPitchingRow>;
  mode: HOrP;
}) {
  if (mode === "hitting") {
    const r = rows as CareerHittingRow[];
    return (
      <ThemedTable bare>
        <ThemedThead>
          <ThemedTr>
            <ThemedTh align="center">YR</ThemedTh>
            <ThemedTh>TM</ThemedTh>
            <ThemedTh align="center">AB</ThemedTh>
            <ThemedTh align="center">H</ThemedTh>
            <ThemedTh align="center">R</ThemedTh>
            <ThemedTh align="center">HR</ThemedTh>
            <ThemedTh align="center">RBI</ThemedTh>
            <ThemedTh align="center">SB</ThemedTh>
            <ThemedTh align="center">AVG</ThemedTh>
          </ThemedTr>
        </ThemedThead>
        <tbody>
          {r.map((x) => (
            <ThemedTr key={`${x.year}-${x.tm}`}>
              <ThemedTd align="center">{x.year}</ThemedTd>
              <ThemedTd>{x.tm || "—"}</ThemedTd>
              <ThemedTd align="center">{toNum(x.AB)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.H)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.R)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.HR)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.RBI)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.SB)}</ThemedTd>
              <ThemedTd align="center">
                {x.AVG ?? fmt3(toNum(x.H) / Math.max(1, toNum(x.AB)))}
              </ThemedTd>
            </ThemedTr>
          ))}
        </tbody>
      </ThemedTable>
    );
  }

  const p = rows as CareerPitchingRow[];
  return (
    <ThemedTable bare>
      <ThemedThead>
        <ThemedTr>
          <ThemedTh align="center">YR</ThemedTh>
          <ThemedTh>TM</ThemedTh>
          <ThemedTh align="center">IP</ThemedTh>
          <ThemedTh align="center">W</ThemedTh>
          <ThemedTh align="center">SV</ThemedTh>
          <ThemedTh align="center">K</ThemedTh>
          <ThemedTh align="center">ERA</ThemedTh>
          <ThemedTh align="center">WHIP</ThemedTh>
        </ThemedTr>
      </ThemedThead>
      <tbody>
        {p.map((x) => {
          const era = norm((x as any).ERA) ? String((x as any).ERA) : fmt2(0);
          const whip = norm((x as any).WHIP) ? String((x as any).WHIP) : fmt2(0);

          return (
            <ThemedTr key={`${x.year}-${x.tm}`}>
              <ThemedTd align="center">{x.year}</ThemedTd>
              <ThemedTd>{x.tm || "—"}</ThemedTd>
              <ThemedTd align="center">{toNum(x.IP)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.W)}</ThemedTd>
              <ThemedTd align="center">{toNum(x.SV)}</ThemedTd>
              <ThemedTd align="center">{toNum((x as any).SO)}</ThemedTd>
              <ThemedTd align="center">{era}</ThemedTd>
              <ThemedTd align="center">{whip}</ThemedTd>
            </ThemedTr>
          );
        })}
      </tbody>
    </ThemedTable>
  );
}
