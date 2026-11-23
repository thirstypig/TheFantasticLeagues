/**
 * Load parsed past seasons (output of parse-archive-workbooks.ts) into
 * HistoricalTeam + HistoricalRosterEntry. Dry run unless --apply.
 *
 * Touches ONLY those two tables (plus creating a HistoricalSeason row for a
 * year that has none). For each loaded year it replaces that year's rows in
 * the two new tables; the older Historical* tables are left alone until the
 * archive page has moved to the new data.
 *
 *   From server/:
 *   npx tsx src/scripts/archive/load-archive-seasons.ts <parsedDir> --league <id> [--owners <file>] [--apply] [year...]
 *
 * --league   the league the archive hangs off (OGBA: 1, the 2025 league,
 *            which every existing HistoricalSeason row already uses).
 * --owners   JSON { "<franchise code>": "<owner>" | [{ from?, to?, owner }] } — see
 *            ownerFor in archiveRows.ts. Kept out of git
 *            (public repo); default: owners.local.json next to this script.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../db/prisma.js";
import { buildArchiveRows, type OwnersFile, type ParsedSeasonFile } from "../../lib/archive/archiveRows.js";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dir = process.argv[2];
  const leagueId = Number(arg("--league"));
  const apply = process.argv.includes("--apply");
  const ownersPath = arg("--owners") ?? join(here, "owners.local.json");
  const flags = new Set(["--league", "--owners", arg("--league"), arg("--owners"), "--apply"]);
  const years = process.argv.slice(3).filter((a) => !flags.has(a));
  if (!dir || !Number.isFinite(leagueId)) {
    console.error("usage: load-archive-seasons.ts <parsedDir> --league <id> [--owners <file>] [--apply] [year...]");
    process.exit(2);
  }
  const owners: OwnersFile = existsSync(ownersPath) ? JSON.parse(readFileSync(ownersPath, "utf8")) : {};
  if (!existsSync(ownersPath)) console.warn(`(no owners file at ${ownersPath} — owner names will be blank)`);

  const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true, name: true } });
  if (!league) { console.error(`league ${leagueId} not found`); process.exit(2); }
  const dbHost = (process.env.DATABASE_URL ?? "").replace(/^.*@/, "").replace(/[/?].*$/, "");
  console.log(`${apply ? "APPLY" : "DRY RUN"} → ${dbHost} · league ${league.id} (${league.name})\n`);

  const files = readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  for (const f of files) {
    const year = Number(f.slice(0, 4));
    if (years.length && !years.includes(String(year))) continue;
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8")) as ParsedSeasonFile;
    const { teams, entries, periodEnds } = buildArchiveRows(parsed, owners);
    const byKind = entries.reduce<Record<string, number>>((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {});
    const notes = teams.filter((t) => t.note).map((t) => `${t.code}: ${t.note}`);
    console.log(`${year}: ${teams.length} teams, ${entries.length} roster rows ${JSON.stringify(byKind)}${parsed.keepersSource === "sheet" ? " · keepers from the Keepers sheet" : ""}${periodEnds.length ? ` · periods end ${periodEnds.join(", ")}` : ""}${notes.length ? `\n   notes: ${notes.join(" | ")}` : ""}`);
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      const keepersFromSheet = parsed.keepersSource === "sheet";
      const season = await tx.historicalSeason.upsert({
        where: { year_leagueId: { year, leagueId } },
        create: { year, leagueId, keepersFromSheet, periodEnds },
        update: { keepersFromSheet, periodEnds },
        select: { id: true },
      });
      await tx.historicalRosterEntry.deleteMany({ where: { seasonId: season.id } });
      await tx.historicalTeam.deleteMany({ where: { seasonId: season.id } });
      await tx.historicalTeam.createMany({ data: teams.map((t) => ({ ...t, seasonId: season.id })) });
      await tx.historicalRosterEntry.createMany({ data: entries.map((e) => ({ ...e, seasonId: season.id })) });
    }, { timeout: 60_000 });
  }
  if (!apply) console.log("\nDry run only. Re-run with --apply to write.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
