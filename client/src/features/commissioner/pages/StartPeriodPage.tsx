// Start the next period: one page, one confirm. Nothing is written until the
// confirm sheet. Shows how late the start is and any roster moves made while
// the period was still pending, so the commissioner can sanity-check them.
import React, { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, MUTED, PRIMARY, ROW, Skeleton, useLoad } from "../components/cardParts";
import { getLeaguePeriods, getMovesSinceStart, getRosterCheck, setPeriodStatus } from "../api";
import type { MoveSinceStart } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";

const DAY_MS = 86_400_000;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Mon Jun 15" */
function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
}

/** Inclusive day count of the period. */
function spanDays(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS) + 1;
}

const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };

function groupByTeam(list: MoveSinceStart[]): Array<[string, MoveSinceStart[]]> {
  const map = new Map<string, MoveSinceStart[]>();
  for (const mv of list) {
    const k = mv.teamName ?? "Unknown team";
    map.set(k, [...(map.get(k) ?? []), mv]);
  }
  return [...map.entries()];
}

function moveColor(type: string | null): string {
  if (type === "ADD") return "var(--am-positive)";
  if (type === "DROP") return "var(--am-negative)";
  return "var(--am-text)";
}

function moveLabel(mv: MoveSinceStart): string {
  const verb = mv.transactionType === "ADD" ? "Added" : mv.transactionType === "DROP" ? "Dropped" : (mv.transactionType ?? "Move");
  return `${verb} ${mv.playerName ?? "Unknown player"} · ${fmtDate(mv.effDate)}`;
}

/** Whole UTC days between the start date and today; <= 0 means on time. */
function daysLate(startIso: string): number {
  const start = new Date(startIso);
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - startDay) / DAY_MS);
}

function lateBadge(startIso: string): string | null {
  const n = daysLate(startIso);
  if (n < 0) return `starts in ${-n} ${-n === 1 ? "day" : "days"}`;
  if (n === 0) return "today";
  return `${n} ${n === 1 ? "day" : "days"} late`;
}

