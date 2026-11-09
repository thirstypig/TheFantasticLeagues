// Close a period: a 5-step guided route. The step lives in ?step=1..5 and
// moving forward pushes history, so browser Back returns to the previous step.
// Each step fetches its own data on mount (no cross-step cache) so a reload on
// any step is safe. Nothing is written until the confirm sheet on step 5.
import React, { useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, MUTED, ROW, Skeleton, useLoad, type Load } from "../components/cardParts";
import {
  getCloseReadiness,
  getGhostIlSummary,
  getPeriodStandingsPreview,
  getRosterCheck,
  previewIlFees,
  setPeriodStatus,
  toTeamTotals,
  type CloseReadiness,
  type IlFeeReconcileResult,
} from "../api";

const PRIMARY: React.CSSProperties = {
  minHeight: 48,
  width: "100%",
  padding: "0 16px",
  borderRadius: 6,
  border: "1px solid var(--am-accent)",
  background: "var(--am-accent)",
  color: "var(--am-surface)",
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY: React.CSSProperties = {
  ...PRIMARY,
  border: "1px solid var(--am-border-strong)",
  background: "transparent",
  color: "var(--am-text)",
};

const LINK: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  fontSize: 16,
  color: "var(--am-accent)",
};

const STEP_LABELS = ["nothing is final until step 5", "rosters", "standings preview", "IL fees", "confirm"];

function fmtDate(iso: string | null): string {
  if (!iso) return "none yet";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function money(n: number): string {
  const abs = Math.abs(n);
  const s = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return n < 0 ? `-$${s}` : `$${s}`;
}

/** Per-team net of the dry-run preview: adds are positive, voids negative. */
function feeTotals(result: IlFeeReconcileResult) {
  const byTeam = new Map<number, { amount: number; players: string[] }>();
  for (const row of result.preview ?? []) {
    const t = byTeam.get(row.teamId) ?? { amount: 0, players: [] };
    t.amount += row.amount;
    if (row.action === "add" && row.playerName) t.players.push(row.playerName);
    byTeam.set(row.teamId, t);
  }
  const teams = [...byTeam.entries()]
    .map(([teamId, t]) => ({ teamId, ...t }))
    .sort((a, b) => b.amount - a.amount || a.teamId - b.teamId);
  const total = teams.reduce((sum, t) => sum + t.amount, 0);
  return { teams, total };
}

function useFeePreview(leagueId: number, periodId: number) {
  return useLoad(async () => {
    const [fees, roster] = await Promise.all([
      previewIlFees(leagueId, periodId),
      // Team names only; a failure here falls back to "Team <id>".
      getRosterCheck(leagueId).catch(() => null),
    ]);
    const names = new Map((roster?.teams ?? []).map((t) => [t.teamId, t.teamName]));
    return { ...feeTotals(fees), names };
  }, [leagueId, periodId]);
}

// ─── Steps ───────────────────────────────────────────────────────────

function Step1({ readiness, base, onNext }: { readiness: Load<CloseReadiness>; base: string; onNext: () => void }) {
  if (readiness.state === "loading") return <Glass padded={false}><Skeleton /></Glass>;
  if (readiness.state === "error") {
    return (
      <Glass padded={false}>
        <CardError>Couldn’t load this period.</CardError>
        <div style={{ padding: "0 16px 8px" }}><Link to={base} style={LINK}>Back to Commissioner</Link></div>
      </Glass>
    );
  }
  const r = readiness.data;
  const closed = r.status === "completed";
  return (
    <>
      <Glass padded={false}>
        <div style={ROW}>
          <span>Final stats are in?</span>
          <strong style={{ color: r.ready ? "var(--am-positive)" : "var(--am-warning)" }}>{r.ready ? "✓ yes" : "not yet"}</strong>
        </div>
        <div style={ROW}><span>Period ends</span><span>{fmtDate(r.endDate)}</span></div>
        <div style={{ ...ROW, borderBottom: "none" }}><span>Last stat date</span><span>{fmtDate(r.lastStatDate)}</span></div>
      </Glass>
      {closed ? (
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 16 }}>This period is already closed.</p>
          <Link to={base} style={LINK}>Back to Commissioner</Link>
        </div>
      ) : r.ready ? (
        <button type="button" style={PRIMARY} onClick={onNext}>Next</button>
      ) : (
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 16 }}>Come back after tomorrow morning's stats sync.</p>
          <Link to={base} style={LINK}>Back to Commissioner</Link>
        </div>
      )}
    </>
  );
}

