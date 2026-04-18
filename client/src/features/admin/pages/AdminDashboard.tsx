/**
 * Executive Admin Dashboard — Stripe/Linear "hero + tile grid" pattern.
 * 5-second test: admin answers "is the business healthy?" at a glance.
 */

import { useEffect, useState, useCallback } from "react";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { StatTile, StatTileSkeleton } from "../components/StatTile";
import { MiniSparkline } from "../components/MiniSparkline";
import { FunnelBar } from "../components/FunnelBar";
import { reportError } from "../../../lib/errorBus";
import {
  Activity,
  ArrowLeftRight,
  ArrowRight,
  Brain,
  Coins,
  LogIn,
  Settings,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

// ─── Types (mirror server DashboardResponse) ──────────────────

interface SparklinePoint { week: string; value: number }
interface HeroMetric {
  label: string; value: number; formattedValue: string;
  delta: number; sparkline: SparklinePoint[]; tooltip: string;
}
interface StatTileData {
  id: string; label: string; value: number; formattedValue: string;
  delta: number; tooltip: string; subtitle: string;
  sparkline: SparklinePoint[]; href: string;
  status: "populated" | "empty" | "loading";
}
interface FunnelStage { label: string; count: number; percent: number }
interface FunnelData { id: string; label: string; stages: FunnelStage[] }
interface ActivityEntry {
  id: number; action: string; resourceType: string | null;
  resourceId: string | null; userEmail: string | null;
  userName: string | null; createdAt: string;
}
interface InlineInsight {
  analysis: string; action: string;
  priority: "high" | "medium" | "low"; generatedBy: "rules" | "ai";
}
interface DashboardResponse {
  hero: HeroMetric; tiles: StatTileData[]; funnels: FunnelData[];
  activity: ActivityEntry[]; insights: Record<string, InlineInsight>;
  generatedAt: string;
  cacheTTLSeconds: number; dateRange: { days: number; from: string; to: string };
}

// ─── Presets ──────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

// ─── Component ───────────────────────────────────────────────

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetchJsonApi<DashboardResponse>(
        `${API_BASE}/admin/dashboard?days=${d}`
      );
      setData(res);
    } catch (err) {
      reportError(err, { source: "admin-dashboard" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--lg-text-heading)]">
            Dashboard
          </h1>
          <p className="text-sm text-[var(--lg-text-muted)] mt-1">
            Executive overview
            {data && (
              <span className="ml-2 opacity-60">
                · cached {data.cacheTTLSeconds}s
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-1 bg-[var(--lg-tint)] p-1 rounded-lg">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                days === p.days
                  ? "bg-[var(--lg-accent)] text-white"
                  : "text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Metric */}
      {loading && !data ? (
        <HeroSkeleton />
      ) : data ? (
        <HeroCard hero={data.hero} insight={data.insights["hero"]} />
      ) : null}

      {/* Stat Tiles Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {loading && !data
          ? Array.from({ length: 6 }).map((_, i) => <StatTileSkeleton key={i} />)
          : data?.tiles.map((tile) => (
              <StatTile key={tile.id} {...tile} insight={data.insights[tile.id]} />
            ))}
      </div>

      {/* Funnels */}
      {data && data.funnels.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">
            Conversion Funnels
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.funnels.map((f) => (
              <FunnelBar key={f.id} label={f.label} stages={f.stages} />
            ))}
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {data && data.activity.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-[var(--lg-text-heading)] mb-4">
            Recent Activity
          </h2>
          <div className="lg-card divide-y divide-[var(--lg-divide)]">
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <ActivityIcon action={a.action} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--lg-text-primary)]">
                    {a.userName || a.userEmail || "System"}
                  </span>
                  <span className="text-sm text-[var(--lg-text-muted)] ml-1.5">
                    {a.action.toLowerCase().replace(/_/g, " ")}
                  </span>
                  {a.resourceType && (
                    <span className="text-xs text-[var(--lg-text-muted)] ml-1">
                      {a.resourceType}#{a.resourceId}
                    </span>
                  )}
                </div>
                <time className="text-[11px] text-[var(--lg-text-muted)] tabular-nums shrink-0">
                  {relativeTime(a.createdAt)}
                </time>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────

const INSIGHT_COLORS: Record<string, string> = {
  high: "bg-[#D55E00]/5 border-[#D55E00]/15",
  medium: "bg-[#E69F00]/5 border-[#E69F00]/15",
  low: "bg-[#0072B2]/5 border-[#0072B2]/15",
};

function HeroCard({ hero, insight }: { hero: HeroMetric; insight?: InlineInsight }) {
  const isPositive = hero.delta > 0;
  return (
    <div className="lg-card p-6 md:p-8" title={hero.tooltip}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--lg-text-muted)] mb-2">
            {hero.label}
          </div>
          <div
            className="text-5xl md:text-6xl font-bold tracking-tight text-[var(--lg-text-heading)]"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {hero.formattedValue}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`text-sm font-semibold ${
                isPositive ? "text-[var(--lg-positive)]" : hero.delta < 0 ? "text-[var(--lg-negative)]" : "text-[var(--lg-text-muted)]"
              }`}
            >
              {isPositive ? "▲" : hero.delta < 0 ? "▼" : "—"} {Math.abs(hero.delta)}% vs prior period
            </span>
          </div>
        </div>
        {hero.sparkline.length > 1 && (
          <div className="w-40 h-16 hidden sm:block">
            <MiniSparkline data={hero.sparkline} />
          </div>
        )}
      </div>
      {insight && (
        <div className={`mt-4 rounded-md p-3 text-xs leading-relaxed border ${INSIGHT_COLORS[insight.priority]}`}>
          <div className="flex items-start gap-1.5">
            {insight.generatedBy === "ai" && (
              <Sparkles className="h-3 w-3 mt-0.5 shrink-0 text-[var(--lg-text-muted)] opacity-60" />
            )}
            <div>
              <p className="text-[var(--lg-text-muted)]">{insight.analysis}</p>
              <div className="flex items-start gap-1 mt-1.5">
                <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-[var(--lg-accent)]" />
                <p className="font-medium text-[var(--lg-text-primary)]">{insight.action}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="lg-card p-6 md:p-8 animate-pulse" aria-hidden="true">
      <div className="h-3 w-24 rounded bg-[var(--lg-tint-hover)] mb-3" />
      <div className="h-14 w-32 rounded bg-[var(--lg-tint-hover)] mb-3" />
      <div className="h-4 w-40 rounded bg-[var(--lg-tint-hover)]" />
    </div>
  );
}

const ACTION_ICONS: Record<string, typeof Activity> = {
  TRADE: ArrowLeftRight,
  WAIVER: Coins,
  AUCTION: Coins,
  BID: Coins,
  DRAFT: Trophy,
  LOGIN: LogIn,
  LOGOUT: LogIn,
  AI: Sparkles,
  INSIGHT: Brain,
  LEAGUE: Trophy,
  USER: Users,
  SETTINGS: Settings,
};

function ActivityIcon({ action }: { action: string }) {
  const Icon = ACTION_ICONS[action] || Activity;
  return (
    <div className="w-7 h-7 rounded-full bg-[var(--lg-tint)] flex items-center justify-center shrink-0">
      <Icon size={14} className="text-[var(--lg-text-muted)]" />
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
