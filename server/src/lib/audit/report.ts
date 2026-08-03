// server/src/lib/audit/report.ts
import type { ClassifyResult, StatLine } from "./types.js";

export interface Coverage {
  playersChecked: number;
  playersSkipped: number;
  skipReasons: string[];
  sourcesReached: { fbst: boolean; mlb: boolean; fg: boolean; bbref: boolean };
  fgLegLevel: "per-player" | "team-level";
}

export type Verdict = "PASS" | "FINDINGS" | "INCOMPLETE";

/**
 * Coverage is part of the verdict. A run that skipped players or failed to
 * reach a source can never be PASS — absence of evidence is not evidence of
 * correctness. INCOMPLETE outranks FINDINGS.
 */
export function decideVerdict(args: { results: ClassifyResult[]; coverage: Coverage }): Verdict {
  const { results, coverage } = args;
  const allReached = Object.values(coverage.sourcesReached).every(Boolean);
  if (!allReached || coverage.playersSkipped > 0) return "INCOMPLETE";
  // Check VALUES, not key presence. classifyTeamDelta (Task 7) writes every
  // stat key including exact-zero reconciliations, so a perfectly clean team
  // still carries 12 residual keys. Testing `Object.keys(...).length > 0` here
  // would make PASS unreachable — every audit would report FINDINGS forever.
  const anyResidual = results.some((r) => Object.values(r.residual).some((v) => v !== 0));
  return anyResidual ? "FINDINGS" : "PASS";
}

function fmt(part: Partial<StatLine>): string {
  const entries = Object.entries(part).filter(([, v]) => v !== 0);
  return entries.length ? entries.map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ") : "—";
}

export function renderReport(args: {
  periodName: string;
  results: ClassifyResult[];
  coverage: Coverage;
}): string {
  const { periodName, results, coverage } = args;
  const verdict = decideVerdict({ results, coverage });

  const lines: string[] = [];
  lines.push(`# Standings audit — ${periodName}`, "");
  lines.push(`**Verdict: ${verdict}**`, "");
  lines.push(
    `Players checked: ${coverage.playersChecked} · skipped: ${coverage.playersSkipped}` +
      (coverage.skipReasons.length ? ` (${coverage.skipReasons.join("; ")})` : ""),
  );
  lines.push(`FanGraphs leg: **${coverage.fgLegLevel}**`);
  lines.push(
    `Sources reached: ` +
      Object.entries(coverage.sourcesReached)
        .map(([k, v]) => `${k}=${v ? "yes" : "NO"}`)
        .join(" · "),
    "",
  );

  lines.push("| Team | Explained by model difference | Unexplained residual |", "|---|---|---|");
  for (const r of results) {
    lines.push(`| ${r.teamName} | ${fmt(r.explained)} | ${fmt(r.residual)} |`);
  }
  lines.push("");

  const withCauses = results.filter((r) => r.causes.length > 0);
  if (withCauses.length) {
    lines.push("## Attributed divergences", "");
    for (const r of withCauses) {
      for (const c of r.causes) {
        lines.push(`- **${r.teamName}** — ${c.playerName} (${c.cause}): ${fmt(c.expected)}. ${c.evidence}`);
      }
    }
    lines.push("");
  }

  if (verdict !== "PASS") {
    lines.push(
      "> Any non-zero residual requires the four-way tie-break (MLB statsapi + " +
        "Baseball Reference) before stating a verdict. Do not round it away.",
    );
  }
  return lines.join("\n");
}