function StartPeriodPageBody() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  const base = `/commissioner/${leagueId}`;
  const navigate = useNavigate();
  const { toast } = useToast();

  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const moves = useLoad(() => getMovesSinceStart(leagueId, periodId), [leagueId, periodId]);
  const roster = useLoad(() => getRosterCheck(leagueId), [leagueId]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: state updates can lag a fast double-tap.
  const inFlight = useRef(false);

  const period = periods.state === "ready" ? periods.data.find((p) => p.id === periodId) : undefined;

  async function confirm() {
    if (inFlight.current || !period) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await setPeriodStatus(periodId, { status: "active" });
      toast(`${period.name} started`, "success");
      navigate(base);
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      setSheetOpen(false);
      toast(err instanceof Error && err.message ? err.message : "Couldn’t start the period.", "error");
    }
  }

  const header = (title: string) => (
    <header>
      <Link to={base} style={LINK}>‹ Commissioner</Link>
      <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>{title}</h1>
    </header>
  );

  let content: React.ReactNode;
  if (periods.state === "loading") {
    content = <Glass padded={false}><Skeleton /></Glass>;
  } else if (periods.state === "error") {
    content = <Glass padded={false}><CardError>Couldn’t load this period.</CardError></Glass>;
  } else if (!period) {
    content = (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 600 }}>No next period set up</p>
        <Link to={`${base}/season`} style={LINK}>Set up periods ›</Link>
      </Glass>
    );
  } else if (period.status !== "pending") {
    content = (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 17 }}>This period has already started.</p>
        <Link to={base} style={LINK}>Back to Commissioner</Link>
      </Glass>
    );
  } else {
    const badge = lateBadge(period.startDate);
    const list = moves.state === "ready" ? moves.data : [];
    const movesReady = moves.state === "ready";
    const overTeams = roster.state === "ready" ? roster.data.teams.filter((t) => t.over) : [];
    // Start-day overlap: warn (don't block) while the previous period is open.
    const stillActive = periods.data.find((p) => p.status === "active" && p.id !== period.id);
    content = (
      <>
        {stillActive && (
          <Glass padded>
            <p style={{ margin: "0 0 4px", fontSize: 17, color: "var(--am-warning)" }}>
              {stillActive.name} is still active — close it first so standings and moves land in the right period.
            </p>
            <Link to={`${base}/close/${stillActive.id}`} style={LINK}>Close {stillActive.name} ›</Link>
          </Glass>
        )}
        <div className="close-cols">
          <div style={{ display: "grid", gap: 16 }}>
            <SectionLabel>Moves since the start date{movesReady ? ` · ${list.length}` : ""}</SectionLabel>
            <Glass padded={false}>
              {moves.state === "loading" ? (
                <Skeleton />
              ) : moves.state === "error" ? (
                <CardError>Couldn’t load moves.</CardError>
              ) : list.length === 0 ? (
                <p style={{ ...ROW, margin: 0, borderBottom: "none", ...MUTED }}>No moves since the start date.</p>
              ) : (
                groupByTeam(list).map(([team, rows]) => (
                  <div key={team} data-testid={`team-moves-${team}`} style={{ borderBottom: "1px solid var(--am-border)" }}>
                    <p style={{ margin: 0, padding: "10px 16px 0", fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{team}</p>
                    {rows.map((mv) => (
                      <Link
                        key={mv.id}
                        to={`${base}/rosters`}
                        style={{ ...ROW, minHeight: 56, borderBottom: "none", fontSize: 15 }}
                      >
                        <span style={{ color: moveColor(mv.transactionType) }}>{moveLabel(mv)}</span>
                        <span aria-hidden="true">›</span>
                      </Link>
                    ))}
                  </div>
                ))
              )}
            </Glass>
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Glass padded>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--am-text)" }}>{period.name}</p>
              <p style={{ margin: "4px 0 0", ...SUB }}>
                {fmtLong(period.startDate)} – {fmtLong(period.endDate)}
              </p>
              <p style={{ margin: "4px 0 0", ...SUB }}>{spanDays(period.startDate, period.endDate)} days</p>
              {badge && (
                <strong style={{ display: "block", marginTop: 4, fontSize: 15, color: daysLate(period.startDate) > 0 ? "var(--am-warning)" : "var(--am-positive)" }}>{badge}</strong>
              )}
            </Glass>

            <Glass padded>
              {roster.state === "loading" && <span style={SUB}>Checking rosters…</span>}
              {roster.state === "error" && <span style={SUB}>Couldn’t load roster sizes.</span>}
              {roster.state === "ready" && overTeams.length === 0 && (
                <span style={{ ...SUB, color: "var(--am-positive)" }}>
                  ✓ All {roster.data.teams.length} rosters within {roster.data.cap}
                </span>
              )}
              {roster.state === "ready" && overTeams.map((t) => (
                <Link key={t.teamId} to={`${base}/rosters`} style={{ ...LINK, fontSize: 15, color: "var(--am-negative)", display: "flex" }}>
                  {t.teamName} {t.activeCount} / {roster.data.cap} ›
                </Link>
              ))}
            </Glass>

            {/* The moves list is the sanity check before starting — no start without it. */}
            <button
              type="button"
              style={{ ...PRIMARY, opacity: movesReady ? 1 : 0.6, cursor: movesReady ? "pointer" : "not-allowed" }}
              onClick={() => setSheetOpen(true)}
              disabled={busy || !movesReady}
            >
              Start {period.name}
            </button>
            {!movesReady && (
              <p style={{ margin: 0, ...MUTED }}>
                {moves.state === "error" ? "Couldn’t load moves — reload before starting" : "Loading moves…"}
              </p>
            )}
          </div>
        </div>
        <ConfirmSheet
          open={sheetOpen}
          title={`Start ${period.name}?`}
          body="Owners see the new rosters right away."
          confirmLabel="Start period"
          busy={busy}
          onConfirm={confirm}
          onCancel={() => setSheetOpen(false)}
        />
      </>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      {header(period ? `Start ${period.name}` : "Start period")}
      {content}
    </div>
  );
}

export default function StartPeriodPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><StartPeriodPageBody /></CommissionerOnly>;
}
