#!/usr/bin/env node
/**
 * sync-inbox — regenerates docs/INBOX.md from the open comments on docs.
 *
 *   node scripts/sync-inbox.mjs
 *   node scripts/sync-inbox.mjs --check    # exit 1 if INBOX.md is stale (for CI)
 *
 * Ordering is deliberate: change_request first (a doc is actively WRONG), then question,
 * then note. Newest first inside each group. See docs/README-DOCS.md §8 for the model.
 *
 * INBOX.md is GENERATED. Hand edits are destroyed on the next run.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODO(james): point this at the real data source.
 *
 * Today it reads a local stub at docs/_comments.json. When the admin board persists
 * comments, this project's stack (Prisma + PostgreSQL on Supabase) means the swap is:
 *
 *   1. Add a `DocComment` model to prisma/schema.prisma with the fields in
 *      docs/README-DOCS.md §8 (id, doc, path, anchor, kind, status, author, createdAt,
 *      resolutionNote, resolutionLink, resolvedAt, resolvedBy).
 *   2. Replace loadComments() below with a Prisma query. Everything downstream — grouping,
 *      ordering, rendering — is already source-agnostic and needs no changes.
 *   3. Mind WHICH DATABASE you point at: server/.env is LOCAL, server/.env.local is a
 *      separate cloud project, and PROD lives only in Railway env. See CLAUDE.md.
 *
 * Keep the stub working as a fallback so the loop is testable offline.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(REPO_ROOT, "docs", "_comments.json");
const OUT = join(REPO_ROOT, "docs", "INBOX.md");

const CHECK = process.argv.includes("--check");

/* ── ordering ─────────────────────────────────────────────────────── */

const KIND_ORDER = ["change_request", "question", "note"];

const KIND_META = {
  change_request: {
    heading: "Change requests",
    blurb: "The doc is wrong or must change. **Act on these first** — edit the doc.",
  },
  question: {
    heading: "Questions",
    blurb: "Someone needs information the doc doesn't give. Answer it — usually by putting the answer *in* the doc.",
  },
  note: {
    heading: "Notes",
    blurb: "An observation, no action implied. Acknowledge and resolve. Recurring notes signal a real gap.",
  },
};

const STATUS_BADGE = { open: "open", in_review: "in review", resolved: "resolved" };

/* ── load ─────────────────────────────────────────────────────────── */

