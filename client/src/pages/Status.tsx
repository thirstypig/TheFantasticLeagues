import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  Database,
  Globe,
  Shield,
  Zap,
  Clock,
  Wifi,
} from "lucide-react";
import { fetchJsonApi } from "../api/base";

/* ── Types ───────────────────────────────────────────────────────── */

interface HealthCheck {
  name: string;
  icon: React.ElementType;
  description: string;
  status: "checking" | "healthy" | "degraded" | "down";
  latency?: number;
  detail?: string;
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Status() {
  const [checks, setChecks] = useState<HealthCheck[]>([
    { name: "Express API", icon: Server, description: "REST API server on :4010", status: "checking" },
    { name: "Database", icon: Database, description: "PostgreSQL via Prisma ORM", status: "checking" },
    { name: "Supabase Auth", icon: Shield, description: "Authentication & session management", status: "checking" },
    { name: "MLB Stats API", icon: Globe, description: "Live player data source", status: "checking" },
  ]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setChecking(true);

    // Reset all to checking
    setChecks((prev) => prev.map((c) => ({ ...c, status: "checking" as const, latency: undefined, detail: undefined })));

    // Check Express API + DB health
    const apiStart = Date.now();
    try {
      const res = await fetchJsonApi<{ status: string; database?: string; supabase?: string }>("/api/health");
      const apiLatency = Date.now() - apiStart;

      setChecks((prev) =>
        prev.map((c) => {
          if (c.name === "Express API") {
            return { ...c, status: "healthy", latency: apiLatency, detail: `Response in ${apiLatency}ms` };
          }
          if (c.name === "Database") {
            const dbOk = res.database === "ok" || res.status === "ok";
            return { ...c, status: dbOk ? "healthy" : "degraded", latency: apiLatency, detail: dbOk ? "Connected" : "Check server logs" };
          }
          if (c.name === "Supabase Auth") {
            const authOk = res.supabase === "ok" || res.status === "ok";
            return { ...c, status: authOk ? "healthy" : "degraded", detail: authOk ? "Connected" : "Check Supabase dashboard" };
          }
          return c;
        })
      );
    } catch {
      const apiLatency = Date.now() - apiStart;
      setChecks((prev) =>
        prev.map((c) => {
          if (c.name === "Express API") return { ...c, status: "down" as const, latency: apiLatency, detail: "Server unreachable" };
          if (c.name === "Database") return { ...c, status: "down" as const, detail: "Cannot reach API" };
          if (c.name === "Supabase Auth") return { ...c, status: "down" as const, detail: "Cannot reach API" };
          return c;
        })
      );
    }

    // Check MLB Stats API (lightweight)
    const mlbStart = Date.now();
    try {
      const res = await fetch("https://statsapi.mlb.com/api/v1/sports/1", { signal: AbortSignal.timeout(5000) });
      const mlbLatency = Date.now() - mlbStart;
      setChecks((prev) =>
        prev.map((c) =>
          c.name === "MLB Stats API"
            ? { ...c, status: res.ok ? "healthy" : "degraded", latency: mlbLatency, detail: res.ok ? `Response in ${mlbLatency}ms` : `HTTP ${res.status}` }
            : c
        )
      );
    } catch {
      const mlbLatency = Date.now() - mlbStart;
      setChecks((prev) =>
        prev.map((c) =>
          c.name === "MLB Stats API"
            ? { ...c, status: "down" as const, latency: mlbLatency, detail: "Unreachable or timed out" }
            : c
        )
      );
    }

    setLastChecked(new Date());
    setChecking(false);
  }, []);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const overallStatus = checks.some((c) => c.status === "down")
    ? "down"
    : checks.some((c) => c.status === "degraded" || c.status === "checking")
      ? "degraded"
      : "healthy";

