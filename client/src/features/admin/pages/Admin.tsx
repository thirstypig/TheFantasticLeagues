import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../auth/AuthProvider";
import PageHeader from "../../../components/ui/PageHeader";
import AdminLeagueTools from "../components/AdminLeagueTools";
import { fetchJsonApi, API_BASE } from "../../../api/base";
import { subscribeErrors, type SurfacedError } from "../../../lib/errorBus";
import {
  Users,
  UserPlus,
  Activity,
  DollarSign,
  Trophy,
  Sparkles,
  CheckSquare,
  BarChart3,
  FileText,
  Wrench,
  History,
  Map,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Copy,
  Check,
  Loader2,
  Shuffle,
  Coins,
  Inbox,
  type LucideIcon,
} from "lucide-react";

// ─── Local types matching the API contract ────────────────────────────────

type TodoPriority = "p0" | "p1" | "p2" | "p3";
type TodoActiveStatus = "not_started" | "in_progress";

interface AdminStatsResponse {
  users: {
    total: number;
    active30d: number;
    newThisMonth: number;
    paid: number;
  };
  leagues: {
    total: number;
    byStatus: {
      setup: number;
      draft: number;
      inSeason: number;
      completed: number;
    };
  };
  aiInsights: {
    total: number;
    generatedThisWeek: number;
    latestWeekKey: string | null;
  };
  todos: {
    total: number;
    notStarted: number;
    inProgress: number;
    done: number;
    topActive: Array<{
      id: string;
      title: string;
      status: TodoActiveStatus;
      priority: TodoPriority;
      categoryTitle: string;
    }>;
  };
  recentActivity: Array<{
    id: number;
    userId: number;
    userName: string | null;
    userEmail: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    createdAt: string;
  }>;
  recentErrors: AdminErrorRecord[];
  generatedAt: string;
}

interface AdminErrorRecord {
  ref: string;
  requestId: string;
  message: string;
  stack: string | null;
  path: string;
  method: string;
  userId: number | null;
  userEmail: string | null;
  statusCode: number;
  timestamp: string;
}

interface AdminErrorsListResponse {
  errors: AdminErrorRecord[];
  bufferSize: number;
  bufferCapacity: number;
}

// ─── Styling helpers ──────────────────────────────────────────────────────

const CARD_CLASS =
  "rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4";
const NUMBER_CLASS =
  "text-2xl font-bold tabular-nums text-[var(--lg-text-primary)]";
const LABEL_CLASS = "text-xs text-[var(--lg-text-muted)]";
const SECTION_TITLE_CLASS =
  "text-xs font-semibold uppercase tracking-wide text-[var(--lg-text-muted)]";

