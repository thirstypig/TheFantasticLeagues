import express from 'express';
import multer from 'multer';
import { requireAuth, requireAdmin } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { prisma } from '../../db/prisma.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });


interface RosterRow {
  teamCode: string;
  playerName: string;
  position: string;
  mlbTeam: string;
  acquisitionCost: string;
}

// POST /api/roster/import - Bulk import roster entries from CSV
router.post('/import', requireAuth, requireAdmin, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const year = parseInt(req.body.year) || new Date().getFullYear();
  const logs: string[] = [];
  const records: RosterRow[] = [];

  // Parse CSV from buffer
  const parser = Readable.from(req.file.buffer).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
    })
  );

  for await (const record of parser) {
    records.push(record as RosterRow);
  }

  logs.push(`Parsed ${records.length} rows from CSV.`);

  let created = 0;
  let updated = 0;

  for (const row of records) {
    const cost = parseFloat(row.acquisitionCost) || 0;

    // Upsert by unique constraint (year + teamCode + playerName)
    const existing = await prisma.rosterEntry.findFirst({
      where: {
        year,
        teamCode: row.teamCode,
        playerName: row.playerName,
      },
    });

    if (existing) {
      await prisma.rosterEntry.update({
        where: { id: existing.id },
        data: {
          position: row.position,
          mlbTeam: row.mlbTeam,
          acquisitionCost: cost,
        },
      });
      updated++;
    } else {
      await prisma.rosterEntry.create({
        data: {
          year,
          teamCode: row.teamCode,
          playerName: row.playerName,
          position: row.position,
          mlbTeam: row.mlbTeam,
          acquisitionCost: cost,
        },
      });
      created++;
    }
  }

  logs.push(`Created ${created} new entries, updated ${updated} existing.`);

  res.json({ success: true, created, updated, logs });
}));

// GET /api/roster/import/template - Download a sample CSV template
router.get('/import/template', (_req, res) => {
  const template = 'teamCode,playerName,position,mlbTeam,acquisitionCost\nDAWGS,Shohei Ohtani,DH,LAD,45\nDAWGS,Mookie Betts,OF,LAD,38\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="roster_template.csv"');
  res.send(template);
});

export const rosterImportRouter = router;
export default rosterImportRouter;
