import React, { useState } from "react";
import { processWaiverClaims } from "../../waivers/api";
import { Button } from "../../../components/ui/button";
import { useToast } from "../../../contexts/ToastContext";

interface WaiverTeam {
  id: number;
  name: string;
  owner?: string;
  rank: number;
  points: number;
}

interface Props {
  sortedWaiverOrder: WaiverTeam[];
  leagueId: number | null;
  isCommissioner: boolean | undefined;
  onRefresh?: () => void;
}

export default function ActivityWaiversTab({ sortedWaiverOrder, leagueId, isCommissioner, onRefresh }: Props) {
  const { toast, confirm } = useToast();
  const [processing, setProcessing] = useState(false);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center mb-12">
        <h3 className="text-4xl font-semibold uppercase text-[var(--lg-text-heading)] mb-2">
          Waiver Priority
        </h3>
        <p className="text-xs text-[var(--lg-text-muted)] uppercase font-medium opacity-40">
          Based on Reverse Standings
        </p>
      </div>

      <div className="lg-card p-0 overflow-hidden divide-y divide-[var(--lg-divide)]">
        {sortedWaiverOrder.map((t, idx) => (
          <div
            key={t.id}
            className="flex items-center justify-between p-8 hover:bg-[var(--lg-tint)] transition-colors group"
          >
            <div className="flex items-center gap-8">
              <span className="text-3xl font-bold text-[var(--lg-text-muted)] opacity-10 w-12 tabular-nums group-hover:opacity-30 transition-opacity">
                {idx + 1}
              </span>
              <div>
                <div className="font-semibold text-2xl text-[var(--lg-text-primary)]">
                  {t.name}
                </div>
                <div className="text-xs text-[var(--lg-text-muted)] font-medium uppercase mt-1 opacity-60">
                  {t.owner || "No Owner"}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-semibold text-[var(--lg-accent)]">
                {t.rank === 999 ? "—" : `POS ${t.rank}`}
              </div>
              <div className="text-xs font-medium text-[var(--lg-text-muted)] mt-1 uppercase opacity-40">
                {t.points.toFixed(1)} Pts
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center text-xs font-medium text-[var(--lg-text-muted)] uppercase mt-12 bg-[var(--lg-tint)] p-6 rounded-3xl border border-[var(--lg-border-subtle)] opacity-60">
        Waiver priority is based on reverse standings order. Claims are processed at
        scheduled times.
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
