/*
 * MobilePlayerExpand — inline expanded panel rendered below a tapped
 * player row in MobilePlayers. Loads career stats on mount via the
 * existing getPlayerCareerStats endpoint (cached server-side per
 * mlbId × group). Skips the L15 sparkline for now — that's a separate
 * getPlayerRecentStats fetch that can ship as a follow-up.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createAddEntry } from "../../features/wire-list/api";
import {
  getPlayerCareerStats,
  type CareerHittingRow,
  type CareerPitchingRow,
  type CareerStatsResponse,
  type PlayerSeasonStat,
} from "../../api";
import { reportError } from "../../lib/errorBus";
import { Glyph } from "../atoms/Glyph";

interface MobilePlayerExpandProps {
  player: PlayerSeasonStat;
  isWatched: boolean;
  watchPending: boolean;
  onToggleWatch: () => void;
  /** Set when there is a PENDING waiver period — enables the add-to-wire-list CTA. */
  activePeriodId?: number;
  /** The current user's team id — required to create the add entry. */
  myTeamId?: number;
}

function isPitcherRow(p: PlayerSeasonStat): boolean {
  return Boolean(p.is_pitcher ?? p.isPitcher);
}

function fmtNum(v: number | string | null | undefined, digits: number): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(digits);
}

function fmtAvgString(v: string | number | undefined | null): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(3).replace(/^0/, "");
}

function fmtInt(v: number | undefined | null): string {
  if (v == null) return "—";
  return String(Math.trunc(v));
}

interface ExpCellProps {
  label: string;
  value: string;
}

function ExpCell({ label, value }: ExpCellProps) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderRadius: 9,
        background: "var(--am-chip)",
        border: "1px solid var(--am-border)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 0.6,
          color: "var(--am-text-faint)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "var(--am-text)",
          fontVariantNumeric: "tabular-nums",
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function MobilePlayerExpand({
  player,
  isWatched,
  watchPending,
  onToggleWatch,
  activePeriodId,
  myTeamId,
}: MobilePlayerExpandProps) {
  const nav = useNavigate();
  const isPitcher = isPitcherRow(player);
  const [career, setCareer] = useState<CareerStatsResponse | null>(null);
  const [careerLoading, setCareerLoading] = useState(true);
  const [careerError, setCareerError] = useState(false);
  const [addState, setAddState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!player.mlb_id) {
      setCareer(null);
      setCareerLoading(false);
      return;
    }
    let canceled = false;
    setCareerLoading(true);
    setCareerError(false);
    getPlayerCareerStats(player.mlb_id, isPitcher ? "pitching" : "hitting")
      .then((resp) => {
        if (canceled) return;
        setCareer(resp);
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setCareerError(true);
        reportError(err, { source: "mobile-player-expand-career" });
      })
      .finally(() => {
        if (!canceled) setCareerLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [player.mlb_id, isPitcher]);

  useEffect(() => {
    setAddState("idle");
    setAddError(null);
  }, [player.id]);

  const handleAddToWireList = async () => {
    if (!activePeriodId || !myTeamId) return;
    setAddState("loading");
    setAddError(null);
    try {
      await createAddEntry(activePeriodId, { teamId: myTeamId, playerId: player.id });
      setAddState("done");
    } catch (err: unknown) {
      setAddState("error");
      setAddError(err instanceof Error ? err.message : "Failed to add to wire list");
      reportError(err, { source: "mobile-player-expand-add-wire" });
    }
  };

  // Pull last-4 real seasons (skip the synthetic "TOT" aggregate row).
  const careerRows = (career?.rows ?? [])
    .filter((r) => r.year !== "TOT")
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, 4);

  return (
    <div
      data-testid="mobile-player-expand"
      style={{
        padding: "12px 14px 14px",
        background: "var(--am-surface-faint)",
        borderTop: "1px solid var(--am-border)",
      }}
    >
      {/* Extended season-stat strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 6,
          marginBottom: 10,
        }}
      >
        {isPitcher ? (
          <>
            <ExpCell label="IP" value={fmtNum(player.IP ?? null, 1)} />
            <ExpCell label="ER" value={fmtInt(player.ER ?? null)} />
            <ExpCell label="K/9" value={fmtNum(player.K9 ?? null, 1)} />
            <ExpCell label="BB/9" value={fmtNum(player.BB9 ?? null, 1)} />
          </>
        ) : (
          <>
            <ExpCell label="G" value={fmtInt(player.G)} />
            <ExpCell label="AB" value={fmtInt(player.AB)} />
            <ExpCell label="OBP" value={fmtAvgString(player.OBP ?? null)} />
            <ExpCell label="OPS" value={fmtAvgString(player.OPS ?? null)} />
          </>
        )}
      </div>

      {/* Career */}
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: 0.6,
          fontWeight: 700,
          color: "var(--am-text-faint)",
          marginBottom: 4,
        }}
      >
        {careerRows.length ? `CAREER · LAST ${careerRows.length} SEASONS` : "CAREER"}
      </div>
      {careerLoading ? (
        <div style={{ fontSize: 11, color: "var(--am-text-muted)", padding: "8px 0" }}>
          Loading career…
        </div>
      ) : careerError ? (
        <div style={{ fontSize: 11, color: "var(--am-text-muted)", padding: "8px 0" }}>
          Career stats unavailable.
        </div>
      ) : careerRows.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--am-text-muted)", padding: "8px 0" }}>
          No career data yet.
        </div>
      ) : (
        <div
          data-testid="mobile-player-expand-career"
          style={{
            display: "grid",
            gridTemplateColumns: isPitcher
              ? "60px repeat(5, 1fr)"
              : "60px repeat(5, 1fr)",
            rowGap: 3,
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            marginBottom: 10,
          }}
        >
          <CareerHeader>YEAR</CareerHeader>
          {isPitcher ? (
            <>
              <CareerHeader align="right">W</CareerHeader>
              <CareerHeader align="right">K</CareerHeader>
              <CareerHeader align="right">ERA</CareerHeader>
              <CareerHeader align="right">WHIP</CareerHeader>
              <CareerHeader align="right">IP</CareerHeader>
            </>
          ) : (
            <>
              <CareerHeader align="right">AVG</CareerHeader>
              <CareerHeader align="right">HR</CareerHeader>
              <CareerHeader align="right">RBI</CareerHeader>
              <CareerHeader align="right">SB</CareerHeader>
              <CareerHeader align="right">OPS</CareerHeader>
            </>
          )}
          {careerRows.map((row, idx) => (
            <CareerRow key={row.year + "-" + idx} row={row} isPitcher={isPitcher} idx={idx} />
          ))}
        </div>
      )}

      {/* CTA buttons */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onToggleWatch}
          disabled={watchPending}
          data-testid="mobile-player-expand-watch"
          style={{
            flex: 1,
            padding: "9px 12px",
            borderRadius: 10,
            background: isWatched ? "var(--am-chip-strong)" : "var(--am-irid)",
            color: isWatched ? "var(--am-text)" : "#fff",
            border: isWatched ? "1px solid var(--am-border-strong)" : "none",
            fontSize: 12,
            fontWeight: 700,
            cursor: watchPending ? "wait" : "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            opacity: watchPending ? 0.6 : 1,
          }}
        >
          <Glyph kind={isWatched ? "starOn" : "star"} size={14} />
          {isWatched ? "Watching" : "Watch"}
        </button>
        {activePeriodId != null && myTeamId != null && (
          <button
            type="button"
            onClick={handleAddToWireList}
            disabled={addState === "loading" || addState === "done"}
            data-testid="mobile-player-expand-add-wire"
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 10,
              background: addState === "done" ? "var(--am-chip-strong)" : "var(--am-chip)",
              color: addState === "done" ? "var(--am-positive)" : "var(--am-accent)",
              border: "1px solid " + (addState === "done" ? "var(--am-border-strong)" : "var(--am-border)"),
              fontSize: 12,
              fontWeight: 700,
              cursor: addState === "loading" || addState === "done" ? "default" : "pointer",
              fontFamily: "inherit",
              opacity: addState === "loading" ? 0.6 : 1,
            }}
          >
            {addState === "done" ? "✓ Added" : addState === "loading" ? "Adding…" : "+ Wire list"}
          </button>
        )}
        <button
          type="button"
          onClick={() => player.mlb_id && nav(`/players/${player.mlb_id}`)}
          disabled={!player.mlb_id}
          data-testid="mobile-player-expand-detail"
          style={{
            padding: "9px 14px",
            borderRadius: 10,
            background: "var(--am-chip-strong)",
            color: "var(--am-text)",
            border: "1px solid var(--am-border)",
            fontSize: 12,
            fontWeight: 600,
            cursor: player.mlb_id ? "pointer" : "default",
            fontFamily: "inherit",
          }}
        >
          Full Profile
        </button>
      </div>
      {addState === "error" && addError && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--am-negative)", textAlign: "center" }}>
          {addError}
        </div>
      )}
    </div>
  );
}

