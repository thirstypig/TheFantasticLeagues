/**
 * docsIndex — pure logic behind the /docs board.
 *
 * No React, no globs, no I/O: this module takes `{ path, raw }` pairs and produces the
 * indexed, sectioned doc list. That keeps every rule below unit-testable, which matters
 * because these rules fail SILENTLY — a mis-parsed title or a doc filed into the wrong
 * section looks fine and is simply wrong.
 *
 * Convention reference: docs/README-DOCS.md
 */

/* ── frontmatter ──────────────────────────────────────────────────── */

export interface Frontmatter {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  status?: string;
  feature_status?: string;
  phase?: string;
  owner?: string;
  tags?: string[];
  links?: string[];
  updated?: string;
}

const FM_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const UNQUOTE = /^["']|["']$/g;

/** Minimal YAML subset: `key: value`, plus `[a, b]` inline lists. Enough for our schema. */
export function parseFrontmatter(raw: string): { fm: Frontmatter | null; body: string } {
  const m = raw.match(FM_BLOCK);
  if (!m) return { fm: null, body: raw };

  const fm: Record<string, unknown> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      fm[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(UNQUOTE, ""))
        .filter(Boolean);
    } else {
      fm[key] = value.replace(UNQUOTE, "");
    }
  }
  return { fm: fm as Frontmatter, body: raw.slice(m[0].length) };
}

/* ── title extraction ─────────────────────────────────────────────── */

/**
 * Remove fenced code blocks before scanning for an H1.
 *
 * This is load-bearing, not defensive. Five docs in this repo have a `#` comment inside a
 * bash fence before their first real heading — without this, `untyped-fetch-wrapper-api-
 * contracts.md` is titled "✓ No errors" in the sidebar. Currently masked because those
 * docs carry a frontmatter title; it bites the first doc that doesn't.
 */
export function stripCodeFences(body: string): string {
  return body.replace(/^[ \t]*(`{3,}|~{3,})[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
}

/** "docs/product/feature-intake-rules.md" → "Feature intake rules" */
export function tidyFilename(path: string): string {
  const base = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
  const words = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Precedence: frontmatter `title` → first H1 outside a code fence → tidied filename. */
export function extractTitle(path: string, raw: string): string {
  const { fm, body } = parseFrontmatter(raw);
  if (fm?.title) return fm.title;

  const h1 = stripCodeFences(body).match(/^#[ \t]+(.+?)[ \t]*$/m);
  if (h1) return h1[1].replace(/\s*#+\s*$/, "").trim();

  return tidyFilename(path);
}

/** Frontmatter `description` → first substantive prose line → "". */
export function extractDescription(raw: string): string {
  const { fm, body } = parseFrontmatter(raw);
  let out = fm?.description ?? "";

  if (!out) {
    for (const line of stripCodeFences(body).split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("#") || t.startsWith("---") || t.startsWith(">") || t.startsWith("|")) continue;
      if (t.startsWith("<!--")) continue;
      out = t;
      break;
    }
  }
  out = out.replace(/[*_`]/g, "");
  return out.length > 140 ? out.slice(0, 137) + "…" : out;
}

/* ── sections: organised by the QUESTION a reader is asking ───────── */

export type SectionKey =
  | "product"
  | "engineering"
  | "security"
  | "operations"
  | "troubleshooting"
  | "foundations"
  | "notes";

export interface SectionMeta {
  key: SectionKey;
  label: string;
  /** One-line purpose blurb rendered under the section header. */
  blurb: string;
}

/** Order: most-referenced first, foundations near the bottom. */
export const SECTIONS: SectionMeta[] = [
  { key: "product", label: "Product", blurb: "What we're building, and why." },
  { key: "engineering", label: "Engineering", blurb: "How it's built — architecture, decisions, APIs, tests." },
  { key: "security", label: "Security", blurb: "Posture, privacy, and the open risks — honest about gaps." },
  { key: "operations", label: "Operations", blurb: "How it's doing and how to run it — metrics, costs, runbooks." },
  { key: "troubleshooting", label: "Troubleshooting", blurb: "This broke before. Here's what it was." },
  { key: "foundations", label: "Foundations", blurb: "Terms, conventions, guides, and the design system." },
  { key: "notes", label: "Notes", blurb: "Scratchpad. Nothing here is authoritative." },
];

/** `type` → section. Filing is by INTENT, not by folder. */
const TYPE_SECTION: Record<string, SectionKey> = {
  prd: "product",
  "launch-spec": "product",
  "intake-rules": "product",
  roadmap: "product",
  todos: "product",
  experiment: "product",

  adr: "engineering",
  "tech-spec": "engineering",
  "api-docs": "engineering",
  "decision-log": "engineering",
  testing: "engineering",
  "component-lib": "engineering",

  privacy: "security",
  risk: "security",

  stats: "operations",
  costs: "operations",
  status: "operations",
  runbook: "operations",
  changelog: "operations",
  inbox: "operations",

  solution: "troubleshooting",

  glossary: "foundations",
  guide: "foundations",
  doc: "foundations",
  report: "foundations",

  note: "notes",
  plan: "notes",
  brainstorm: "notes",
};

