#!/usr/bin/env node
/**
 * refresh-docs — regenerates the LIVING docs from real data.
 *
 *   npm run docs:refresh
 *   node scripts/refresh-docs.mjs --check    # exit 1 if any generated doc is stale (for CI)
 *
 * Writes:
 *   docs/under-the-hood/stats.md          repo + docs metrics
 *   docs/under-the-hood/costs.md          unit economics from docs/costs.config.json
 *   docs/under-the-hood/system-status.md  env-key configuration (names only, NEVER values)
 *   README.md, CLAUDE.md                  the block between DOCS:STATUS markers, in place
 *
 * Run this before every push. All four outputs are GENERATED — hand edits are destroyed.
 * Read-only with respect to application code.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
// execFileSync (not execSync): no shell is spawned, so nothing here can be shell-interpreted.
// Every invocation below uses a fixed argv array with no interpolated input.
import { execFileSync } from "node:child_process";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const TODAY = new Date().toISOString().slice(0, 10);

const P = (...s) => join(REPO_ROOT, ...s);
const rd = (p) => readFileSync(p, "utf8");
const num = (n) => n.toLocaleString("en-US");
const usd = (n) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);

/* ══ shared helpers ═══════════════════════════════════════════════ */

/** Tracked files only — this is how we respect .gitignore without reimplementing it. */
function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString().split("\n").filter(Boolean);
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/* ══ 6a — stats.md ════════════════════════════════════════════════ */

/** The controlled vocabularies from docs/README-DOCS.md §4. Kept in sync by hand —
 *  if you add a type or status there, add it here so the retrofit count stays honest. */
const KNOWN_TYPES = new Set([
  "prd", "launch-spec", "intake-rules", "glossary", "roadmap", "todos", "adr", "tech-spec",
  "api-docs", "decision-log", "testing", "component-lib", "changelog", "risk", "experiment",
  "privacy", "runbook", "doc", "solution", "guide", "report", "plan", "note",
  "stats", "costs", "status", "inbox",
]);
const KNOWN_STATUS = new Set(["draft", "active", "locked", "done", "deprecated"]);

/**
 * Files this script itself writes. They are EXCLUDED from the line counts for two reasons:
 *
 *  1. Correctness — stats.md reports a line total that includes stats.md. Writing it
 *     changes that total, so the next run produces a different number, forever. A
 *     generator whose output is an input to itself never converges. (Latent until the
 *     file became git-tracked, which is exactly when `git ls-files` started seeing it.)
 *  2. Honesty — generated output is not authored work. Counting it inflates a number the
 *     header already warns is a vanity signal.
 */
const GENERATED_OUTPUTS = new Set([
  "docs/under-the-hood/stats.md",
  "docs/under-the-hood/costs.md",
  "docs/under-the-hood/system-status.md",
  "docs/INBOX.md",
]);