function Step2({ leagueId, base, onNext }: { leagueId: number; base: string; onNext: () => void }) {
  const ghost = useLoad(() => getGhostIlSummary(leagueId), [leagueId]);
  const roster = useLoad(() => getRosterCheck(leagueId), [leagueId]);
  const rosters = `${base}/rosters`;
  return (
    <>
      <SectionLabel>Rosters right now</SectionLabel>
      <Glass padded={false}>
        {roster.state === "loading" ? (
          <Skeleton />
        ) : roster.state === "error" ? (
          <CardError>Couldn’t load roster sizes.</CardError>
        ) : roster.data.teams.some((t) => t.over) ? (
          roster.data.teams.filter((t) => t.over).map((t) => (
            <Link key={t.teamId} to={rosters} style={{ ...ROW, color: "var(--am-warning)" }}>
              <span>⚠ {t.teamName} · {t.activeCount} active (cap {roster.data.cap})</span>
              <span aria-hidden="true">›</span>
            </Link>
          ))
        ) : (
          <div style={ROW}>
            <span>✓ Roster sizes</span>
            <span style={MUTED}>All {roster.data.teams.length} at or under {roster.data.cap}</span>
          </div>
        )}
        {ghost.state === "loading" ? (
          <Skeleton />
        ) : ghost.state === "error" ? (
          <CardError>Couldn’t load ghost IL check.</CardError>
        ) : ghost.data.totalGhosts === 0 ? (
          <div style={ROW}><span>✓ Ghost IL</span><span style={MUTED}>None</span></div>
        ) : (
          ghost.data.teams.flatMap((t) =>
            t.ghosts.map((g) => (
              <Link key={g.rosterId} to={rosters} style={{ ...ROW, color: "var(--am-warning)" }}>
                <span>⚠ {t.teamName} · Ghost IL: {g.playerName} is off the MLB IL</span>
                <span aria-hidden="true">›</span>
              </Link>
            )),
          )
        )}
      </Glass>
      <p style={{ margin: 0, ...MUTED }}>This checks rosters as they are now, not every day of the period.</p>
      <button type="button" style={PRIMARY} onClick={onNext}>Next</button>
    </>
  );
}

function Step3({ leagueId, periodId, name, onNext }: { leagueId: number; periodId: number; name: string; onNext: () => void }) {
  const totals = useLoad(async () => toTeamTotals(await getPeriodStandingsPreview(leagueId, periodId)), [leagueId, periodId]);
  return (
    <>
      <SectionLabel>{name} points · not final</SectionLabel>
      <Glass padded={false}>
        {totals.state === "loading" ? (
          <Skeleton />
        ) : totals.state === "error" ? (
          <CardError>Couldn’t load the standings preview.</CardError>
        ) : totals.data.length === 0 ? (
          <p style={{ ...ROW, margin: 0, ...MUTED }}>No standings yet.</p>
        ) : (
          totals.data.map((t, i) => (
            <div key={t.teamName} style={ROW}>
              <span><span style={MUTED}>{i + 1}.</span> <span>{t.teamName}</span></span>
              <strong>{t.points}</strong>
            </div>
          ))
        )}
      </Glass>
      <button type="button" style={PRIMARY} onClick={onNext}>Next</button>
    </>
  );
}

function Step4({ leagueId, periodId, onChoose }: { leagueId: number; periodId: number; onChoose: (bill: "now" | "later") => void }) {
  const fees = useFeePreview(leagueId, periodId);
  return (
    <>
      <Glass padded={false}>
        {fees.state === "loading" ? (
          <Skeleton />
        ) : fees.state === "error" ? (
          <CardError>Couldn’t load the IL fee preview.</CardError>
        ) : (
          <>
            <div style={{ ...ROW, fontWeight: 700 }}>This close would bill {money(fees.data.total)}</div>
            {fees.data.teams.length === 0 && <p style={{ ...ROW, margin: 0, ...MUTED }}>No IL fees for this period.</p>}
            {fees.data.teams.map((t) => (
              <div key={t.teamId} data-testid={`fee-team-${t.teamId}`} style={ROW}>
                <span>
                  <span>{fees.data.names.get(t.teamId) ?? `Team ${t.teamId}`}</span>
                  {t.players.length > 0 && <span style={{ ...MUTED, display: "block" }}>{t.players.join(", ")}</span>}
                </span>
                <span>{money(t.amount)}</span>
              </div>
            ))}
          </>
        )}
      </Glass>
      {fees.state !== "loading" && (
        <div style={{ display: "grid", gap: 8 }}>
          {/* Billing now needs a known amount; "later" is always available. */}
          {fees.state === "ready" && (
            <button type="button" style={PRIMARY} onClick={() => onChoose("now")}>Close &amp; bill now</button>
          )}
          <button type="button" style={SECONDARY} onClick={() => onChoose("later")}>Close, bill later</button>
          <p style={{ margin: 0, ...MUTED }}>“Bill later” keeps a reminder in Needs you until you bill.</p>
        </div>
      )}
    </>
  );
}

