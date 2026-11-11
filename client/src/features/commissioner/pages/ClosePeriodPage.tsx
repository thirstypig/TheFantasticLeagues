// Close a period from one checklist page: what to check before closing,
// the standings that will lock, the IL fee choice, and the Close button.
// Every data call is the same as the old 5-step flow. Nothing is written
// until the confirm sheet; the write is PATCH /api/periods/:id with
// { status: "completed", billFees }.
import React, { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, MUTED, PRIMARY, ROW, Skeleton, useLoad } from "../components/cardParts";
import { FeePreviewRows, dollars, feeHeadline, money, useFeePreview } from "../components/feePreview";
import {
  getCloseReadiness,
  getGhostIlSummary,
  getPeriodStandingsPreview,
  formatInnings,
  getRosterCheck,
  setPeriodStatus,
  teamsUnderInnings,
  toTeamTotals,
} from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import "../commissioner.css";

type Bill = "now" | "later";
type ChipKind = "ready" | "review" | "waiting";

const CHIP_LABEL: Record<ChipKind, string> = { ready: "Ready", review: "Review", waiting: "Waiting" };
const CHIP_COLOR: Record<ChipKind, string> = {
  ready: "var(--am-positive)",
  review: "var(--am-warning)",
  waiting: "var(--am-text-muted)",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "none yet";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function StatusChip({ kind }: { kind: ChipKind }) {
  return (
    <span
      style={{
        flex: "none", fontSize: 13, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
        border: `1px solid ${CHIP_COLOR[kind]}`, color: CHIP_COLOR[kind],
      }}
    >
      {CHIP_LABEL[kind]}
    </span>
  );
}

/** One "Before you close" row: title and detail lines on the left, status chip on the right. */
function CheckRow({ title, chip, last, children }: { title: string; chip: ChipKind; last?: boolean; children?: React.ReactNode }) {
  return (
    <div style={{ ...ROW, minHeight: 56, alignItems: "flex-start", borderBottom: last ? "none" : ROW.borderBottom }}>
      <div style={{ display: "grid", gap: 2 }}>
        <span>{title}</span>
        {children}
      </div>
      <StatusChip kind={chip} />
    </div>
  );
}

const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
const SUB_LINK: React.CSSProperties = { fontSize: 15, color: "var(--am-warning)", display: "flex", alignItems: "center", minHeight: 44 };

function BillChoice({ value, nowDisabled, onChange }: { value: Bill | null; nowDisabled: boolean; onChange: (b: Bill) => void }) {
  const opts: Array<{ v: Bill; label: string; disabled: boolean }> = [
    { v: "now", label: "Bill now", disabled: nowDisabled },
    { v: "later", label: "Bill later", disabled: false },
  ];
  return (
    <div
      role="group"
      aria-label="IL fees"
      style={{ display: "flex", border: "1px solid var(--am-field-line)", borderRadius: 22, overflow: "hidden", background: "var(--am-field)" }}
    >
      {opts.map((o) => {
        const on = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => !on && onChange(o.v)}
            style={{
              flex: 1, minHeight: 44, padding: "0 14px", border: 0, fontSize: 15, fontWeight: 600, fontFamily: "inherit",
              cursor: o.disabled ? "default" : "pointer",
              background: on ? "var(--am-accent)" : "transparent",
              color: on ? "var(--am-on-accent)" : "var(--am-text)",
              opacity: o.disabled ? 0.5 : 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ClosePeriodPageBody() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  const base = `/commissioner/${leagueId}`;
  const rosters = `${base}/rosters`;
  const navigate = useNavigate();
  const { toast } = useToast();

  const readiness = useLoad(() => getCloseReadiness(leagueId, periodId), [leagueId, periodId]);
  const roster = useLoad(() => getRosterCheck(leagueId), [leagueId]);
  const ghost = useLoad(() => getGhostIlSummary(leagueId), [leagueId]);
  const standings = useLoad(async () => {
    const resp = await getPeriodStandingsPreview(leagueId, periodId);
    return { totals: toTeamTotals(resp), under: teamsUnderInnings(resp) };
  }, [leagueId, periodId]);
  const fees = useFeePreview(leagueId, periodId);

  const [picked, setPicked] = useState<Bill | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Synchronous guard: state updates can lag a fast double-tap.
  const inFlight = useRef(false);

  const backLink = <Link to={base} style={LINK}>‹ Commissioner</Link>;

  if (readiness.state === "loading") {
    return <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px" }}>{backLink}<Glass padded={false}><Skeleton /></Glass></div>;
  }
  if (readiness.state === "error") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 8 }}>
        {backLink}
        <Glass padded={false}>
          <CardError>Couldn’t load this period.</CardError>
          <div style={{ padding: "0 16px 8px" }}><Link to={base} style={LINK}>Back to Commissioner</Link></div>
        </Glass>
      </div>
    );
  }

  const r = readiness.data;
  if (r.status === "completed") {
    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 8 }}>
        {backLink}
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Close {r.name}</h1>
        <Glass padded>
          <p style={{ margin: "0 0 4px", fontSize: 17 }}>This period is already closed.</p>
          <Link to={base} style={LINK}>Back to Commissioner</Link>
        </Glass>
      </div>
    );
  }

  // Billing: "now" needs a known amount. Zero fees and a failed preview both send billFees:false.
  const total = fees.state === "ready" ? fees.data.total : null;
  const noFees = total === 0;
  const feesFailed = fees.state === "error";
  const choice: Bill | null = noFees || feesFailed ? "later" : picked ?? (total !== null && total > 0 ? "now" : null);
  const billNow = choice === "now" && total !== null && !noFees;
  const canClose = r.ready && choice !== null && fees.state !== "loading" && !busy;

  const net = total ?? 0;
  const sheetBody = !billNow
    ? noFees
      ? "Standings lock. There are no IL fees to bill. You can't undo this."
      : "Standings lock — IL fees stay unbilled until you bill them. You can't undo this."
    : net > 0
      ? `Standings lock and ${money(net)} in IL fees are billed. You can't undo this.`
      : `Standings lock and a ${dollars(net)} IL fee credit is applied. You can't undo this.`;

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

  const under = standings.state === "ready" ? standings.data.under : [];
  const overTeams = roster.state === "ready" ? roster.data.teams.filter((t) => t.over) : [];
  const ghosts = ghost.state === "ready" ? ghost.data.teams.flatMap((t) => t.ghosts.map((g) => ({ ...g, teamName: t.teamName }))) : [];

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header>
        {backLink}
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Close {r.name}</h1>
        <p style={{ margin: "2px 0 0", ...MUTED }}>Ends {fmtDate(r.endDate)}</p>
      </header>

      <div className="close-cols">
        <div style={{ display: "grid", gap: 16 }}>
          <SectionLabel>Before you close</SectionLabel>
          <Glass padded={false}>
            <CheckRow title="Final stats are in" chip={r.ready ? "ready" : "waiting"}>
              <span style={SUB}>
                Last stat date {fmtDate(r.lastStatDate)} · period ended {fmtDate(r.endDate)}
                {r.ready ? "" : ". Come back after tomorrow morning's stats sync."}
              </span>
            </CheckRow>
            <CheckRow
              title="Rosters at the limit"
              chip={roster.state === "loading" ? "waiting" : roster.state === "error" || overTeams.length > 0 ? "review" : "ready"}
            >
              {roster.state === "error" && <span style={SUB}>Couldn’t load roster sizes.</span>}
              {roster.state === "ready" && overTeams.length === 0 && (
                <span style={SUB}>{roster.data.teams.length} of {roster.data.teams.length} teams within {roster.data.cap}</span>
              )}
              {overTeams.map((t) => (
                <Link key={t.teamId} to={rosters} style={SUB_LINK}>
                  {t.teamName} {t.activeCount} / {roster.state === "ready" ? roster.data.cap : ""} ›
                </Link>
              ))}
            </CheckRow>
            <CheckRow
              title="IL players back from MLB IL"
              chip={ghost.state === "loading" ? "waiting" : ghost.state === "error" || ghosts.length > 0 ? "review" : "ready"}
              last={under.length === 0}
            >
              {ghost.state === "error" && <span style={SUB}>Couldn’t load the IL check.</span>}
              {ghost.state === "ready" && ghosts.length === 0 && <span style={SUB}>None</span>}
              {ghosts.map((g) => (
                <Link key={g.rosterId} to={rosters} style={SUB_LINK}>{g.teamName} · {g.playerName} is off the MLB IL ›</Link>
              ))}
            </CheckRow>
            {under.length > 0 && (
              <CheckRow title="Innings minimum" chip="review" last>
                {under.map((t) => (
                  <span key={t.teamName} style={SUB}>{t.teamName} {formatInnings(t.ip)} of {t.min} IP · you decide</span>
                ))}
              </CheckRow>
            )}
          </Glass>

          <SectionLabel>Standings at close</SectionLabel>
          <Glass padded={false}>
            {standings.state === "loading" ? (
              <Skeleton />
            ) : standings.state === "error" ? (
              <CardError>Couldn’t load the standings preview.</CardError>
            ) : standings.data.totals.length === 0 ? (
              <p style={{ ...ROW, margin: 0, ...MUTED }}>No standings yet.</p>
            ) : (
              standings.data.totals.map((t, i) => (
                <div key={t.teamName} style={ROW}>
                  <span><span style={MUTED}>{i + 1}.</span> <span>{t.teamName}</span></span>
                  <strong>{t.points}</strong>
                </div>
              ))
            )}
          </Glass>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <SectionLabel>IL fees for {r.name}</SectionLabel>
          <Glass padded={false}>
            {fees.state === "loading" ? (
              <Skeleton />
            ) : fees.state === "error" ? (
              <CardError>Couldn’t load the fee preview; you can bill later from Money</CardError>
            ) : noFees ? (
              <div style={ROW}>No IL fees this period</div>
            ) : (
              <FeePreviewRows preview={fees.data} headline={feeHeadline(fees.data.total, "This close would bill")} />
            )}
          </Glass>
          {fees.state !== "loading" && !noFees && (
            <BillChoice value={choice} nowDisabled={feesFailed} onChange={setPicked} />
          )}
          {choice === "later" && !noFees && (
            <p style={{ margin: 0, ...MUTED }}>“Bill later” keeps a reminder in Needs you until you bill.</p>
          )}
          <button type="button" style={{ ...PRIMARY, opacity: canClose ? 1 : 0.5, cursor: canClose ? "pointer" : "default" }} disabled={!canClose} onClick={() => setSheetOpen(true)}>
            Close {r.name}
          </button>
        </div>
      </div>

      <ConfirmSheet
        open={sheetOpen}
        title={`Close ${r.name}?`}
        body={sheetBody}
        confirmLabel="Close period"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setSheetOpen(false)}
      />
    </div>
  );
}

export default function ClosePeriodPage() {
  const leagueId = Number(useParams().leagueId);
  return <CommissionerOnly leagueId={leagueId}><ClosePeriodPageBody /></CommissionerOnly>;
}