function buildStats(files) {
  const byExt = new Map();
  let totalLoc = 0;

  for (const f of files.filter((f) => !GENERATED_OUTPUTS.has(f))) {
    const ext = extname(f) || "(none)";
    const abs = P(f);
    let loc = 0;
    try {
      if (statSync(abs).size < 4 * 1024 * 1024) loc = rd(abs).split("\n").length;
    } catch { /* deleted or binary — skip */ }
    const cur = byExt.get(ext) ?? { files: 0, loc: 0 };
    cur.files++; cur.loc += loc;
    byExt.set(ext, cur);
    totalLoc += loc;
  }

  const INTERESTING = [".ts", ".tsx", ".md", ".json", ".mjs", ".cjs", ".js", ".sql", ".css", ".prisma", ".yml"];
  const rows = INTERESTING.map((e) => [e, byExt.get(e)]).filter(([, v]) => v)
    .sort((a, b) => b[1].loc - a[1].loc);

  // routes
  let routes = 0;
  for (const f of files.filter((f) => f.startsWith("server/src/") && f.endsWith(".ts"))) {
    try { routes += (rd(P(f)).match(/router\.(get|post|put|patch|delete)\(/g) || []).length; } catch { /* */ }
  }

  // Docs by type / status.
  // Counted ONLY over docs/ + the four root docs — i.e. what the board indexes. todos/ and
  // .claude/ carry their own unrelated frontmatter vocabularies (feat/fix, pending/complete);
  // blending them in produced a "type" table that looked authoritative and meant nothing.
  const BOARD_ROOTS = ["docs/", "CLAUDE.md", "README.md", "FEEDBACK.md", "ROADMAP.md"];
  const docFiles = files.filter(
    (f) => f.endsWith(".md") && !f.startsWith("docs/_templates/") && BOARD_ROOTS.some((r) => f.startsWith(r)),
  );
  const allMd = files.filter((f) => f.endsWith(".md"));
  const byType = new Map(), byStatus = new Map();
  let withFm = 0;
  for (const f of docFiles) {
    let fm = null;
    try { fm = parseFrontmatter(rd(P(f))); } catch { /* */ }
    if (!fm) continue;
    withFm++;
    if (fm.type) byType.set(fm.type, (byType.get(fm.type) || 0) + 1);
    if (fm.status) byStatus.set(fm.status, (byStatus.get(fm.status) || 0) + 1);
  }

  // todos
  const todoFiles = files.filter((f) => f.startsWith("todos/") && f.endsWith(".md"));
  const openTodos = todoFiles.filter((f) => f.split("/").pop().split("-")[1] === "pending");
  const byPri = new Map();
  for (const f of openTodos) {
    const pri = f.split("/").pop().split("-")[2] ?? "?";
    byPri.set(pri, (byPri.get(pri) || 0) + 1);
  }

  // feature isolation (reuse the baseline if present)
  let isolation = null;
  const blPath = P("scripts", "feature-isolation-baseline.json");
  if (existsSync(blPath)) {
    try { isolation = JSON.parse(rd(blPath)).count; } catch { /* */ }
  }

  // phase, from planning.json
  let phaseLine = "unknown", planningUpdated = null;
  const planPath = P("server", "data", "planning.json");
  if (existsSync(planPath)) {
    try {
      const plan = JSON.parse(rd(planPath));
      planningUpdated = (plan.updatedAt || "").slice(0, 10) || null;
      const tasks = (plan.categories || []).flatMap((c) => c.tasks || []);
      const done = tasks.filter((t) => t.status === "done").length;
      const prog = tasks.filter((t) => t.status === "in_progress").length;
      phaseLine = `${done}/${tasks.length} planning tasks done, ${prog} in progress`;
    } catch { /* */ }
  }

  const L = [];
  L.push(fm("DOC-012", "Repo statistics", "Generated repo and docs metrics. LOC is a vanity signal; features shipped is the real one.", "stats", "docs-system"));
  L.push("# Repo statistics", "");
  L.push("<!-- GENERATED by scripts/refresh-docs.mjs — hand edits are destroyed. -->", "");
  L.push("> **Read this before reading the numbers.** Lines of code is a **rough vanity signal**,");
  L.push("> tracked here for reference only. It goes up when you write a feature and it also goes");
  L.push("> up when you write a bad feature badly. **Real progress is features and phases shipped**");
  L.push("> — see the roadmap and the changelog. Nothing on this page should be used to feel");
  L.push("> productive.", "");
  L.push(`*Generated ${TODAY} from ${num(files.length)} git-tracked files.*`, "");

  L.push("## Code", "");
  L.push("| Type | Files | Lines |");
  L.push("|---|---:|---:|");
  rows.forEach(([e, v]) => L.push(`| \`${e}\` | ${num(v.files)} | ${num(v.loc)} |`));
  L.push(`| **All tracked** | **${num(files.length - GENERATED_OUTPUTS.size)}** | **${num(totalLoc)}** |`, "");
  L.push(`<sub>Excludes the ${GENERATED_OUTPUTS.size} files this script generates — they are output, not authored work, and counting them would make this report unable to converge on its own line total.</sub>`, "");

  L.push("## Surface area", "");
  L.push("| Measure | Count |");
  L.push("|---|---:|");
  L.push(`| API routes | ${num(routes)} |`);
  L.push(`| Prisma models | ${num(countMatches(P("prisma", "schema.prisma"), /^model /gm))} |`);
  L.push(`| Prisma migrations | ${num(files.filter((f) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(f)).length)} |`);
  L.push(`| Server feature modules | ${num(dirCount(files, "server/src/features/"))} |`);
  L.push(`| Client feature modules | ${num(dirCount(files, "client/src/features/"))} |`);
  if (isolation !== null) L.push(`| Cross-feature imports (ADR-015 baseline) | ${num(isolation)} |`);
  L.push("");

  L.push("## Docs", "");
  L.push(`**${num(docFiles.length)}** board-scope markdown files (\`docs/\` plus the four root docs), of which **${num(withFm)}** carry frontmatter.`, "");
  L.push(`*${num(allMd.length)} markdown files exist repo-wide; the rest live in \`todos/\` and \`.claude/\`, which use their own`);
  L.push("unrelated frontmatter vocabularies and are deliberately excluded from the tables below.*", "");
  const unindexed = docFiles.length - withFm;
  if (unindexed > 0) {
    L.push(`> **${num(unindexed)} board-scope docs have no frontmatter** and therefore cannot be indexed, filtered,`);
    L.push("> or cross-linked. Retrofitting them is the largest single piece of remaining docs work.", "");
  }
  if (byType.size) {
    const off = [...byType.entries()].filter(([k]) => !KNOWN_TYPES.has(k)).reduce((n, [, v]) => n + v, 0);
    L.push("| Type | Docs | In vocabulary? |");
    L.push("|---|---:|---|");
    [...byType.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => L.push(`| \`${k}\` | ${v} | ${KNOWN_TYPES.has(k) ? "✅" : "❌ off-vocabulary"} |`));
    L.push("");
    if (off > 0) L.push(`**${off} docs use a \`type\` outside the controlled vocabulary** (see \`docs/README-DOCS.md\` §4) — mostly older \`docs/solutions/\` and \`docs/archive/\` entries written before the schema existed.`, "");
  }
  if (byStatus.size) {
    const off = [...byStatus.entries()].filter(([k]) => !KNOWN_STATUS.has(k)).reduce((n, [, v]) => n + v, 0);
    L.push("| Status | Docs | In vocabulary? |");
    L.push("|---|---:|---|");
    [...byStatus.entries()].sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => L.push(`| \`${k}\` | ${v} | ${KNOWN_STATUS.has(k) ? "✅" : "❌ off-vocabulary"} |`));
    L.push("");
    if (off > 0) L.push(`**${off} docs use a \`status\` outside \`draft|active|locked|done|deprecated\`.** The board's "done" filter cannot see them.`, "");
  }

  L.push("## Open work", "");
  L.push(`**${openTodos.length} open** of ${todoFiles.length} total to-dos.`, "");
  if (byPri.size) {
    L.push("| Priority | Open |");
    L.push("|---|---:|");
    [...byPri.entries()].sort().forEach(([k, v]) => L.push(`| \`${k}\` | ${v} |`));
    L.push("");
  }
  L.push(`Planning status: ${phaseLine}.`, "");
  if (planningUpdated) {
    const ageDays = Math.round((Date.parse(TODAY) - Date.parse(planningUpdated)) / 86400000);
    L.push(`\`server/data/planning.json\` last updated **${planningUpdated}** (${ageDays} days ago).`);
    if (ageDays > 30) L.push("", `> ⚠️ The canonical roadmap source is **${ageDays} days stale**. Numbers above are honest; the *plan* they describe may not be.`);
    L.push("");
  }
  return L.join("\n") + "\n";
}

