import React, { useState, useCallback, useEffect, useRef } from "react";
import { Sparkles, Lock, Loader2, ExternalLink, BarChart3, Trophy, TrendingUp, ArrowLeftRight, Users, Gavel, BookOpen, Rewind, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";

import PageHeader from "../../../components/ui/PageHeader";

/* ── Types ───────────────────────────────────────────────────────── */

interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  category: "draft" | "season" | "planning" | "historical";
  available: boolean;
  lockReason?: string;
  navigateTo?: string;
  generateUrl?: string;
}


/* ── Main Page ───────────────────────────────────────────────────── */

export default function AIHub() {
  const { leagueId, myTeamId } = useLeague();
  const gating = useSeasonGating();

  // State for generating/viewing results
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AI responses have varied shapes per feature
  const [results, setResults] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Loading messages for animation
  const loadingMessages = [
    "Crunching the numbers...",
    "Analyzing roster composition...",
    "Comparing league-wide trends...",
    "Generating insights...",
  ];
  const [msgIdx, setMsgIdx] = React.useState(0);
  React.useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => setMsgIdx(i => (i + 1) % loadingMessages.length), 2500);
    return () => clearInterval(interval);
  }, [loading]);

  const hasAuctionCompleted = gating.canViewAuctionResults || gating.seasonStatus === "COMPLETED";
  const isInSeason = gating.seasonStatus === "IN_SEASON";
  const isDraft = gating.canAuction;

  const hasRosterData = hasAuctionCompleted || isInSeason || gating.seasonStatus === "COMPLETED";

  const features: AIFeature[] = [
    // Draft
    {
      id: "draft-report",
      title: "Draft Report",
      description: "Per-team grades, strategy analysis, value efficiency, and projected stat contributions.",
      icon: Trophy,
      category: "draft",
      available: hasRosterData,
      lockReason: "Available after rosters are drafted",
      navigateTo: "/draft-report",
    },
    {
      id: "bid-advice",
      title: "Live Bid Advice",
      description: "Real-time AI recommendations during active bidding — should you bid, and how high?",
      icon: Gavel,
      category: "draft",
      available: isDraft,
      lockReason: "Available during the live auction draft",
      navigateTo: "/auction",
    },
    // Season
    {
      id: "weekly-insights",
      title: "Weekly Team Insights",
      description: "AI-powered analysis of your team's strengths, weaknesses, and strategic recommendations.",
      icon: Brain,
      category: "season",
      available: isInSeason,
      lockReason: "Available during the active season",
      generateUrl: myTeamId ? `/teams/ai-insights?leagueId=${leagueId}&teamId=${myTeamId}` : undefined,
    },
    {
      id: "trade-analysis",
      title: "Trade Analyzer",
      description: "AI evaluates trade fairness, identifies the winner, and recommends approve or reject.",
      icon: ArrowLeftRight,
      category: "season",
      available: isInSeason,
      lockReason: "Available during the active season when proposing trades",
      navigateTo: "/activity",
    },
    {
      id: "waiver-advice",
      title: "Waiver Bid Advisor",
      description: "AI suggests optimal FAAB bid amounts based on player value and your team needs.",
      icon: Users,
      category: "season",
      available: isInSeason,
      lockReason: "Available during the active season when claiming players",
      navigateTo: "/activity",
    },
    // Planning
    {
      id: "keeper-recs",
      title: "Keeper Recommendations",
      description: "AI ranks your roster by keeper value, factoring in cost, scarcity, and upside.",
      icon: BookOpen,
      category: "planning",
      available: gating.canKeepers,
      lockReason: "Available during pre-draft keeper selection",
      navigateTo: leagueId ? `/leagues/${leagueId}/keepers` : undefined,
    },
    // Historical
    {
      id: "historical-trends",
      title: "Season Trends",
      description: "AI analysis of a team's performance trajectory across periods — improving, declining, or consistent.",
      icon: TrendingUp,
      category: "historical",
      available: true,
      navigateTo: "/archive",
    },
    {
      id: "historical-draft",
      title: "Historical Draft Review",
      description: "AI evaluates a past season's draft strategy — value picks, overpays, and how it affected standings.",
      icon: Rewind,
      category: "historical",
      available: true,
      navigateTo: "/archive",
    },
  ];

  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (feature: AIFeature) => {
    if (!feature.generateUrl || !leagueId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(feature.id);
    setErrors(prev => ({ ...prev, [feature.id]: "" }));
    setActiveFeature(feature.id);
    try {
      const data = await fetchJsonApi(`${API_BASE}${feature.generateUrl}`, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setResults(prev => ({ ...prev, [feature.id]: data }));
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      setErrors(prev => ({ ...prev, [feature.id]: (err as Error)?.message || "Failed to generate" }));
    } finally {
      if (!controller.signal.aborted) setLoading(null);
    }
  }, [leagueId]);

  // Abort in-flight request on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const categoryLabels: Record<string, string> = {
    draft: "Draft & Auction",
    season: "In-Season",
    planning: "Planning",
    historical: "Historical",
  };
  const categories = ["draft", "season", "planning", "historical"];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="AI Insights"
        subtitle="AI-powered analysis across every phase of your fantasy baseball season."
      />

      {/* Status bar */}
      <div className="flex items-center gap-2 mb-8 text-xs text-[var(--lg-text-muted)]">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span className="font-medium">AI Available</span>
        <span className="opacity-50">•</span>
        <span className="opacity-50">Powered by Gemini / Claude</span>
      </div>

      {categories.map(cat => {
        const catFeatures = features.filter(f => f.category === cat);
        if (catFeatures.length === 0) return null;

        return (
          <div key={cat} className="mb-10">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--lg-text-muted)] opacity-60 mb-4">
              {categoryLabels[cat]}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {catFeatures.map(feature => {
                const isLocked = !feature.available;
                const isLoading = loading === feature.id;
                const hasResult = !!results[feature.id];
                const hasError = !!errors[feature.id];
                const isExpanded = activeFeature === feature.id;
                const Icon = feature.icon;

                return (
                  <div
                    key={feature.id}
                    className={`liquid-glass rounded-2xl p-5 transition-all duration-300 relative ${
                      isLocked ? "opacity-50 grayscale-[30%]" : "hover:scale-[1.01]"
                    }`}
                  >
                    {/* Lock badge */}
                    {isLocked && (
                      <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[10px] font-bold text-[var(--lg-text-muted)]">
                        <Lock size={10} />
                        <span className="uppercase tracking-wide">Locked</span>
                      </div>
                    )}

                    {/* Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isLocked
                          ? "bg-[var(--lg-tint)]"
                          : "bg-gradient-to-br from-blue-500/20 to-purple-500/20"
                      }`}>
                        <Icon size={18} className={isLocked ? "text-[var(--lg-text-muted)]" : "text-blue-400"} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-[var(--lg-text-primary)] leading-tight">{feature.title}</h3>
                        <p className="text-xs text-[var(--lg-text-muted)] mt-1 leading-relaxed">{feature.description}</p>
                      </div>
                    </div>

                    {/* Lock reason */}
                    {isLocked && feature.lockReason && (
                      <p className="text-[11px] text-[var(--lg-text-muted)] italic mb-3 pl-12">{feature.lockReason}</p>
                    )}

                    {/* Action area */}
                    <div className="flex items-center gap-2 mt-4 pl-12">
                      {isLocked ? (
                        <button
                          disabled
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--lg-tint)] text-[var(--lg-text-muted)] opacity-40 cursor-not-allowed border border-[var(--lg-border-faint)]"
                        >
                          Locked
                        </button>
                      ) : feature.generateUrl ? (
                        <button
                          onClick={() => generate(feature)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--lg-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              Generating...
                            </>
                          ) : hasResult ? (
                            <>
                              <Sparkles size={12} />
                              Regenerate
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              Generate
                            </>
                          )}
                        </button>
                      ) : null}

                      {feature.navigateTo && !isLocked && (
                        <Link
                          to={feature.navigateTo}
                          className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
                        >
                          View <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>

                    {/* Loading state */}
                    {isLoading && (
                      <div className="mt-4 pl-12 flex items-center gap-2 text-xs text-[var(--lg-text-muted)] animate-pulse">
                        <Sparkles size={12} className="text-blue-400" />
                        {loadingMessages[msgIdx]}
                      </div>
                    )}

                    {/* Error state */}
                    {hasError && !isLoading && (
                      <div className="mt-3 pl-12 text-xs text-rose-400">{errors[feature.id]}</div>
                    )}

                    {/* Draft Report now has its own page at /draft-report */}

                    {/* Results: Weekly Insights */}
                    {feature.id === "weekly-insights" && hasResult && !isLoading && isExpanded && (
                      <div className="mt-4 border-t border-[var(--lg-border-faint)] pt-4 space-y-2">
                        {/* Mode indicator */}
                        {results["weekly-insights"]?.mode && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              results["weekly-insights"].mode === "in-season"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                            }`}>
                              {results["weekly-insights"].mode}
                            </span>
                            <span className="text-[10px] text-[var(--lg-text-muted)]">
                              Grade: <span className="font-bold text-[var(--lg-text-primary)]">{results["weekly-insights"].overallGrade}</span>
                            </span>
                          </div>
                        )}
                        {(results["weekly-insights"]?.insights || []).map((insight: any, i: number) => (
                          <div key={i} className="text-xs flex gap-2">
                            {insight.priority && (
                              <span className={`flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${
                                insight.priority === "high" ? "bg-red-400" :
                                insight.priority === "medium" ? "bg-amber-400" : "bg-[var(--lg-text-muted)]"
                              }`} />
                            )}
                            <div>
                              <span className="font-bold text-[var(--lg-text-primary)]">{insight.title}</span>
                              <span className="text-[var(--lg-text-muted)] ml-1">{insight.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Toggle expand for results */}
                    {hasResult && !isLoading && (
                      <button
                        onClick={() => setActiveFeature(isExpanded ? null : feature.id)}
                        className="mt-2 pl-12 text-[11px] font-medium text-[var(--lg-accent)] hover:underline"
                      >
                        {isExpanded ? "Collapse" : "Show results"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
