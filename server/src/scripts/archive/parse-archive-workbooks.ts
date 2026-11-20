/**
 * Parse the commissioner's past-season workbooks into one JSON file per year
 * plus a coverage report. READ-ONLY: touches no database.
 *
 *   1. Download each workbook named in workbook-manifest.json from Drive to
 *      <dir>/<driveFileId>.<ext> (Google Sheets: export as .xlsx).
 *   2. From server/: npx tsx src/scripts/archive/parse-archive-workbooks.ts <dir> <outDir> [year...]
 *
 * Exit 0 = every season passed its checks, 1 = at least one check error.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSheet, type Grid, type ParsedSheet } from "../../lib/archive/workbookParser.js";
import { buildSeason, type FranchiseMap, type SeasonData, type SeasonSpec, type SheetRef } from "../../lib/archive/seasonBuilder.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const [dir, outDir, ...years] = process.argv.slice(2);
  if (!dir || !outDir) {
    console.error("usage: parse-archive-workbooks.ts <workbookDir> <outDir> [year...]");
    process.exit(2);
  }
  const mod = await import("xlsx");
  const XLSX = (mod as unknown as { default?: typeof mod }).default ?? mod; // CJS under ESM: real API is on .default
  const manifest = JSON.parse(readFileSync(join(here, "workbook-manifest.json"), "utf8")) as {
    franchises: FranchiseMap; seasons: SeasonSpec[];
  };

  const books = new Map<string, ReturnType<typeof XLSX.readFile>>();
  const load = (ref: SheetRef): ParsedSheet | null => {
    if (!books.has(ref.file)) books.set(ref.file, XLSX.readFile(join(dir, ref.file)));
    const ws = books.get(ref.file)!.Sheets[ref.sheet];
    if (!ws) return null;
    return parseSheet(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as Grid);
  };

  mkdirSync(outDir, { recursive: true });
  const report: string[] = ["| Year | Teams | Rosters by period | Keepers/team | Recorded periods | Final total (top) | Checks |", "|---|---|---|---|---|---|---|"];
  let errors = 0;
  for (const spec of manifest.seasons) {
    if (years.length && !years.includes(String(spec.year))) continue;
    let season: SeasonData;
    try {
      season = buildSeason(spec, manifest.franchises, load);
    } catch (e) {
      errors++;
      report.push(`| ${spec.year} | — | — | — | — | — | CRASH: ${(e as Error).message} |`);
      continue;
    }
    writeFileSync(join(outDir, `${spec.year}.json`), JSON.stringify(season, null, 1));
    const errs = season.checks.filter((c) => c.level === "error");
    const warns = season.checks.filter((c) => c.level === "warn");
    errors += errs.length;
    const keeperCounts = season.keepers ? Object.values(season.keepers).map((k) => k.length).join(",") : "—";
    const top = Object.entries(season.recordedTotals).sort((a, b) => b[1] - a[1])[0];
    report.push(
      `| ${spec.year} | ${season.teams.map((t) => t.code).join(" ")} | ${season.periodRosters.map((p) => `P${p.period}`).join(" ") || "—"} | ${keeperCounts} | ${season.recordedPoints.length} | ${top ? `${top[0]} ${top[1]}` : "—"} | ${errs.length ? `**${errs.length} err**: ${errs.map((c) => c.message).join("; ")}` : "ok"}${warns.length ? ` (${warns.length} warn)` : ""} |`,
    );
  }
  writeFileSync(join(outDir, "REPORT.md"), report.join("\n") + "\n");
  console.log(report.join("\n"));
  process.exit(errors ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