/**
 * Path-prefix overrides for the exceptions — kept deliberately SHORT. If this map starts
 * growing, the docs need frontmatter, not more special cases here.
 */
const PATH_SECTION: [string, SectionKey][] = [
  ["docs/solutions/", "troubleshooting"],
  ["docs/runbooks/", "operations"],
  ["docs/reports/", "operations"],
  ["docs/under-the-hood/", "operations"],
  ["docs/product/", "product"],
  ["docs/engineering/", "engineering"],
  ["docs/guides/", "foundations"],
  ["docs/learnings/", "troubleshooting"],
];

const SECURITY_PATHS = ["docs/SECURITY.md", "docs/privacy", "docs/AUTH_SETUP.md"];

export function sectionFor(path: string, fm: Frontmatter | null): SectionKey {
  // 1. explicit type wins
  if (fm?.type && TYPE_SECTION[fm.type]) return TYPE_SECTION[fm.type];
  // 2. security is path-flagged (these predate the schema)
  if (SECURITY_PATHS.some((p) => path.startsWith(p))) return "security";
  // 3. path override
  for (const [prefix, key] of PATH_SECTION) if (path.startsWith(prefix)) return key;
  // 4. root docs (CLAUDE.md, README.md…) are foundations
  return "foundations";
}

/* ── exclusions ───────────────────────────────────────────────────── */

/** Templates must never render as docs. Git-ignored files never reach the glob. */
export function isExcluded(path: string): boolean {
  return path.startsWith("docs/_templates/") || path.split("/").pop()?.startsWith("_") === true;
}

/* ── badges ───────────────────────────────────────────────────────── */

export type BadgeTone = "neutral" | "good" | "warn" | "muted" | "info";

export interface Badge {
  label: string;
  tone: BadgeTone;
  title: string;
}

const STATUS_BADGE: Record<string, Badge> = {
  draft: { label: "draft", tone: "warn", title: "Being written — do not rely on it" },
  active: { label: "active", tone: "good", title: "Current and trustworthy" },
  locked: { label: "locked", tone: "info", title: "Frozen by process — changing it requires the intake gate" },
  done: { label: "done", tone: "muted", title: "The work this describes is complete" },
  deprecated: { label: "deprecated", tone: "muted", title: "Superseded or wrong — see the forward link" },
};

const FEATURE_BADGE: Record<string, Badge> = {
  shipped: { label: "shipped", tone: "good", title: "This feature exists in production" },
  "in-progress": { label: "in progress", tone: "info", title: "Being built now" },
  planned: { label: "planned", tone: "warn", title: "Not built yet" },
  abandoned: { label: "abandoned", tone: "muted", title: "Started and dropped" },
};

/** Doc status first, then — for PRDs only — the feature's own status. */
export function badgesFor(fm: Frontmatter | null): Badge[] {
  if (!fm) return [];
  const out: Badge[] = [];
  if (fm.status && STATUS_BADGE[fm.status]) out.push(STATUS_BADGE[fm.status]);
  if (fm.type === "prd" && fm.feature_status && FEATURE_BADGE[fm.feature_status]) {
    out.push(FEATURE_BADGE[fm.feature_status]);
  }
  return out;
}

/* ── index ────────────────────────────────────────────────────────── */

export interface DocEntry {
  path: string;
  title: string;
  description: string;
  content: string;
  section: SectionKey;
  id?: string;
  type?: string;
  status?: string;
  featureStatus?: string;
  tags: string[];
  badges: Badge[];
  generated: boolean;
}

const GENERATED_TYPES = new Set(["stats", "costs", "status", "inbox"]);

export function buildIndex(files: { path: string; raw: string }[]): DocEntry[] {
  return files
    .filter((f) => !isExcluded(f.path))
    .map(({ path, raw }) => {
      const { fm } = parseFrontmatter(raw);
      return {
        path,
        title: extractTitle(path, raw),
        description: extractDescription(raw),
        content: raw,
        section: sectionFor(path, fm),
        id: fm?.id,
        type: fm?.type,
        status: fm?.status,
        featureStatus: fm?.feature_status,
        tags: fm?.tags ?? [],
        badges: badgesFor(fm),
        generated: !!(fm?.type && GENERATED_TYPES.has(fm.type)),
      };
    })
    .sort((a, b) => (a.id && b.id ? a.id.localeCompare(b.id) : a.title.localeCompare(b.title)));
}

/** Search over title, id, and path — the three things people actually remember. */
export function searchDocs(docs: DocEntry[], query: string): DocEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      (d.id?.toLowerCase().includes(q) ?? false) ||
      d.path.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q),
  );
}

export function groupBySection(docs: DocEntry[]): { meta: SectionMeta; docs: DocEntry[] }[] {
  return SECTIONS.map((meta) => ({ meta, docs: docs.filter((d) => d.section === meta.key) })).filter(
    (g) => g.docs.length > 0,
  );
}
