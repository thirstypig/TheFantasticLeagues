import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users, Search, AlertCircle, Clock, Shield, UserCheck } from "lucide-react";
import AdminCrossNav from "../components/AdminCrossNav";
import { useAuth } from "../../../auth/AuthProvider";

/**
 * Admin Users page — SCAFFOLD.
 *
 * Live data (last login, session count, time on site) requires the
 * UserSession + UserMetrics schema proposed in:
 *   docs/plans/2026-04-13-admin-users-session-tracking-plan.md
 *
 * Until that migration is approved and applied, this page renders what we
 * already know (email, admin flag, membership count) and stubs the
 * behavioral columns so the shape is visible.
 */

type SortKey =
  | "email"
  | "signupAt"
  | "lastLoginAt"
  | "totalSessions"
  | "totalSecondsOnSite"
  | "leaguesOwned"
  | "tier";

interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  signupAt: string;
  // Populated once UserSession / UserMetrics schema lands.
  lastLoginAt: string | null;
  totalLogins: number;
  totalSessions: number;
  totalSecondsOnSite: number;
  avgSessionSec: number;
  leaguesOwned: number;
  leaguesCommissioned: number;
  tier: "free" | "pro" | "commissioner" | "unknown";
  signupSource: string | null;
  country: string | null;
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminUsers() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastLoginAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    // Endpoint not implemented yet — see plan doc. For now, show empty state
    // with helpful guidance instead of a runtime error.
    setLoading(false);
    setRows([]);
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q
      ? rows.filter(
          (r) =>
            r.email.toLowerCase().includes(q) ||
            (r.name || "").toLowerCase().includes(q),
        )
      : rows;
    return [...base].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey] as string | number | null;
      const bv = b[sortKey] as string | number | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, search, sortKey, sortDir]);

  if (!isAdmin) {
    return (
      <div className="px-4 py-6 md:px-6 md:py-10">
        <p className="text-sm text-[var(--lg-text-muted)]">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[var(--lg-accent)]" />
          <h1 className="text-lg font-semibold text-[var(--lg-text-primary)]">Users</h1>
        </div>
        <p className="text-sm text-[var(--lg-text-secondary)] mt-1">
          Login activity, engagement, and account management across every registered account.
        </p>
        <AdminCrossNav />
      </header>

      {/* Migration-pending notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2 flex-1">
            <h2 className="text-sm font-semibold text-amber-300">
              Session tracking schema pending
            </h2>
            <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
              Live columns (last login, sessions, time on site) depend on two new
              Prisma models: <code className="text-[var(--lg-accent)]">UserSession</code>{" "}
              and <code className="text-[var(--lg-accent)]">UserMetrics</code>. The
              migration has not been run yet — explicit approval required.
            </p>
            <p className="text-xs text-[var(--lg-text-secondary)] leading-relaxed">
              Review the schema, endpoints, privacy handling, and heartbeat design in{" "}
              <span className="text-[var(--lg-accent)]">
                docs/plans/2026-04-13-admin-users-session-tracking-plan.md
              </span>
              . Say the word and I'll apply the migration, ship the session
              endpoints, add the client heartbeat hook, and backfill this page
              with real data.
            </p>
          </div>
        </div>
      </div>

      {/* Columns preview — shows the intended shape so reviewers can
          critique before the schema lands. */}
      <section className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-3">
          Planned columns
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {[
            ["Email + name + avatar", "from User model — live"],
            ["Signup date", "User.createdAt once added — small migration"],
            ["Last login", "UserMetrics.lastLoginAt — new"],
            ["Total sessions", "UserMetrics.totalSessions — new"],
            ["Total time on site", "UserMetrics.totalSecondsOnSite — new"],
            ["Avg session length", "UserMetrics.avgSessionSec — new"],
            ["Leagues owned", "count of Team owner rows — live"],
            ["Leagues commissioned", "count of LeagueMembership.COMMISSIONER — live"],
            ["Tier", "Subscription.tier once Stripe lands — pending"],
            ["Stripe LTV", "Subscription + PaymentEvent aggregate — pending"],
            ["Last seen country", "UserSession.country (from CF-IPCountry) — new"],
            ["Actions", "Impersonate / Suspend / Delete — P1 follow-up"],
          ].map(([col, note]) => (
            <div key={col} className="flex items-start gap-2 py-0.5">
              <Shield className="w-3 h-3 mt-0.5 text-[var(--lg-text-muted)] shrink-0" />
              <span className="font-medium text-[var(--lg-text-primary)]">{col}</span>
              <span className="text-[var(--lg-text-muted)]">— {note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Search / filter stubs — real when the data lands */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--lg-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or name..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] focus:outline-none focus:border-[var(--lg-accent)]"
          />
        </div>
      </div>

      {/* Table shell — renders empty rows cleanly until endpoint exists */}
      <div className="rounded-lg border border-[var(--lg-border-faint)] overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[var(--lg-tint)]">
            <tr className="text-left text-[var(--lg-text-muted)]">
              {(
                [
                  ["email", "User"],
                  ["signupAt", "Signup"],
                  ["lastLoginAt", "Last login"],
                  ["totalSessions", "Sessions"],
                  ["totalSecondsOnSite", "Time on site"],
                  ["leaguesOwned", "Leagues"],
                  ["tier", "Tier"],
                ] as Array<[SortKey, string]>
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="px-3 py-2 font-medium cursor-pointer select-none"
                  onClick={() => {
                    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
                    else {
                      setSortKey(key);
                      setSortDir("desc");
                    }
                  }}
                >
                  {label}
                  {sortKey === key && <span className="ml-1 opacity-60">{sortDir === "asc" ? "↑" : "↓"}</span>}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--lg-text-muted)]">
                  Loading…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-red-400">
                  {err}
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[var(--lg-text-muted)]">
                  <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No rows yet — endpoint `GET /api/admin/users` ships with the session-tracking migration.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t border-[var(--lg-border-faint)]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-[var(--lg-text-primary)]">{r.name || r.email}</div>
                    {r.name && <div className="text-[10px] text-[var(--lg-text-muted)]">{r.email}</div>}
                  </td>
                  <td className="px-3 py-2 text-[var(--lg-text-secondary)]">{fmtRelative(r.signupAt)}</td>
                  <td className="px-3 py-2 text-[var(--lg-text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 opacity-50" />
                      {fmtRelative(r.lastLoginAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--lg-text-secondary)] tabular-nums">{r.totalSessions}</td>
                  <td className="px-3 py-2 text-[var(--lg-text-secondary)] tabular-nums">{fmtDuration(r.totalSecondsOnSite)}</td>
                  <td className="px-3 py-2 text-[var(--lg-text-secondary)] tabular-nums">{r.leaguesOwned}</td>
                  <td className="px-3 py-2 text-[var(--lg-text-secondary)]">{r.tier}</td>
                  <td className="px-3 py-2">
                    <Link to={`/profile/${r.id}`} className="text-[var(--lg-accent)] hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
