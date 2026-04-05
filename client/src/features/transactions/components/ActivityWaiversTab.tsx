import React, { useState, useEffect, useCallback } from "react";
import { processWaiverClaims, getWaiverClaims, cancelWaiverClaim, WaiverClaim } from "../../waivers/api";
import { Button } from "../../../components/ui/button";
import { useToast } from "../../../contexts/ToastContext";
import { useAuth } from "../../../auth/AuthProvider";

interface WaiverTeam {
  id: number;
  name: string;
  owner?: string;
  rank: number;
  points: number;
  ownerUserId?: number;
  ownerships?: { userId: number }[];
}

interface Props {
  sortedWaiverOrder: WaiverTeam[];
  leagueId: number | null;
  isCommissioner: boolean | undefined;
  onRefresh?: () => void;
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  ONLY_IF_UNAVAILABLE: "Only if unavailable",
  ONLY_IF_AVAILABLE: "Only if available",
  PAIR_WITH: "Paired claim",
};

function ConditionBadge({ claim }: { claim: WaiverClaim }) {
  if (!claim.conditionType || !claim.conditionPlayer) return null;

  const condName = claim.conditionPlayer.name;
  const label = CONDITION_TYPE_LABELS[claim.conditionType] || claim.conditionType;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400">
        Conditional
      </span>
      <span className="text-[10px] text-[var(--lg-text-muted)]">
        {label}: <strong>{condName}</strong>
      </span>
    </div>
  );
}

function ConditionFailureNote({ claim }: { claim: WaiverClaim }) {
  if (claim.status !== "FAILED_CONDITION" || !claim.conditionPlayer) return null;

  const condName = claim.conditionPlayer.name;
  let reason = "condition not met";
  if (claim.conditionType === "ONLY_IF_UNAVAILABLE") {
    reason = `${condName} was still available`;
  } else if (claim.conditionType === "ONLY_IF_AVAILABLE") {
    reason = `${condName} was already claimed`;
  } else if (claim.conditionType === "PAIR_WITH") {
    reason = `paired claim for ${condName} was not won`;
  }

  return (
    <div className="text-[10px] text-red-400 mt-1">
      Failed: {reason}
    </div>
  );
}

export default function ActivityWaiversTab({ sortedWaiverOrder, leagueId, isCommissioner, onRefresh }: Props) {
  const { toast, confirm } = useToast();
  const { me } = useAuth();
  const userId = Number(me?.user?.id);
  const [processing, setProcessing] = useState(false);
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);

  const loadClaims = useCallback(async () => {
    setLoadingClaims(true);
    try {
      const res = await getWaiverClaims();
      setClaims(res.claims || []);
    } catch {
      setClaims([]);
    } finally {
      setLoadingClaims(false);
    }
  }, []);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const handleCancel = async (claimId: number) => {
    if (!await confirm("Cancel this waiver claim?")) return;
    try {
      await cancelWaiverClaim(claimId);
      toast("Claim cancelled", "success");
      loadClaims();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Failed to cancel", "error");
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* My Pending Claims */}
      {claims.length > 0 && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-1.5 h-6 bg-emerald-500 rounded-full shadow-lg shadow-emerald-500/20"></div>
            <h3 className="text-xl font-semibold uppercase tracking-tight text-[var(--lg-text-heading)]">
              My Pending Claims
            </h3>
          </div>
          <div className="lg-card p-0 overflow-hidden divide-y divide-[var(--lg-divide)]">
            {claims.map((c) => (
              <div key={c.id} className="flex items-start justify-between p-4 hover:bg-[var(--lg-tint)] transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--lg-text-primary)]">
                      {c.player?.name || `Player #${c.playerId}`}
                    </span>
                    {c.player?.posPrimary && (
                      <span className="text-[9px] font-bold uppercase text-[var(--lg-text-muted)] bg-[var(--lg-tint)] px-1.5 py-0.5 rounded">
                        {c.player.posPrimary}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-[var(--lg-accent)]">${c.bidAmount}</span>
                  </div>
                  {c.dropPlayer && (
                    <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5">
                      Drop: {c.dropPlayer.name}
                    </div>
                  )}
                  <ConditionBadge claim={c} />
                  {c.conditionNote && (
                    <div className="text-[10px] text-[var(--lg-text-muted)] mt-0.5 italic opacity-60">
                      {c.conditionNote}
                    </div>
                  )}
                  <ConditionFailureNote claim={c} />
                </div>
                <button
                  onClick={() => handleCancel(c.id)}
                  className="text-[10px] font-bold uppercase text-red-400 hover:text-red-300 px-2 py-1 rounded border border-red-500/20 hover:border-red-500/40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center mb-8">
        <h3 className="text-3xl font-semibold uppercase text-[var(--lg-text-heading)] mb-2">
          Waiver Priority
        </h3>
        <p className="text-xs text-[var(--lg-text-muted)] uppercase font-medium opacity-50">
          Inverse Standings — Worst Record Picks First
        </p>
        <p className="text-[10px] text-[var(--lg-text-muted)] mt-1 opacity-40">
          Updated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Based on current season standings
        </p>
      </div>

      <div className="lg-card p-0 overflow-hidden divide-y divide-[var(--lg-divide)]">
        {sortedWaiverOrder.map((t, idx) => {
          const isMyTeam = t.ownerUserId === userId ||
            (t.ownerships || []).some((o) => o.userId === userId);
          return (
            <div
              key={t.id}
              className={`flex items-center justify-between p-6 hover:bg-[var(--lg-tint)] transition-colors group ${isMyTeam ? "border-l-2 border-l-[var(--lg-accent)]" : ""}`}
            >
              <div className="flex items-center gap-6">
                <span className="text-2xl font-bold text-[var(--lg-text-muted)] opacity-15 w-10 tabular-nums group-hover:opacity-30 transition-opacity text-center">
                  {idx + 1}
                </span>
                <div>
                  <div className="font-semibold text-lg text-[var(--lg-text-primary)] flex items-center gap-2">
                    {t.name}
                    {isMyTeam && (
                      <span className="text-[9px] font-bold uppercase text-[var(--lg-accent)] bg-[var(--lg-accent)]/10 px-1.5 py-0.5 rounded border border-[var(--lg-accent)]/20">
                        You
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-[var(--lg-text-secondary)]">
                  {t.rank > 0 ? `#${t.rank} in standings` : "---"}
                </div>
                <div className="text-xs font-medium text-[var(--lg-text-muted)] mt-0.5 opacity-50">
                  {t.points.toFixed(1)} pts
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[11px] font-medium text-[var(--lg-text-muted)] uppercase mt-8 bg-[var(--lg-tint)] p-4 rounded-2xl border border-[var(--lg-border-subtle)] opacity-50">
        Worst-performing team gets first waiver pick. Priority updates with each period's standings.
      </div>

      {/* Commissioner Process Button */}
      {leagueId && isCommissioner && (
        <div className="text-center mt-6">
          <Button
            onClick={async () => {
              if (!await confirm("Process all pending waiver claims for this league?")) return;
              setProcessing(true);
              try {
                const result = await processWaiverClaims(leagueId);
                toast(`Waivers processed. ${result.logs.length} claims handled.`, "success");
                loadClaims();
                onRefresh?.();
              } catch (err: unknown) {
                toast(err instanceof Error ? err.message : "Failed to process waivers", "error");
              } finally {
                setProcessing(false);
              }
            }}
            disabled={processing}
            variant="default"
            className="px-8"
          >
            {processing ? "Processing..." : "Process Waivers"}
          </Button>
        </div>
      )}
    </div>
  );
}