const countMatches = (p, re) => (existsSync(p) ? (rd(p).match(re) || []).length : 0);
const dirCount = (files, prefix) =>
  new Set(files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split("/")[0])).size;

/* ══ 6b — costs.md ════════════════════════════════════════════════ */

const singular = (a) => a.unitLabelSingular || a.unitLabel.replace(/s$/, "");

function buildCosts() {
  const cfgPath = P("docs", "costs.config.json");
  const cfg = JSON.parse(rd(cfgPath));
  const { assumptions: a, unitCosts: u, tiers } = cfg;
  const verify = new Set(cfg.verify || []);
  const notes = cfg.notes || {};

  const V = (key, rendered) => (verify.has(key) ? `${rendered} **⚠️ VERIFY**` : rendered);
  const anyUnverified = verify.size > 0;

  const L = [];
  L.push(fm("DOC-013", "Unit economics", "Cost per user and gross margin by scale. Generated from docs/costs.config.json.", "costs", "deploy"));
  L.push("# Unit economics", "");
  L.push("<!-- GENERATED by scripts/refresh-docs.mjs from docs/costs.config.json — hand edits are destroyed. -->", "");

  if (anyUnverified) {
    L.push("> ## ⚠️ This model is not yet grounded in real numbers");
    L.push(">");
    L.push(`> **${verify.size} of the inputs below are unverified** and are flagged \`VERIFY\` inline.`);
    L.push("> They are placeholders, not estimates. **Do not present this table externally until the");
    L.push("> flags are cleared** — an unflagged guess shown to a partner is the one failure mode");
    L.push("> that actually costs something.");
    L.push(">");
    L.push("> Clear a flag by putting the real number in `docs/costs.config.json`, removing its entry");
    L.push("> from `verify`, and re-running `npm run docs:refresh`.", "");
  }

  L.push("## Assumptions", "");
  L.push("*These drive every number below. A reader should be able to disagree with the model by", "disagreeing with this table.*", "");
  L.push("| Assumption | Value |");
  L.push("|---|---|");
  L.push(`| ${a.unitLabel} per user per month | ${V("assumptions.unitsPerUserPerMonth", num(a.unitsPerUserPerMonth))} |`);
  L.push(`| Average ${a.unitSizeLabel} per ${singular(a)} | ${V("assumptions.avgUnitSize", num(a.avgUnitSize))} |`);
  L.push(`| Plan price (per user / month) | ${V("assumptions.planPriceUsd", usd(a.planPriceUsd))} |`);
  L.push("");
  L.push("| Unit cost | Value |");
  L.push("|---|---|");
  L.push(`| Primary variable cost per ${singular(a)} | ${V("unitCosts.primaryVariablePerUnit", usd(u.primaryVariablePerUnit))} |`);
  L.push(`| Auth, per user / month | ${V("unitCosts.perUserMonthAuth", usd(u.perUserMonthAuth))} |`);
  L.push(`| Database, per user / month | ${V("unitCosts.perUserMonthDb", usd(u.perUserMonthDb))} |`);
  L.push(`| Hosting, flat / month | ${V("unitCosts.hostingFlatMonth", usd(u.hostingFlatMonth))} |`);
  L.push(`| Payment fees | ${V("unitCosts.paymentPctFee", (u.paymentPctFee * 100).toFixed(1) + "% + " + usd(u.paymentFlatFee))} |`);
  L.push("");

  L.push("## Cost and margin by scale", "");
  L.push("| Users | Variable / user | Total variable | Hosting / user | Payment fees | Revenue | Gross margin | Margin % |");
  L.push("|---:|---:|---:|---:|---:|---:|---:|---:|");

  for (const users of tiers) {
    const varPerUser = a.unitsPerUserPerMonth * u.primaryVariablePerUnit + u.perUserMonthAuth + u.perUserMonthDb;
    const totalVar = varPerUser * users;
    const hostPerUser = users > 0 ? u.hostingFlatMonth / users : 0;
    const fees = a.planPriceUsd > 0 ? (a.planPriceUsd * u.paymentPctFee + u.paymentFlatFee) * users : 0;
    const revenue = a.planPriceUsd * users;
    const margin = revenue - totalVar - u.hostingFlatMonth - fees;
    const pct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) + "%" : "—";
    L.push(`| ${num(users)} | ${usd(varPerUser)} | ${usd(totalVar)} | ${usd(hostPerUser)} | ${usd(fees)} | ${usd(revenue)} | ${usd(margin)} | ${pct} |`);
  }
  L.push("");

  if (a.planPriceUsd === 0) {
    L.push("> **Margin is `—`, not 0%.** With no plan price there is no revenue, so margin percentage");
    L.push("> is undefined rather than bad. The gross-margin column shows real monthly **cost** as a");
    L.push("> negative number — that part is meaningful even with no pricing model.", "");
  }

  const noteKeys = Object.keys(notes);
  if (noteKeys.length) {
    L.push("## What each input actually means", "");
    for (const k of noteKeys) L.push(`**\`${k}\`** — ${notes[k]}`, "");
  }

  L.push("---", "");
  L.push(`<sub>Generated ${TODAY} from \`docs/costs.config.json\`. Edit the config, not this file.</sub>`, "");
  return L.join("\n") + "\n";
}

