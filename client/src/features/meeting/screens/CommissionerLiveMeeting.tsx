// Commissioner's live meeting (spec "Commissioner: screen 4"): open the meeting
// with a worst-first order, run the turn clock, enter moves for owners, end it,
// and hand the moves to today's Review & save (via onHandOff).
import React, { useEffect, useState } from "react";
import type { MeetingMove, MeetingSessionResponse, MeetingState } from "@shared/api/meeting";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { useMediaQuery } from "../../../hooks/useMediaQuery";
import {
  addTime,
  endMeeting,
  getSeasonOrder,
  openMeeting,
  passTurn,
  pauseMeeting,
  resumeMeeting,
  setOrder,
  skipTurn,
  startMeeting,
  submitMove,
} from "../api";
import { Countdown } from "../components/Countdown";
import { TurnEntry } from "../components/TurnEntry";
import { ERROR, ICON, MUTED, PRIMARY, ROW, SECONDARY, disabled, lastName } from "../components/styles";
import { useMeetingSession } from "../hooks/useMeetingSession";

type Team = { id: number; name: string };
type Session = NonNullable<MeetingSessionResponse["session"]>;
type Act = (fn: (version: number) => Promise<MeetingSessionResponse>) => Promise<void>;

export interface CommissionerLiveMeetingProps {
  leagueId: number;
  periodId: number;
  teams: Team[];
  /** Called with the session's moves (and its id, for the handed-off stamp). */
  onHandOff: (moves: MeetingMove[], sessionId: number) => void;
}

const PAGE: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16 };
const H1: React.CSSProperties = { margin: 0, fontSize: 24, fontWeight: 700, color: "var(--am-text)" };
const LIST: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

function message(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "That didn’t go through. Try again.";
}

function moveText(mv: MeetingMove): string {
  return `+ ${lastName(mv.add.name)} − ${lastName(mv.drop.name)}`;
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ─── Order editor (setup) ────────────────────────────────────────────

function OrderEditor({ order, nameOf, busy, onChange }: { order: number[]; nameOf: (id: number) => string; busy: boolean; onChange: (next: number[]) => void }) {
  return (
    <Glass padded={false}>
      <ol style={LIST}>
        {order.map((id, i) => (
          <li key={id} data-testid="order-row" style={ROW}>
            <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              <span style={{ ...MUTED, minWidth: 20 }}>{i + 1}</span>
              <b data-testid="order-name" style={{ fontSize: 17 }}>{nameOf(id)}</b>
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" aria-label={`Move ${nameOf(id)} up`} disabled={busy || i === 0} style={disabled(ICON, busy || i === 0)} onClick={() => onChange(move(order, i, -1))}>↑</button>
              <button type="button" aria-label={`Move ${nameOf(id)} down`} disabled={busy || i === order.length - 1} style={disabled(ICON, busy || i === order.length - 1)} onClick={() => onChange(move(order, i, 1))}>↓</button>
            </span>
          </li>
        ))}
      </ol>
    </Glass>
  );
}

function NoSession({ leagueId, periodId, teams, nameOf, act }: { leagueId: number; periodId: number; teams: Team[]; nameOf: (id: number) => string; act: Act }) {
  const [order, setOrderState] = useState<number[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const ids = teams.map((t) => t.id);
    getSeasonOrder(leagueId).then(
      (season) => {
        if (!live) return;
        const known = season.filter((id) => ids.includes(id));
        setOrderState([...known, ...ids.filter((id) => !known.includes(id))]);
      },
      () => {
        if (!live) return;
        setNote("Couldn’t load the standings, so the order is A to Z. Set it before you open.");
        setOrderState([...teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => t.id));
      },
    );
    return () => {
      live = false;
    };
  }, [leagueId, teams]);

  async function open() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await act(() => openMeeting(leagueId, { periodId, order }));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header>
        <h1 style={H1}>Live meeting</h1>
        <p style={{ margin: "4px 0 0", ...MUTED }}>Turn order, worst to first by season points. Change it before you open.</p>
      </header>
      {note && <p style={{ margin: 0, fontSize: 15, color: "var(--am-warning)" }}>{note}</p>}
      {order ? <OrderEditor order={order} nameOf={nameOf} busy={busy} onChange={setOrderState} /> : <p aria-busy="true" style={MUTED}>Loading the order…</p>}
      {error && <p role="alert" style={ERROR}>{error}</p>}
      <button type="button" disabled={!order || busy} style={disabled(PRIMARY, !order || busy)} onClick={open}>Open the meeting</button>
    </>
  );
}

