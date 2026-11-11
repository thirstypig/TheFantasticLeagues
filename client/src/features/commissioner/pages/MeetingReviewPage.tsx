// Review and save (screen 14). Writes every meeting move to the roster,
// dated to the next period's start. Each move is previewed first and only
// claimed after its own preview succeeds; a failure stays in the draft.
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { ConfirmSheet } from "../../../components/shared/ConfirmSheet";
import { useToast } from "../../../contexts/ToastContext";
import { CardError, LINK, PRIMARY, Skeleton, useLoad } from "../components/cardParts";
import { getCommissionerOverview, getLeaguePeriods, previewMove, saveMove } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import { clearDraft, completeMoves, flagMoves, loadDraft, removeMove, saveDraft, updateMove } from "../lib/meetingDraft";
import type { DraftMove, DraftPlayer, MeetingDraft } from "../lib/meetingDraft";
import "../commissioner.css";

/** "Mon Jun 15" */
function fmtLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).replace(",", "");
}

function lastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] || full;
}

const SUB: React.CSSProperties = { fontSize: 15, color: "var(--am-text-muted)" };
const GOOD: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: "var(--am-positive)" };
const BAD: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: "var(--am-negative)" };

function PlayerText({ p, style }: { p: DraftPlayer | null; style: React.CSSProperties }) {
  if (!p) return <span style={{ ...SUB, fontWeight: 600 }}>Needs a player</span>;
  return (
    <b style={style}>
      {`${style === GOOD ? "+" : "−"} ${lastName(p.name)} `}
      <span style={SUB}>{[p.pos, p.mlbTeam].filter(Boolean).join(" · ")}</span>
    </b>
  );
}

