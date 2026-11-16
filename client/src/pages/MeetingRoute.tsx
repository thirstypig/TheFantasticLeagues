// /commissioner/:leagueId/meeting/:periodId — picks today's meeting page or the
// live meeting by the league's `meeting.live` rule, and hands the live
// meeting's moves to today's Review & save. Lives in pages/ because it joins
// two features (meeting + commissioner), which features may not do (ADR-015).
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { MeetingMove } from "@shared/api/meeting";
import { useLeague } from "../contexts/LeagueContext";
import { CommissionerOnly } from "../components/shared/CommissionerOnly";
import { ConfirmSheet } from "../components/shared/ConfirmSheet";
import { reportError } from "../lib/errorBus";
import MeetingPage from "../features/commissioner/pages/MeetingPage";
import { getCommissionerOverview } from "../features/commissioner/api";
import { loadDraft, saveDraft } from "../features/commissioner/lib/meetingDraft";
import { CommissionerLiveMeeting } from "../features/meeting/screens/CommissionerLiveMeeting";
import { markHandedOff } from "../features/meeting/api";

type Team = { id: number; name: string };
type Pending = { moves: MeetingMove[]; sessionId: number; existing: number };

function LiveMeeting({ leagueId, periodId }: { leagueId: number; periodId: number }) {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getCommissionerOverview(leagueId).then(
      (res) => live && setTeams([...(res.teams ?? [])].map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name))),
      () => live && setLoadFailed(true),
    );
    return () => {
      live = false;
    };
  }, [leagueId]);

  async function handOff(moves: MeetingMove[], sessionId: number) {
    setBusy(true);
    saveDraft({ leagueId, periodId, moves, marks: {}, selectedTeamId: null });
    try {
      await markHandedOff(sessionId);
    } catch (e) {
      // The moves are already in the draft; only the "sent" stamp is missing.
      reportError(e, { source: "meeting-handed-off" });
    }
    setBusy(false);
    setPending(null);
    navigate(`/commissioner/${leagueId}/meeting/${periodId}/review`);
  }

  function onHandOff(moves: MeetingMove[], sessionId: number) {
    const existing = loadDraft(leagueId, periodId).moves.length;
    if (existing > 0) setPending({ moves, sessionId, existing });
    else void handOff(moves, sessionId);
  }

  if (loadFailed) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <p style={{ margin: 0, fontSize: 17, color: "var(--am-negative)" }}>Couldn’t load the meeting.</p>
      </div>
    );
  }
  if (!teams) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <p aria-busy="true" style={{ margin: 0, fontSize: 15, color: "var(--am-text-muted)" }}>Loading the meeting…</p>
      </div>
    );
  }

  return (
    <>
      <CommissionerLiveMeeting leagueId={leagueId} periodId={periodId} teams={teams} onHandOff={onHandOff} />
      <ConfirmSheet
        open={pending !== null}
        title="Replace the moves already in Review?"
        body={
          pending
            ? `This device already has ${pending.existing} ${pending.existing === 1 ? "move" : "moves"} waiting in Review. They'll be replaced by the ${pending.moves.length} from the meeting.`
            : ""
        }
        confirmLabel="Replace them"
        busy={busy}
        onConfirm={() => pending && void handOff(pending.moves, pending.sessionId)}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

export default function MeetingRoute() {
  const params = useParams();
  const leagueId = Number(params.leagueId);
  const periodId = Number(params.periodId);
  const { leagueId: currentLeagueId, leagueRules } = useLeague();

  // Rules in context belong to the selected league; for any other league the switch reads as off.
  const rulesForThisLeague = currentLeagueId === leagueId;
  if (rulesForThisLeague && leagueRules === null) {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
        <p aria-busy="true" style={{ margin: 0, fontSize: 15, color: "var(--am-text-muted)" }}>Loading…</p>
      </div>
    );
  }
  const live = rulesForThisLeague && leagueRules?.meeting?.live === "true";
  if (!live) return <MeetingPage />;

  return (
    <CommissionerOnly leagueId={leagueId}>
      <LiveMeeting key={`${leagueId}.${periodId}`} leagueId={leagueId} periodId={periodId} />
    </CommissionerOnly>
  );
}