function SetupOpened({ session, nameOf, act }: { session: Session; nameOf: (id: number) => string; act: Act }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: (v: number) => Promise<MeetingSessionResponse>) {
    setBusy(true);
    setError(null);
    try {
      await act(fn);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header>
        <h1 style={H1}>Live meeting</h1>
        <p style={{ margin: "4px 0 0", ...MUTED }}>The meeting is open. Owners can see the order. Start when everyone is ready.</p>
      </header>
      <OrderEditor
        order={session.state.order}
        nameOf={nameOf}
        busy={busy}
        onChange={(order) => run((version) => setOrder(session.id, { order, version }))}
      />
      {error && <p role="alert" style={ERROR}>{error}</p>}
      <button type="button" disabled={busy} style={disabled(PRIMARY, busy)} onClick={() => run((v) => startMeeting(session.id, v))}>Start</button>
    </>
  );
}

// ─── Running / paused ───────────────────────────────────────────────

function OnlineDot({ online }: { online: boolean }) {
  return online ? (
    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--am-positive)" }}>● Online</span>
  ) : (
    <span style={MUTED}>○ Not online</span>
  );
}

/** Turn results for the current round, with each "move" paired to its move (moves are appended in turn order). */
function roundResults(s: MeetingState): { teamId: number; text: string; muted: boolean }[] {
  let k = 0;
  const out: { teamId: number; text: string; muted: boolean }[] = [];
  for (const log of s.turnsLog) {
    const mv = log.result === "move" ? s.moves[k++] : undefined;
    if (log.round !== s.round) continue;
    if (log.result === "move") out.push({ teamId: log.teamId, text: mv ? moveText(mv) : "Move", muted: false });
    else out.push({ teamId: log.teamId, text: log.result === "pass" ? "Passed" : "Skipped", muted: true });
  }
  return out;
}

function MovesSoFar({ state, teams, nameOf }: { state: MeetingState; teams: Team[]; nameOf: (id: number) => string }) {
  const ids = [...new Set(state.moves.map((mv) => mv.teamId))].sort((a, b) => {
    const ia = teams.findIndex((t) => t.id === a);
    const ib = teams.findIndex((t) => t.id === b);
    return ia - ib;
  });
  return (
    <section data-testid="moves-so-far">
      <SectionLabel>{`Moves so far (${state.moves.length})`}</SectionLabel>
      {ids.length === 0 ? (
        <p style={{ margin: 0, ...MUTED }}>No moves yet.</p>
      ) : (
        <Glass padded={false}>
          <ul style={LIST}>
            {ids.map((id) => (
              <li key={id} style={{ ...ROW, display: "grid", gap: 2, justifyContent: "stretch" }}>
                <b style={{ fontSize: 17 }}>{nameOf(id)}</b>
                {state.moves.filter((mv) => mv.teamId === id).map((mv) => (
                  <span key={mv.id} style={MUTED}>{moveText(mv)}</span>
                ))}
              </li>
            ))}
          </ul>
        </Glass>
      )}
    </section>
  );
}

