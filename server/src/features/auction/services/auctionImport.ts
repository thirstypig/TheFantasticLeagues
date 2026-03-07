// server/src/services/auctionImport.ts
import { prisma } from "../../../db/prisma.js";

type ImportRow = {
  playerName: string;
  mlbTeam: string;
  teamCode: string;
  cost: number;
  isKeeper: boolean;
  position: string;
};

export class AuctionImportService {
  async importRostersFromCsv(leagueId: number, csvContent: string) {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== "");
    // Expect header: Player,MLB,Team,Cost,Keeper,Pos
    // Or lax header check. We'll skip first line if it looks like a header.
    
    const rows: ImportRow[] = [];
    
    let startIndex = 0;
    if (lines[0].toLowerCase().includes("player")) {
      startIndex = 1;
    }

    // 1. Parse CSV
    for (let i = startIndex; i < lines.length; i++) {
      // Handle simple CSV splitting (naive for now, upgrade if quotes needed)
      const cols = lines[i].split(",").map(s => s.trim());
      // Minimally expect: Name, Team, Cost
      if (cols.length < 3) continue;

      const playerName = cols[0];
      const mlbTeam = cols[1] || "";
      const teamCode = cols[2];
      const cost = Number(cols[3]) || 0;
      const isKeeper = (cols[4] || "").toLowerCase() === "true" || (cols[4] || "").toLowerCase() === "yes" || (cols[4] || "") === "1";
      const position = cols[5] || "";

      rows.push({ playerName, mlbTeam, teamCode, cost, isKeeper, position });
    }

    // 2. Validate League
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      include: {
        teams: true
      }
    });

    if (!league) throw new Error("League not found");

    // Map Team Code -> Team ID
    const teamMap = new Map<string, number>();
    for (const t of league.teams) {
      if (t.code) teamMap.set(t.code.toUpperCase(), t.id);
      // Also map by name just in case? Or stricter? Let's stick to code/name matches.
      teamMap.set(t.name.toUpperCase(), t.id);
    }

    const errors: string[] = [];
    let importedCount = 0;

    // 3. Process Rows
    await prisma.$transaction(async (tx) => {
        // Clear existing rosters? 
        // For now, let's assume this is an APPEND or UPDATE operation.
        // If the user wants to clear, they should probably do that separately or we add a flag.
        // But "Pre-Auction" implies setting the initial state. 
        // Let's create a fresh "Import" by deleting prior 'AUCTION_IMPORT' entries? 
        // Safer: Update existing by player+team, insert new.

        for (const row of rows) {
            const teamId = teamMap.get(row.teamCode.toUpperCase());
            if (!teamId) {
                if (row.teamCode && row.teamCode !== "FA") {
                   errors.push(`Team not found for code: ${row.teamCode} (Player: ${row.playerName})`);
                }
                continue; // Skip if no valid team (e.g. Free Agent)
            }

            // Resolve Player
            // Try to find by name (+ optional MLB team context later)
            // Ideally we use your existing player resolution logic or fuzzy match.
            // For this pass: Exact match on Name, create if missing?
            // "Pre-Auction" often brings in new rookies.
            
            let player = await tx.player.findFirst({
                where: { name: { equals: row.playerName, mode: "insensitive" } }
            });

            if (!player) {
                // Create new player placeholder
                player = await tx.player.create({
                    data: {
                        name: row.playerName,
                        mlbTeam: row.mlbTeam,
                        posPrimary: row.position || "UT",
                        posList: row.position || "UT"
                    }
                });
            }

            // Create/Update Roster Entry
            // Start of season roster...
            // Check if player is already on this team?
            const existing = await tx.roster.findFirst({
                where: { 
                    teamId: teamId,
                    playerId: player.id
                }
            });

            if (existing) {
                await tx.roster.update({
                    where: { id: existing.id },
                    data: {
                        price: row.cost,
                        isKeeper: row.isKeeper,
                        source: "AUCTION_IMPORT"
                    }
                });
            } else {
                await tx.roster.create({
                    data: {
                        teamId,
                        playerId: player.id,
                        price: row.cost,
                        isKeeper: row.isKeeper,
                        source: "AUCTION_IMPORT",
                        assignedPosition: row.position || null
                    }
                });
            }
            importedCount++;
        }
    }, { timeout: 30_000 });

    return { success: true, count: importedCount, errors };
  }
}
