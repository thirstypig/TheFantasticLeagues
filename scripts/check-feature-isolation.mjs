#!/usr/bin/env node
/**
 * Feature-module isolation check — see docs/engineering/adrs/ADR-015-feature-module-boundaries.md
 *
 * A feature module must not import from another feature module. Shared code is promoted to
 * client/src/components/shared, client/src/hooks, client/src/lib, server/src/lib, or shared/api.
 *
 * This is a RATCHET, not a gate on existing code: the 85 imports that existed when ADR-015 was
 * accepted are grandfathered in scripts/feature-isolation-baseline.json. Anything NOT in the
 * baseline is an error. The number can only go down.
 *
 *   node scripts/check-feature-isolation.mjs             # exit 1 on any new violation
 *   node scripts/check-feature-isolation.mjs --report    # print the full current graph
 *   node scripts/check-feature-isolation.mjs --update-baseline
 *
 * Read-only. Touches no application code.
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH = join(REPO_ROOT, "scripts", "feature-isolation-baseline.json");

const ROOTS = [
  { side: "server", dir: "server/src/features" },
  { side: "client", dir: "client/src/features" },
];

const args = new Set(process.argv.slice(2));
const REPORT = args.has("--report");
const UPDATE = args.has("--update-baseline");

/* ── scan ─────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

// `from "x"` and dynamic `import("x")`
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const TEST_RE = /__tests__|\.test\.|\.spec\./;

function scan() {
  const found = [];

  for (const { side, dir } of ROOTS) {
    const featureRoot = join(REPO_ROOT, dir);
    if (!existsSync(featureRoot)) continue;

    for (const file of walk(featureRoot)) {
      const ownFeature = relative(featureRoot, file).split(sep)[0];
      const isTest = TEST_RE.test(file);
      const src = readFileSync(file, "utf8");

      IMPORT_RE.lastIndex = 0;
      let m;
      while ((m = IMPORT_RE.exec(src))) {
        const spec = m[1];
        let target = null;

        if (spec.startsWith(".")) {
          // relative — resolve and see if it lands inside another feature dir
          const rel = relative(featureRoot, resolve(dirname(file), spec));
          if (!rel.startsWith("..") && rel !== "") target = rel.split(sep)[0];
        } else {
          // aliased — @/features/x, ~/features/x, src/features/x
          const alias = spec.match(/^(?:@\/|@client\/|~\/)?(?:src\/)?features\/([^/]+)/);
          if (alias) target = alias[1];
        }

        if (target && target !== ownFeature) {
          found.push({
            side,
            from: ownFeature,
            to: target,
            isTest,
            file: relative(REPO_ROOT, file).split(sep).join("/"),
            spec,
          });
        }
      }
    }
  }

  return found;
}

/** Stable identity for a violation. Deliberately excludes line number so that
 *  moving code within a file doesn't invalidate the baseline. */
const keyOf = (v) => `${v.side}|${v.file}|${v.spec}`;

/* ── report mode ──────────────────────────────────────────────────── */

function printReport(all) {
  const prod = all.filter((v) => !v.isTest);
  console.log(`\nCross-feature imports: ${all.length} total (${prod.length} production, ${all.length - prod.length} test)\n`);

  for (const side of ["server", "client"]) {
    const rows = prod.filter((v) => v.side === side);
    console.log(`── ${side.toUpperCase()} — ${rows.length} production ──`);

    const inbound = new Map();
    const outbound = new Map();
    for (const r of rows) {
      inbound.set(r.to, (inbound.get(r.to) || 0) + 1);
      outbound.set(r.from, (outbound.get(r.from) || 0) + 1);
    }

    const top = (m, label) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        .forEach(([k, n]) => console.log(`   ${String(n).padStart(3)}  ${label} ${k}`));

    console.log("  most depended-upon (de-facto shared):");
    top(inbound, "←");
    console.log("  least isolated (most outbound):");
    top(outbound, "→");
    console.log();
  }

  const edges = new Set(prod.map((v) => `${v.side}:${v.from}->${v.to}`));
  const cycles = [...edges].filter((e) => {
    const [side, pair] = e.split(":");
    const [a, b] = pair.split("->");
    return edges.has(`${side}:${b}->${a}`) && a < b;
  });
  console.log(`── circular dependencies: ${cycles.length} ──`);
  cycles.forEach((c) => console.log("   " + c.replace(":", ": ").replace("->", " ↔ ")));

  for (const { side, dir } of ROOTS) {
    const root = join(REPO_ROOT, dir);
    if (!existsSync(root)) continue;
    const total = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).length;
    const dirty = new Set(prod.filter((v) => v.side === side).map((v) => v.from)).size;
    console.log(`\n${side}: ${total - dirty}/${total} modules fully isolated`);
  }
  console.log();
}

/* ── main ─────────────────────────────────────────────────────────── */

const current = scan();

if (REPORT) {
  printReport(current);
  process.exit(0);
}

if (UPDATE) {
  const baseline = {
    _comment:
      "Grandfathered cross-feature imports — see docs/engineering/adrs/ADR-015-feature-module-boundaries.md. " +
      "This list may SHRINK but must never grow. Regenerate only after legitimately removing a violation.",
    generated: new Date().toISOString().slice(0, 10),
    count: current.length,
    allowed: current.map(keyOf).sort(),
  };
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`Baseline written: ${current.length} entries → scripts/feature-isolation-baseline.json`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error("No baseline found. Create one with:\n  node scripts/check-feature-isolation.mjs --update-baseline");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const allowed = new Set(baseline.allowed);

const added = current.filter((v) => !allowed.has(keyOf(v)));
const currentKeys = new Set(current.map(keyOf));
const removed = [...allowed].filter((k) => !currentKeys.has(k));

if (removed.length) {
  console.log(`✓ ${removed.length} grandfathered import(s) no longer present — nice.`);
  console.log(`  Run --update-baseline to lock in the improvement so they can't come back.\n`);
}

if (added.length === 0) {
  console.log(`✓ Feature isolation OK — ${current.length} known cross-feature imports, 0 new.`);
  process.exit(0);
}

console.error(`\n✗ ${added.length} NEW cross-feature import(s) — see ADR-015.\n`);
for (const v of added) {
  console.error(`  ${v.side}: features/${v.from} → features/${v.to}${v.isTest ? "  (test)" : ""}`);
  console.error(`     ${v.file}`);
  console.error(`     imports "${v.spec}"\n`);
}
console.error("Fix by promoting the shared code to a shared location:");
console.error("  client/src/components/shared/ · client/src/hooks/ · client/src/lib/");
console.error("  server/src/lib/ · shared/api/");
console.error("\nDuplicating a small helper is also fine. If the coupling is genuinely");
console.error("justified, add it to the baseline with a comment explaining why.\n");
process.exit(1);
