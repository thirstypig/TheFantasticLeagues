import React, { useState } from "react";
import { processWaiverClaims } from "../../waivers/api";
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

export default function ActivityWaiversTab({ sortedWaiverOrder, leagueId, isCommissioner, onRefresh }: Props) {
  const { toast, confirm } = useToast();
  const { me } = useAuth();
  const userId = Number(me?.user?.id);
  const [processing, setProcessing] = useState(false);

  return (
    <div className="max-w-xl mx-auto space-y-6">
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
                  {t.rank > 0 ? `#${t.rank} in standings` : "—"}
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
