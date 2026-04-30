/**
 * Shared dashboard types — single source of truth for the admin dashboard.
 *
 * These were previously redefined independently across:
 *   - server/src/features/admin/services/dashboardService.ts
 *   - server/src/features/admin/services/dashboardInsightEngine.ts
 *   - client/src/features/admin/pages/AdminDashboard.tsx
 *   - client/src/features/admin/components/StatTile.tsx
 *   - client/src/features/admin/components/MiniSparkline.tsx
 *
 * Centralizing here eliminates drift risk. The server keeps its own
 * mirrored copy in `server/src/features/admin/services/dashboardService.ts`
 * (Node ESM cannot import client paths), but the wire shape is identical.
 */

export interface SparklinePoint {
  /** ISO week label, e.g. "W14" */
  week: string;
  value: number;
}

export interface HeroMetric {
  label: string;
  value: number;
  formattedValue: string;
  delta: number;
  sparkline: SparklinePoint[];
  tooltip: string;
}

export interface StatTileData {
  id: string;
  label: string;
  value: number;
  formattedValue: string;
  delta: number;
  tooltip: string;
  subtitle: string;
  sparkline: SparklinePoint[];
  href: string;
  status: "populated" | "empty" | "loading";
}

export interface FunnelStage {
  label: string;
  count: number;
  percent: number;
}

export interface FunnelData {
  id: string;
  label: string;
  stages: FunnelStage[];
}

export interface ActivityEntry {
  id: number;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  userEmail: string | null;
  userName: string | null;
  createdAt: string;
}

export interface InlineInsight {
  analysis: string;
  action: string;
  priority: "high" | "medium" | "low";
  generatedBy: "rules" | "ai";
}

export interface DashboardResponse {
  hero: HeroMetric;
  tiles: StatTileData[];
  funnels: FunnelData[];
  activity: ActivityEntry[];
  insights: Record<string, InlineInsight>;
  generatedAt: string;
  cacheTTLSeconds: number;
  dateRange: { days: number; from: string; to: string };
}

/**
 * Tailwind class tokens for inline-insight backgrounds. Keyed by
 * `InlineInsight.priority`. Each class string applies a tinted bg + border.
 */
export const INSIGHT_COLORS: Record<InlineInsight["priority"], string> = {
  high: "bg-[#D55E00]/5 border-[#D55E00]/15",
  medium: "bg-[#E69F00]/5 border-[#E69F00]/15",
  low: "bg-[#0072B2]/5 border-[#0072B2]/15",
};