/* ══ 6c — system-status.md ════════════════════════════════════════ */

const SERVICES = [
  { name: "Supabase — database", keys: ["DATABASE_URL", "DIRECT_URL"] },
  { name: "Supabase — auth (server)", keys: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] },
  { name: "Supabase — auth (client)", keys: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"] },
  { name: "Anthropic — Claude Sonnet", keys: ["ANTHROPIC_API_KEY"] },
  { name: "Google — Gemini 2.5 Flash", keys: ["GEMINI_API_KEY"] },
  { name: "Resend — transactional email", keys: ["RESEND_API_KEY"] },
  { name: "Web push — VAPID", keys: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"] },
  { name: "PostHog — product analytics", keys: ["VITE_POSTHOG_KEY"] },
  { name: "Google Analytics", keys: ["VITE_GA_MEASUREMENT_ID"] },
  { name: "YouTube API", keys: ["YOUTUBE_API_KEY"] },
  { name: "IP hashing secret", keys: ["IP_HASH_SECRET"] },
];

/** Collect env-var NAMES defined locally. Values are never read, stored, or printed. */
function localEnvKeyNames() {
  const names = new Set(Object.keys(process.env));
  for (const f of ["server/.env", "server/.env.local", "client/.env", "client/.env.local", ".env"]) {
    const p = P(f);
    if (!existsSync(p)) continue;
    for (const line of rd(p).split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/);
      if (m) names.add(m[1]);
    }
  }
  return names;
}

