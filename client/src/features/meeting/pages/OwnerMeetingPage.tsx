// Owner's turn screen (spec "Owner: screen 5"), route /leagues/:leagueId/meeting.
// My turn: clock + TurnEntry. Not my turn: who is up, my place, my moves so far.
import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { MeetingSessionResponse } from "@shared/api/meeting";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { useLeague } from "../../../contexts/LeagueContext";
import { getLeagueTeams, passTurn, submitMove } from "../api";
import { Countdown } from "../components/Countdown";
import { TurnEntry } from "../components/TurnEntry";
import { ERROR, MUTED, ROW, lastName } from "../components/styles";
import { useMeetingSession } from "../hooks/useMeetingSession";
import { useTurnCue } from "../hooks/useTurnCue";
import { ordinal, placeInOrder } from "../lib/place";

type Team = { id: number; name: string };

const PAGE: React.CSSProperties = { maxWidth: 640, margin: "0 auto", padding: "16px 16px 32px", display: "grid", gap: 16, boxSizing: "border-box" };
const H1: React.CSSProperties = { margin: 0, fontSize: 24, fontWeight: 700, color: "var(--am-text)" };
const LIST: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

/** The mobile shell renders this outside any <Route>, where useParams is empty: fall back to the URL. */
function useRouteLeagueId(): number | null {
  const params = useParams();
  const { pathname } = useLocation();
  const raw = params.leagueId ?? pathname.match(/^\/leagues\/(\d+)\/meeting\/?$/)?.[1];
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function OwnerMeetingPage() {
  const leagueId = useRouteLeagueId();
  const { leagueId: currentLeagueId, myTeamId } = useLeague();
  const { data, error, skew, act } = useMeetingSession(leagueId);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    if (leagueId == null) return;
    let live = true;
    getLeagueTeams(leagueId).then(
      (t) => live && setTeams(t),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [leagueId]);

  // myTeamId belongs to the league selected in the app; for any other league I have no team here.
  const teamId = leagueId != null && currentLeagueId === leagueId ? myTeamId : null;
  const session = data?.session ?? null;
  const s = session?.state;
  const live = !!s && (s.status === "running" || s.status === "paused");
  const place = s && teamId != null ? placeInOrder(s, teamId) : null;
  const myTurn = live && !!place?.onClock && s?.status === "running";
  useTurnCue(data != null && teamId != null, myTurn && s ? `${session?.id}.${s.round}.${s.turnIndex}` : null);

  const nameOf = (id: number) => teams.find((t) => t.id === id)?.name ?? `Team ${id}`;

  let body: React.ReactNode;
  if (leagueId == null) {
    body = <p style={MUTED}>No meeting right now.</p>;
  } else if (!data) {
    body = error ? <p role="alert" style={ERROR}>Couldn’t load the meeting.</p> : <p aria-busy="true" style={MUTED}>Loading the meeting…</p>;
  } else if (!session || !s || !live) {
    body = <p style={{ margin: 0, fontSize: 17, color: "var(--am-text)" }}>No meeting right now.</p>;
  } else if (teamId == null || !place) {
    body = <p style={{ margin: 0, fontSize: 17, color: "var(--am-text)" }}>You don’t have a team in this meeting.</p>;
  } else {
    body = (
      <Live
        session={session}
        skew={skew}
        teamId={teamId}
        leagueId={leagueId}
        nameOf={nameOf}
        place={place}
        myTurn={myTurn}
        act={act}
      />
    );
  }

  return (
    <div style={PAGE}>
      {data && error && <p role="status" style={{ margin: 0, fontSize: 15, color: "var(--am-warning)" }}>Connection lost. Retrying…</p>}
      {body}
    </div>
  );
}

type Session = NonNullable<MeetingSessionResponse["session"]>;

function Live({ session, skew, teamId, leagueId, nameOf, place, myTurn, act }: {
  session: Session;
  skew: number;
  teamId: number;
  leagueId: number;
  nameOf: (id: number) => string;
  place: { onClock: boolean; nth: number };
  myTurn: boolean;
  act: (fn: (version: number) => Promise<MeetingSessionResponse>) => Promise<void>;
}) {
  const s = session.state;
  const paused = s.status === "paused";
  const current = s.order[s.turnIndex];
  const mine = s.moves.filter((mv) => mv.teamId === teamId);

  const clock = <Countdown turnEndsAt={s.turnEndsAt} pausedRemainingMs={s.pausedRemainingMs} skew={skew} />;

  return (
    <>
      <header style={{ display: "grid", gap: 8 }}>
        {myTurn ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h1 style={H1}>You're up</h1>
              {clock}
            </div>
            <p style={{ margin: 0, ...MUTED }}>{`${nameOf(teamId)} · Round ${s.round}`}</p>
          </>
        ) : (
          <>
            <h1 style={H1}>Period meeting</h1>
            <p style={{ margin: 0, ...MUTED }}>{`Round ${s.round}${paused ? " · Paused" : ""}`}</p>
          </>
        )}
      </header>

      {myTurn ? (
        <TurnEntry
          key={`${s.round}.${s.turnIndex}`}
          leagueId={leagueId}
          sessionId={session.id}
          teamId={teamId}
          onSubmit={(addPlayerId, dropPlayerId) =>
            act((version) => submitMove(session.id, { teamId, addPlayerId, dropPlayerId, version }))
          }
          onPass={() => act((version) => passTurn(session.id, { teamId, version }))}
        />
      ) : (
        <Glass>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ display: "grid", gap: 2 }}>
                <span style={MUTED}>{paused ? "On the clock · Paused" : "On the clock"}</span>
                <b style={{ fontSize: 24, color: "var(--am-text)" }}>{nameOf(current)}</b>
              </span>
              {clock}
            </div>
            <p style={{ margin: 0, fontSize: 17, color: "var(--am-text)" }}>
              {place.onClock ? "You're up once the meeting resumes." : `You're ${ordinal(place.nth)} in the order.`}
            </p>
          </div>
        </Glass>
      )}

      <section data-testid="my-moves">
        <SectionLabel>{`Your moves so far (${mine.length})`}</SectionLabel>
        {mine.length === 0 ? (
          <p style={{ margin: 0, ...MUTED }}>No moves yet.</p>
        ) : (
          <Glass padded={false}>
            <ul style={LIST}>
              {mine.map((mv) => (
                <li key={mv.id} style={ROW}>{`+ ${lastName(mv.add.name)} − ${lastName(mv.drop.name)}`}</li>
              ))}
            </ul>
          </Glass>
        )}
      </section>
    </>
  );
}

export default OwnerMeetingPage;
