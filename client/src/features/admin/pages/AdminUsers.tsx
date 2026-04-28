import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  Search,
  AlertCircle,
  Clock,
  UserCheck,
  UserPlus,
  Activity,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import AdminCrossNav from "../components/AdminCrossNav";
import { useAuth } from "../../../auth/AuthProvider";
import { API_BASE, fetchJsonApi, ApiError } from "../../../api/base";
import { reportError } from "../../../lib/errorBus";
import { Glass, SectionLabel } from "../../../components/aurora/atoms";
import {
  ThemedTable,
  ThemedThead,
  ThemedTbody,
  ThemedTh,
  ThemedTr,
  ThemedTd,
} from "../../../components/ui/ThemedTable";

// ─── Types ────────────────────────────────────────────────────────────────

type SortKey =
  | "email"
  | "signupAt"
  | "lastLoginAt"
  | "totalSessions"
  | "totalSecondsOnSite";

type ActiveWindow = "all" | "today" | "7d" | "30d" | "dormant";
type TierFilter = "all" | "free" | "pro" | "commissioner";
type Tier = "free" | "pro" | "commissioner" | "unknown";

interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  signupAt: string;
  lastLoginAt: string | null;
  totalLogins: number;
  totalSessions: number;
  totalSecondsOnSite: number;
  avgSessionSec: number;
  leaguesOwned: number;
  leaguesCommissioned: number;
  tier: Tier;
  signupSource: string | null;
  country: string | null;
}

interface AdminUsersResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface AdminUsersStatsSlice {
  total: number;
  active30d: number;
  newThisMonth: number;
  paid: number;
}

interface AdminStatsResponse {
  users: AdminUsersStatsSlice;
}

const PAGE_SIZE = 50;

// ─── Styling helpers ──────────────────────────────────────────────────────

const CARD_CLASS =
  "rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4";
const NUMBER_CLASS =
  "text-2xl font-bold tabular-nums text-[var(--lg-text-primary)]";
const LABEL_CLASS = "text-xs text-[var(--lg-text-muted)]";

const TIER_BADGE: Record<Tier, string> = {
  free: "text-slate-300 bg-slate-500/10 border-slate-500/20",
  pro: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  commissioner: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  unknown: "text-slate-400 bg-slate-500/5 border-slate-500/10",
};

const ACTIVE_CHIPS: Array<{ value: ActiveWindow; label: string }> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "dormant", label: "Dormant 90d+" },
];

const TIER_CHIPS: Array<{ value: TierFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "commissioner", label: "Commissioner" },
];

// ─── Formatters ───────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (!Number.isFinite(diff)) return "—";
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

function initials(name: string | null, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return src.slice(0, 2).toUpperCase();
}