function Live({ session, data, skew, teams, nameOf, act, leagueId }: { session: Session; data: MeetingSessionResponse; skew: number; teams: Team[]; nameOf: (id: number) => string; act: Act; leagueId: number }) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const s = session.state;
  const running = s.status === "running";
  const current = s.order[s.turnIndex];
  const turnKey = `${s.round}.${s.turnIndex}`;
  const [entering, setEntering] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const online = new Set(data.online);

  async function run(fn: (v: number) => Promise<MeetingSessionResponse>) {
    setBusy(true);
    setError(null);
    try {
      await act(fn);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const results = roundResults(s);
  const upNext = s.order.slice(s.turnIndex + 1);
  const showEntry = running && entering === turnKey;

  const clockCard = (
    <Glass>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ display: "grid", gap: 2 }}>
            <span style={MUTED}>{running ? "On the clock" : "On the clock · Paused"}</span>
            <b style={{ fontSize: 24, color: "var(--am-text)" }}>{nameOf(current)}</b>
          </span>
          <Countdown turnEndsAt={s.turnEndsAt} pausedRemainingMs={s.pausedRemainingMs} skew={skew} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {s.settings.canAddTime && (
            <button type="button" disabled={busy} style={disabled(SECONDARY, busy)} onClick={() => run((v) => addTime(session.id, v))}>+1 min</button>
          )}
          <button type="button" disabled={busy || !running} style={disabled(SECONDARY, busy || !running)} onClick={() => run((v) => skipTurn(session.id, v))}>Skip</button>
          <button
            type="button"
            aria-expanded={showEntry}
            disabled={!running}
            style={disabled(SECONDARY, !running)}
            onClick={() => setEntering((cur) => (cur === turnKey ? null : turnKey))}
          >
            Enter for them
          </button>
        </div>
        {showEntry && (
          <div style={{ borderTop: "1px solid var(--am-border)", paddingTop: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 600, color: "var(--am-text)" }}>{`Entering for ${nameOf(current)}`}</p>
            <TurnEntry
              key={turnKey}
              leagueId={leagueId}
              sessionId={session.id}
              teamId={current}
              onSubmit={(addPlayerId, dropPlayerId) =>
                act((version) => submitMove(session.id, { teamId: current, addPlayerId, dropPlayerId, version }))
              }
              onPass={() => act((version) => passTurn(session.id, { teamId: current, version }))}
            />
          </div>
        )}
      </div>
    </Glass>
  );

  const thisRound = (
    <section data-testid="this-round">
      <SectionLabel>This round</SectionLabel>
      {results.length === 0 ? (
        <p style={{ margin: 0, ...MUTED }}>No turns finished yet.</p>
      ) : (
        <Glass padded={false}>
          <ul style={LIST}>
            {results.map((r, i) => (
              <li key={`${r.teamId}-${i}`} style={ROW}>
                <span>{nameOf(r.teamId)}</span>
                <span style={r.muted ? MUTED : { fontSize: 17 }}>{r.text}</span>
              </li>
            ))}
          </ul>
        </Glass>
      )}
    </section>
  );

  const order = desktop ? (
    <section data-testid="turn-order">
      <SectionLabel>Turn order</SectionLabel>
      <Glass padded={false}>
        <ol style={LIST}>
          {s.order.map((id, i) => {
            const done = results.find((r) => r.teamId === id && i < s.turnIndex);
            return (
              <li key={id} style={{ ...ROW, background: i === s.turnIndex ? "var(--am-surface-alt)" : "transparent" }}>
                <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ ...MUTED, minWidth: 20 }}>{i + 1}</span>
                  <span style={{ fontWeight: i === s.turnIndex ? 700 : 400 }}>{nameOf(id)}</span>
                </span>
                {i === s.turnIndex ? (
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--am-accent)" }}>Up now</span>
                ) : done ? (
                  <span style={MUTED}>{done.text}</span>
                ) : (
                  <OnlineDot online={online.has(id)} />
                )}
              </li>
            );
          })}
        </ol>
      </Glass>
    </section>
  ) : (
    <section data-testid="up-next">
      <SectionLabel>Up next</SectionLabel>
      {upNext.length === 0 ? (
        <p style={{ margin: 0, ...MUTED }}>Last turn of the round.</p>
      ) : (
        <Glass padded={false}>
          <ul style={LIST}>
            {upNext.map((id) => (
              <li key={id} style={ROW}>
                <span>{nameOf(id)}</span>
                <OnlineDot online={online.has(id)} />
              </li>
            ))}
          </ul>
        </Glass>
      )}
    </section>
  );

  const controls = (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      {running ? (
        <button type="button" disabled={busy} style={disabled(SECONDARY, busy)} onClick={() => run((v) => pauseMeeting(session.id, v))}>Pause</button>
      ) : (
        <button type="button" disabled={busy} style={disabled(PRIMARY, busy)} onClick={() => run((v) => resumeMeeting(session.id, v))}>Resume</button>
      )}
      <button type="button" disabled={busy} style={disabled(SECONDARY, busy)} onClick={() => run((v) => endMeeting(session.id, v))}>End meeting</button>
    </div>
  );

  return (
    <>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={H1}>Live meeting</h1>
        <span style={{ fontSize: 17, color: "var(--am-text-muted)" }}>{`Round ${s.round}`}</span>
      </header>
      {error && <p role="alert" style={ERROR}>{error}</p>}
      <div style={desktop ? { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 24, alignItems: "start" } : { display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          {clockCard}
          {!desktop && order}
          {thisRound}
          <MovesSoFar state={s} teams={teams} nameOf={nameOf} />
          {controls}
        </div>
        {desktop && order}
      </div>
    </>
  );
}

// ─── Ended ───────────────────────────────────────────────────────────

function Ended({ session, teams, nameOf, onHandOff }: { session: Session; teams: Team[]; nameOf: (id: number) => string; onHandOff: CommissionerLiveMeetingProps["onHandOff"] }) {
  const s = session.state;
  const n = s.moves.length;
  return (
    <>
      <header>
        <h1 style={H1}>Meeting over</h1>
        <p style={{ margin: "4px 0 0", ...MUTED }}>{`${n} ${n === 1 ? "move" : "moves"} in ${s.round} ${s.round === 1 ? "round" : "rounds"} · nothing saved until you review`}</p>
      </header>
      <MovesSoFar state={s} teams={teams} nameOf={nameOf} />
      {session.handedOffAt ? (
        <div style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--am-positive)" }}>Moves sent to Review</p>
          <button type="button" style={SECONDARY} onClick={() => onHandOff(s.moves, session.id)}>Copy again</button>
        </div>
      ) : (
        <button type="button" disabled={n === 0} style={disabled(PRIMARY, n === 0)} onClick={() => onHandOff(s.moves, session.id)}>Review all moves</button>
      )}
    </>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────

export function CommissionerLiveMeeting({ leagueId, periodId, teams, onHandOff }: CommissionerLiveMeetingProps) {
  const { data, error, skew, act } = useMeetingSession(leagueId);
  const nameOf = (id: number) => teams.find((t) => t.id === id)?.name ?? `Team ${id}`;

  let body: React.ReactNode;
  if (!data) {
    body = error ? <p role="alert" style={ERROR}>Couldn’t load the meeting.</p> : <p aria-busy="true" style={MUTED}>Loading the meeting…</p>;
  } else {
    // GET current may return another period's session: an ended one is history, an open one blocks.
    const session = data.session && (data.session.periodId === periodId || data.session.state.status !== "ended") ? data.session : null;
    if (!session) {
      body = <NoSession leagueId={leagueId} periodId={periodId} teams={teams} nameOf={nameOf} act={act} />;
    } else if (session.periodId !== periodId) {
      body = (
        <>
          <h1 style={H1}>Live meeting</h1>
          <p style={{ margin: 0, fontSize: 17, color: "var(--am-text)" }}>A meeting for another period is still open. End it before opening this one.</p>
        </>
      );
    } else if (session.state.status === "setup") {
      body = <SetupOpened session={session} nameOf={nameOf} act={act} />;
    } else if (session.state.status === "ended") {
      body = <Ended session={session} teams={teams} nameOf={nameOf} onHandOff={onHandOff} />;
    } else {
      body = <Live session={session} data={data} skew={skew} teams={teams} nameOf={nameOf} act={act} leagueId={leagueId} />;
    }
  }

  return <div style={PAGE}>{body}</div>;
}

export default CommissionerLiveMeeting;