function buildStatus() {
  const known = localEnvKeyNames();
  let head = "unknown", headDate = "unknown";
  try {
    head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT }).toString().trim();
    headDate = execFileSync("git", ["log", "-1", "--format=%cI"], { cwd: REPO_ROOT }).toString().trim().slice(0, 10);
  } catch { /* */ }

  const L = [];
  L.push(fm("DOC-014", "System status", "Which external services are configured, and how to verify what production is actually running.", "status", "deploy"));
  L.push("# System status", "");
  L.push("<!-- GENERATED by scripts/refresh-docs.mjs — hand edits are destroyed. -->", "");
  L.push("> **Scope, stated plainly.** This page reports whether an env key is **present in the");
  L.push("> environment this script ran in** — your local machine. It is **not** a report on");
  L.push("> production. Production env lives only in Railway and is not readable from here.");
  L.push("> **Key values are never read or printed — only their names.**", "");
  L.push(`*Generated ${TODAY} · local HEAD \`${head}\` (${headDate})*`, "");

  L.push("## Service configuration (local environment)", "");
  L.push("| Service | Keys | Local |");
  L.push("|---|---|---|");
  for (const s of SERVICES) {
    const missing = s.keys.filter((k) => !known.has(k));
    const state = missing.length === 0 ? "✅ configured"
      : missing.length === s.keys.length ? "⬜ absent"
      : `⚠️ partial — missing \`${missing.join("`, `")}\``;
    L.push(`| ${s.name} | \`${s.keys.join("`, `")}\` | ${state} |`);
  }
  L.push("");
  L.push("⬜ absent locally is often **fine** — several of these are production-only. It is a");
  L.push("signal to check Railway, not a defect.", "");

  L.push("## Verifying production", "");
  L.push("The single check that matters, because a health endpoint returning 200 **cannot** detect a");
  L.push("frozen deploy — the previous image keeps serving happily:", "");
  L.push("```bash");
  L.push("curl -s https://app.thefantasticleagues.com/api/health | jq .version");
  L.push("git rev-parse origin/main       # these two must match");
  L.push("```");
  L.push("");
  L.push("`.github/workflows/verify-deploy.yml` automates this and emails on mismatch (PR #405).");
  L.push("Prod has frozen twice on migration failures (`P3009`) — 21 hours in May, **8 days** in June.", "");

  L.push("---", "");
  L.push("## FUTURE: real health checks", "");
  L.push("Dormant until there are paying users. Configuration presence is not health — a key can be");
  L.push("present and the service still down, over quota, or rate-limited.", "");
  L.push("```js");
  L.push("// Per-service liveness. Wire in when uptime becomes someone else's problem, not just yours.");
  L.push("//");
  L.push("// const CHECKS = [");
  L.push("//   { name: 'database',  ping: () => prisma.$queryRaw`SELECT 1` },");
  L.push("//   { name: 'supabase',  ping: () => fetch(`${SUPABASE_URL}/auth/v1/health`) },");
  L.push("//   { name: 'anthropic', ping: () => fetch('https://api.anthropic.com/v1/models', { headers }) },");
  L.push("//   { name: 'resend',    ping: () => fetch('https://api.resend.com/domains', { headers }) },");
  L.push("// ];");
  L.push("//");
  L.push("// For each: status (up/down/degraded), latency p50/p95, last-success timestamp,");
  L.push("// 30-day uptime %, and quota headroom where the provider exposes it.");
  L.push("//");
  L.push("// Cheapest useful version first: log every outbound call's status + duration, then");
  L.push("// aggregate. That also closes todo 299 (no ingestion-job run tracking or alerting),");
  L.push("// which is a live P1 — a sync can fail silently today.");
  L.push("```");
  L.push("");
  return L.join("\n") + "\n";
}

