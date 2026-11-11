import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { PlayerSeasonStat } from "../../../api";
import { fmtRate } from "../../../api";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { PlayerLink } from "../../../components/shared/playerCard/PlayerCardProvider";
import { cardMlbId } from "../../../components/shared/playerDetailHelpers";
import { OGBA_TEAM_NAMES } from "../../../lib/ogbaTeams";
import "./players-table.css";

export type PlayersTableProps = {
  rows: PlayerSeasonStat[];
  group: "hitters" | "pitchers";
  /** This step ships season mode only; the auction (step F) adds its own. */
  mode: "season";
  myTeamId: number | null;
  myTeamCode?: string | null;
  /** Id of the wire-list period when it is still editable; null hides + Wire List. */
  pendingPeriodId: number | null;
  /** Prisma player ids already on the owner's Wire List this period. */
  listedIds: ReadonlySet<number>;
  onWireListAdd: (row: PlayerSeasonStat) => Promise<void>;
  sortKey?: string;
  sortDesc?: boolean;
  onSort?: (key: string) => void;
};

type StatCol = { key: string; label: string };
const HITTER_COLS: StatCol[] = [
  { key: "R", label: "R" }, { key: "HR", label: "HR" }, { key: "RBI", label: "RBI" },
  { key: "SB", label: "SB" }, { key: "AVG", label: "AVG" },
];
const PITCHER_COLS: StatCol[] = [
  { key: "W", label: "W" }, { key: "SV", label: "SV" }, { key: "K", label: "K" },
  { key: "ERA", label: "ERA" }, { key: "WHIP", label: "WHIP" },
];

function fmtStat(key: string, row: PlayerSeasonStat): string {
  const v = (row as unknown as Record<string, unknown>)[key];
  if (key === "AVG") return typeof v === "number" ? fmtRate(v) : ".000";
  if (key === "ERA" || key === "WHIP") return typeof v === "number" ? v.toFixed(2) : "0.00";
  return String(v ?? 0);
}

function posLabel(row: PlayerSeasonStat): string {
  const raw = (row.positions || "").split(",").map((s) => s.trim()).filter(Boolean).join("/");
  return raw || (row.is_pitcher ? "P" : "UT");
}

function mlbLabel(row: PlayerSeasonStat): string {
  return row.mlb_team || row.mlbTeam || "FA";
}

function fantasyLabel(row: PlayerSeasonStat): string {
  const code = row.ogba_team_code;
  if (!code) return "Free agent";
  return row.ogba_team_name || OGBA_TEAM_NAMES[code] || code;
}

function displayName(row: PlayerSeasonStat): string {
  return row.mlb_full_name || row.player_name || "";
}

function Action({
  row, myTeamId, myTeamCode, pendingPeriodId, listedIds, onWireListAdd,
}: Pick<PlayersTableProps, "myTeamId" | "myTeamCode" | "pendingPeriodId" | "listedIds" | "onWireListAdd"> & { row: PlayerSeasonStat }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (myTeamId == null) return null;

  const owned = !!row.ogba_team_code;
  if (!owned) {
    if (pendingPeriodId == null) return null;
    if (listedIds.has(row.id)) {
      return <button type="button" className="pt-btn pt-btn-done" disabled>On Wire List</button>;
    }
    const add = async () => {
      setBusy(true);
      setError(null);
      try {
        await onWireListAdd(row);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : "Couldn't add. Try again.");
      } finally {
        setBusy(false);
      }
    };
    return (
      <span className="pt-action">
        <button type="button" className="pt-btn" disabled={busy} onClick={add}>+ Wire List</button>
        {error && <span role="alert" className="pt-error">{error}</span>}
      </span>
    );
  }

  const mine = row.ogba_team_id != null ? row.ogba_team_id === myTeamId : !!myTeamCode && row.ogba_team_code === myTeamCode;
  if (mine || row.ogba_team_id == null || row.ogba_slot === "IL") return null;
  return (
    <Link className="pt-btn pt-btn-link" to={`/trades/new?team=${row.ogba_team_id}&get=${row.id}`}>Trade</Link>
  );
}

function SortTh({
  k, label, align, sortKey, sortDesc, onSort,
}: { k: string; label: string; align?: "left" | "center"; sortKey?: string; sortDesc?: boolean; onSort?: (k: string) => void }) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDesc ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      className={align === "center" ? "pt-c" : undefined}
      aria-sort={active ? (sortDesc ? "descending" : "ascending") : "none"}
    >
      {onSort ? (
        <button type="button" className="pt-sort" onClick={() => onSort(k)}>
          {label}<Icon size={13} aria-hidden="true" />
        </button>
      ) : label}
    </th>
  );
}

export function PlayersTable(props: PlayersTableProps) {
  const { rows, group, myTeamId, myTeamCode, pendingPeriodId, listedIds, onWireListAdd, sortKey, sortDesc, onSort } = props;
  const phone = useMediaQuery("(max-width: 767px)");
  const cols = group === "hitters" ? HITTER_COLS : PITCHER_COLS;
  const actionProps = { myTeamId, myTeamCode, pendingPeriodId, listedIds, onWireListAdd };

  if (phone) {
    return (
      <ul className="pt-list" aria-label="Players">
        {rows.map((row) => (
          <li key={row.row_id ?? `${row.mlb_id}-${row.id}`} className="pt-item">
            <div className="pt-line">
              <div className="pt-id">
                <PlayerLink mlbId={cardMlbId(row.mlb_id)} name={displayName(row)} className="pt-name" group={group === "pitchers" ? "pitching" : "hitting"} />
                <span className="pt-sub">{`${posLabel(row)} · ${mlbLabel(row)} · ${fantasyLabel(row)}`}</span>
              </div>
              <div className="pt-item-action"><Action row={row} {...actionProps} /></div>
            </div>
            <div className="pt-stats">{cols.map((c) => (c.key === "AVG" ? fmtStat(c.key, row) : `${c.label} ${fmtStat(c.key, row)}`)).join(" · ")}</div>
          </li>
        ))}
      </ul>
    );
  }

  const sp = { sortKey, sortDesc, onSort };
  return (
    <div className="pt-wrap">
      <table className="pt-table" aria-label="Players">
        <thead>
          <tr>
            <SortTh k="name" label="Player" {...sp} />
            <SortTh k="mlb_team" label="MLB" {...sp} />
            <SortTh k="pos" label="Pos" {...sp} />
            <SortTh k="fantasy" label="Fantasy team" {...sp} />
            {cols.map((c) => <SortTh key={c.key} k={c.key} label={c.label} align="center" {...sp} />)}
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.row_id ?? `${row.mlb_id}-${row.id}`}>
              <td><PlayerLink mlbId={cardMlbId(row.mlb_id)} name={displayName(row)} className="pt-name" group={group === "pitchers" ? "pitching" : "hitting"} /></td>
              <td>{mlbLabel(row)}</td>
              <td>{posLabel(row)}</td>
              <td className={row.ogba_team_code ? undefined : "pt-muted"}>{fantasyLabel(row)}</td>
              {cols.map((c) => <td key={c.key} className="pt-c">{fmtStat(c.key, row)}</td>)}
              <td><Action row={row} {...actionProps} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
