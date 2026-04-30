import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  FolderOpen,
  ArrowRight,
  Search,
  BookOpen,
  Shield,
  Terminal,
  Database,
  Layers,
  Settings,
  History,
  Palette,
  ClipboardList,
} from "lucide-react";

/* ── Static markdown imports via Vite ───────────────────────────── */

// Root-level docs
import claudeMd from "../../../CLAUDE.md?raw";
import readmeMd from "../../../README.md?raw";
import feedbackMd from "../../../FEEDBACK.md?raw";

// docs/ directory
import howto from "../../../docs/howto.md?raw";
import decisions from "../../../docs/decisions.md?raw";
import security from "../../../docs/SECURITY.md?raw";
import mcpPlan from "../../../docs/MCP-MLB-API-PLAN.md?raw";
import dataSchema from "../../../docs/data-schema.md?raw";
import displayRules from "../../../docs/display-rules.md?raw";
import archiveStandards from "../../../docs/archive_standards.md?raw";
import devNotes from "../../../docs/DEV_NOTES.md?raw";
import authSetup from "../../../docs/AUTH_SETUP.md?raw";
import historicalMapping from "../../../docs/HistoricalTeamMapping.md?raw";
import projectSwitching from "../../../docs/Project_Switching_Guide.md?raw";
import audit from "../../../docs/AUDIT-2026-03-19.md?raw";
import prismaV2 from "../../../docs/prisma_v2_draft.md?raw";
import planAuth from "../../../docs/PLAN-AUTH-MEMBERS.md?raw";
import roadmapDoc from "../../../docs/ROADMAP.md?raw";
import auroraDesignSystem from "../../../docs/aurora-design-system.md?raw";

// docs/plans/ — active proposals awaiting review
import planYahooRosterMoves from "../../../docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md?raw";

/* ── Doc registry ───────────────────────────────────────────────── */

interface DocEntry {
  name: string;
  filename: string;
  content: string;
  category: "root" | "docs" | "proposal";
  icon: React.ElementType;
  description: string;
}

