import React, { useState, useCallback, useEffect } from "react";
import { Sparkles, Lock, Loader2, ExternalLink, BarChart3, Trophy, TrendingUp, ArrowLeftRight, Users, Gavel, BookOpen, Rewind, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { useLeague } from "../../../contexts/LeagueContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";
import { useAuth } from "../../../auth/AuthProvider";
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

interface DraftGrade {
  teamId: number;
  teamName: string;
  grade: string;
  summary: string;
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function AIHub() {
  const { leagueId } = useLeague();
  const gating = useSeasonGating();
  const { user } = useAuth();

  // Fetch user's team for features that require teamId
  const [myTeamId, setMyTeamId] = useState<number | null>(null);
  useEffect(() => {
    if (!user || !leagueId) return;
    fetchJsonApi<{ league: { teams: Array<{ id: number; ownerUserId?: number | null; ownerships?: Array<{ userId: number }> }> } }>(`${API_BASE}/leagues/${leagueId}`)
      .then(res => {
        const uid = Number(user.id);
        const mine = res.league?.teams?.find(t =>
          t.ownerUserId === uid || (t.ownerships || []).some(o => o.userId === uid)
        );
        setMyTeamId(mine?.id ?? null);
      })
      .catch(() => setMyTeamId(null));
  }, [user, leagueId]);

  // State for generating/viewing results
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
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

  const features: AIFeature[] = [
    // Draft
    {
      id: "draft-grades",
      title: "Draft Grades",
      description: "AI-generated letter grades (A+ through F) for each team's auction draft performance.",
      icon: Trophy,
      category: "draft",
      available: hasAuctionCompleted,
      lockReason: "Available after the auction is complete",
      navigateTo: "/auction",
      generateUrl: `/auction/draft-grades?leagueId=${leagueId}`,
    },
    {
      id: "draft-report",
      title: "Draft Report",
      description: "League stats, bargains, overpays, position spending, and team efficiency analysis.",
      icon: BarChart3,
      category: "draft",
      available: hasAuctionCompleted,
      lockReason: "Available after the auction is complete",
      navigateTo: "/auction",
      generateUrl: `/auction/retrospective?leagueId=${leagueId}`,
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

  const generate = useCallback(async (feature: AIFeature) => {
    if (!feature.generateUrl || !leagueId) return;
    setLoading(feature.id);
    setErrors(prev => ({ ...prev, [feature.id]: "" }));
    setActiveFeature(feature.id);
    try {
      const data = await fetchJsonApi(`${API_BASE}${feature.generateUrl}`);
      setResults(prev => ({ ...prev, [feature.id]: data }));
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [feature.id]: err?.message || "Failed to generate" }));
    } finally {
      setLoading(null);
    }
  }, [leagueId]);

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

                    {/* Results: Draft Grades */}
                    {feature.id === "draft-grades" && hasResult && !isLoading && isExpanded && (
                      <div className="mt-4 space-y-2 border-t border-[var(--lg-border-faint)] pt-4">
                        {(results["draft-grades"]?.grades || []).map((g: DraftGrade) => (
                          <div key={g.teamId} className="flex items-start gap-3 p-2 rounded-lg hover:bg-[var(--lg-tint)] transition-colors">
                            <span className="text-lg font-bold tabular-nums w-8 text-center">{g.grade}</span>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[var(--lg-text-primary)]">{g.teamName}</div>
                              <div className="text-[11px] text-[var(--lg-text-muted)] leading-relaxed">{g.summary}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Results: Draft Report summary */}
                    {feature.id === "draft-report" && hasResult && !isLoading && isExpanded && (
                      <div className="mt-4 border-t border-[var(--lg-border-faint)] pt-4 space-y-2 text-xs text-[var(--lg-text-secondary)]">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-[var(--lg-tint)] p-2.5 rounded-lg">
                            <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] opacity-50">Total Spent</div>
                            <div className="font-bold text-[var(--lg-text-primary)]">${results["draft-report"]?.league?.totalSpent}</div>
                          </div>
                          <div className="bg-[var(--lg-tint)] p-2.5 rounded-lg">
                            <div className="text-[10px] uppercase tracking-wide font-bold text-[var(--lg-text-muted)] opacity-50">Avg Price</div>
                            <div className="font-bold text-[var(--lg-text-primary)]">${results["draft-report"]?.league?.avgPrice}</div>
                          </div>
                        </div>
                        <Link to="/auction" className="text-[var(--lg-accent)] font-medium hover:underline text-xs">
                          View full report →
                        </Link>
                      </div>
                    )}

                    {/* Results: Weekly Insights */}
                    {feature.id === "weekly-insights" && hasResult && !isLoading && isExpanded && (
                      <div className="mt-4 border-t border-[var(--lg-border-faint)] pt-4 space-y-2">
                        {(results["weekly-insights"]?.result?.insights || []).slice(0, 3).map((insight: any, i: number) => (
                          <div key={i} className="text-xs">
                            <span className="font-bold text-[var(--lg-text-primary)]">{insight.title}</span>
                            <span className="text-[var(--lg-text-muted)] ml-1">{insight.detail}</span>
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
