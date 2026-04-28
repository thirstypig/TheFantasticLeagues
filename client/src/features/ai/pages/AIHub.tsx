import React, { useState } from "react";
import { Lock, ExternalLink, Trophy, TrendingUp, ArrowLeftRight, Users, Gavel, BookOpen, Rewind, Brain, ChevronDown, ChevronUp, Eye, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { useLeague } from "../../../contexts/LeagueContext";
import { useSeasonGating } from "../../../hooks/useSeasonGating";

import { Glass, SectionLabel } from "../../../components/aurora/atoms";

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
  scope: "team" | "league" | "player";
  trigger: string;
  model: string;
  promptSummary: string;
  dataUsed: string[];
}


/* ── Main Page ───────────────────────────────────────────────────── */

export default function AIHub() {
  const { leagueId } = useLeague();
  const gating = useSeasonGating();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasAuctionCompleted = gating.canViewAuctionResults || gating.seasonStatus === "COMPLETED";
  const isInSeason = gating.seasonStatus === "IN_SEASON";
  const isDraft = gating.canAuction;
  const hasRosterData = hasAuctionCompleted || isInSeason || gating.seasonStatus === "COMPLETED";

  const features: AIFeature[] = [
    // Draft & Auction
    {
      id: "draft-report",
      title: "Draft Report",
      description: "Per-team grades, strategy analysis, value efficiency, and projected stat contributions.",
      icon: Trophy,
      category: "draft",
      available: hasRosterData,
      lockReason: "Available after rosters are drafted",
      navigateTo: "/draft-report",
      scope: "league",
      trigger: "Generated once after the auction completes. Persists across sessions — view anytime.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Grades each team's draft on auction efficiency (surplus = projected value minus price paid). Factors in NL-only scarcity, injury discounts (15–30%), and ~5% projection uncertainty. Keepers are assessed separately from auction picks.",
      dataUsed: [
        "All team rosters with player names, positions, and auction prices",
        "Projected auction values from scouting data (843 players)",
        "Keeper designations and costs ($5 above prior price)",
        "Auction log (every bid, win event, and timestamp)",
        "League rules (budget cap, roster size, NL-only/mixed)",
      ],
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
      scope: "team",
      trigger: "On-demand during live auction. Appears inline on the auction page when a player is nominated.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Calculates marginal value of the nominated player for YOUR team specifically. Considers your budget remaining, open roster slots, category needs vs. league average, and scarcity of remaining alternatives at the position.",
      dataUsed: [
        "Your team's current roster and budget",
        "Player's projected stats and dollar value",
        "Current bid amount",
        "Available alternatives at the same position",
        "Your team's projected category totals (R, HR, RBI, SB, AVG, W, SV, K, ERA, WHIP)",
        "League scoring format and roster requirements",
      ],
    },
    // In-Season
    {
      id: "weekly-insights",
      title: "Weekly Team Insights",
      description: "AI-powered analysis of your team's strengths, weaknesses, and strategic recommendations.",
      icon: Brain,
      category: "season",
      available: isInSeason,
      lockReason: "Available during the active season",
      navigateTo: leagueId ? `/teams` : undefined,
      scope: "team",
      trigger: "Auto-generates when you visit your Team page. Cached weekly — one fresh analysis per week.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Analyzes your team's performance in the current scoring period. Identifies hot/cold bats, pitching concerns, roster alerts, and a 'hot take' prediction. Grades your team A+ through F relative to the league.",
      dataUsed: [
        "Your roster with current period stats (AB, H, R, HR, RBI, SB, W, SV, K, IP, ER)",
        "Your category standings and rankings vs. other teams",
        "Recent transactions (trades, waiver claims, drops)",
        "League type (NL-only, AL-only, or mixed)",
      ],
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
      scope: "league",
      trigger: "Auto-generates when a trade is processed by the commissioner. Fire-and-forget — appears inline on the Activity page.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Evaluates trade fairness by comparing the projected value and category impact of assets exchanged. Rates as fair, slightly unfair, or unfair, and identifies the winning team.",
      dataUsed: [
        "Trade items (players, future auction dollars, waiver position)",
        "Both teams' current rosters and standings",
        "Player projected values and category contributions",
        "League scoring format",
      ],
    },
    {
      id: "waiver-advice",
      title: "Waiver Claim Analysis",
      description: "AI assesses each processed waiver claim — bid grade, category impact, and roster fit.",
      icon: Users,
      category: "season",
      available: isInSeason,
      lockReason: "Available during the active season when claiming players",
      navigateTo: "/activity",
      scope: "team",
      trigger: "Auto-generates when a waiver claim is processed. Fire-and-forget — appears inline on the Activity page.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Grades the waiver bid (A+ to F) based on bid amount vs. projected value. Assesses whether the claimed player fills a category need and whether the dropped player was expendable.",
      dataUsed: [
        "Claimed player name, position, and projected value",
        "Bid amount and remaining budget after claim",
        "Dropped player (if any)",
        "Team's current roster composition",
      ],
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
      scope: "team",
      trigger: "On-demand from the Keeper Selection page. Generates fresh recommendations each time.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Ranks every player on your roster by keeper value. Keeper cost = prior price + $5. Weighs projected value surplus, positional scarcity (NL-only context), age/trajectory, injury risk (15–30% discount), and budget impact.",
      dataUsed: [
        "Your full roster with current prices",
        "Keeper cost formula (price + $5 per year kept)",
        "Projected auction values for upcoming season",
        "League rules (budget cap, max keepers, roster size)",
        "NL-only scarcity context",
      ],
    },
    // Historical
    {
      id: "league-digest",
      title: "Weekly League Digest",
      description: "League-wide weekly recap with power rankings, hot/cold teams, stat highlights, and a bold prediction.",
      icon: TrendingUp,
      category: "historical",
      available: true,
      navigateTo: "/",
      scope: "league",
      trigger: "Auto-generates weekly on the Home page. Past weeks browsable via tabs. Cached — one digest per week per league.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Produces a 7-section weekly digest: headline, power rankings, hot team, cold team, stat of the week, category movers, proposed trade of the week, and a bold prediction. Post-draft week may discuss auction results; all subsequent weeks are stats-only (no auction prices).",
      dataUsed: [
        "All teams' period stats and category standings",
        "Recent transactions (trades, waivers, add/drops)",
        "Keeper designations (excluded from trade proposals)",
        "League standings and point totals",
        "Team roster compositions",
      ],
    },
    {
      id: "historical-trends",
      title: "Season Trends (Archive)",
      description: "Historical AI analysis of past seasons — team trajectory and period-over-period performance.",
      icon: Rewind,
      category: "historical",
      available: true,
      navigateTo: "/archive",
      scope: "team",
      trigger: "On-demand from the Archive page. Select a team and season to generate analysis.",
      model: "Gemini 2.5 Flash (primary) / Claude Sonnet 4 (fallback)",
      promptSummary: "Analyzes a team's performance arc across a historical season. Identifies peak periods, slumps, category strengths/weaknesses, and the overall trajectory narrative.",
      dataUsed: [
        "Historical period-by-period stats for the selected team",
        "Historical standings for the selected season",
        "Team roster for that season",
      ],
    },
  ];

  const categoryLabels: Record<string, string> = {
    draft: "Draft & Auction",
    season: "In-Season",
    planning: "Planning",
    historical: "Historical & Digest",
  };
  const categories = ["draft", "season", "planning", "historical"];

  const scopeLabels: Record<string, { label: string; color: string }> = {
    team: { label: "Your Team", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    league: { label: "League-Wide", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
    player: { label: "Per Player", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ AI Insights</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
          AI Insights
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
          AI-powered analysis across every phase of your fantasy baseball season. Expand any card to see exactly what the AI analyzes.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 11, color: "var(--am-text-faint)" }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: "rgb(16, 185, 129)" }} />
          <span style={{ fontWeight: 500, color: "var(--am-text-muted)" }}>AI Available</span>
          <span>·</span>
          <span>Powered by Google Gemini & Anthropic Claude</span>
        </div>
      </Glass>

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
                const isExpanded = expandedId === feature.id;
                const Icon = feature.icon;
                const scopeInfo = scopeLabels[feature.scope];

                return (
                  <div
                    key={feature.id}
                    className={`liquid-glass rounded-2xl p-5 transition-all duration-300 relative flex flex-col ${
                      isLocked ? "opacity-50 grayscale-[30%]" : ""
                    } ${isExpanded ? "ring-1 ring-[var(--lg-accent)]/30" : ""}`}
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[var(--lg-text-primary)] leading-tight">{feature.title}</h3>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${scopeInfo.color}`}>
                            {scopeInfo.label}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--lg-text-muted)] mt-1 leading-relaxed">{feature.description}</p>
                      </div>
                    </div>

                    {/* Lock reason */}
                    {isLocked && feature.lockReason && (
                      <p className="text-[11px] text-[var(--lg-text-muted)] italic mb-3 pl-12">{feature.lockReason}</p>
                    )}

                    {/* Action area */}
                    <div className="flex items-center gap-3 mt-auto pt-3 pl-12">
                      {/* Expand/collapse for prompt transparency */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : feature.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint-hover)] transition-colors flex items-center gap-1.5 border border-[var(--lg-border-faint)]"
                      >
                        <Eye size={12} />
                        {isExpanded ? "Hide Details" : "How It Works"}
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {feature.navigateTo && !isLocked && (
                        <Link
                          to={feature.navigateTo}
                          className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
                        >
                          View <ExternalLink size={10} />
                        </Link>
                      )}
                    </div>

                    {/* Expanded prompt transparency section */}
                    {isExpanded && (
                      <div className="mt-4 border-t border-[var(--lg-border-faint)] pt-4 space-y-3 animate-in fade-in duration-200">
                        {/* Trigger */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Zap size={11} className="text-amber-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">When It Runs</span>
                          </div>
                          <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed pl-4">{feature.trigger}</p>
                        </div>

                        {/* Prompt summary */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Brain size={11} className="text-purple-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">What the AI Does</span>
                          </div>
                          <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed pl-4">{feature.promptSummary}</p>
                        </div>

                        {/* Data used */}
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <Eye size={11} className="text-blue-400" />
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--lg-text-muted)]">Data It Sees</span>
                          </div>
                          <ul className="text-xs text-[var(--lg-text-secondary)] leading-relaxed pl-4 space-y-0.5">
                            {feature.dataUsed.map((item, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="text-[var(--lg-text-muted)] mt-0.5 flex-shrink-0">•</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Model */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-[10px] text-[var(--lg-text-muted)]">Model:</span>
                          <span className="text-[10px] text-[var(--lg-text-secondary)] font-medium">{feature.model}</span>
                        </div>
                      </div>
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
