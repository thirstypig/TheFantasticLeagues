import React from "react";
import { Link } from "react-router-dom";
import AdminCrossNav from "../features/admin/components/AdminCrossNav";
import { Glass, SectionLabel } from "../components/aurora/atoms";
import {
  GitCommit,
  ArrowRight,
  Sparkles,
  Bug,
  Wrench,
  Shield,
  Zap,
  Layers,
} from "lucide-react";

/* ── Single source of truth: docs/changelog.md (auto-parsed) ──────────
 * The page renders the maintained, user-facing changelog file directly.
 * Add a release to docs/changelog.md and it appears here — no second copy
 * to keep in sync. (Format: `## vX.Y.Z — YYYY-MM-DD — type[, type]`, then
 * a `### Title`, then `- **Category:** …` bullets.)                    */

import changelogMd from "../../../docs/changelog.md?raw";

interface Release {
  version: string;
  date: string;
  types: string[];
  title: string;
  bullets: { category: string; text: string }[];
}

const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");

function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  for (const sec of md.split(/\n## /).slice(1)) {
    const nl = sec.indexOf("\n");
    const header = (nl === -1 ? sec : sec.slice(0, nl)).trim();
    const body = nl === -1 ? "" : sec.slice(nl + 1);
    const [version = "", date = "", typesStr = ""] = header.split(/\s+—\s+/).map((s) => s.trim());
    if (!version) continue;
    const types = typesStr.split(",").map((s) => s.trim()).filter(Boolean);
    const title = body.match(/^###\s+(.+)$/m)?.[1].trim() ?? "";
    const bullets: { category: string; text: string }[] = [];
    for (const line of body.split("\n")) {
      const bm = line.match(/^-\s+(.+)$/);
      if (!bm) continue;
      const cm = bm[1].match(/^\*\*(.+?):\*\*\s*(.+)$/);
      bullets.push(cm ? { category: cm[1].trim(), text: stripMd(cm[2].trim()) } : { category: "", text: stripMd(bm[1].trim()) });
    }
    releases.push({ version, date, types, title, bullets });
  }
  return releases;
}

const releases = parseChangelog(changelogMd);

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  feature: { icon: Sparkles, color: "text-emerald-400" },
  improvement: { icon: Zap, color: "text-blue-400" },
  fix: { icon: Bug, color: "text-amber-400" },
  reliability: { icon: Shield, color: "text-cyan-400" },
  breaking: { icon: Wrench, color: "text-red-400" },
};
const typeMeta = (t: string) => typeConfig[t.toLowerCase()] ?? { icon: Layers, color: "text-[var(--lg-text-muted)]" };

/* ── Components ──────────────────────────────────────────────────── */

function ReleaseCard({ r }: { r: Release }) {
  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-5 py-4">
      <div className="flex items-center gap-3 flex-wrap">
        <code className="text-sm font-semibold text-[var(--lg-accent)] tabular-nums">{r.version}</code>
        <span className="text-xs text-[var(--lg-text-muted)]">{r.date}</span>
        <div className="flex items-center gap-1.5">
          {r.types.map((t) => {
            const cfg = typeMeta(t);
            const Icon = cfg.icon;
            return (
              <span key={t} className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[var(--lg-tint)] inline-flex items-center gap-1 ${cfg.color}`}>
                <Icon className="w-3 h-3" /> {t}
              </span>
            );
          })}
        </div>
      </div>
      {r.title && <h3 className="mt-1.5 text-sm font-semibold text-[var(--lg-text-primary)]">{r.title}</h3>}
      <ul className="mt-2 space-y-1.5">
        {r.bullets.map((b, i) => (
          <li key={i} className="text-sm text-[var(--lg-text-secondary)] flex items-start gap-2">
            <span className="text-[var(--lg-text-muted)] mt-1.5 w-1 h-1 rounded-full bg-[var(--lg-text-muted)] shrink-0" />
            <span>
              {b.category && <span className="font-semibold text-[var(--lg-text-primary)]">{b.category}: </span>}
              {b.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangelogStats() {
  const totalChanges = releases.reduce((s, r) => s + r.bullets.length, 0);
  const typeCounts = releases.reduce<Record<string, number>>((acc, r) => {
    r.types.forEach((t) => { acc[t] = (acc[t] || 0) + 1; });
    return acc;
  }, {});
  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-5">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">{releases.length}</div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Releases</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">{totalChanges}</div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Changes</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-semibold text-[var(--lg-text-primary)] tabular-nums">{releases[0]?.version ?? "—"}</div>
          <div className="text-[10px] text-[var(--lg-text-muted)] uppercase">Latest</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {sorted.map(([type, count]) => (
          <span key={type} className={`text-[10px] font-semibold uppercase px-2 py-1 rounded ${typeMeta(type).color} bg-[var(--lg-tint)]`}>
            {type}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────── */

export default function Changelog() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <Glass strong>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div>
            <SectionLabel><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><GitCommit size={11} /> Changelog</span></SectionLabel>
            <h1 style={{ fontFamily: "var(--am-display)", fontSize: 30, fontWeight: 300, color: "var(--am-text)", margin: 0, lineHeight: 1.1 }}>Changelog</h1>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--am-text-muted)", maxWidth: 720 }}>
              Release history for The Fantastic Leagues — the features, fixes, and improvements shipped to production.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link to="/roadmap" style={{ fontSize: 12, color: "var(--am-text-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Roadmap <ArrowRight className="w-3 h-3" />
            </Link>
            <Link to="/tech" style={{ fontSize: 12, color: "var(--am-text-muted)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Under the Hood <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
        <div style={{ marginTop: 12 }}><AdminCrossNav /></div>
      </Glass>

      <ChangelogStats />

      <div className="space-y-3">
        {releases.map((r) => (
          <ReleaseCard key={r.version} r={r} />
        ))}
      </div>

      <p className="text-xs text-[var(--lg-text-muted)] text-center pb-4">
        Single source: <code className="bg-[var(--lg-tint)] px-1 py-0.5 rounded">docs/changelog.md</code> |{" "}
        <Link to="/tech" className="text-[var(--lg-accent)] hover:underline">Under the Hood</Link>
      </p>
    </div>
  );
}