function Step5({
  leagueId,
  periodId,
  base,
  readiness,
  bill,
}: {
  leagueId: number;
  periodId: number;
  base: string;
  readiness: Load<CloseReadiness>;
  bill: "now" | "later" | null;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fees = useFeePreview(leagueId, periodId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: state updates can lag a fast double-tap.
  const inFlight = useRef(false);

  if (bill === null) {
    return (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 16 }}>Pick whether to bill IL fees now or later first.</p>
        <Link to="?step=4" style={LINK}>Choose how to bill ›</Link>
      </Glass>
    );
  }

  if (readiness.state === "loading") return <Glass padded={false}><Skeleton /></Glass>;
  if (readiness.state === "error") return <Glass padded={false}><CardError>Couldn’t load this period.</CardError></Glass>;
  const r = readiness.data;
  if (r.status === "completed") {
    return (
      <Glass padded>
        <p style={{ margin: "0 0 4px", fontSize: 16 }}>This period is already closed.</p>
        <Link to={base} style={LINK}>Back to Commissioner</Link>
      </Glass>
    );
  }

  const billNow = bill === "now";
  const total = fees.state === "ready" ? fees.data.total : null;
  // Billing now must state the dollar amount before the commissioner confirms.
  const canClose = !billNow || total !== null;
  const body = billNow
    ? `Standings lock and ${money(total ?? 0)} in IL fees are billed. You can't undo this.`
    : "Standings lock — IL fees stay unbilled until you bill them. You can't undo this.";

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await setPeriodStatus(periodId, { status: "completed", billFees: billNow });
      toast(`${r.name} closed`, "success");
      navigate(base);
    } catch (err) {
      inFlight.current = false;
      setBusy(false);
      setSheetOpen(false);
      toast(err instanceof Error && err.message ? err.message : "Couldn’t close the period.", "error");
    }
  }

  return (
    <>
      <SectionLabel>Summary</SectionLabel>
      <Glass padded={false}>
        <div style={ROW}><span>Standings</span><span>Locked at close</span></div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <span>IL fees</span>
          <span>
            {fees.state === "loading"
              ? "…"
              : fees.state === "error"
                ? "couldn’t load"
                : billNow
                  ? `${money(fees.data.total)} billed now`
                  : `${money(fees.data.total)} left unbilled`}
          </span>
        </div>
      </Glass>
      {fees.state === "error" && billNow && (
        <CardError>Couldn’t load the IL fee amount, so billing now is unavailable. Reload, or go back and choose bill later.</CardError>
      )}
      {canClose && (
        <button type="button" style={PRIMARY} onClick={() => setSheetOpen(true)} disabled={busy}>
          Close {r.name}
        </button>
      )}
      <ConfirmSheet
        open={sheetOpen}
        title={`Close ${r.name}?`}
        body={body}
        confirmLabel="Close period"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setSheetOpen(false)}
      />
    </>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export default function ClosePeriodPage() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  const base = `/commissioner/${leagueId}`;
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const raw = Number(search.get("step"));
  const step = Number.isInteger(raw) && raw >= 1 && raw <= 5 ? raw : 1;
  const billParam = search.get("bill");
  const bill = billParam === "now" || billParam === "later" ? billParam : null;

  // Re-fetched on every step change: it carries the period name for the header
  // and the readiness/status checks steps 1 and 5 act on.
  const readiness = useLoad(() => getCloseReadiness(leagueId, periodId), [leagueId, periodId, step]);
  const name = readiness.state === "ready" ? readiness.data.name : "period";

  /** Forward moves push history; the state lets the in-page back use it. */
  const go = (to: number, extra = "") => navigate(`?step=${to}${extra}`, { state: { fromStep: step } });

  const back = () => {
    const fromStep = (location.state as { fromStep?: number } | null)?.fromStep;
    if (fromStep === step - 1) navigate(-1);
    else navigate(`?step=${step - 1}`, { replace: true });
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header>
        {step === 1 ? (
          <Link to={base} style={LINK}>‹ Commissioner</Link>
        ) : (
          <button type="button" onClick={back} style={{ ...LINK, border: "none", background: "none", padding: 0, cursor: "pointer" }}>
            ‹ Step {step - 1}
          </button>
        )}
        <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: "var(--am-text)" }}>Close {name}</h1>
        <p style={{ margin: "2px 0 0", ...MUTED }}>Step {step} of 5 · {STEP_LABELS[step - 1]}</p>
      </header>

      {step === 1 && <Step1 key={step} readiness={readiness} base={base} onNext={() => go(2)} />}
      {step === 2 && <Step2 key={step} leagueId={leagueId} base={base} onNext={() => go(3)} />}
      {step === 3 && <Step3 key={step} leagueId={leagueId} periodId={periodId} name={readiness.state === "ready" ? readiness.data.name : "Period"} onNext={() => go(4)} />}
      {step === 4 && <Step4 key={step} leagueId={leagueId} periodId={periodId} onChoose={(b) => go(5, `&bill=${b}`)} />}
      {step === 5 && <Step5 key={step} leagueId={leagueId} periodId={periodId} base={base} readiness={readiness} bill={bill} />}
    </div>
  );
}