const docs: DocEntry[] = [
  // Root-level
  { name: "CLAUDE.md", filename: "CLAUDE.md", content: claudeMd, category: "root", icon: Terminal, description: "Project conventions, architecture, and coding guidelines" },
  { name: "README.md", filename: "README.md", content: readmeMd, category: "root", icon: BookOpen, description: "Project overview and getting started" },
  { name: "FEEDBACK.md", filename: "FEEDBACK.md", content: feedbackMd, category: "root", icon: History, description: "Session-by-session development log" },
  // docs/ directory
  { name: "Aurora Design System", filename: "docs/aurora-design-system.md", content: auroraDesignSystem, category: "docs", icon: Palette, description: "Style sheet — colors, typography, atoms, tables, spacing, motion" },
  { name: "How-To Guides", filename: "docs/howto.md", content: howto, category: "docs", icon: BookOpen, description: "Step-by-step guides for common tasks" },
  { name: "Architecture Decisions", filename: "docs/decisions.md", content: decisions, category: "docs", icon: Layers, description: "Why behind key architectural choices" },
  { name: "Security Architecture", filename: "docs/SECURITY.md", content: security, category: "docs", icon: Shield, description: "Auth, authorization, and security patterns" },
  { name: "MCP MLB API Plan", filename: "docs/MCP-MLB-API-PLAN.md", content: mcpPlan, category: "docs", icon: Database, description: "MLB Data Proxy MCP server design" },
  { name: "Data Schema", filename: "docs/data-schema.md", content: dataSchema, category: "docs", icon: Database, description: "JSON schemas for stats worker and API" },
  { name: "Display Rules", filename: "docs/display-rules.md", content: displayRules, category: "docs", icon: Settings, description: "Team and player display conventions" },
  { name: "Archive Standards", filename: "docs/archive_standards.md", content: archiveStandards, category: "docs", icon: FileText, description: "Historical player data validation rules" },
  { name: "Dev Notes", filename: "docs/DEV_NOTES.md", content: devNotes, category: "docs", icon: Terminal, description: "Change tracking and workflow notes" },
  { name: "Auth Setup", filename: "docs/AUTH_SETUP.md", content: authSetup, category: "docs", icon: Shield, description: "OAuth provider configuration" },
  { name: "Historical Team Mapping", filename: "docs/HistoricalTeamMapping.md", content: historicalMapping, category: "docs", icon: History, description: "Automated player-to-team mapping logic" },
  { name: "Project Switching", filename: "docs/Project_Switching_Guide.md", content: projectSwitching, category: "docs", icon: FolderOpen, description: "Switching between FBST and other projects" },
  { name: "Codebase Audit (Mar 2026)", filename: "docs/AUDIT-2026-03-19.md", content: audit, category: "docs", icon: Layers, description: "Full-stack codebase audit from Session 26" },
  { name: "Prisma v2 Draft", filename: "docs/prisma_v2_draft.md", content: prismaV2, category: "docs", icon: Database, description: "Future schema redesign draft" },
  { name: "Auth + Members Plan", filename: "docs/PLAN-AUTH-MEMBERS.md", content: planAuth, category: "docs", icon: Shield, description: "Auth fixes and commissioner member management" },
  { name: "Legacy Roadmap", filename: "docs/ROADMAP.md", content: roadmapDoc, category: "docs", icon: Settings, description: "Historical security & quality roadmap" },
  // docs/plans/ — active proposals awaiting review
  { name: "Yahoo-Style Roster Moves", filename: "docs/plans/2026-04-29-yahoo-style-roster-moves-plan.md", content: planYahooRosterMoves, category: "proposal", icon: ClipboardList, description: "⚠️ v3 design pending — pivot approved, 5 refinements (consolidated table+stats, no modals, GP numbers). See §0.5" },
];

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

  const rootDocs = docs.filter(d => d.category === "root");
  const dirDocs = docs.filter(d => d.category === "docs");
  const proposalDocs = docs.filter(d => d.category === "proposal");

  const filteredDocs = useMemo(() => {
    if (!search) return docs;
    const q = search.toLowerCase();
    return docs.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.filename.toLowerCase().includes(q)
    );
  }, [search]);

  const currentDoc = docs.find(d => d.filename === activeDoc);
  const lineCount = currentDoc ? currentDoc.content.split("\n").length : 0;
  const charCount = currentDoc ? currentDoc.content.length : 0;

  return (
    <div className="flex h-[calc(100svh-64px)]">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? "w-72" : "w-0"} transition-all duration-200 overflow-hidden border-r border-[var(--lg-border-faint)] bg-[var(--lg-bg-card)] flex-shrink-0`}>
        <div className="p-4 space-y-4 w-72">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[var(--lg-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search docs..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-[var(--lg-tint)] border border-[var(--lg-border-faint)] text-[var(--lg-text-primary)] placeholder:text-[var(--lg-text-muted)] focus:outline-none focus:border-[var(--lg-accent)]"
            />
          </div>

          {/* Root docs */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lg-text-muted)] mb-2">
              Project Root
            </h3>
            <div className="space-y-0.5">
              {(search ? filteredDocs.filter(d => d.category === "root") : rootDocs).map(doc => {
                const Icon = doc.icon;
                const isActive = doc.filename === activeDoc;
                return (
                  <button
                    key={doc.filename}
                    onClick={() => setActiveDoc(doc.filename)}
                    className={`w-full text-left px-2.5 py-2 rounded-md text-xs flex items-center gap-2 transition-colors ${
                      isActive
                        ? "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]"
                        : "text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{doc.name}</div>
                      <div className="text-[10px] text-[var(--lg-text-muted)] truncate">{doc.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active proposals awaiting review */}
          {((search ? filteredDocs.filter(d => d.category === "proposal") : proposalDocs).length > 0) && (
            <div>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1">
                <ClipboardList className="w-3 h-3" /> Active Proposals
              </h3>
              <div className="space-y-0.5">
                {(search ? filteredDocs.filter(d => d.category === "proposal") : proposalDocs).map(doc => {
                  const Icon = doc.icon;
                  const isActive = doc.filename === activeDoc;
                  return (
                    <button
                      key={doc.filename}
                      onClick={() => setActiveDoc(doc.filename)}
                      className={`w-full text-left px-2.5 py-2 rounded-md text-xs flex items-center gap-2 transition-colors border-l-2 ${
                        isActive
                          ? "bg-amber-500/10 text-amber-300 border-amber-400"
                          : "border-amber-500/40 text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{doc.name}</div>
                        <div className="text-[10px] text-[var(--lg-text-muted)] truncate">{doc.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* docs/ directory */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--lg-text-muted)] mb-2 flex items-center gap-1">
              <FolderOpen className="w-3 h-3" /> docs/
            </h3>
            <div className="space-y-0.5">
              {(search ? filteredDocs.filter(d => d.category === "docs") : dirDocs).map(doc => {
                const Icon = doc.icon;
                const isActive = doc.filename === activeDoc;
                return (
                  <button
                    key={doc.filename}
                    onClick={() => setActiveDoc(doc.filename)}
                    className={`w-full text-left px-2.5 py-2 rounded-md text-xs flex items-center gap-2 transition-colors ${
                      isActive
                        ? "bg-[var(--lg-accent)]/10 text-[var(--lg-accent)]"
                        : "text-[var(--lg-text-secondary)] hover:bg-[var(--lg-tint)] hover:text-[var(--lg-text-primary)]"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{doc.name}</div>
                      <div className="text-[10px] text-[var(--lg-text-muted)] truncate">{doc.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
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
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[var(--lg-text-muted)]" />
              <span className="text-sm font-medium text-[var(--lg-text-primary)]">
                {currentDoc?.filename}
              </span>
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
