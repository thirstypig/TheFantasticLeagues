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

// ─── Report registry ─────────────────────────────────────────────────────────

const REPORTS: Record<string, { title: string; raw: string; date: string }> = {
  "onroto-audit-2026-06-08": {
    title: "OnRoto/FanGraphs vs FBST Standings Audit",
    date: "June 8, 2026",
    raw: onrotoAudit,
  },
};

// ─── Minimal markdown → JSX renderer ────────────────────────────────────────
// Handles: headings, tables, bold, inline code, blockquotes, hr, paragraphs.
// Intentionally minimal — just enough to render these audit documents cleanly.

function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const nodes: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const inlineRender = (text: string): React.ReactNode => {
    // Bold **x**, inline code `x`, links [label](url)
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/);
    return parts.map((part, pi) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={pi}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={pi} className="rounded bg-[var(--lg-tint)] px-1 py-0.5 font-mono text-[11px] text-[var(--lg-accent)]">{part.slice(1, -1)}</code>;
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch)
        return <a key={pi} href={linkMatch[2]} className="text-[var(--lg-accent)] underline underline-offset-2" target="_blank" rel="noreferrer">{linkMatch[1]}</a>;
      return part;
    });
  };

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") { i++; continue; }

    // HR
    if (/^---+$/.test(line.trim())) {
      nodes.push(<hr key={key++} className="my-6 border-[var(--lg-border-faint)]" />);
      i++; continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2];
      const Tag = `h${level}` as "h1"|"h2"|"h3"|"h4"|"h5"|"h6";
      const cls = [
        "font-bold text-[var(--lg-text-primary)]",
        level === 1 ? "text-2xl mt-8 mb-3" :
        level === 2 ? "text-lg mt-7 mb-2 border-b border-[var(--lg-border-faint)] pb-1" :
        level === 3 ? "text-base mt-5 mb-2" :
        "text-sm mt-4 mb-1",
      ].join(" ");
      nodes.push(<Tag key={key++} className={cls}>{inlineRender(text)}</Tag>);
      i++; continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const content = line.replace(/^>\s*/, "");
      nodes.push(
        <blockquote key={key++} className="border-l-4 border-[var(--lg-accent)] bg-[var(--lg-tint)]/50 px-4 py-2 my-2 text-xs text-[var(--lg-text-muted)] italic">
          {inlineRender(content)}
        </blockquote>
      );
      i++; continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      nodes.push(
        <pre key={key++} className="my-3 rounded border border-[var(--lg-border-faint)] bg-[var(--lg-tint)] p-3 overflow-x-auto text-[11px] font-mono text-[var(--lg-text-primary)] leading-relaxed">
          {codeLines.join("\n")}
        </pre>
      );
      i++; continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const headerCells = tableLines[0].split("|").filter(Boolean).map(c => c.trim());
        const bodyRows = tableLines.slice(2).map(row =>
          row.split("|").filter(Boolean).map(c => c.trim())
        );
        nodes.push(
          <div key={key++} className="my-4 overflow-x-auto rounded border border-[var(--lg-border-faint)]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--lg-tint)]">
                  {headerCells.map((h, hi) => (
                    <th key={hi} className="px-3 py-2 text-left font-semibold text-[var(--lg-text-primary)] border-b border-[var(--lg-border-faint)] whitespace-nowrap">
                      {inlineRender(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, ri) => (
                  <tr key={ri} className={ri % 2 === 0 ? "" : "bg-[var(--lg-tint)]/30"}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-[var(--lg-text-primary)] border-b border-[var(--lg-border-faint)]/50 whitespace-nowrap">
                        {inlineRender(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // List item
    if (/^[-*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^[-*]\s/, ""));
        i++;
      }
      nodes.push(
        <ul key={key++} className="my-2 list-disc list-inside space-y-0.5 text-sm text-[var(--lg-text-primary)]">
          {listItems.map((item, ii) => (
            <li key={ii} className="text-sm">{inlineRender(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph
    nodes.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-[var(--lg-text-primary)]">
        {inlineRender(line)}
      </p>
    );
    i++;
  }

  return nodes;
}

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