/* ══ 6d — README / CLAUDE.md status block ═════════════════════════ */

const START = "<!-- DOCS:STATUS:START -->";
const END = "<!-- DOCS:STATUS:END -->";

function statusBlock(files) {
  const todoFiles = files.filter((f) => f.startsWith("todos/") && f.endsWith(".md"));
  const open = todoFiles.filter((f) => f.split("/").pop().split("-")[1] === "pending");
  const rank = { p1: 0, p2: 1, p3: 2 };
  const next3 = open
    .map((f) => {
      const b = f.split("/").pop().replace(/\.md$/, "").split("-");
      return { id: b[0], pri: b[2], title: b.slice(3).join(" ") };
    })
    .sort((a, b) => (rank[a.pri] ?? 9) - (rank[b.pri] ?? 9) || a.id.localeCompare(b.id))
    .slice(0, 3);

  let phase = "see roadmap";
  const planPath = P("server", "data", "planning.json");
  if (existsSync(planPath)) {
    try {
      const plan = JSON.parse(rd(planPath));
      const cur = (plan.roadmap || [])[0];
      if (cur) phase = `${cur.label} (${cur.timeframe})`;
    } catch { /* */ }
  }

  const L = [START];
  L.push("");
  L.push("### Current status");
  L.push("");
  L.push(`**Phase:** ${phase}`);
  L.push("");
  L.push(`**Next 3 to-dos** (${open.length} open):`);
  L.push("");
  next3.forEach((t) => L.push(`- \`${t.id}\` **${t.pri.toUpperCase()}** — ${t.title}`));
  L.push("");
  L.push("Roadmap: [`docs/product/roadmap.md`](docs/product/roadmap.md) · Docs map: [`docs/README-DOCS.md`](docs/README-DOCS.md)");
  L.push("");
  L.push(`<sub>Generated ${TODAY} by \`npm run docs:refresh\` — do not edit between the markers.</sub>`);
  L.push("");
  L.push(END);
  return L.join("\n");
}

