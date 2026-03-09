/**
 * Merge roster CSV (abbreviated names + fantasy teams + positions)
 * with values CSV (full names + MLB teams + costs)
 * to produce a clean import CSV for the roster import endpoint.
 *
 * Usage: npx tsx scripts/merge-roster-values.ts
 */
import fs from "fs";
import path from "path";

const ROSTER_FILE = path.resolve(
  process.env.HOME!,
  "downloads/Period 7 - Aug 31 to sept 28, 2025 - End of Season.csv"
);
const VALUES_FILE = path.resolve(
  process.env.HOME!,
  "downloads/2026 Player Values.xlsx - as of 02-15-2026.csv"
);
const OUTPUT_FILE = path.resolve(
  process.env.HOME!,
  "downloads/league2-roster-import.csv"
);

// --- Parse Values CSV ---
interface ValueEntry {
  name: string;
  mlbTeam: string;
  pos: string;
  cost: number;
}

function parseValues(content: string): ValueEntry[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const entries: ValueEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Format: #,Name,Team,Pos,$
    // Handle potential commas in position like "2B/3B/ OF"
    const line = lines[i];
    const match = line.match(/^\d+,(.+?),([\w]+),(.+?),(-?\$\d+)$/);
    if (!match) continue;

    const name = match[1].trim();
    const mlbTeam = match[2].trim();
    const pos = match[3].trim().replace(/\s+/g, "");
    const costStr = match[4].replace("$", "").trim();
    const cost = parseInt(costStr, 10);

    entries.push({ name, mlbTeam, pos, cost });
  }

  return entries;
}

// --- Parse Roster CSV ---
interface RosterEntry {
  abbrevName: string;
  fantasyTeam: string;
  pos: string;
  lineNum: number;
}

function parseRoster(content: string): RosterEntry[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const entries: RosterEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    // Handle quoted fields with commas inside (e.g. "N,. Castellanos")
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());

    const abbrevName = fields[0] || "";
    const fantasyTeam = fields[3] || "";
    const pos = fields[7] || "";

    if (!abbrevName || !fantasyTeam) continue;

    entries.push({ abbrevName, fantasyTeam, pos, lineNum: i + 1 });
  }

  return entries;
}

// --- Name Matching ---

/**
 * Normalize an abbreviated name for matching.
 * Handles: "F. Tatis Jr.", "KB.. Hayes", "H-S. Kim", "CJ. Abrams",
 *          "E.Tovar", "Wilm. Contreras", "JT Realmuto", "Ra. Suarez",
 *          "N,. Castellanos", "V,Vodnik"
 */
function normalizeAbbrev(abbrev: string): {
  initials: string;
  lastName: string;
  partialFirst: string;
} {
  let s = abbrev.trim();
  // Remove stray commas (data errors like "N,. Castellanos" or "V,Vodnik")
  s = s.replace(/,/g, "");

  // Normalize multiple dots to single dot
  s = s.replace(/\.{2,}/g, ".");

  // Extract suffix (Jr., II, III, IV)
  const suffixMatch = s.match(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i);
  const suffix = suffixMatch ? suffixMatch[1].replace(/\.$/, "") : "";
  if (suffix) {
    s = s.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, "").trim();
  }

  // Split on first space or dot-followed-by-uppercase
  // Handle "E.Tovar" (no space), "W.Adames", "CJ. Abrams", "Ra. Suarez"
  let firstPart = "";
  let lastName = "";

  // Try splitting on ". " or "." or " "
  const dotSpaceIdx = s.indexOf(". ");
  const dotIdx = s.indexOf(".");
  const spaceIdx = s.indexOf(" ");

  if (dotSpaceIdx >= 0) {
    firstPart = s.substring(0, dotSpaceIdx);
    lastName = s.substring(dotSpaceIdx + 2);
  } else if (dotIdx >= 0) {
    firstPart = s.substring(0, dotIdx);
    lastName = s.substring(dotIdx + 1);
  } else if (spaceIdx >= 0) {
    firstPart = s.substring(0, spaceIdx);
    lastName = s.substring(spaceIdx + 1);
  } else {
    lastName = s;
  }

  if (suffix) {
    lastName = lastName + " " + suffix;
  }

  // firstPart could be: "F", "KB", "CJ", "H-S", "Ra", "Wilm", "Ro", "JT"
  const initials = firstPart
    .replace(/-/g, "")
    .replace(/\./g, "")
    .toUpperCase();
  const partialFirst = firstPart.replace(/-/g, "").replace(/\./g, "");

  return { initials, lastName: lastName.trim(), partialFirst };
}

function normalizeFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.split(" ");
  // Handle "Fernando Tatis Jr." — last name is "Tatis Jr."
  // Handle "Elly De La Cruz" — last name is "De La Cruz"
  // Handle "CJ Abrams" — first is "CJ", last is "Abrams"

  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");

  return { firstName, lastName };
}

function matchScore(
  abbrev: ReturnType<typeof normalizeAbbrev>,
  full: ReturnType<typeof normalizeFullName>
): number {
  let score = 0;

  // Last name match (case-insensitive)
  const abbrLast = abbrev.lastName.toLowerCase().replace(/[^a-z ]/g, "");
  const fullLast = full.lastName.toLowerCase().replace(/[^a-z ]/g, "");

  if (abbrLast === fullLast) {
    score += 100;
  } else if (fullLast.includes(abbrLast) || abbrLast.includes(fullLast)) {
    score += 60;
  } else {
    return 0; // Last name must match
  }

  // First name/initial match
  const abbrInit = abbrev.initials.toUpperCase();
  const fullFirst = full.firstName.toUpperCase().replace(/[^A-Z]/g, "");

  if (abbrev.partialFirst.length <= 2) {
    // It's initials (F, KB, CJ, Ra)
    if (fullFirst.startsWith(abbrInit)) {
      score += 50;
    } else if (abbrInit.length === 2) {
      // Multi-initial: "KB" should match "Ke'Bryan" → KB
      // Check if initials match first letters of hyphenated/apostrophe name parts
      const firstParts = full.firstName.split(/[-']/);
      if (firstParts.length >= 2) {
        const multiInit = firstParts.map((p) => p[0]?.toUpperCase()).join("");
        if (multiInit === abbrInit) {
          score += 50;
        }
      }
      // Also check "CJ" matching "CJ" directly
      if (fullFirst === abbrInit) {
        score += 50;
      }
    }
  } else {
    // It's a partial first name: "Wilm", "Ra", "Ro"
    const partial = abbrev.partialFirst.toLowerCase();
    const fullLower = full.firstName.toLowerCase();
    if (fullLower.startsWith(partial)) {
      score += 50;
    }
  }

  return score;
}

function findBestMatch(
  roster: RosterEntry,
  values: ValueEntry[],
  usedIndices: Set<number>,
  isPitcher: boolean
): { value: ValueEntry; index: number; score: number } | null {
  const abbrev = normalizeAbbrev(roster.abbrevName);

  let bestScore = 0;
  let bestIdx = -1;

  for (let i = 0; i < values.length; i++) {
    if (usedIndices.has(i)) continue;

    const full = normalizeFullName(values[i].name);
    const score = matchScore(abbrev, full);

    // Bonus for position match
    let posBonus = 0;
    const valPos = values[i].pos.toLowerCase();
    if (isPitcher && (valPos.includes("sp") || valPos.includes("rp"))) {
      posBonus = 10;
    } else if (!isPitcher && !valPos.includes("sp") && !valPos.includes("rp")) {
      posBonus = 10;
    }

    if (score + posBonus > bestScore) {
      bestScore = score + posBonus;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore >= 140) {
    return { value: values[bestIdx], index: bestIdx, score: bestScore };
  }

  return null;
}

// Manual overrides for players not in the values CSV
// (AL players, retired, misspelled, or simply missing from the values list)
const MANUAL_OVERRIDES: Record<
  string,
  { fullName: string; mlbTeam: string; cost: number }
> = {
  "B. Alexander": { fullName: "Blaze Alexander", mlbTeam: "ARI", cost: 1 },
  "KB.. Hayes": { fullName: "Ke'Bryan Hayes", mlbTeam: "CIN", cost: 4 },
  "Ra. Suarez": { fullName: "Ranger Suarez", mlbTeam: "PHI", cost: 1 },
  "V. Scott": { fullName: "Victor Scott II", mlbTeam: "STL", cost: 6 },
  "V,Vodnik": { fullName: "Victor Vodnik", mlbTeam: "COL", cost: 7 },
  "Wilm. Contreras": { fullName: "William Contreras", mlbTeam: "MIL", cost: 24 },
  "S. Gray": { fullName: "Sonny Gray", mlbTeam: "FA", cost: 1 },
  "J-H. Lee": { fullName: "Jung Hoo Lee", mlbTeam: "SF", cost: 11 },
  "A. Hays": { fullName: "Austin Hays", mlbTeam: "FA", cost: 1 },
  "I. Collins": { fullName: "Isaiah Collins", mlbTeam: "FA", cost: 1 },
  "C. Durbin": { fullName: "Chase Durbin", mlbTeam: "FA", cost: 1 },
  "J. McNeil": { fullName: "Jeff McNeil", mlbTeam: "FA", cost: 1 },
  "C. Kershaw": { fullName: "Clayton Kershaw", mlbTeam: "FA", cost: 1 },
  "M. Ventos": { fullName: "Mark Vientos", mlbTeam: "NYM", cost: 12 },
  "J. Oviendo": { fullName: "Johan Oviedo", mlbTeam: "FA", cost: 1 },
  "A. Saalfrank": { fullName: "AJ Saalfrank", mlbTeam: "FA", cost: 1 },
  "Q. Piester": { fullName: "Quinn Priester", mlbTeam: "MIL", cost: 5 },
  "B. Nimmo": { fullName: "Brandon Nimmo", mlbTeam: "NYM", cost: 1 },
  "A. Monasterio": { fullName: "Andruw Monasterio", mlbTeam: "MIL", cost: 1 },
  "K. Schwaber": { fullName: "Kyle Schwarber", mlbTeam: "PHI", cost: 26 },
  "B. Trinen": { fullName: "Blake Trinen", mlbTeam: "FA", cost: 1 },
  "C. Mullins": { fullName: "Cedric Mullins", mlbTeam: "FA", cost: 1 },
  // D. Peterson and A. Uribe appear twice on Devil Dawgs — roster data entry duplicates
  // The first occurrence matches fine; the second will use the override key with "|2" suffix
  "J. Bell": { fullName: "Josh Bell", mlbTeam: "FA", cost: 1 },
  "J. Verlander": { fullName: "Justin Verlander", mlbTeam: "FA", cost: 1 },
  "P. Alonso": { fullName: "Pete Alonso", mlbTeam: "NYM", cost: 1 },
  "I. Kiner-Falefa": { fullName: "Isiah Kiner-Falefa", mlbTeam: "FA", cost: 1 },
  "Wil. Contreas": { fullName: "William Contreras", mlbTeam: "MIL", cost: 24 },
  "D. Cease": { fullName: "Dylan Cease", mlbTeam: "SD", cost: 1 },
  "N. Crismatt": { fullName: "Nabil Crismatt", mlbTeam: "FA", cost: 1 },
  "J. Ferrer": { fullName: "Jose Ferrer", mlbTeam: "FA", cost: 1 },
};

// --- Main ---
function main() {
  const rosterContent = fs.readFileSync(ROSTER_FILE, "utf-8");
  const valuesContent = fs.readFileSync(VALUES_FILE, "utf-8");

  const rosterEntries = parseRoster(rosterContent);
  const valueEntries = parseValues(valuesContent);

  console.log(
    `Parsed ${rosterEntries.length} roster entries, ${valueEntries.length} value entries`
  );

  const usedValueIndices = new Set<number>();
  const nameOccurrences = new Map<string, number>(); // track duplicate abbrev names
  const results: {
    fullName: string;
    mlbTeam: string;
    fantasyTeam: string;
    cost: number;
    keeper: boolean;
    pos: string;
    abbrevName: string;
    matched: boolean;
  }[] = [];
  const unmatched: RosterEntry[] = [];

  for (const roster of rosterEntries) {
    // Track occurrences for duplicate detection
    const key = `${roster.abbrevName}|${roster.fantasyTeam}`;
    const occurrence = (nameOccurrences.get(key) || 0) + 1;
    nameOccurrences.set(key, occurrence);

    const isPitcher = roster.pos === "P";
    const match = findBestMatch(roster, valueEntries, usedValueIndices, isPitcher);

    if (match) {
      usedValueIndices.add(match.index);
      results.push({
        fullName: match.value.name,
        mlbTeam: match.value.mlbTeam,
        fantasyTeam: roster.fantasyTeam,
        cost: Math.max(match.value.cost, 0), // Floor at 0 for negative values
        keeper: false,
        pos: roster.pos,
        abbrevName: roster.abbrevName,
        matched: true,
      });
    } else if (MANUAL_OVERRIDES[roster.abbrevName] || (occurrence > 1)) {
      // For duplicates (2nd occurrence of same name on same team), skip — it's a data entry error
      if (occurrence > 1) {
        console.log(`  SKIPPING duplicate: "${roster.abbrevName}" (${roster.fantasyTeam}, ${roster.pos}) — occurrence #${occurrence}`);
        continue;
      }
      const override = MANUAL_OVERRIDES[roster.abbrevName]!;
      results.push({
        fullName: override.fullName,
        mlbTeam: override.mlbTeam,
        fantasyTeam: roster.fantasyTeam,
        cost: Math.max(override.cost, 0),
        keeper: false,
        pos: roster.pos,
        abbrevName: roster.abbrevName,
        matched: true,
      });
    } else {
      unmatched.push(roster);
      // Still add with defaults
      results.push({
        fullName: roster.abbrevName,
        mlbTeam: "",
        fantasyTeam: roster.fantasyTeam,
        cost: 1,
        keeper: false,
        pos: roster.pos,
        abbrevName: roster.abbrevName,
        matched: false,
      });
    }
  }

  // Report
  console.log(`\nMatched: ${results.filter((r) => r.matched).length}`);
  console.log(`Unmatched: ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log("\n--- UNMATCHED ---");
    for (const u of unmatched) {
      const parsed = normalizeAbbrev(u.abbrevName);
      console.log(
        `  Line ${u.lineNum}: "${u.abbrevName}" → initials="${parsed.initials}" last="${parsed.lastName}" (${u.fantasyTeam}, ${u.pos})`
      );
    }
  }

  // Team summary
  const teams = new Map<string, number>();
  for (const r of results) {
    teams.set(r.fantasyTeam, (teams.get(r.fantasyTeam) || 0) + 1);
  }
  console.log("\n--- TEAM COUNTS ---");
  for (const [team, count] of teams) {
    console.log(`  ${team}: ${count} players`);
  }

  // Write output CSV
  const header = "Player,MLB,Team,Cost,Keeper,Pos";
  const rows = results.map(
    (r) =>
      `${r.fullName},${r.mlbTeam},${r.fantasyTeam},${r.cost},${r.keeper},${r.pos}`
  );
  const csv = [header, ...rows].join("\n");
  fs.writeFileSync(OUTPUT_FILE, csv);
  console.log(`\nOutput written to: ${OUTPUT_FILE}`);
}

main();