function CareerHeader({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: 0.5,
        fontWeight: 700,
        color: "var(--am-text-faint)",
        textAlign: align,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function CareerRow({
  row,
  isPitcher,
  idx,
}: {
  row: CareerHittingRow | CareerPitchingRow;
  isPitcher: boolean;
  idx: number;
}) {
  const yearWeight = idx === 0 ? 700 : 500;
  const valueWeight = idx === 0 ? 600 : 400;
  const color = idx === 0 ? "var(--am-text)" : "var(--am-text-muted)";
  const yearStyle: React.CSSProperties = {
    color,
    fontWeight: yearWeight,
    textAlign: "left",
  };
  const cellStyle: React.CSSProperties = {
    color,
    fontWeight: valueWeight,
    textAlign: "right",
  };
  if (isPitcher) {
    const r = row as CareerPitchingRow;
    // Hitters/pitchers don't share fields — use slug-based access via runtime check.
    return (
      <>
        <div style={yearStyle}>{r.year}</div>
        <div style={cellStyle}>{fmtInt(r.W)}</div>
        <div style={cellStyle}>{fmtInt(r.SO)}</div>
        <div style={cellStyle}>{fmtAvgString(r.ERA)}</div>
        <div style={cellStyle}>{fmtAvgString(r.WHIP)}</div>
        <div style={cellStyle}>{fmtNum(r.IP, 1)}</div>
      </>
    );
  }
  const r = row as CareerHittingRow;
  // Compute OPS from OBP + SLG (career rows don't carry OPS directly).
  const obp = Number(r.OBP);
  const slg = Number(r.SLG);
  const ops = Number.isFinite(obp) && Number.isFinite(slg) ? obp + slg : null;
  return (
    <>
      <div style={yearStyle}>{r.year}</div>
      <div style={cellStyle}>{fmtAvgString(r.AVG)}</div>
      <div style={cellStyle}>{fmtInt(r.HR)}</div>
      <div style={cellStyle}>{fmtInt(r.RBI)}</div>
      <div style={cellStyle}>{fmtInt(r.SB)}</div>
      <div style={cellStyle}>{ops != null ? ops.toFixed(3).replace(/^0/, "") : "—"}</div>
    </>
  );
}
