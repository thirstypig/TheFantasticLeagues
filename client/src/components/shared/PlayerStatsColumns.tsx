/**
 * Shared column definitions for hitter/pitcher stat tables.
 * Used by Players, AddDropTab, and PlayerPoolTab to eliminate
 * duplicated header + cell definitions across 4 files.
 */

import { SortableHeader } from "../ui/SortableHeader";
import { ThemedTd } from "../ui/ThemedTable";
import { fmtRate } from "../../api";

interface SortProps {
  sortKey: string;
  sortDesc: boolean;
  onSort: (key: string) => void;
}

/** Column width presets */
const W_STAT = "w-14";       // compact stat column (R, HR, RBI, SB, AB, W, SV, K)
const W_RATE = "w-[4.5rem]"; // rate stat column (AVG, ERA, WHIP)
const W_NARROW = "w-10";     // narrow stat column (G, SHO)

// ─── Headers ──────────────────────────────────────────────────

export function HitterStatHeaders({ sortKey, sortDesc, onSort }: SortProps) {
  return (
    <>
      <SortableHeader sortKey="G" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_NARROW}>G</SortableHeader>
      <SortableHeader sortKey="AB" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>AB</SortableHeader>
      <SortableHeader sortKey="R" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>R</SortableHeader>
      <SortableHeader sortKey="HR" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>HR</SortableHeader>
      <SortableHeader sortKey="RBI" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>RBI</SortableHeader>
      <SortableHeader sortKey="SB" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>SB</SortableHeader>
      <SortableHeader sortKey="AVG" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_RATE}>AVG</SortableHeader>
    </>
  );
}

export function PitcherStatHeaders({ sortKey, sortDesc, onSort }: SortProps) {
  return (
    <>
      <SortableHeader sortKey="G" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_NARROW}>G</SortableHeader>
      <SortableHeader sortKey="IP" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>IP</SortableHeader>
      <SortableHeader sortKey="W" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>W</SortableHeader>
      <SortableHeader sortKey="SV" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>SV</SortableHeader>
      <SortableHeader sortKey="K" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>K</SortableHeader>
      <SortableHeader sortKey="ERA" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_RATE}>ERA</SortableHeader>
      <SortableHeader sortKey="WHIP" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_RATE}>WHIP</SortableHeader>
      <SortableHeader sortKey="SHO" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_NARROW} title="Shutouts">SHO</SortableHeader>
    </>
  );
}

// ─── Cells ────────────────────────────────────────────────────

interface StatRow {
  G?: number | string;
  AB?: number | string;
  R?: number | string;
  HR?: number | string;
  RBI?: number | string;
  SB?: number | string;
  AVG?: number | string;
  W?: number | string;
  SV?: number | string;
  K?: number | string;
  IP?: number | string;
  ERA?: number | string;
  WHIP?: number | string;
  SHO?: number | string;
}

export function HitterStatCells({ row }: { row: StatRow }) {
  return (
    <>
      <ThemedTd align="center">{row.G ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.AB ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.R ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.HR ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.RBI ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.SB ?? 0}</ThemedTd>
      <ThemedTd align="center">{typeof row.AVG === "number" ? fmtRate(row.AVG) : ".000"}</ThemedTd>
    </>
  );
}

/** Format IP for display — show one decimal for fractional innings */
function fmtIP(val: number | string | undefined): string {
  if (val == null) return "0";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (!n) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export function PitcherStatCells({ row }: { row: StatRow }) {
  return (
    <>
      <ThemedTd align="center">{row.G ?? 0}</ThemedTd>
      <ThemedTd align="center">{fmtIP(row.IP)}</ThemedTd>
      <ThemedTd align="center">{row.W ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.SV ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.K ?? 0}</ThemedTd>
      <ThemedTd align="center">{row.ERA ? Number(row.ERA).toFixed(2) : "0.00"}</ThemedTd>
      <ThemedTd align="center">{row.WHIP ? Number(row.WHIP).toFixed(2) : "0.00"}</ThemedTd>
      <ThemedTd align="center">{row.SHO ?? 0}</ThemedTd>
    </>
  );
}