function ReviewBody({ leagueId, periodId }: { leagueId: number; periodId: number }) {
  const base = `/commissioner/${leagueId}`;
  const navigate = useNavigate();
  const { toast } = useToast();
  const overview = useLoad(() => getCommissionerOverview(leagueId), [leagueId]);
  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);

  const [draft, setDraft] = useState<MeetingDraft>(() => loadDraft(leagueId, periodId));
  const draftRef = useRef(draft);
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => () => { alive.current = false; }, []);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [frozen, setFrozen] = useState<{ moves: number; teams: number } | null>(null);
  const [outcome, setOutcome] = useState<{ saved: number; total: number } | null>(null);

  /** Every change goes through here so state and storage never drift. */
  function apply(fn: (d: MeetingDraft) => MeetingDraft) {
    const next = fn(draftRef.current);
    draftRef.current = next;
    saveDraft(next);
    if (alive.current) setDraft(next);
  }

  const meetingLink = (children: React.ReactNode) =>
    saving ? (
      <span aria-disabled="true" style={{ ...LINK, opacity: 0.5 }}>{children}</span>
    ) : (
      <Link to={`${base}/meeting/${periodId}`} style={LINK}>{children}</Link>
    );

  if (periods.state === "loading" || overview.state === "loading") {
    return <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}><Link to={`${base}/meeting/${periodId}`} style={LINK}>‹ Moves</Link><Glass padded={false}><Skeleton /></Glass></div>;
  }
  if (periods.state === "error" || overview.state === "error") {
    return <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}><Link to={`${base}/meeting/${periodId}`} style={LINK}>‹ Moves</Link><Glass padded={false}><CardError>Couldn’t load the review.</CardError></Glass></div>;
  }

  const period = periods.data.find((p) => p.id === periodId);
  if (!period || period.status !== "pending") {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 8 }}>
        <Link to={`${base}/rosters`} style={LINK}>‹ Rosters</Link>
        <p style={{ margin: 0, fontSize: 17, color: "var(--am-text)" }}>This period has already started. Meeting moves are for the next period.</p>
      </div>
    );
  }
  const effectiveDate = period.startDate.slice(0, 10);

  const teamNames: Record<number, string> = Object.fromEntries((overview.data.teams ?? []).map((t) => [t.id, t.name]));
  const nameOf = (id: number) => teamNames[id] ?? `Team ${id}`;
  const moves = [...draft.moves].sort((a, b) => nameOf(a.teamId).localeCompare(nameOf(b.teamId)));

  const ruleFlags = flagMoves(draft, teamNames);
  const flagRows = [
    ...ruleFlags.map((f) => ({ moveId: f.moveId, text: f.message })),
    ...draft.moves.filter((mv) => mv.error).map((mv) => ({ moveId: mv.id, text: mv.error as string })),
  ].map((f) => {
    const mv = draft.moves.find((x) => x.id === f.moveId);
    return { ...f, text: `${mv ? nameOf(mv.teamId) : "Move"}: ${f.text}` };
  });

  const complete = completeMoves(draft);
  const teamCount = new Set(complete.map((mv) => mv.teamId)).size;
  const n = complete.length;
  const labelFor = (moves: number, teams: number) => `Save ${moves} ${moves === 1 ? "move" : "moves"} for ${teams} ${teams === 1 ? "team" : "teams"}`;
  const label = labelFor(n, teamCount);
  // Stored errors are shown but never block; only rule flags do.
  const blocked = ruleFlags.length > 0 || n === 0;
  const failed = outcome ? draft.moves.filter((mv) => mv.error) : [];

  function fix(mv: DraftMove) {
    apply((d) => ({ ...d, selectedTeamId: mv.teamId }));
  }

  async function runSave() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setOutcome(null);
    const batch = completeMoves(draftRef.current); // snapshot, draft order
    setFrozen({ moves: batch.length, teams: new Set(batch.map((mv) => mv.teamId)).size });
    let saved = 0;
    setProgress({ done: 0, total: batch.length });
    for (let i = 0; i < batch.length; i++) {
      const mv = batch[i];
      if (alive.current) setProgress({ done: i, total: batch.length });
      const addId = mv.add!.playerId;
      const dropId = mv.drop!.playerId;
      let error: string | null = null;
      try {
        const pre = await previewMove(leagueId, mv.teamId, addId, dropId);
        if (!pre.ok) {
          error = pre.error || "This move was rejected.";
        } else {
          await saveMove(leagueId, mv.teamId, addId, dropId, effectiveDate);
        }
      } catch (err) {
        error = err instanceof Error && err.message ? err.message : "Couldn’t save this move.";
      }
      if (error === null) {
        saved += 1;
        apply((d) => removeMove(d, mv.id));
      } else {
        const msg = error;
        apply((d) => updateMove(d, mv.id, { error: msg }));
      }
    }
    inFlight.current = false;
    if (!alive.current) return; // per-move storage writes already happened; no navigation or toast
    if (saved === batch.length) {
      clearDraft(leagueId, periodId);
      toast(`Saved ${saved} ${saved === 1 ? "move" : "moves"}`, "success");
      navigate(`${base}/start/${periodId}`);
      return;
    }
    setSaving(false);
    setSheetOpen(false);
    setProgress(null);
    setOutcome({ saved, total: batch.length });
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          {meetingLink(`‹ ${period.name} moves`)}
          <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>Review</h1>
        </div>
        <span className="rv-count" style={{ ...SUB, fontWeight: 600 }}>{`${n} ${n === 1 ? "move" : "moves"}`}</span>
      </header>

      {outcome && (
        <div role="alert" style={{ padding: 12, border: "1px solid var(--am-negative)", borderRadius: 6, display: "grid", gap: 4 }}>
          <b style={{ fontSize: 17, color: "var(--am-text)" }}>{`Saved ${outcome.saved} of ${outcome.total} moves. The rest need a look.`}</b>
          {failed.map((mv) => (
            <span key={mv.id} style={SUB}>{`${nameOf(mv.teamId)}: + ${mv.add ? lastName(mv.add.name) : "?"} · − ${mv.drop ? lastName(mv.drop.name) : "?"}`}</span>
          ))}
        </div>
      )}

      {flagRows.length > 0 && (
        <div role="alert" data-testid="review-flags" style={{ padding: 12, border: "1px solid var(--am-negative)", borderRadius: 6, display: "grid", gap: 4 }}>
          {flagRows.map((f, i) => (
            <p key={`${f.moveId}-${i}`} style={{ margin: 0, fontSize: 15, color: "var(--am-negative)" }}>{f.text}</p>
          ))}
        </div>
      )}

      <div className="rv-grid">
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <SectionLabel>Moves by team</SectionLabel>
          <Glass padded={false}>
            <div className="rv-head" aria-hidden="true"><span>Team</span><span>Add</span><span>Drop</span><span /></div>
            {moves.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 17, color: "var(--am-text-muted)" }}>No moves to save.</p>}
            {moves.map((mv) => {
              const incomplete = !mv.add || !mv.drop;
              const flagged = incomplete || !!mv.error;
              return (
                <div key={mv.id} className="rv-row" data-testid="review-move">
                  <b style={{ fontSize: 17, color: "var(--am-text)" }}>{nameOf(mv.teamId)}</b>
                  <PlayerText p={mv.add} style={GOOD} />
                  <PlayerText p={mv.drop} style={BAD} />
                  {saving ? (
                    <span aria-disabled="true" style={{ ...LINK, opacity: 0.5 }}>{flagged ? "Fix" : "Edit"}</span>
                  ) : (
                    <Link to={`${base}/meeting/${periodId}`} onClick={() => fix(mv)} style={LINK} aria-label={`${flagged ? "Fix" : "Edit"} ${nameOf(mv.teamId)} move`}>
                      {flagged ? "Fix" : "Edit"}
                    </Link>
                  )}
                </div>
              );
            })}
          </Glass>
        </div>

        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <p style={{ margin: 0, ...SUB }}>{`Effective ${fmtLong(period.startDate)}. Owners see them in Activity.`}</p>
          <button
            type="button"
            style={{ ...PRIMARY, opacity: blocked || saving ? 0.5 : 1, cursor: blocked || saving ? "not-allowed" : "pointer" }}
            disabled={blocked || saving}
            onClick={() => setSheetOpen(true)}
          >
            {label}
          </button>
          {ruleFlags.length > 0 && <p style={{ margin: 0, fontSize: 15, color: "var(--am-negative)" }}>Fix the flagged move first.</p>}
          {saving && progress && (
            <p role="status" style={{ margin: 0, fontSize: 15, color: "var(--am-text)" }}>
              {`Saving ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`}
            </p>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={sheetOpen}
        title={`${saving && frozen ? labelFor(frozen.moves, frozen.teams) : label}?`}
        body={saving && progress ? `Saving ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…` : `Rosters change effective ${fmtLong(period.startDate)}. Owners see the moves in Activity.`}
        confirmLabel="Save moves"
        cancelLabel="Keep reviewing"
        busy={saving}
        onConfirm={runSave}
        onCancel={() => setSheetOpen(false)}
      />
    </div>
  );
}

export default function MeetingReviewPage() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  return (
    <CommissionerOnly leagueId={leagueId}>
      <ReviewBody key={`${leagueId}.${periodId}`} leagueId={leagueId} periodId={periodId} />
    </CommissionerOnly>
  );
}
