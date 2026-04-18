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

// ─── Headers ──────────────────────────────────────────────────

export function HitterStatHeaders({ sortKey, sortDesc, onSort }: SortProps) {
  return (
    <>
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
      <SortableHeader sortKey="W" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>W</SortableHeader>
      <SortableHeader sortKey="SV" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>SV</SortableHeader>
      <SortableHeader sortKey="K" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_STAT}>K</SortableHeader>
      <SortableHeader sortKey="ERA" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_RATE}>ERA</SortableHeader>
      <SortableHeader sortKey="WHIP" activeSortKey={sortKey} sortDesc={sortDesc} onSort={onSort} align="center" className={W_RATE}>WHIP</SortableHeader>
    </>
  );
}

// ─── Cells ────────────────────────────────────────────────────

interface StatRow {
  AB?: number | string;
  R?: number | string;
  HR?: number | string;
  RBI?: number | string;
  SB?: number | string;
  AVG?: number | string;
  W?: number | string;
  SV?: number | string;
  K?: number | string;
  ERA?: number | string;
  WHIP?: number | string;
}

export function HitterStatCells({ row }: { row: StatRow }) {
  return (
    <>
      <ThemedTd align="center">{row.AB ?? "—"}</ThemedTd>
      <ThemedTd align="center">{row.R}</ThemedTd>
      <ThemedTd align="center">{row.HR}</ThemedTd>
      <ThemedTd align="center">{row.RBI}</ThemedTd>
      <ThemedTd align="center">{row.SB}</ThemedTd>
      <ThemedTd align="center">{typeof row.AVG === "number" ? fmtRate(row.AVG) : "—"}</ThemedTd>
    </>
  );
}

export function PitcherStatCells({ row }: { row: StatRow }) {
  return (
    <>
      <ThemedTd align="center">{row.W}</ThemedTd>
      <ThemedTd align="center">{row.SV}</ThemedTd>
      <ThemedTd align="center">{row.K}</ThemedTd>
      <ThemedTd align="center">{row.ERA ? Number(row.ERA).toFixed(2) : "—"}</ThemedTd>
      <ThemedTd align="center">{row.WHIP ? Number(row.WHIP).toFixed(2) : "—"}</ThemedTd>
    </>
  );
}
