// Meeting moves entry (screen 13): the commissioner enters each owner's
// add + drop pairs. Nothing touches rosters here; the draft lives in
// localStorage until the Review page saves it.
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { CardError, LINK, PRIMARY, ROW, SECONDARY, Skeleton, useLoad } from "../components/cardParts";
import { getCommissionerOverview, getCommissionerRosters, getLeaguePeriods, getRosterCheck, previewMove } from "../api";
import { CommissionerOnly } from "../components/CommissionerOnly";
import { MoveEditor } from "../components/MoveEditor";
import {
  addMove,
  completeMoves,
  flagMoves,
  loadDraft,
  removeMove,
  saveDraft,
  setMark,
  teamCountAfter,
  updateMove,
} from "../lib/meetingDraft";
import type { DraftMove, DraftPlayer, MeetingDraft, TeamMark } from "../lib/meetingDraft";
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
const CHIP: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: "var(--am-text-muted)" };

function isDesktop(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches;
  } catch {
    return false;
  }
}

function MeetingBody({ leagueId, periodId }: { leagueId: number; periodId: number }) {
  const base = `/commissioner/${leagueId}`;
  const overview = useLoad(() => getCommissionerOverview(leagueId), [leagueId]);
  const periods = useLoad(() => getLeaguePeriods(leagueId), [leagueId]);
  const check = useLoad(() => getRosterCheck(leagueId), [leagueId]);
  const rosters = useLoad(() => getCommissionerRosters(leagueId), [leagueId]);

  const [draft, setDraft] = useState<MeetingDraft>(() => {
    const d = loadDraft(leagueId, periodId);
    const t = d.selectedTeamId;
    return t !== null && !d.moves.some((mv) => mv.teamId === t) ? addMove(d, t) : d;
  });
  const draftRef = useRef(draft);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /** Every change goes through here so state and storage never drift. */
  function apply(fn: (d: MeetingDraft) => MeetingDraft) {
    const next = fn(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    saveDraft(next);
  }

  const backLink = <Link to={`${base}/rosters`} style={LINK}>‹ Rosters</Link>;

  if (periods.state === "loading" || overview.state === "loading") {
    return <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>{backLink}<Glass padded={false}><Skeleton /></Glass></div>;
  }
  if (periods.state === "error" || overview.state === "error") {
    return <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>{backLink}<Glass padded={false}><CardError>Couldn’t load the meeting.</CardError></Glass></div>;
  }

  const period = periods.data.find((p) => p.id === periodId);
  if (!period || period.status !== "pending") {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 8 }}>
        {backLink}
        <p style={{ margin: 0, fontSize: 17, color: "var(--am-text)" }}>This period has already started. Meeting moves are for the next period.</p>
      </div>
    );
  }

  const teams = [...(overview.data.teams ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const teamNames: Record<number, string> = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  const cap = check.state === "ready" ? check.data.cap : null;
  const activeOf = (teamId: number): number | null => {
    if (check.state !== "ready") return null;
    return check.data.teams.find((t) => t.teamId === teamId)?.activeCount ?? null;
  };

  const flags = flagMoves(draft, teamNames);
  const complete = completeMoves(draft);
  const teamDone = (id: number) => !!draft.marks[id] || complete.some((mv) => mv.teamId === id);
  const doneCount = teams.filter((t) => teamDone(t.id)).length;
  const selectedId = draft.selectedTeamId;
  const selected = teams.find((t) => t.id === selectedId) ?? null;

  function select(teamId: number | null) {
    apply((d) => {
      let next: MeetingDraft = { ...d, selectedTeamId: teamId };
      if (teamId !== null && !next.moves.some((mv) => mv.teamId === teamId)) next = addMove(next, teamId);
      return next;
    });
  }

  /** Close the editor: drop untouched empty cards, set the mark, move on. */
  function finish(teamId: number, mark: TeamMark) {
    const idx = teams.findIndex((t) => t.id === teamId);
    const nextTeam = isDesktop() ? teams[idx + 1] ?? null : null;
    apply((d) => {
      // "No moves" only exists for a team with no complete move, so it never discards a finished one.
      const keep = (mv: DraftMove) => mv.teamId !== teamId || (mark === "done" ? mv.add || mv.drop : mv.add && mv.drop);
      let next: MeetingDraft = { ...d, moves: d.moves.filter(keep) };
      next = setMark(next, teamId, mark);
      return { ...next, selectedTeamId: nextTeam ? nextTeam.id : null };
    });
    if (nextTeam && !draftRef.current.moves.some((mv) => mv.teamId === nextTeam.id)) {
      apply((d) => addMove(d, nextTeam.id));
    }
  }

  function change(teamId: number, id: string, patch: Partial<Pick<DraftMove, "add" | "drop" | "error">>) {
    apply((d) => {
      let next = updateMove(d, id, patch.add !== undefined || patch.drop !== undefined ? { ...patch, error: undefined } : patch);
      if (next.marks[teamId] === "passed") next = setMark(next, teamId, null);
      return next;
    });
    const mv = draftRef.current.moves.find((x) => x.id === id);
    if (!mv || !mv.add || !mv.drop || (patch.add === undefined && patch.drop === undefined)) return;
    const addId = mv.add.playerId;
    const dropId = mv.drop.playerId;
    previewMove(leagueId, mv.teamId, addId, dropId).then(
      (res) => {
        const cur = draftRef.current.moves.find((x) => x.id === id);
        if (!alive.current || !cur || cur.add?.playerId !== addId || cur.drop?.playerId !== dropId) return; // edited since
        apply((d) => updateMove(d, id, { error: res.ok ? undefined : res.error || "This move was rejected." }));
      },
      () => {
        /* preview never throws on a rule failure; a network failure leaves the move unchecked */
      },
    );
  }

  const addedIds = draft.moves.flatMap((mv) => (mv.add ? [mv.add.playerId] : []));

  function dropChoicesFor(teamId: number, move: DraftMove): DraftPlayer[] {
    if (rosters.state !== "ready") return [];
    const droppedElsewhere = new Set(draft.moves.filter((x) => x.id !== move.id && x.drop).map((x) => x.drop!.playerId));
    return rosters.data
      .filter((r) => r.teamId === teamId && r.assignedPosition !== "IL" && !droppedElsewhere.has(r.player.id))
      .map((r) => ({ playerId: r.player.id, name: r.player.name, pos: r.player.posPrimary, mlbTeam: r.player.mlbTeam ?? null, mlbId: r.player.mlbId ?? null }));
  }

  function statusFor(teamId: number): React.ReactNode {
    if (teamId === selectedId) return <span aria-hidden="true">›</span>;
    const n = complete.filter((mv) => mv.teamId === teamId).length;
    if (n > 0) return <span style={{ ...CHIP, color: "var(--am-positive)" }}>{`${n} ✓`}</span>;
    if (draft.marks[teamId] === "passed") return <span style={CHIP}>Passed</span>;
    if (draft.marks[teamId] === "done") return <span style={CHIP}>Done</span>;
    return <span style={CHIP}>Not yet</span>;
  }

  const teamMoves = selected ? draft.moves.filter((mv) => mv.teamId === selected.id) : [];
  const teamFlags = flags.filter((f) => teamMoves.some((mv) => mv.id === f.moveId));
  const active = selected ? activeOf(selected.id) : null;
  const countAfter = selected && active !== null ? teamCountAfter(active, draft, selected.id) : null;
  const allComplete = teamMoves.length > 0 && teamMoves.every((mv) => mv.add && mv.drop);
  const anyError = teamMoves.some((mv) => mv.error);
  const stays = allComplete && teamFlags.length === 0 && !anyError && countAfter !== null && cap !== null;

  const tonight = teams
    .map((t) => ({ team: t, moves: complete.filter((mv) => mv.teamId === t.id) }))
    .filter((x) => x.moves.length > 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 }}>
      <header>
        {backLink}
        <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "var(--am-text)" }}>{`${period.name} moves`}</h1>
        <p style={{ margin: "4px 0 0", ...SUB }}>
          {`Dated ${fmtLong(period.startDate)} · ${doneCount} of ${teams.length} teams done · nothing saved until you review`}
        </p>
      </header>

      <div className="mt-grid" data-picked={selected ? "true" : "false"}>
        <div className="mt-list" style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <SectionLabel>Teams · A to Z</SectionLabel>
          <Glass padded={false}>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid="meeting-team-row"
                onClick={() => select(t.id)}
                style={{ ...ROW, width: "100%", minHeight: 56, background: t.id === selectedId ? "var(--am-surface-alt)" : "transparent", border: 0, borderBottom: "1px solid var(--am-border)", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}
              >
                <b style={{ fontSize: 17 }}>{t.name}</b>
                {statusFor(t.id)}
              </button>
            ))}
          </Glass>
        </div>

        <div className="mt-editor" style={{ display: "grid", gap: 12, alignContent: "start" }}>
          {selected ? (
            <>
              <button type="button" className="mt-phone-back" onClick={() => select(null)} style={{ ...LINK, background: "transparent", border: 0, padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                {`‹ ${period.name} moves`}
              </button>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--am-text)" }}>
                {countAfter !== null && cap !== null ? `${selected.name} · ${countAfter} / ${cap}` : selected.name}
              </h2>
              {rosters.state === "error" && <CardError>Couldn’t load this roster.</CardError>}
              {teamMoves.map((mv, i) => (
                <MoveEditor
                  key={mv.id}
                  index={i}
                  move={mv}
                  leagueId={leagueId}
                  dropChoices={dropChoicesFor(selected.id, mv)}
                  excludeAddIds={addedIds}
                  onChange={(patch) => change(selected.id, mv.id, patch)}
                  onRemove={() => apply((d) => removeMove(d, mv.id))}
                />
              ))}
              {stays ? (
                <p style={{ margin: 0, fontSize: 15, color: "var(--am-positive)" }}>{`✓ Roster stays at ${countAfter} / ${cap}`}</p>
              ) : (
                teamFlags.map((f, i) => (
                  <p key={`${f.moveId}-${i}`} style={{ margin: 0, fontSize: 15, color: "var(--am-warning)" }}>{f.message}</p>
                ))
              )}
              <button type="button" style={SECONDARY} onClick={() => apply((d) => addMove(setMark(d, selected.id, null), selected.id))}>
                + Another move
              </button>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {!complete.some((mv) => mv.teamId === selected.id) && (
                  <button type="button" style={SECONDARY} onClick={() => finish(selected.id, "passed")}>No moves</button>
                )}
                <button type="button" style={{ ...PRIMARY, gridColumn: "1 / -1" }} onClick={() => finish(selected.id, "done")}>
                  {isDesktop() ? "Done · next team" : "Done · back to teams"}
                </button>
              </div>
            </>
          ) : (
            <p style={{ margin: 0, ...SUB }}>Pick a team to enter its moves.</p>
          )}
        </div>

        <div className="mt-tonight" style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <SectionLabel>{`Tonight's moves (${complete.length})`}</SectionLabel>
          {tonight.length > 0 && (
            <Glass padded={false}>
              {tonight.map(({ team, moves }) => (
                <div key={team.id} style={{ ...ROW, display: "grid", gap: 2, minHeight: 56 }}>
                  <b style={{ fontSize: 17 }}>{team.name}</b>
                  {moves.map((mv) => (
                    <small key={mv.id} style={SUB}>{`+ ${lastName(mv.add!.name)} · − ${lastName(mv.drop!.name)}`}</small>
                  ))}
                </div>
              ))}
            </Glass>
          )}
          {complete.length > 0 ? (
            <Link to={`${base}/meeting/${periodId}/review`} style={{ ...SECONDARY, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>
              Review all moves
            </Link>
          ) : (
            <span role="link" aria-disabled="true" style={{ ...SECONDARY, display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", opacity: 0.5, cursor: "not-allowed" }}>
              Review all moves
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MeetingPage() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  return (
    <CommissionerOnly leagueId={leagueId}>
      <MeetingBody key={`${leagueId}.${periodId}`} leagueId={leagueId} periodId={periodId} />
    </CommissionerOnly>
  );
}
