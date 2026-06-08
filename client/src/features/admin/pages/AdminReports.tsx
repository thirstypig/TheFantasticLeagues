/**
 * Admin Reports — renders markdown audit/report documents stored in
 * docs/reports/. Served at /admin/reports/:slug. Currently shows the
 * OnRoto standings audit (2026-06-08) with more reports linkable over time.
 *
 * The markdown is imported at build time via Vite's ?raw suffix — no
 * react-markdown dependency required.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Download, FileText } from "lucide-react";
import onrotoAudit from "../../../../../docs/reports/onroto-audit-2026-06-08.md?raw";
import { renderMarkdown } from "../lib/renderMarkdown";

// ─── Report registry ─────────────────────────────────────────────────────────

const REPORTS: Record<string, { title: string; raw: string; date: string }> = {
  "onroto-audit-2026-06-08": {
    title: "FanGraphs on Roto vs TFL Standings Audit",
    date: "June 8, 2026",
    raw: onrotoAudit,
  },
};

// ─── Report index ────────────────────────────────────────────────────────────

function ReportIndex() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <Link to="/admin" className="flex items-center gap-1 text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)]">
          <ChevronLeft size={14} /> Admin
        </Link>
      </div>

      <h1 className="text-xl font-bold text-[var(--lg-text-primary)] mb-1">League Reports</h1>
      <p className="text-sm text-[var(--lg-text-muted)] mb-6">Audit documents and standings analysis.</p>

      <div className="space-y-2">
        {Object.entries(REPORTS).map(([slug, r]) => (
          <Link
            key={slug}
            to={`/admin/reports/${slug}`}
            className="flex items-center gap-3 rounded-lg border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] p-4 hover:bg-[var(--lg-tint)] transition-colors"
          >
            <FileText size={18} className="text-[var(--lg-text-muted)] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-[var(--lg-text-primary)]">{r.title}</div>
              <div className="text-xs text-[var(--lg-text-muted)] mt-0.5">{r.date}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Report viewer ────────────────────────────────────────────────────────────

function ReportViewer({ slug }: { slug: string }) {
  const report = REPORTS[slug];
  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-[var(--lg-text-muted)]">Report not found.</p>
        <Link to="/admin/reports" className="text-xs text-[var(--lg-accent)] hover:underline mt-2 block">
          ← Back to reports
        </Link>
      </div>
    );
  }

  const handleDownload = () => {
    const blob = new Blob([report.raw], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-[var(--lg-text-muted)]">
          <Link to="/admin" className="hover:text-[var(--lg-text-primary)]">Admin</Link>
          <span>/</span>
          <Link to="/admin/reports" className="hover:text-[var(--lg-text-primary)]">Reports</Link>
          <span>/</span>
          <span className="text-[var(--lg-text-primary)] truncate max-w-xs">{report.title}</span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 rounded border border-[var(--lg-border-faint)] px-3 py-1.5 text-xs text-[var(--lg-text-muted)] hover:text-[var(--lg-text-primary)] hover:bg-[var(--lg-tint)] transition-colors"
        >
          <Download size={12} />
          .md
        </button>
      </div>

      {/* Content */}
      <article className="rounded-xl border border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] px-8 py-6">
        {renderMarkdown(report.raw)}
      </article>
    </div>
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export default function AdminReports() {
  const { slug } = useParams<{ slug?: string }>();
  return slug ? <ReportViewer slug={slug} /> : <ReportIndex />;
}
