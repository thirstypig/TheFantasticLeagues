#!/usr/bin/env node
// Turns vitest json-summary files into a Markdown table for $GITHUB_STEP_SUMMARY.
// Usage: node scripts/coverage-summary.mjs <server summary.json> <client summary.json>
// A missing file (its test step failed before writing) is reported, not thrown.
import { existsSync, readFileSync } from "node:fs";

const METRICS = ["lines", "statements", "branches", "functions"];

export function coverageTable(entries) {
  const rows = entries.map(({ name, summary }) => {
    if (!summary) return `| ${name} | ${METRICS.map(() => "n/a").join(" | ")} |`;
    return `| ${name} | ${METRICS.map((m) => `${summary.total[m].pct}%`).join(" | ")} |`;
  });
  return [
    "### Test coverage",
    "",
    `| | ${METRICS.join(" | ")} |`,
    `|---|${METRICS.map(() => "---").join("|")}|`,
    ...rows,
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const entries = process.argv.slice(2).map((file) => ({
    name: file.split("/")[0],
    summary: existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null,
  }));
  process.stdout.write(coverageTable(entries));
}