const PRIORITY_COLORS: Record<TodoPriority, string> = {
  p0: "text-red-400 bg-red-500/10 border-red-500/30",
  p1: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  p2: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  p3: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

const STATUS_PILL: Record<
  keyof AdminStatsResponse["leagues"]["byStatus"],
  { label: string; className: string }
> = {
  setup: { label: "Setup", className: "text-slate-300 bg-slate-500/10 border-slate-500/20" },
  draft: { label: "Draft", className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  inSeason: { label: "In Season", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  completed: { label: "Completed", className: "text-sky-400 bg-sky-500/10 border-sky-500/30" },
};

function relativeTime(iso: string | number | Date): string {
  const t = typeof iso === "number" ? iso : new Date(iso).getTime();
  const diff = Date.now() - t;
  if (!Number.isFinite(diff)) return "";
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function actionIcon(action: string): LucideIcon {
  const a = action.toUpperCase();
  if (a.includes("TRADE")) return Shuffle;
  if (a.includes("WAIVER")) return Inbox;
  if (a.includes("AUCTION") || a.includes("BID") || a.includes("DRAFT")) return Coins;
  if (a.includes("LOGIN") || a.includes("LOGOUT") || a.includes("USER")) return Users;
  if (a.includes("LEAGUE")) return Trophy;
  if (a.includes("AI")) return Sparkles;
  return Activity;
}

// ─── Small reusable pieces ────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconBg,
  value,
  label,
  hint,
}: {
  icon: LucideIcon;
  iconBg: string;
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={NUMBER_CLASS}>{value}</div>
          <div className={LABEL_CLASS}>{label}</div>
          {hint && (
            <div className="text-[10px] text-[var(--lg-text-muted)] opacity-70 mt-0.5">{hint}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ title, message }: { title: string; message: string }) {
  return (
    <div className={CARD_CLASS}>
      <h3 className={SECTION_TITLE_CLASS + " mb-2"}>{title}</h3>
      <p className="text-xs text-[var(--lg-text-muted)] italic">{message}</p>
    </div>
  );
}

// ─── Error row — copies ref to clipboard on click ─────────────────────────

function ErrorRow({ err }: { err: AdminErrorRecord }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(err.ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — silently ignore
    }
  };
  return (
    <button
      onClick={onCopy}
      className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[var(--lg-tint)] transition-colors group"
      title={err.message}
    >
      <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono text-[var(--lg-text-primary)] truncate">{err.ref}</code>
          <span className="text-[10px] text-[var(--lg-text-muted)]">{relativeTime(err.timestamp)}</span>
        </div>
        <div className="text-[11px] text-[var(--lg-text-muted)] truncate">
          <span className="font-semibold text-[var(--lg-text-primary)] opacity-80">{err.method}</span>{" "}
          {err.path}
        </div>
      </div>
      {copied ? (
        <Check size={12} className="text-emerald-400 mt-1 shrink-0" />
      ) : (
        <Copy size={12} className="text-[var(--lg-text-muted)] opacity-0 group-hover:opacity-100 mt-1 shrink-0" />
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function Admin() {
  const { user } = useAuth();

  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [errors, setErrors] = useState<AdminErrorsListResponse | null>(null);
  const [errorsError, setErrorsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Best-effort fallback: errors observed on THIS client via errorBus
  const [localErrors, setLocalErrors] = useState<SurfacedError[]>([]);

  const isAdmin = Boolean(user?.isAdmin);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetchJsonApi<AdminStatsResponse>(`${API_BASE}/admin/stats`);
      setStats(res);
      setStatsError(null);
    } catch (e) {
      setStats(null);
      setStatsError(e instanceof Error ? e.message : "Failed to load dashboard stats.");
    }
  }, []);

  const loadErrors = useCallback(async () => {
    try {
      const res = await fetchJsonApi<AdminErrorsListResponse>(`${API_BASE}/admin/errors`);
      setErrors(res);
      setErrorsError(null);
    } catch (e) {
      setErrors(null);
      setErrorsError(e instanceof Error ? e.message : "Failed to load errors.");
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadStats(), loadErrors()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadStats, loadErrors]);

  // Initial load
  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      await Promise.all([loadStats(), loadErrors()]);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, loadStats, loadErrors]);

  // Auto-refresh every 60s while page is visible
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    function start() {
      if (intervalRef.current != null) return;
      intervalRef.current = window.setInterval(() => {
        if (document.visibilityState === "visible") refresh();
      }, 60_000);
    }
    function stop() {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    function onVis() {
      if (document.visibilityState === "visible") start();
      else stop();
    }
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, [isAdmin, refresh]);

  // Subscribe to errorBus for fallback local error list (when server endpoint down)
  useEffect(() => {
    if (!isAdmin) return;
    return subscribeErrors((err) => {
      setLocalErrors((prev) => [err, ...prev].slice(0, 5));
    });
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
        <PageHeader title="Admin Dashboard" subtitle="Ops command center." />
        <div className="lg-card p-16 text-center text-sm text-[var(--lg-text-muted)] mt-6">
          Admin access required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Admin Dashboard"
        subtitle="Ops command center — users, leagues, activity, and launch readiness."
        rightElement={
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--lg-accent)] hover:underline px-3 py-1.5 rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] disabled:opacity-50"
          >
            {refreshing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Refresh
          </button>
        }
      />
      {stats?.generatedAt && (
        <div className="text-[10px] text-[var(--lg-text-muted)] -mt-2 mb-2">
          Updated {relativeTime(stats.generatedAt)}
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-[var(--lg-text-muted)]">
          <Loader2 className="inline-block animate-spin mr-2" size={14} /> Loading dashboard…
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {/* ─── Row 1: 4 stat cards ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats ? (
              <>
                <StatCard
                  icon={Users}
                  iconBg="bg-sky-500/10 text-sky-400"
                  value={stats.users.total.toLocaleString()}
                  label="Total users"
                />
                <StatCard
                  icon={Activity}
                  iconBg="bg-emerald-500/10 text-emerald-400"
                  value={stats.users.active30d.toLocaleString()}
                  label="Active (30d)"
                />
                <StatCard
                  icon={UserPlus}
                  iconBg="bg-fuchsia-500/10 text-fuchsia-400"
                  value={stats.users.newThisMonth.toLocaleString()}
                  label="New this month"
                />
                <StatCard
                  icon={DollarSign}
                  iconBg="bg-amber-500/10 text-amber-400"
                  value={stats.users.paid.toLocaleString()}
                  label="Paid subscribers"
                  hint={stats.users.paid === 0 ? "awaiting Stripe" : undefined}
                />
              </>
            ) : (
              <div className="md:col-span-2 lg:col-span-4">
                <EmptyCard
                  title="User metrics unavailable"
                  message={statsError ?? "Endpoint not yet deployed. Stats will appear once /api/admin/stats is live."}
                />
              </div>
            )}
          </div>

          {/* ─── Row 2: League health + AI Insights summary ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* League health */}
            <div className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Trophy size={16} />
                  </div>
                  <div>
                    <div className={NUMBER_CLASS}>{stats?.leagues.total ?? "—"}</div>
                    <div className={LABEL_CLASS}>League health</div>
                  </div>
                </div>
                <a
                  href="#leagues"
                  className="flex items-center gap-1 text-xs text-[var(--lg-accent)] hover:underline"
                >
                  Manage <ArrowRight size={12} />
                </a>
              </div>
              {stats ? (
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(STATUS_PILL) as Array<keyof typeof STATUS_PILL>).map((k) => (
                    <span
                      key={k}
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${STATUS_PILL[k].className}`}
                    >
                      {STATUS_PILL[k].label}: {stats.leagues.byStatus[k]}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--lg-text-muted)] italic">
                  Status breakdown will appear once /api/admin/stats is live.
                </p>
              )}
            </div>

            {/* AI Insights summary */}
            <div className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-fuchsia-500/10 text-fuchsia-400 flex items-center justify-center">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className={NUMBER_CLASS}>{stats?.aiInsights.total ?? "—"}</div>
                    <div className={LABEL_CLASS}>AI insights</div>
                  </div>
                </div>
                <Link
                  to="/ai"
                  className="flex items-center gap-1 text-xs text-[var(--lg-accent)] hover:underline"
                >
                  View <ArrowRight size={12} />
                </Link>
              </div>
              {stats ? (
                <div className="text-xs text-[var(--lg-text-muted)] space-y-0.5">
                  <div>
                    <span className="text-emerald-400 font-semibold tabular-nums">
                      {stats.aiInsights.generatedThisWeek}
                    </span>{" "}
                    generated this week
                  </div>
                  {stats.aiInsights.latestWeekKey && (
                    <div>
                      Latest:{" "}
                      <code className="text-[11px] text-[var(--lg-text-primary)]">
                        {stats.aiInsights.latestWeekKey}
                      </code>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--lg-text-muted)] italic">
                  Insight counts unavailable.
                </p>
              )}
            </div>
          </div>

          {/* ─── Row 3: Todo progress + Quick links ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Todo progress */}
            <div className={CARD_CLASS}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-md bg-amber-500/10 text-amber-400 flex items-center justify-center">
                    <CheckSquare size={16} />
                  </div>
                  <div>
                    <div className={NUMBER_CLASS}>{stats?.todos.total ?? "—"}</div>
                    <div className={LABEL_CLASS}>Todo items</div>
                  </div>
                </div>
                <Link
                  to="/todo"
                  className="flex items-center gap-1 text-xs text-[var(--lg-accent)] hover:underline"
                >
                  Manage <ArrowRight size={12} />
                </Link>
              </div>

              {stats ? (
                <>
                  <div className="flex items-center gap-3 text-[11px] text-[var(--lg-text-muted)] mb-3">
                    <span className="text-emerald-400">
                      <strong className="font-bold tabular-nums">{stats.todos.done}</strong> done
                    </span>
                    <span className="text-amber-400">
                      <strong className="font-bold tabular-nums">{stats.todos.inProgress}</strong> in progress
                    </span>
                    <span className="text-slate-400">
                      <strong className="font-bold tabular-nums">{stats.todos.notStarted}</strong> not started
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--lg-border-faint)] rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{
                        width: `${stats.todos.total > 0 ? (stats.todos.done / stats.todos.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {stats.todos.topActive.length > 0 ? (
                    <ul className="space-y-1.5">
                      {stats.todos.topActive.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-xs">
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${PRIORITY_COLORS[t.priority]}`}
                          >
                            {t.priority.toUpperCase()}
                          </span>
                          <span className="text-[var(--lg-text-primary)] truncate flex-1">
                            {t.title}
                          </span>
                          <span className="text-[10px] text-[var(--lg-text-muted)] opacity-70 shrink-0">
                            {t.categoryTitle}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--lg-text-muted)] italic">No active todos.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-[var(--lg-text-muted)] italic">Todo progress unavailable.</p>
              )}
            </div>

            {/* Quick links */}
            <div className={CARD_CLASS}>
              <h3 className={SECTION_TITLE_CLASS + " mb-3"}>Quick Links</h3>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { to: "/admin/dashboard", label: "Dashboard", Icon: BarChart3 },
                  { to: "/admin/users", label: "Users", Icon: Users },
                  { to: "/todo", label: "Todo", Icon: CheckSquare },
                  { to: "/analytics", label: "Analytics", Icon: BarChart3 },
                  { to: "/status", label: "Status", Icon: Activity },
                  { to: "/tech", label: "Under the Hood", Icon: Wrench },
                  { to: "/docs", label: "Docs", Icon: FileText },
                  { to: "/changelog", label: "Changelog", Icon: History },
                  { to: "/roadmap", label: "Roadmap", Icon: Map },
                ].map(({ to, label, Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)] transition-colors group"
                  >
                    <Icon size={14} className="text-[var(--lg-text-muted)] group-hover:text-[var(--lg-accent)]" />
                    <span className="flex-1 truncate">{label}</span>
                    <ChevronRight
                      size={12}
                      className="text-[var(--lg-text-muted)] opacity-0 group-hover:opacity-100"
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Row 4: Recent Activity + Recent Errors ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Recent Activity */}
            <div className={CARD_CLASS}>
              <h3 className={SECTION_TITLE_CLASS + " mb-3"}>Recent Activity</h3>
              {stats && stats.recentActivity.length > 0 ? (
                <ul className="space-y-1 max-h-96 overflow-y-auto">
                  {stats.recentActivity.map((row) => {
                    const Icon = actionIcon(row.action);
                    return (
                      <li
                        key={row.id}
                        className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-[var(--lg-tint)] transition-colors"
                      >
                        <Icon size={14} className="text-[var(--lg-text-muted)] mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-[var(--lg-text-primary)] truncate">
                            <code className="text-[10px] font-mono opacity-80">{row.action}</code>
                            {row.resourceId && (
                              <span className="text-[var(--lg-text-muted)] opacity-70"> · {row.resourceType}#{row.resourceId}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--lg-text-muted)] truncate">
                            {row.userEmail ?? row.userName ?? `user#${row.userId}`} · {relativeTime(row.createdAt)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-[var(--lg-text-muted)] italic">
                  {statsError ? "Unavailable." : "No recent activity."}
                </p>
              )}
            </div>

            {/* Recent Errors */}
            <div className={CARD_CLASS}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={SECTION_TITLE_CLASS}>Recent Errors</h3>
                {errors && (
                  <span className="text-[10px] text-[var(--lg-text-muted)] tabular-nums">
                    {errors.bufferSize}/{errors.bufferCapacity}
                  </span>
                )}
              </div>
              {errors && errors.errors.length > 0 ? (
                <div className="space-y-0.5 max-h-96 overflow-y-auto">
                  {errors.errors.slice(0, 5).map((err) => (
                    <ErrorRow key={err.ref} err={err} />
                  ))}
                </div>
              ) : localErrors.length > 0 ? (
                <>
                  <p className="text-[10px] text-[var(--lg-text-muted)] italic mb-2">
                    Server buffer unavailable — showing errors from this session.
                  </p>
                  <ul className="space-y-1">
                    {localErrors.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start gap-2 px-2 py-1.5 text-xs"
                        title={e.message}
                      >
                        <AlertTriangle size={12} className="text-red-400 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-[var(--lg-text-primary)] truncate">
                            {e.message}
                          </div>
                          <div className="text-[10px] text-[var(--lg-text-muted)]">
                            {e.requestId ? <code className="font-mono">{e.requestId}</code> : null}{" "}
                            · {relativeTime(e.timestamp)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-[var(--lg-text-muted)] italic">
                  {errorsError ?? "No errors in buffer. Nice."}
                </p>
              )}
            </div>
          </div>

          {/* ─── Row 5: League Tools (collapsible) ─── */}
          <details id="leagues" className={CARD_CLASS + " group"}>
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <div className="flex items-center gap-2">
                <Wrench size={16} className="text-[var(--lg-text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--lg-text-heading)]">League Tools</h3>
                <span className="text-[10px] text-[var(--lg-text-muted)]">
                  expand to manage seasons, rosters, CSV import
                </span>
              </div>
              <ChevronRight
                size={16}
                className="text-[var(--lg-text-muted)] transition-transform group-open:rotate-90"
              />
            </summary>
            <div className="mt-4 pt-4 border-t border-[var(--lg-border-faint)]">
              <AdminLeagueTools />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