// ─── Small pieces ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconBg,
  value,
  label,
  hint,
}: {
  icon: typeof Users;
  iconBg: string;
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={NUMBER_CLASS}>{value}</div>
          <div className={LABEL_CLASS}>{label}</div>
          {hint && (
            <div className="text-[10px] text-[var(--lg-text-muted)] opacity-70 mt-0.5">
              {hint}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip<T extends string>({
  value,
  current,
  label,
  onClick,
}: {
  value: T;
  current: T;
  label: string;
  onClick: (v: T) => void;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={[
        "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
        active
          ? "bg-[var(--lg-accent)]/10 border-[var(--lg-accent)] text-[var(--lg-accent)]"
          : "bg-[var(--lg-tint)] border-[var(--lg-border-faint)] text-[var(--lg-text-secondary)] hover:text-[var(--lg-text-primary)]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Avatar({ url, name, email }: { url: string | null; name: string | null; email: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-7 h-7 rounded-full object-cover shrink-0 border border-[var(--lg-border-faint)]"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] border border-[var(--lg-border-faint)]">
      {initials(name, email)}
    </div>
  );
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) {
  if (!active) return <ArrowUpDown size={11} className="inline opacity-40 ml-1" />;
  return dir === "asc" ? (
    <ArrowUp size={11} className="inline ml-1 text-[var(--lg-accent)]" />
  ) : (
    <ArrowDown size={11} className="inline ml-1 text-[var(--lg-accent)]" />
  );
}

// Debounce hook for search
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Main component ───────────────────────────────────────────────────────

export default function AdminUsers() {
  const { isAdmin } = useAuth();

  // Filters
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [active, setActive] = useState<ActiveWindow>("all");
  const [tier, setTier] = useState<TierFilter>("all");

  // Sort — default: lastLoginAt DESC (plan R14: lastSeenAt; server exposes
  // lastLoginAt as the sort key in the Admin Users API).
  const [sortKey, setSortKey] = useState<SortKey>("lastLoginAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Pagination
  const [page, setPage] = useState(1);

  // Data
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [stats, setStats] = useState<AdminUsersStatsSlice | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ message: string; ref: string | null } | null>(null);

  // Reset to page 1 when filters change
  const firstFilterRenderRef = useRef(true);
  useEffect(() => {
    if (firstFilterRenderRef.current) {
      firstFilterRenderRef.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, active, tier]);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      params.set("sort", sortKey);
      params.set("dir", sortDir);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (active !== "all") params.set("active", active);
      if (tier !== "all") params.set("tier", tier);

      const res = await fetchJsonApi<AdminUsersResponse>(
        `${API_BASE}/admin/users?${params.toString()}`,
      );
      setData(res);
    } catch (e) {
      const apiErr = e instanceof ApiError ? e : null;
      setErr({
        message: apiErr?.detail || apiErr?.serverMessage || (e instanceof Error ? e.message : "Failed to load users."),
        ref: apiErr?.displayCode() ?? null,
      });
      setData(null);
      reportError(e, { source: "admin-users" });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, page, sortKey, sortDir, debouncedSearch, active, tier]);

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetchJsonApi<AdminStatsResponse>(`${API_BASE}/admin/stats`);
      setStats(res?.users ?? null);
    } catch (e) {
      // Stat cards are nice-to-have; don't block the table.
      setStats(null);
      reportError(e, { source: "admin-users-stats" });
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.pageSize));
  }, [data]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Glass>
          <div style={{ padding: 8, color: "var(--am-text-muted)", fontSize: 13, textAlign: "center" }}>
            Admin access required.
          </div>
        </Glass>
      </div>
    );
  }

  const rows = data?.users ?? [];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <SectionLabel>✦ Admin · Users</SectionLabel>
        <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>
          User accounts.
        </h1>
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)" }}>
          Login activity, engagement, and account management across every registered account.
        </div>
        <div style={{ marginTop: 12 }}>
          <AdminCrossNav />
        </div>
      </Glass>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          iconBg="bg-sky-500/10 text-sky-400"
          value={stats ? stats.total.toLocaleString() : "—"}
          label="Total users"
        />
        <StatCard
          icon={Activity}
          iconBg="bg-emerald-500/10 text-emerald-400"
          value={stats ? stats.active30d.toLocaleString() : "—"}
          label="Active (30d)"
        />
        <StatCard
          icon={UserPlus}
          iconBg="bg-fuchsia-500/10 text-fuchsia-400"
          value={stats ? stats.newThisMonth.toLocaleString() : "—"}
          label="New this month"
        />
        <StatCard
          icon={DollarSign}
          iconBg="bg-amber-500/10 text-amber-400"
          value={stats ? stats.paid.toLocaleString() : "—"}
          label="Paid subscribers"
          hint={stats && stats.paid === 0 ? "awaiting Stripe" : undefined}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--lg-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] focus:outline-none focus:border-[var(--lg-accent)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase font-semibold text-[var(--lg-text-muted)] mr-1">
            Active:
          </span>
          {ACTIVE_CHIPS.map((c) => (
            <Chip key={c.value} value={c.value} current={active} label={c.label} onClick={setActive} />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase font-semibold text-[var(--lg-text-muted)] mr-1">
            Tier:
          </span>
          {TIER_CHIPS.map((c) => (
            <Chip key={c.value} value={c.value} current={tier} label={c.label} onClick={setTier} />
          ))}
        </div>
      </div>

      {/* Error banner */}
      {err && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-red-300">Failed to load users</div>
              <div className="text-xs text-[var(--lg-text-secondary)] mt-1 break-words">
                {err.message}
              </div>
              {err.ref && (
                <div className="text-[10px] font-mono text-[var(--lg-text-muted)] mt-1">
                  {err.ref}
                </div>
              )}
            </div>
            <button
              onClick={() => void loadUsers()}
              className="text-xs font-medium text-[var(--lg-accent)] hover:underline px-3 py-1 rounded border border-[var(--lg-border-faint)] shrink-0"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-[var(--lg-border-faint)] overflow-hidden bg-[var(--lg-bg-card)]">
        <ThemedTable bare density="default" aria-label="Users">
          <ThemedThead>
            <ThemedTr>
              {/* Explicit widths so the User column gets the lion's share
                  and stat cols stay tight — table-layout: fixed otherwise
                  divides evenly and wastes horizontal space. */}
              <ThemedTh className="w-[260px]" onClick={() => toggleSort("email")}>
                User
                <SortIcon active={sortKey === "email"} dir={sortDir} />
              </ThemedTh>
              <ThemedTh className="w-[140px]" onClick={() => toggleSort("lastLoginAt")}>
                Last login
                <SortIcon active={sortKey === "lastLoginAt"} dir={sortDir} />
              </ThemedTh>
              <ThemedTh align="right" className="w-[90px]" onClick={() => toggleSort("totalSessions")}>
                Sessions
                <SortIcon active={sortKey === "totalSessions"} dir={sortDir} />
              </ThemedTh>
              <ThemedTh align="right" className="w-[110px]" onClick={() => toggleSort("totalSecondsOnSite")}>
                Time on site
                <SortIcon active={sortKey === "totalSecondsOnSite"} dir={sortDir} />
              </ThemedTh>
              <ThemedTh align="right" className="w-[90px]">Leagues</ThemedTh>
              <ThemedTh className="w-[80px]">Tier</ThemedTh>
              <ThemedTh className="w-[130px]" onClick={() => toggleSort("signupAt")}>
                Joined
                <SortIcon active={sortKey === "signupAt"} dir={sortDir} />
              </ThemedTh>
              <ThemedTh className="w-[100px]">Actions</ThemedTh>
            </ThemedTr>
          </ThemedThead>
          <ThemedTbody>
            {loading ? (
              // Skeleton rows
              Array.from({ length: 6 }).map((_, i) => (
                <ThemedTr key={`s-${i}`}>
                  <ThemedTd colSpan={8}>
                    <div className="h-6 rounded bg-[var(--lg-tint)] animate-pulse" />
                  </ThemedTd>
                </ThemedTr>
              ))
            ) : err ? (
              <ThemedTr>
                <ThemedTd colSpan={8}>
                  <div className="py-8 text-center text-xs text-[var(--lg-text-muted)]">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    Unable to load data.
                  </div>
                </ThemedTd>
              </ThemedTr>
            ) : rows.length === 0 ? (
              <ThemedTr>
                <ThemedTd colSpan={8}>
                  <div className="py-8 text-center text-xs text-[var(--lg-text-muted)]">
                    <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No users match the current filters.
                  </div>
                </ThemedTd>
              </ThemedTr>
            ) : (
              rows.map((r) => (
                <ThemedTr key={r.id}>
                  <ThemedTd>
                    <div className="flex items-center gap-2">
                      <Avatar url={r.avatarUrl} name={r.name} email={r.email} />
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--lg-text-primary)] truncate">
                          {r.name || r.email}
                        </div>
                        {r.name && (
                          <div className="text-[10px] text-[var(--lg-text-muted)] truncate">
                            {r.email}
                          </div>
                        )}
                      </div>
                    </div>
                  </ThemedTd>
                  <ThemedTd>
                    <span className="flex items-center gap-1 text-[var(--lg-text-secondary)]">
                      <Clock className="w-3 h-3 opacity-50" />
                      {relativeTime(r.lastLoginAt)}
                    </span>
                  </ThemedTd>
                  <ThemedTd align="right" className="text-[var(--lg-text-secondary)]">
                    {r.totalSessions.toLocaleString()}
                  </ThemedTd>
                  <ThemedTd align="right" className="text-[var(--lg-text-secondary)]">
                    {fmtDuration(r.totalSecondsOnSite)}
                  </ThemedTd>
                  <ThemedTd align="right" className="text-[var(--lg-text-secondary)]">
                    {r.leaguesOwned}/{r.leaguesCommissioned}
                  </ThemedTd>
                  <ThemedTd>
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${TIER_BADGE[r.tier]}`}
                    >
                      {r.tier}
                    </span>
                  </ThemedTd>
                  <ThemedTd className="text-[var(--lg-text-secondary)]">
                    {relativeTime(r.signupAt)}
                  </ThemedTd>
                  <ThemedTd>
                    <Link
                      to={`/profile/${r.id}`}
                      className="text-[var(--lg-accent)] hover:underline text-xs"
                    >
                      View
                    </Link>
                  </ThemedTd>
                </ThemedTr>
              ))
            )}
          </ThemedTbody>
        </ThemedTable>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-[var(--lg-border-faint)] px-3 py-2 bg-[var(--lg-tint)]">
          <div className="text-[11px] text-[var(--lg-text-muted)] tabular-nums">
            {loading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Loading
              </span>
            ) : data ? (
              <>
                Page {data.page} of {totalPages} · {data.total.toLocaleString()} users
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[var(--lg-border-faint)] text-[var(--lg-text-secondary)] hover:text-[var(--lg-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={12} /> Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={loading || page >= totalPages}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[var(--lg-border-faint)] text-[var(--lg-text-secondary)] hover:text-[var(--lg-text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
