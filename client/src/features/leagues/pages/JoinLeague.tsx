import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import { Button } from "../../../components/ui/button";
import { getJoinInfo, joinLeague, type JoinInfoLeague } from "../api";
import { useLeague } from "../../../contexts/LeagueContext";

export default function JoinLeague() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshLeagues } = useLeague();

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<JoinInfoLeague | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      setError("No invite code provided.");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const resp = await getJoinInfo(inviteCode);
        setLeague(resp.league);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Invalid invite code.");
      } finally {
        setLoading(false);
      }
    })();
  }, [inviteCode]);

  async function handleJoin() {
    if (!inviteCode) return;
    setJoining(true);
    try {
      const resp = await joinLeague(inviteCode);
      refreshLeagues(); // Update sidebar dropdown immediately
      toast(`Joined ${resp.league.name}!`, "success");
      navigate("/");
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to join league.", "error");
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <Glass><div style={{ padding: 32, textAlign: "center", color: "var(--am-text-muted)", fontSize: 13 }}>Loading league info…</div></Glass>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <Glass strong>
          <SectionLabel>✦ Join League</SectionLabel>
          <h1 style={{ fontFamily: "var(--am-display)", fontSize: 28, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>Join League</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>Something went wrong.</div>
        </Glass>
        <Glass>
          <div style={{ padding: 8, textAlign: "center", color: "var(--am-negative)", fontSize: 13 }}>{error || "League not found."}</div>
        </Glass>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Join League</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 28, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>Join League</h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>You've been invited to join a league.</div>
      </Glass>

      <div className="mt-8 space-y-6">
        {/* League Card */}
        <div className="lg-card p-6 space-y-4">
          <div className="text-center">
            <div className="text-2xl font-semibold text-[var(--lg-text-heading)]">{league.name}</div>
            <div className="text-sm text-[var(--lg-text-muted)] mt-1">{league.season} Season</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[var(--lg-tint)] rounded-xl p-3">
              <div className="text-xs text-[var(--lg-text-muted)] uppercase">Format</div>
              <div className="text-sm font-medium text-[var(--lg-text-primary)] mt-0.5">
                {league.scoringFormat?.replace("_", " ")}
              </div>
            </div>
            <div className="bg-[var(--lg-tint)] rounded-xl p-3">
              <div className="text-xs text-[var(--lg-text-muted)] uppercase">Draft</div>
              <div className="text-sm font-medium text-[var(--lg-text-primary)] mt-0.5">
                {league.draftMode}
              </div>
            </div>
            <div className="bg-[var(--lg-tint)] rounded-xl p-3">
              <div className="text-xs text-[var(--lg-text-muted)] uppercase">Teams</div>
              <div className="text-sm font-medium text-[var(--lg-text-primary)] mt-0.5">
                {league.teamsFilled} / {league.maxTeams}
              </div>
            </div>
            <div className="bg-[var(--lg-tint)] rounded-xl p-3">
              <div className="text-xs text-[var(--lg-text-muted)] uppercase">Sport</div>
              <div className="text-sm font-medium text-[var(--lg-text-primary)] mt-0.5 capitalize">
                {league.sport}
              </div>
            </div>
          </div>

          {league.description && (
            <div className="text-sm text-[var(--lg-text-secondary)] text-center">
              {league.description}
            </div>
          )}

          {league.entryFee != null && league.entryFee > 0 && (
            <div className="text-center">
              <span className="inline-block bg-amber-500/10 text-amber-500 text-xs font-semibold px-3 py-1 rounded-full">
                Entry Fee: ${league.entryFee}
              </span>
              {league.entryFeeNote && (
                <div className="text-xs text-[var(--lg-text-muted)] mt-1">{league.entryFeeNote}</div>
              )}
            </div>
          )}
        </div>

        {/* Join Action */}
        {league.isFull ? (
          <div className="lg-card p-6 text-center">
            <div className="text-sm font-semibold text-red-400">This league is full.</div>
            <div className="text-xs text-[var(--lg-text-muted)] mt-1">
              All {league.maxTeams} spots have been filled.
            </div>
          </div>
        ) : (
          <div className="text-center">
            <Button
              onClick={handleJoin}
              disabled={joining}
              variant="default"
              className="px-10 py-3 text-base"
            >
              {joining ? "Joining..." : "Join League"}
            </Button>
            <div className="text-xs text-[var(--lg-text-muted)] mt-2">
              {league.maxTeams - league.teamsFilled} spot{league.maxTeams - league.teamsFilled !== 1 ? "s" : ""} remaining
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
