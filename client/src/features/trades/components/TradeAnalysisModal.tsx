import { useEffect, useState } from "react";
import { analyzeTrade, TradeAnalysisItem, TradeAnalysisResult } from "../api";
import { Sparkles, Loader2, X, ShieldCheck, ShieldAlert, ShieldX, TrendingUp, Crown, MapPin } from "lucide-react";
import { Button } from "../../../components/ui/button";

interface TradeAnalysisModalProps {
  leagueId: number;
  items: TradeAnalysisItem[];
  onClose: (action?: "propose") => void;
}

function FairnessBadge({ fairness }: { fairness: string }) {
  if (fairness === "fair") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <ShieldCheck size={14} />
        Fair
      </span>
    );
  }
  if (fairness === "slightly_unfair") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <ShieldAlert size={14} />
        Slightly Unfair
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
      <ShieldX size={14} />
      Unfair
    </span>
  );
}

export function TradeAnalysisModal({ leagueId, items, onClose }: TradeAnalysisModalProps) {
  const [result, setResult] = useState<TradeAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await analyzeTrade(leagueId, items);
        if (!cancelled) setResult(data);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId, items]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => onClose()}>
      <div
        className="rounded-xl border border-[var(--lg-border-subtle)] bg-[var(--lg-bg-card)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--lg-border-subtle)] flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--lg-accent)]" />
            <h3 className="font-semibold text-lg text-[var(--lg-text-heading)]">AI Trade Advisor</h3>
          </div>
          <button
            onClick={() => onClose()}
            className="p-1 hover:bg-[var(--lg-tint)] rounded text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-[var(--lg-accent)]" />
              <p className="text-sm text-[var(--lg-text-muted)]">Analyzing trade...</p>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-400 text-sm mb-2">{error}</p>
              <p className="text-xs text-[var(--lg-text-muted)]">AI analysis is temporarily unavailable. You can still propose the trade.</p>
            </div>
          )}

          {result && (
            <>
              {/* Fairness + Winner */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <FairnessBadge fairness={result.fairness} />
                {result.winner && result.winner !== "even" && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-[var(--lg-text-muted)]">
                    <Crown size={13} className="text-amber-400" />
                    Edge: <span className="font-semibold text-[var(--lg-text-primary)]">{result.winner}</span>
                  </span>
                )}
              </div>

              {/* Analysis */}
              <div>
                <h4 className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1.5">Analysis</h4>
                <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">{result.analysis}</p>
              </div>

              {/* Category Impact */}
              {result.categoryImpact && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1.5 flex items-center gap-1.5">
                    <TrendingUp size={12} /> Category Impact
                  </h4>
                  <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">{result.categoryImpact}</p>
                </div>
              )}

              {/* Keeper Note */}
              {result.keeperNote && (
                <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                  <h4 className="text-xs font-semibold uppercase text-amber-400 mb-1">Keeper Implications</h4>
                  <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">{result.keeperNote}</p>
                </div>
              )}

              {/* Position Note */}
              {result.positionNote && (
                <div>
                  <h4 className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1.5 flex items-center gap-1.5">
                    <MapPin size={12} /> Position Fit
                  </h4>
                  <p className="text-sm text-[var(--lg-text-secondary)] leading-relaxed">{result.positionNote}</p>
                </div>
              )}

              {/* Recommendation */}
              <div className="p-3 rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-tint)]">
                <h4 className="text-xs font-semibold uppercase text-[var(--lg-text-muted)] mb-1">Recommendation</h4>
                <p className="text-sm text-[var(--lg-text-primary)] font-medium">{result.recommendation}</p>
              </div>

              {/* Attribution */}
              <div className="text-xs text-[var(--lg-text-muted)] opacity-40">
                Powered by <strong>Google Gemini</strong> & <strong>Anthropic Claude</strong>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--lg-border-subtle)] flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => onClose("propose")}
            disabled={loading}
          >
            Propose Trade
          </Button>
        </div>
      </div>
    </div>
  );
}
