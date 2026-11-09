// Start the next period: one page, one confirm. Nothing is written until the
// confirm sheet. Shows how late the start is and any roster moves made while
// the period was still pending, so the commissioner can sanity-check them.
import React, { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, MUTED, PRIMARY, ROW, Skeleton, useLoad } from "../components/cardParts";
import { getLeaguePeriods, getMovesSinceStart, setPeriodStatus } from "../api";

const DAY_MS = 86_400_000;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
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

export default function StartPeriodPage() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  const base = `/commissioner/${leagueId}`;
  const navigate = useNavigate();
  const { toast } = useToast();

  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const moves = useLoad(() => getMovesSinceStart(leagueId, periodId), [leagueId, periodId]);
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
      <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: "var(--am-text)" }}>{title}</h1>
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
        <p style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 600 }}>No next period set up</p>
        <Link to={`${base}/settings`} style={LINK}>Set up periods ›</Link>
      </Glass>
    );
  } else if (period.status !== "pending") {
    content = (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 16 }}>This period has already started.</p>
        <Link to={base} style={LINK}>Back to Commissioner</Link>
      </Glass>
    );
  } else {
    const badge = lateBadge(period.startDate);
    const list = moves.state === "ready" ? moves.data : [];
    const movesReady = moves.state === "ready";
    // Start-day overlap: warn (don't block) while the previous period is open.
    const stillActive = periods.data.find((p) => p.status === "active" && p.id !== period.id);
    content = (
      <>
        {stillActive && (
          <Glass padded>
            <p style={{ margin: "0 0 4px", fontSize: 16, color: "var(--am-warning)" }}>
              {stillActive.name} is still active — close it first so standings and moves land in the right period.
            </p>
            <Link to={`${base}/close/${stillActive.id}`} style={LINK}>Close {stillActive.name} ›</Link>
          </Glass>
        )}
        <Glass padded={false}>
          <div style={{ ...ROW, borderBottom: "none" }}>
            <span>{fmtDate(period.startDate)} – {fmtDate(period.endDate)}</span>
            {badge && (
              <strong style={{ color: daysLate(period.startDate) > 0 ? "var(--am-warning)" : "var(--am-positive)" }}>{badge}</strong>
            )}
          </div>
        </Glass>

        <SectionLabel>Moves since the start date</SectionLabel>
        <Glass padded={false}>
          {moves.state === "loading" ? (
            <Skeleton />
          ) : moves.state === "error" ? (
            <CardError>Couldn’t load moves.</CardError>
          ) : list.length === 0 ? (
            <p style={{ ...ROW, margin: 0, borderBottom: "none", ...MUTED }}>No moves since the start date.</p>
          ) : (
            <>
              <div style={{ ...ROW, fontWeight: 700, color: "var(--am-warning)" }}>
                ⚠ {list.length} {list.length === 1 ? "move" : "moves"} made while pending
              </div>
              {list.map((mv) => (
                <Link key={mv.id} to={`${base}/rosters`} style={ROW}>
                  <span>
                    {mv.playerName ?? "Unknown player"}
                    <span style={{ ...MUTED, display: "block" }}>
                      {[mv.teamName, mv.transactionType, fmtDate(mv.effDate)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
            </>
          )}
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
        <ConfirmSheet
          open={sheetOpen}
          title={`Start ${period.name}?`}
          body="The period becomes active and stats start counting. Moves made while pending stay as they are."
          confirmLabel="Start period"
          busy={busy}
          onConfirm={confirm}
          onCancel={() => setSheetOpen(false)}
        />
      </>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      {header(period ? `Start ${period.name}` : "Start period")}
      {content}
    </div>
  );
}
