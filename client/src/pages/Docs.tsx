import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ArrowRight,
  Search,
  BookOpen,
  Terminal,
  Settings,
  ClipboardList,
  FlaskConical,
  Shield,
} from "lucide-react";
import {
  buildIndex,
  searchDocs,
  groupBySection,
  type DocEntry,
  type SectionKey,
  type Badge,
  type BadgeTone,
} from "./docs/docsIndex";

/* ── Auto-discovered markdown (Vite glob) ───────────────────────────
 * Every .md in the reference folders below is discovered at build time
 * — no manual registration. Add a doc, it appears here automatically.
 * Working/superseded folders (docs/plans, brainstorms, scratch, design,
 * archive) are intentionally excluded from the viewer, as is
 * docs/_templates (enforced again by isExcluded in docsIndex.ts).
 *
 * Indexing, title extraction, sectioning and badges live in
 * ./docs/docsIndex.ts — pure and unit-tested. See docs/README-DOCS.md. */

const RAW_MODULES = import.meta.glob(
  [
    "../../../docs/*.md",
    "../../../docs/guides/*.md",
    "../../../docs/reports/*.md",
    "../../../docs/runbooks/*.md",
    "../../../docs/learnings/*.md",
    "../../../docs/solutions/**/*.md",
    "../../../docs/product/**/*.md",
    "../../../docs/engineering/**/*.md",
    "../../../docs/under-the-hood/*.md",
    "../../../CLAUDE.md",
    "../../../README.md",
    "../../../FEEDBACK.md",
    "../../../ROADMAP.md",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const docs: DocEntry[] = buildIndex(
  Object.entries(RAW_MODULES).map(([path, raw]) => ({
    path: path.replace(/^(?:\.\.\/)+/, ""),
    raw,
  })),
);

const BADGE_TONE: Record<BadgeTone, string> = {
  good: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  info: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  muted: "bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border-[var(--lg-border-faint)]",
  neutral: "bg-[var(--lg-tint)] text-[var(--lg-text-secondary)] border-[var(--lg-border-faint)]",
};

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span
      title={badge.title}
      className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide border ${BADGE_TONE[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

/* ── Section presentation ───────────────────────────────────────── */

const SECTION_ICON: Record<SectionKey, React.ElementType> = {
  product: ClipboardList,
  engineering: Terminal,
  security: Shield,
  operations: Settings,
  troubleshooting: FlaskConical,
  foundations: BookOpen,
  notes: FileText,
};

type AccentKey = "none" | "sky" | "emerald" | "amber" | "fuchsia";

const SECTION_ACCENT: Record<SectionKey, AccentKey> = {
  product: "sky",
  engineering: "none",
  security: "amber",
  operations: "fuchsia",
  troubleshooting: "emerald",
  foundations: "none",
  notes: "none",
};

// Literal class strings (Tailwind JIT can't see dynamically-built names).
const ACCENT: Record<AccentKey, { header: string; itemBase: string; active: string; inactive: string }> = {
  none: {
    header: "text-[var(--lg-text-muted)]",
    itemBase: "",
    active: "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]",
    inactive: "text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]",
  },
  sky: {
    header: "text-sky-400",
    itemBase: "border-l-2",
    active: "bg-sky-500/10 text-sky-300 border-sky-400",
    inactive: "border-sky-500/30 text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]",
  },
  emerald: {
    header: "text-emerald-400",
    itemBase: "border-l-2",
    active: "bg-emerald-500/10 text-emerald-300 border-emerald-400",
    inactive: "border-emerald-500/30 text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]",
  },
  amber: {
    header: "text-amber-400",
    itemBase: "border-l-2",
    active: "bg-amber-500/10 text-amber-300 border-amber-400",
    inactive: "border-amber-500/30 text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]",
  },
  fuchsia: {
    header: "text-fuchsia-400",
    itemBase: "border-l-2",
    active: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-400",
    inactive: "border-fuchsia-500/30 text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]",
  },
};

/* ── Simple markdown renderer ───────────────────────────────────── */

function renderMarkdown(raw: string): React.ReactNode {
  const lines = raw.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = "";

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
        i++;
        continue;
      } else {
        inCodeBlock = false;
        elements.push(
          <pre key={i} className="bg-[var(--lg-tint)] rounded-md p-3 overflow-x-auto text-xs my-2 border border-[var(--lg-border-faint)]">
            <code className="text-[var(--lg-text-secondary)]">{codeLines.join("\n")}</code>
          </pre>
        );
        i++;
        continue;
      }
    }
    if (inCodeBlock) {
      codeLines.push(line);
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-xl font-semibold text-[var(--lg-text-primary)] mt-6 mb-2">{inlineFormat(line.slice(2))}</h1>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-semibold text-[var(--lg-text-primary)] mt-5 mb-2 border-b border-[var(--lg-border-faint)] pb-1">{inlineFormat(line.slice(3))}</h2>);
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-medium text-[var(--lg-text-primary)] mt-4 mb-1">{inlineFormat(line.slice(4))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("#### ")) {
      elements.push(<h4 key={i} className="text-sm font-medium text-[var(--lg-text-primary)] mt-3 mb-1">{inlineFormat(line.slice(5))}</h4>);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-[var(--lg-border-faint)] my-4" />);
      i++;
      continue;
    }

    // Checkbox list items
    if (/^\s*- \[[ x]\] /.test(line)) {
      const checked = line.includes("[x]");
      const text = line.replace(/^\s*- \[[ x]\] /, "");
      elements.push(
        <div key={i} className="flex items-start gap-2 text-sm text-[var(--lg-text-secondary)] my-0.5 pl-2">
          <span className={`mt-0.5 ${checked ? "text-emerald-400" : "text-[var(--lg-text-muted)]"}`}>
            {checked ? "✓" : "○"}
          </span>
          <span className={checked ? "line-through opacity-60" : ""}>{inlineFormat(text)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Bullet list items
    if (/^\s*[-*] /.test(line)) {
      const indent = (line.match(/^\s*/)?.[0].length || 0) / 2;
      const text = line.replace(/^\s*[-*] /, "");
      elements.push(
        <div key={i} className="flex items-start gap-2 text-sm text-[var(--lg-text-secondary)] my-0.5" style={{ paddingLeft: `${indent * 16 + 8}px` }}>
          <span className="text-[var(--lg-text-muted)] mt-1.5 w-1 h-1 rounded-full bg-[var(--lg-text-muted)] shrink-0" />
          <span>{inlineFormat(text)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Numbered list items
    if (/^\s*\d+\.\s/.test(line)) {
      const num = line.match(/^\s*(\d+)\./)?.[1];
      const text = line.replace(/^\s*\d+\.\s/, "");
      elements.push(
        <div key={i} className="flex items-start gap-2 text-sm text-[var(--lg-text-secondary)] my-0.5 pl-2">
          <span className="text-[var(--lg-text-muted)] font-medium shrink-0 w-4 text-right">{num}.</span>
          <span>{inlineFormat(text)}</span>
        </div>
      );
      i++;
      continue;
    }

    // Tables
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) => row.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
        const headers = parseRow(tableLines[0]);
        // Skip separator row
        const dataRows = tableLines.slice(2).map(parseRow);
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-3">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--lg-border-faint)]">
                  {headers.map((h, hi) => (
                    <th key={hi} className="text-left py-1.5 px-2 text-[var(--lg-text-muted)] font-medium">{inlineFormat(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, ri) => (
                  <tr key={ri} className="border-b border-[var(--lg-border-faint)]/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="py-1.5 px-2 text-[var(--lg-text-secondary)]">{inlineFormat(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <div key={i} className="border-l-2 border-[var(--lg-accent)] pl-3 my-2 text-sm text-[var(--lg-text-secondary)] italic">
          {inlineFormat(line.slice(2))}
        </div>
      );
      i++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={i} className="text-sm text-[var(--lg-text-secondary)] my-1.5">{inlineFormat(line)}</p>
    );
    i++;
  }

  return <>{elements}</>;
}

/** Inline formatting: bold, italic, code, links */
function inlineFormat(text: string): React.ReactNode {
  // Process inline patterns: **bold**, *italic*, `code`, [link](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold", index: boldMatch.index!, length: boldMatch[0].length, content: boldMatch[1] } : null,
      codeMatch ? { type: "code", index: codeMatch.index!, length: codeMatch[0].length, content: codeMatch[1] } : null,
      linkMatch ? { type: "link", index: linkMatch.index!, length: linkMatch[0].length, content: linkMatch[1], url: linkMatch[2] } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const match = matches[0]!;
    if (match.index > 0) {
      parts.push(remaining.slice(0, match.index));
    }

    if (match.type === "bold") {
      parts.push(<strong key={key++} className="font-semibold text-[var(--lg-text-primary)]">{match.content}</strong>);
    } else if (match.type === "code") {
      parts.push(<code key={key++} className="text-xs bg-[var(--lg-tint)] px-1 py-0.5 rounded text-[var(--lg-accent)]">{match.content}</code>);
    } else if (match.type === "link") {
      parts.push(<span key={key++} className="text-[var(--lg-accent)] underline">{match.content}</span>);
    }

    remaining = remaining.slice(match.index + match.length);
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}

/* ── Component ──────────────────────────────────────────────────── */

export default function Docs() {
  const [activeDoc, setActiveDoc] = useState<string>("CLAUDE.md");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const groups = useMemo(() => groupBySection(searchDocs(docs, search)), [search]);
  const matchCount = useMemo(() => searchDocs(docs, search).length, [search]);

  const currentDoc = docs.find(d => d.path === activeDoc);
  const lineCount = currentDoc ? currentDoc.content.split("\n").length : 0;
  const charCount = currentDoc ? currentDoc.content.length : 0;

  return (
    <div className="flex h-[calc(100svh-64px)]">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-80" : "w-0"} transition-all duration-200 overflow-y-auto border-r border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] flex-shrink-0`}>
        <div className="p-4 space-y-5 w-80">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--lg-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, ID, or path…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] focus:outline-none focus:border-[var(--lg-accent)]"
            />
          </div>

          {search && (
            <p className="text-[10px] text-[var(--lg-text-muted)] -mt-2">
              {matchCount} of {docs.length} {matchCount === 1 ? "doc" : "docs"}
            </p>
          )}

          {/* Sections — grouped by the QUESTION a reader is asking, not by folder */}
          {groups.map(({ meta, docs: items }) => {
            const acc = ACCENT[SECTION_ACCENT[meta.key]];
            const HeaderIcon = SECTION_ICON[meta.key];
            return (
              <div key={meta.key}>
                <h3 className={`text-[10px] font-semibold uppercase tracking-wider ${acc.header} flex items-center gap-1`}>
                  <HeaderIcon className="w-3 h-3" /> {meta.label}
                  <span className="opacity-50">({items.length})</span>
                </h3>
                <p className="text-[10px] text-[var(--lg-text-muted)] mb-2 mt-0.5 leading-snug">{meta.blurb}</p>
                <div className="space-y-0.5">
                  {items.map((doc) => {
                    const isActive = doc.path === activeDoc;
                    return (
                      <button
                        key={doc.path}
                        onClick={() => setActiveDoc(doc.path)}
                        title={`${doc.id ? doc.id + " — " : ""}${doc.title}\n${doc.path}`}
                        className={`w-full text-left px-2.5 py-2 rounded-md text-xs flex items-start gap-2 transition-colors ${acc.itemBase} ${isActive ? acc.active : acc.inactive}`}
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {doc.id && (
                              <span className="text-[9px] font-mono text-[var(--lg-text-muted)] shrink-0">{doc.id}</span>
                            )}
                            <span className="font-medium truncate">{doc.title}</span>
                          </div>
                          {doc.badges.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {doc.badges.map((b) => <BadgeChip key={b.label} badge={b} />)}
                            </div>
                          )}
                          <div className="text-[10px] text-[var(--lg-text-muted)] truncate mt-0.5">{doc.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {/* Toolbar */}
        <div className="sticky top-0 z-10 bg-[var(--lg-bg-page)] border-b border-[var(--lg-border-faint)] px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-[var(--lg-tint)] text-[var(--lg-text-muted)]"
            >
              {sidebarOpen ? <ChevronDown className="w-4 h-4 rotate-90" /> : <ChevronUp className="w-4 h-4 rotate-90" />}
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-[var(--lg-text-muted)] shrink-0" />
              <span className="text-sm font-medium text-[var(--lg-text-primary)] truncate" title={currentDoc?.path}>
                {currentDoc?.path}
              </span>
              {currentDoc?.badges.map((b) => <BadgeChip key={b.label} badge={b} />)}
              {currentDoc?.generated && (
                <span
                  title="Generated by npm run docs:refresh — hand edits are destroyed on the next run."
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wide border bg-[var(--lg-tint)] text-[var(--lg-text-muted)] border-[var(--lg-border-faint)] shrink-0"
                >
                  generated
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-[var(--lg-text-muted)]">
            <span>{lineCount} lines</span>
            <span>{(charCount / 1024).toFixed(1)} KB</span>
            <Link
              to="/roadmap"
              className="text-[var(--lg-accent)] hover:underline flex items-center gap-1"
            >
              Roadmap <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Doc content */}
        <div className="px-6 py-6 md:px-10 md:py-8 max-w-4xl">
          {currentDoc ? renderMarkdown(currentDoc.content) : (
            <p className="text-sm text-[var(--lg-text-muted)]">Select a document from the sidebar.</p>
          )}
        </div>
      </div>
    </div>
  );
}