function applyBlock(relPath, block) {
  const p = P(relPath);
  if (!existsSync(p)) return { path: relPath, action: "skipped (missing)" };
  const cur = rd(p);
  const s = cur.indexOf(START), e = cur.indexOf(END);
  let next;
  let action;
  if (s !== -1 && e !== -1 && e > s) {
    next = cur.slice(0, s) + block + cur.slice(e + END.length);
    action = "updated in place";
  } else {
    next = cur.trimEnd() + "\n\n---\n\n" + block + "\n";
    action = "markers appended";
  }
  return { path: relPath, action, changed: next !== cur, next };
}

/* ══ shared frontmatter emitter ═══════════════════════════════════ */

function fm(id, title, description, type, tag) {
  return [
    "---",
    `id: ${id}`,
    `title: "${title}"`,
    `description: "${description}"`,
    `type: ${type}`,
    "status: active",
    "phase: null",
    "owner: james",
    `tags: [${tag}]`,
    "links: [DOC-001]",
    `updated: ${TODAY}`,
    "---",
    "",
  ].join("\n");
}

/* ══ main ═════════════════════════════════════════════════════════ */

const files = trackedFiles();

const outputs = [
  { path: "docs/under-the-hood/stats.md", content: buildStats(files) },
  { path: "docs/under-the-hood/costs.md", content: buildCosts() },
  { path: "docs/under-the-hood/system-status.md", content: buildStatus() },
];

const blocks = [applyBlock("README.md", statusBlock(files)), applyBlock("CLAUDE.md", statusBlock(files))];

if (CHECK) {
  const stale = [];
  for (const o of outputs) {
    const cur = existsSync(P(o.path)) ? rd(P(o.path)) : "";
    if (cur !== o.content) stale.push(o.path);
  }
  for (const b of blocks) if (b.changed) stale.push(b.path);
  if (stale.length) {
    console.error(`✗ ${stale.length} generated doc(s) stale — run \`npm run docs:refresh\`:`);
    stale.forEach((s) => console.error("   " + s));
    process.exit(1);
  }
  console.log("✓ All generated docs are up to date.");
  process.exit(0);
}

for (const o of outputs) {
  writeFileSync(P(o.path), o.content);
  console.log(`✓ ${o.path}`);
}
for (const b of blocks) {
  if (b.next === undefined) { console.log(`- ${b.path} — ${b.action}`); continue; }
  writeFileSync(P(b.path), b.next);
  console.log(`✓ ${b.path} — ${b.action}${b.changed ? "" : " (no change)"}`);
}
console.log("\nRun before every push. Consider a pre-push hook:");
console.log("  echo 'npm run docs:refresh --silent && git diff --quiet docs || (echo \"docs stale — commit the refresh\"; exit 1)' > .git/hooks/pre-push");