function loadComments() {
  if (!existsSync(SOURCE)) {
    console.error(`No comment source found at docs/_comments.json.`);
    console.error(`Create it, or wire this script to the real source (see the TODO at the top).`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(SOURCE, "utf8"));
  if (!Array.isArray(raw.comments)) {
    console.error(`docs/_comments.json has no "comments" array.`);
    process.exit(1);
  }
  return raw.comments;
}

/* ── validate ─────────────────────────────────────────────────────── */

function validate(comments) {
  const problems = [];
  const seen = new Set();

  for (const c of comments) {
    const at = c.id || "(no id)";
    if (!c.id) problems.push(`comment with no id (on ${c.path ?? "?"})`);
    else if (seen.has(c.id)) problems.push(`${at}: duplicate id`);
    else seen.add(c.id);

    if (!KIND_ORDER.includes(c.kind)) problems.push(`${at}: unknown kind "${c.kind}"`);
    if (!Object.keys(STATUS_BADGE).includes(c.status)) problems.push(`${at}: unknown status "${c.status}"`);
    if (!c.created || Number.isNaN(Date.parse(c.created))) problems.push(`${at}: missing or unparseable "created"`);

    // The rule that keeps the loop honest: resolved REQUIRES a note and a link.
    if (c.status === "resolved") {
      if (!c.resolution) problems.push(`${at}: status "resolved" with no resolution block`);
      else {
        if (!c.resolution.note) problems.push(`${at}: resolution has no note`);
        if (!c.resolution.link) problems.push(`${at}: resolution has no link — "I fixed it" without a link is not a resolution`);
      }
    }
  }
  return problems;
}

/* ── render ───────────────────────────────────────────────────────── */

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
const day = (iso) => new Date(iso).toISOString().slice(0, 10);

function render(comments) {
  const openish = comments.filter((c) => c.status !== "resolved");
  const resolved = comments.filter((c) => c.status === "resolved");

  const byKind = new Map(KIND_ORDER.map((k) => [k, []]));
  for (const c of openish) byKind.get(c.kind)?.push(c);
  for (const list of byKind.values()) list.sort((a, b) => Date.parse(b.created) - Date.parse(a.created));

  const counts = KIND_ORDER.map((k) => `${byKind.get(k).length} ${KIND_META[k].heading.toLowerCase()}`).join(" · ");

  const L = [];
  L.push("---");
  L.push("id: DOC-020");
  L.push('title: "Comment inbox"');
  L.push('description: "Open comments on docs, newest first, change requests pinned to the top. Generated — do not hand-edit."');
  L.push("type: inbox");
  L.push("status: active");
  L.push("phase: null");
  L.push("owner: james");
  L.push("tags: [docs-system]");
  L.push("links: [DOC-001]");
  L.push(`updated: ${day(new Date().toISOString())}`);
  L.push("---");
  L.push("");
  L.push("# Comment inbox");
  L.push("");
  L.push("<!-- GENERATED by scripts/sync-inbox.mjs — hand edits are destroyed on the next run. -->");
  L.push("");
  L.push(`**${openish.length} open** — ${counts}. ${resolved.length} resolved.`);
  L.push("");
  L.push("> **The session ritual.** Read this file at the start of a session. Act on change");
  L.push("> requests, answer questions, then write a resolution (`status → resolved`, note +");
  L.push("> link) in `docs/_comments.json` so the item clears. Regenerate with");
  L.push("> `node scripts/sync-inbox.mjs`.");
  L.push("");
  L.push("A comment cannot be resolved without a **link** — a commit SHA, a PR number, or the");
  L.push("doc id where the answer now lives. This script enforces that.");
  L.push("");

  if (openish.length === 0) {
    L.push("---");
    L.push("");
    L.push("**Inbox clear.** Nothing open.");
    L.push("");
  }

  for (const kind of KIND_ORDER) {
    const items = byKind.get(kind);
    if (!items.length) continue;
    const meta = KIND_META[kind];

    L.push("---");
    L.push("");
    L.push(`## ${meta.heading} (${items.length})`);
    L.push("");
    L.push(meta.blurb);
    L.push("");

    for (const c of items) {
      const where = c.anchor ? ` · ${esc(c.anchor)}` : "";
      L.push(`### \`${c.id}\` — ${esc(c.doc)}${where}`);
      L.push("");
      L.push(`*${day(c.created)} · ${esc(c.author)} · **${STATUS_BADGE[c.status]}***`);
      L.push("");
      L.push(esc(c.body));
      L.push("");
      L.push(`<sub>[\`${c.path}\`](${relLink(c.path)})</sub>`);
      L.push("");
    }
  }

  if (resolved.length) {
    L.push("---");
    L.push("");
    L.push(`## Resolved (${resolved.length})`);
    L.push("");
    L.push("Kept visible on purpose. A resolution you can't find is a resolution you can't trust.");
    L.push("");
    L.push("| ID | Doc | Resolved | By | Resolution | Link |");
    L.push("|---|---|---|---|---|---|");
    resolved
      .sort((a, b) => Date.parse(b.resolution.resolvedAt ?? b.created) - Date.parse(a.resolution.resolvedAt ?? a.created))
      .forEach((c) => {
        L.push(
          `| \`${c.id}\` | ${esc(c.doc)} | ${day(c.resolution.resolvedAt ?? c.created)} | ${esc(c.resolution.resolvedBy)} | ${esc(c.resolution.note)} | ${esc(c.resolution.link)} |`,
        );
      });
    L.push("");
  }

  L.push("---");
  L.push("");
  L.push("<sub>Source: `docs/_comments.json` (local stub). Model: `docs/README-DOCS.md` §8.</sub>");
  L.push("");

  return L.join("\n");
}

/** docs/INBOX.md → a path relative to docs/ */
function relLink(p) {
  return p.startsWith("docs/") ? p.slice("docs/".length) : "../" + p;
}

/* ── main ─────────────────────────────────────────────────────────── */

const comments = loadComments();

const problems = validate(comments);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s) in docs/_comments.json:\n`);
  problems.forEach((p) => console.error("  " + p));
  console.error("");
  process.exit(1);
}

const next = render(comments);

if (CHECK) {
  const prev = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (prev !== next) {
    console.error("✗ docs/INBOX.md is stale. Run: node scripts/sync-inbox.mjs");
    process.exit(1);
  }
  console.log("✓ docs/INBOX.md is up to date.");
  process.exit(0);
}

writeFileSync(OUT, next);

const open = comments.filter((c) => c.status !== "resolved");
const cr = open.filter((c) => c.kind === "change_request").length;
console.log(`✓ docs/INBOX.md written — ${open.length} open (${cr} change request${cr === 1 ? "" : "s"}), ${comments.length - open.length} resolved.`);