  const statusConfig = {
    healthy: { label: "All Systems Operational", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    degraded: { label: "Partial Degradation", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
    down: { label: "Service Disruption", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
  };

  const overall = statusConfig[overallStatus];

  return (
    <div className="px-4 py-6 md:px-6 md:py-10 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--lg-accent)]" />
            <h1 className="text-2xl font-semibold text-[var(--lg-text-primary)]">
              System Status
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/tech"
              className="text-xs font-medium text-[var(--lg-accent)] hover:underline flex items-center gap-1"
            >
              Under the Hood <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
        <p className="mt-2 text-sm text-[var(--lg-text-secondary)]">
          Live health checks for all system components. Pings the API server, database,
          auth provider, and external data sources.
        </p>
      </div>

      {/* Overall Status Banner */}
      <div className={`rounded-lg border ${overall.border} ${overall.bg} p-5`}>
        <div className="flex items-center gap-3">
          {overallStatus === "healthy" ? (
            <CheckCircle2 className={`w-6 h-6 ${overall.color}`} />
          ) : overallStatus === "degraded" ? (
            <Activity className={`w-6 h-6 ${overall.color}`} />
          ) : (
            <XCircle className={`w-6 h-6 ${overall.color}`} />
          )}
          <div className="flex-1">
            <h2 className={`text-lg font-semibold ${overall.color}`}>
              {overall.label}
            </h2>
            {lastChecked && (
              <p className="text-xs text-[var(--lg-text-muted)]">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
          <button
            onClick={runChecks}
            disabled={checking}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--lg-accent)] hover:underline disabled:opacity-50 px-3 py-1.5 rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Individual Checks */}
      <div className="space-y-3">
        {checks.map((check) => {
          const Icon = check.icon;
          const isHealthy = check.status === "healthy";
          const isDegraded = check.status === "degraded";
          const isDown = check.status === "down";
          const isChecking = check.status === "checking";

          return (
            <div
              key={check.name}
              className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 flex items-center gap-4"
            >
              <Icon className="w-5 h-5 text-[var(--lg-text-muted)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-[var(--lg-text-primary)]">
                    {check.name}
                  </h3>
                  <span className="text-xs text-[var(--lg-text-muted)]">{check.description}</span>
                </div>
                {check.detail && (
                  <p className="text-xs text-[var(--lg-text-secondary)] mt-0.5">{check.detail}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {check.latency !== undefined && (
                  <span className="text-xs text-[var(--lg-text-muted)] tabular-nums flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {check.latency}ms
                  </span>
                )}
                {isChecking && (
                  <span className="text-xs font-semibold text-[var(--lg-text-muted)] flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking
                  </span>
                )}
                {isHealthy && (
                  <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Healthy
                  </span>
                )}
                {isDegraded && (
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Degraded
                  </span>
                )}
                {isDown && (
                  <span className="text-xs font-semibold text-red-400 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> Down
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* System Info */}
      <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
        <h3 className="text-sm font-semibold text-[var(--lg-text-primary)] mb-3">
          System Information
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "Frontend", value: "React 18 + Vite (:3010)" },
            { label: "API Server", value: "Express + TypeScript (:4010)" },
            { label: "Database", value: "PostgreSQL (Supabase)" },
            { label: "Auth", value: "Supabase Auth (Google/Yahoo OAuth)" },
            { label: "Real-time", value: "WebSocket (auction)" },
            { label: "Cache", value: "SQLite (MLB API proxy)" },
            { label: "Tests", value: "670 passing (454 server + 187 client + 29 MCP)" },
            { label: "API Endpoints", value: "116 across 17 modules" },
          ].map((item) => (
            <div key={item.label} className="flex items-baseline gap-2 text-sm py-1">
              <span className="text-[var(--lg-text-muted)] font-medium w-24 shrink-0">{item.label}</span>
              <span className="text-[var(--lg-text-secondary)]">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Health endpoint:{" "}
        <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">GET /api/health</code>{" "}
        |{" "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">
          Under the Hood
        </Link>
      </p>
    </div>
  );
}
