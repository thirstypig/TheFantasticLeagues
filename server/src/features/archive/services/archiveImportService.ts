import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';
import { prisma } from '../../../db/prisma.js';
import { parse } from 'csv-parse/sync';

// Fix for XLSX in ESM environments where readFile might be on .default or not exported correctly
// @ts-ignore
const readFile = XLSX.readFile || (XLSX as any).default?.readFile;
// @ts-ignore
const utils = XLSX.utils || (XLSX as any).default?.utils;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to get Opening Day for a given year (approximate start of Period 1)
function getOpeningDay(year: number): string {
  const dates: Record<number, string> = {
    2008: '2008-03-31',
    2009: '2009-04-05',
    2010: '2010-04-04',
    2011: '2011-03-31',
    2012: '2012-03-28',
    2013: '2013-03-31',
    2014: '2014-03-31',
    2015: '2015-04-05',
    2016: '2016-04-03',
    2017: '2017-04-02',
    2018: '2018-03-29',
    2019: '2019-03-28',
    2020: '2020-07-23', // COVID shortened
    2021: '2021-04-01',
    2022: '2022-04-07',
    2023: '2023-03-30',
    2024: '2024-03-28',
    2025: '2025-03-27' 
  };
  return dates[year] || `${year}-03-28`;
}

// Helper to get the last game of the regular season for a given year
export function getSeasonEnd(year: number): string {
  const dates: Record<number, string> = {
    2008: '2008-09-30',
    2009: '2009-10-06',
    2010: '2010-10-03',
    2011: '2011-09-28',
    2012: '2012-10-03',
    2013: '2013-09-30',
    2014: '2014-09-28',
    2015: '2015-10-04',
    2016: '2016-10-02',
    2017: '2017-10-01',
    2018: '2018-10-01',
    2019: '2019-09-29',
    2020: '2020-09-27',
    2021: '2021-10-03',
    2022: '2022-10-05',
    2023: '2023-10-01',
    2024: '2024-09-30',
    2025: '2025-09-28'
  };
  return dates[year] || `${year}-09-30`;
}

interface PeriodDefinition {
  p: number;
  start: Date;
  end: Date;
  tabName: string;
}

export class ArchiveImportService {
  private year: number;
  private archiveDir: string;

  constructor(year: number) {
    this.year = year;
    this.archiveDir = path.join(__dirname, `../../../data/archive/${year}`);
  }

  /**
   * Main entry point: Process Excel file and import data into DB
   */
  async processAndImport(filePath: string): Promise<{ success: boolean; messages: string[] }> {
    const logs: string[] = [];
    const log = (msg: string) => { console.log(msg); logs.push(msg); };

    try {
      log(`Starting import for year ${this.year}...`);
      
      // Ensure directory exists
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
        log(`Created directory: ${this.archiveDir}`);
      }

      // 1. Read Excel File
      const workbook = readFile(filePath, { cellStyles: true });
      const sheetNames = workbook.SheetNames;
      log(`Found sheets: ${sheetNames.join(', ')}`);

      // 2. Identify Sheets
      const draftSheet = sheetNames.find(s => s.toLowerCase().includes('draft'));
      const standingsSheet = sheetNames.find(s => {
          const v = s.toLowerCase();
          return v.includes('standing') || v.includes('final stat') || v.includes('league stats') || v.includes('scoring') || v.includes('cumulative');
      });
      
      const potentialPeriodSheets = sheetNames.filter(s => {
          const v = s.toLowerCase();
          if (s === draftSheet || s === standingsSheet) return false;
          if (v.includes('transaction') || v.includes('info') || v.includes('salary') || v.includes('traded') || v.includes('keeper') || v.includes('traded')) return false;
          if (v === 'rosters' || v === 'ranks' || v === 'projections') return false;
          
          // Exclude past year rosters (e.g., "2008 Final Rosters" in 2009 import)
          const yearMatch = v.match(/\b(20\d{2})\b/);
          if (yearMatch && parseInt(yearMatch[1]) < this.year) return false;
          
          return true;
      });
      
      const periods: PeriodDefinition[] = [];
      const openingDay = new Date(getOpeningDay(this.year));
      const seasonEnd = new Date(getSeasonEnd(this.year));
      
      const parsedDateSheets = potentialPeriodSheets.map(name => {
        let date: Date | null = null;
        const normalized = name.toLowerCase().trim();

        if (normalized.includes('final') || normalized.includes('season') || normalized.includes('end')) {
          date = new Date(this.year, 9, 1); // Oct 1 local
        } else if (normalized.startsWith('period_') || normalized.startsWith('period ')) {
            // "period_1" -> approximate date
            const num = parseInt(normalized.replace('period_', '').replace('period ', ''));
            if (!isNaN(num)) {
                 // Spacing out periods by 2 weeks essentially, starting from opening day
                 date = new Date(openingDay);
                 date.setDate(date.getDate() + (num - 1) * 14);
                 
                 // Treat Period 1 as earlier than opening day to capture "Draft" timeframe effectively?
                 if (num === 1) date = openingDay; 
            }
        } else {
          // Robust regex for (M)M.(D)D or (M)M/(D)D or (M)M-(D)D
          const match = normalized.match(/(\d{1,2})[\.\/\-](\d{1,2})/);
          if (match) {
            const m = parseInt(match[1]);
            const d = parseInt(match[2]);
            // Months are 0-indexed in JS Date
            date = new Date(this.year, m - 1, d);
          } else {
            // Fallback to native parsing
            const fallback = new Date(`${name}, ${this.year}`);
            if (!isNaN(fallback.getTime())) {
              date = fallback;
            }
          }
        }

        if (date && !isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          log(`  [Date Parser] Identified tab "${name}" as ${date.toISOString().split('T')[0]}`);
          return { name, date };
        }
        
        log(`  [Date Parser] Skipping tab "${name}" (could not parse as date)`);
        return null;
      }).filter(x => x !== null) as { name: string, date: Date }[];

      parsedDateSheets.sort((a, b) => a.date.getTime() - b.date.getTime());

      // Build Period List (Standardize on 7 periods max)
      const maxTotalPeriods = 7;
      let dateSheetsToUse = parsedDateSheets;

      // Ensure we don't exceed maxTotalPeriods
      if (draftSheet) {
          // P1 is draft, so we take at most maxTotalPeriods - 1 date tabs
          dateSheetsToUse = parsedDateSheets.slice(0, maxTotalPeriods - 1);
      } else {
          // No draft, take max 7 date tabs
          dateSheetsToUse = parsedDateSheets.slice(0, maxTotalPeriods);
      }

      log(`[Period Standardization] Season ${this.year}: Found Draft=${!!draftSheet}, ${parsedDateSheets.length} date tabs. Hard-capping to ${maxTotalPeriods} total periods.`);

      // Period 1 = Draft
      if (draftSheet) {
          let p1EndDate: Date;
          if (dateSheetsToUse.length > 0) {
              p1EndDate = new Date(dateSheetsToUse[0].date);
              p1EndDate.setDate(p1EndDate.getDate() - 1);
          } else {
              p1EndDate = seasonEnd;
          }
          
          periods.push({
              p: 1,
              start: openingDay,
              end: p1EndDate,
              tabName: draftSheet
          });
      }

      // Remaining Periods = Date Tabs
      dateSheetsToUse.forEach((sheet, idx) => {
        const startDate = new Date(sheet.date);
        let endDate: Date;
        if (idx < dateSheetsToUse.length - 1) {
            endDate = new Date(dateSheetsToUse[idx + 1].date);
            endDate.setDate(endDate.getDate() - 1);
        } else {
            // Last period always ends at exact regular season end
            endDate = seasonEnd;
        }

        periods.push({
          p: idx + (draftSheet ? 2 : 1),
          start: startDate,
          end: endDate,
          tabName: sheet.name
        });
      });

      log(`Identified ${periods.length} periods (P1 = ${periods[0]?.tabName || 'None'}).`);

      const standingsWs = standingsSheet ? workbook.Sheets[standingsSheet] : workbook.Sheets[sheetNames[0]];
      if (standingsWs) {
          const sRows = utils.sheet_to_json(standingsWs, { header: 1 }) as any[][];
          log("Building Team Name -> Code map...");
          sRows.forEach(row => {
              row.forEach(cell => {
                  const code = this.identifyTeam(String(cell || ''));
                  if (code) { }
              });
          });
      }

      // 4. Generate CSVs

      // Period Dates CSV
      const dateRows = periods.map(p => ({
          period: p.p,
          tab: p.tabName,
          start_date: p.start.toISOString().split('T')[0],
          end_date: p.end.toISOString().split('T')[0]
      }));
      const dateWs = utils.json_to_sheet(dateRows);
      fs.writeFileSync(path.join(this.archiveDir, `period_dates_${this.year}.csv`), utils.sheet_to_csv(dateWs));
      log(`Generated period_dates_${this.year}.csv`);

      // Draft
      if (draftSheet) {
        try {
          const sheet = workbook.Sheets[draftSheet];
          log(`[Draft] Analyzing layout...`);
          const rows = utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][]; // defval: '' ensures blank cells are preserved
          
          let teamRowIdx = -1;
          let colToTeam = new Map<number, string>();
          const positions = new Set(['OF', 'P', '1B', '2B', '3B', 'SS', 'C', 'CM', 'MI', 'DH', 'IL1', 'IL2', 'DL', 'R', 'SP', 'RP', 'PITCHER', 'STAFF', 'CO', 'UT', 'CI', 'LF', 'CF', 'RF']);

          // Find team header row - look for row with 4+ team-like headers
          for (let i = 0; i < Math.min(15, rows.length); i++) {
              const row = rows[i] || [];
              let teamsFound = 0;
              colToTeam.clear();
              row.forEach((cell, idx) => {
                  const val = String(cell || '').trim();
                  if (val) {
                     const code = this.identifyTeam(val);
                     if (code) {
                         colToTeam.set(idx, code);
                         teamsFound++;
                     } else if (val.length >= 3 && isNaN(Number(val)) && !positions.has(val.toUpperCase())) {
                         // Potential team name not in our map
                         colToTeam.set(idx, `UNK-${idx}`);
                         teamsFound++;
                     }
                  }
              });
              if (teamsFound >= 3) { // Lower threshold to 3
                  teamRowIdx = i; 
                  log(`  Found ${teamsFound} team headers at row ${i}: ${Array.from(colToTeam.values()).join(', ')}`);
                  break; 
              }
          }

          if (teamRowIdx !== -1 && colToTeam.size >= 4) {
              log(`  Unrolling Draft Grid (${colToTeam.size} teams)...`);
              const standardizedRows: any[] = [];
              let sectionIsPitchers = false;
              
              // Find the position column (usually leftmost column with position values)
              let posColIdx = -1;
              for (let i = teamRowIdx + 1; i < Math.min(teamRowIdx + 30, rows.length); i++) {
                  const row = rows[i] || [];
                  for (let j = 0; j < Math.min(5, row.length); j++) {
                      const val = String(row[j] || '').trim().toUpperCase();
                      if (positions.has(val)) {
                          posColIdx = j;
                          log(`  Found position column at index ${j}`);
                          break;
                      }
                  }
                  if (posColIdx !== -1) break;
              }

              for (let i = teamRowIdx + 1; i < rows.length; i++) {
                  const row = rows[i] || [];
                  if (row.length === 0) continue;

                  const rowStr = row.join(' ').toLowerCase();
                  if (rowStr.includes('salary cap') || rowStr.includes('totals')) break;

                  // Get position from position column if found
                  let currentPos = '';
                  if (posColIdx !== -1) {
                      currentPos = String(row[posColIdx] || '').trim().toUpperCase();
                      if (positions.has(currentPos)) {
                          if (['P', 'SP', 'RP', 'PITCHER', 'STAFF'].includes(currentPos)) sectionIsPitchers = true;
                          else if (['C', '1B', '2B', '3B', 'SS', 'OF', 'MI', 'CM', 'DH', 'CO', 'CI', 'UT', 'LF', 'CF', 'RF', 'R'].includes(currentPos)) sectionIsPitchers = false;
                      }
                  }

                  // Check for section headers
                  if (rowStr.includes('pitchers') || rowStr.includes('pitching') || rowStr.includes('staff')) {
                      sectionIsPitchers = true;
                      continue;
                  }
                  if (rowStr.includes('hitters') || rowStr.includes('hitting') || rowStr.includes('batters')) {
                      sectionIsPitchers = false;
                      continue;
                  }

                  // Process each team column
                  colToTeam.forEach((teamCode, colIdx) => {
                      // Look in current column and next few columns for player data
                      let pName = '';
                      let pPos = currentPos;
                      let pMlb = '';
                      let pPrice = 0;
                      let isBold = false;

                      // Check for player name in this cell
                      const cellAddress = utils.encode_cell({ r: i, c: colIdx });
                      const cell = sheet[cellAddress];
                      pName = String(cell?.v || '').trim();
                      isBold = cell?.s?.font?.bold === true;

                      // Skip if no player name or it's noise
                      if (!pName) return;
                      const isNoise = positions.has(pName.toUpperCase()) || 
                                      this.identifyTeam(pName) !== null ||
                                      pName.length <= 1 || 
                                      !isNaN(Number(pName)) ||
                                      pName.toLowerCase().includes('total');
                      if (isNoise) return;

                      // Look in adjacent columns for position, MLB team, price
                      for (let j = 1; j <= 5; j++) {
                          const val = String(row[colIdx + j] || '').trim();
                          if (!val) continue;
                          
                          if (positions.has(val.toUpperCase()) && !pPos) {
                              pPos = val.toUpperCase();
                          } else if (val.length >= 2 && val.length <= 3 && /^[A-Z]+$/i.test(val) && !positions.has(val.toUpperCase())) {
                              pMlb = val.toUpperCase();
                          } else if (!isNaN(Number(val)) && Number(val) > 0 && Number(val) <= 500) {
                              pPrice = parseInt(val);
                          }
                      }

                      standardizedRows.push({
                          player_name: pName,
                          team_code: teamCode,
                          mlb_team: pMlb,
                          position: pPos || currentPos || '?',
                          is_pitcher: sectionIsPitchers || ['P', 'SP', 'RP'].includes(pPos),
                          is_keeper: isBold,
                          draft_dollars: pPrice
                      });
                  });
              }
              
              log(`  Extracted ${standardizedRows.length} draft picks from grid`);
              const ws = utils.json_to_sheet(standardizedRows, { header: ['player_name', 'team_code', 'mlb_team', 'position', 'is_pitcher', 'is_keeper', 'draft_dollars'] });
              const csv = utils.sheet_to_csv(ws);
              fs.writeFileSync(path.join(this.archiveDir, `draft_${this.year}_auction.csv`), csv);
              fs.writeFileSync(path.join(this.archiveDir, `period_1.csv`), csv);
              log(`  Generated draft_${this.year}_auction.csv and period_1.csv (${standardizedRows.length} draft picks)`);
          } else {
              log(`  Could not find enough teams (found ${colToTeam.size}), falling back to standard export`);
              const csv = utils.sheet_to_csv(sheet);
              fs.writeFileSync(path.join(this.archiveDir, `draft_${this.year}_auction.csv`), csv);
              log(`  Generated draft_${this.year}_auction.csv (standard export)`);
          }
        } catch (err: unknown) {
          log(`  Error parsing Draft sheet: ${err instanceof Error ? err.message : "unknown error"}. Fallback to standard.`);
          const csv = utils.sheet_to_csv(workbook.Sheets[draftSheet]);
          fs.writeFileSync(path.join(this.archiveDir, `draft_${this.year}_auction.csv`), csv);
        }
      }


      // Standings
      if (standingsSheet) {
        try {
          const sheet = workbook.Sheets[standingsSheet];
          log(`[Standings] Analyzing layout...`);
          const rows = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
          
          let headerRowIdx = -1;
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            const rowStr = (rows[i] || []).join(' ').toLowerCase();
            if (rowStr.includes('rank') || rowStr.includes('team') || rowStr.includes('total')) {
              headerRowIdx = i;
              break;
            }
          }

          if (headerRowIdx !== -1) {
            const headerRow = (rows[headerRowIdx] || []).map(h => String(h || '').trim());
            const tableStarts: number[] = [];
            headerRow.forEach((h, idx) => {
               if (h.toLowerCase().includes('rank') || h.toLowerCase() === 'rk' || (h.toLowerCase().includes('team') && !h.toLowerCase().includes('score'))) {
                   if (tableStarts.length === 0 || idx > tableStarts[tableStarts.length - 1] + 2) tableStarts.push(idx);
               }
            });

            if (tableStarts.length > 1) {
                log(`  Unrolling side-by-side Standings (${tableStarts.length} tables)...`);
                const standardizedRows: any[] = [];
                const standardHeaders = headerRow.slice(tableStarts[0], tableStarts[1]).filter(h => h);

                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const row = rows[i] || [];
                    tableStarts.forEach((startCol, loopIdx) => {
                        const nextStart = tableStarts[loopIdx + 1] || row.length;
                         if (startCol >= row.length) return;
                         const chunk = row.slice(startCol, nextStart);
                         if (chunk.length > 0 && chunk[0] && !isNaN(Number(chunk[0]))) {
                              const rowObj: any = {};
                              standardHeaders.forEach((h, hIdx) => { if (hIdx < chunk.length) rowObj[h] = chunk[hIdx]; });
                              standardizedRows.push(rowObj);
                         }
                    });
                }
                const ws = utils.json_to_sheet(standardizedRows, { header: standardHeaders });
                fs.writeFileSync(path.join(this.archiveDir, `season_standings_${this.year}.csv`), utils.sheet_to_csv(ws));
            } else {
                fs.writeFileSync(path.join(this.archiveDir, `season_standings_${this.year}.csv`), utils.sheet_to_csv(sheet));
            }
          } else {
            fs.writeFileSync(path.join(this.archiveDir, `season_standings_${this.year}.csv`), utils.sheet_to_csv(sheet));
          }
        } catch (err: unknown) {
          log(`  Error parsing Standings: ${err instanceof Error ? err.message : "unknown error"}. Fallback.`);
          fs.writeFileSync(path.join(this.archiveDir, `season_standings_${this.year}.csv`), utils.sheet_to_csv(workbook.Sheets[standingsSheet]));
        }
        log(`Generated season_standings_${this.year}.csv`);
      }

      // Periods (2+)
      for (const p of periods) {
        if (p.p === 1 && draftSheet) continue;
        
        const sheet = workbook.Sheets[p.tabName];
        if (sheet) {
          try {
             log(`[Period ${p.p}] Analyzing layout...`);
             const rows = utils.sheet_to_json(sheet, { header: 1 }) as any[][];
             if (!rows || rows.length === 0) continue;

             let teamRowIdx = -1;
             let colToTeam = new Map<number, string>();
              const positions = new Set(['OF', 'P', '1B', '2B', '3B', 'SS', 'C', 'CM', 'MI', 'DH', 'IL1', 'IL2', 'DL', 'R', 'SP', 'RP', 'PITCHER', 'STAFF', 'CO', 'UT', 'CI', 'LF', 'CF', 'RF']);

             let isVertical = false;
             // Check for Vertical/Standard Headers FIRST
             for (let i = 0; i < Math.min(10, rows.length); i++) {
                 const rowStr = (rows[i] || []).join(' ').toLowerCase();
                 if (rowStr.includes('player_name') || rowStr.includes('team_code') || (rowStr.includes('player') && rowStr.includes('team'))) {
                     log(`  Found Standard Vertical Headers at Row ${i}. Skipping Grid Detection.`);
                     isVertical = true;
                     teamRowIdx = -1; // Ensure we don't treat this as grid
                     colToTeam.clear();
                     break;
                 }
             }

             if (!isVertical && colToTeam.size === 0) {
                 for (let i = 0; i < Math.min(10, rows.length); i++) {
                     const row = rows[i];
                     if (i === 0 || i === 1) {
                        log(`  Row ${i} raw: ${row.map(c => String(c || '').trim()).join(' | ')}`);
                     }
                 let teamsFound = 0;
                 row.forEach((cell, idx) => {
                     const val = String(cell || '').trim();
                     if (val) {
                        const code = this.identifyTeam(val);
                        if (code) {
                            colToTeam.set(idx, code);
                            teamsFound++;
                        } else if (val.length >= 3 && !!isNaN(Number(val)) && !positions.has(val.toUpperCase())) {
                            // If it's a long non-numeric string and not a position, it's likely a team name
                            colToTeam.set(idx, `UNK-${idx}`);
                            teamsFound++;
                        }
                     }
                 });
                 if (teamsFound >= 4) { // Increased threshold to avoid false positives with random text
                     teamRowIdx = i;
                     log(`  Found Team Headers at Row ${i} (Teams: ${Array.from(colToTeam.values()).join(', ')})`);
                     break;
                 }
                 if (i === 0 || i === 1) {
                    log(`  Row ${i} raw: ${row.map(c => String(c || '').trim()).join(' | ')}`);
                 }
             }

             }

              if (teamRowIdx !== -1 && colToTeam.size >= 2) {
                  // ROSTER GRID MODE
                  log(`  Entering Roster Grid Parsing Mode for Period ${p.p}`);
                  const standardizedRows: any[] = [];
                  const teamCounts = new Map<string, number>();
                  const maxPlayers = this.year <= 2022 ? 23 : 30;
                  let sectionIsPitchers = false;
                  
                  for (let i = teamRowIdx + 1; i < rows.length; i++) {
                      const row = rows[i];
                      if (!row || row.length === 0) continue;

                      const rowStr = row.join(' ').toLowerCase();
                      if (rowStr.includes('total') || rowStr.includes('standings') || rowStr.includes('salary cap')) {
                          break;
                      }

                      let currentPos = '';
                      const posColIdx = row.findIndex(c => positions.has(String(c || '').trim().toUpperCase()));
                      if (posColIdx !== -1) {
                          currentPos = String(row[posColIdx]).trim().toUpperCase();
                          if (['P', 'SP', 'RP', 'PITCHER', 'STAFF'].includes(currentPos)) sectionIsPitchers = true;
                          else sectionIsPitchers = false;
                      }

                      if (rowStr.includes('pitchers') || rowStr.includes('pitching') || rowStr.includes('staff')) {
                          sectionIsPitchers = true;
                      }

                       colToTeam.forEach((teamCode, colIdx) => {
                           const cellAddress = utils.encode_cell({ r: i, c: colIdx });
                           const cell = sheet[cellAddress];
                           const pName = String(cell?.v || '').trim();
                           const isBold = cell?.s?.font?.bold === true;
                           
                           const count = teamCounts.get(teamCode) || 0;
                           if (count >= maxPlayers) return;

                           const isNoise = 
                               positions.has(pName.toUpperCase()) || 
                               this.identifyTeam(pName) !== null || 
                               pName.length <= 1 || 
                               pName.includes('/') || 
                               !isNaN(Number(pName));

                           if (pName && !isNoise) {
                                standardizedRows.push({
                                    player_name: pName,
                                    team_code: teamCode,
                                    position: currentPos || (teamCode ? '??' : ''),
                                    is_pitcher: sectionIsPitchers || currentPos === 'P' || currentPos === 'SP' || currentPos === 'RP' || currentPos === 'PITCHER' || currentPos === 'STAFF',
                                    is_keeper: isBold
                                });
                                teamCounts.set(teamCode, count + 1);
                           }
                       });
                   }

                  const ws = utils.json_to_sheet(standardizedRows);
                  const csv = utils.sheet_to_csv(ws);
                  fs.writeFileSync(path.join(this.archiveDir, `period_${p.p}.csv`), csv);
                  log(`  Generated period_${p.p}.csv (${standardizedRows.length} players unrolled)`);

              } else {
                  // VERTICAL / STANDARD MODE
                  log(`  Falling back to Vertical/Unroll Mode for Period ${p.p}`);
                  
                  let headerRowIdx = -1;
                  for (let i = 0; i < Math.min(50, rows.length); i++) {
                    const rowStr = (rows[i] || []).join(' ').toLowerCase();
                    if (rowStr.includes('player') || rowStr.includes('team')) {
                      headerRowIdx = i;
                      break;
                    }
                  }

                  if (headerRowIdx === -1) {
                     const csv = utils.sheet_to_csv(sheet);
                     fs.writeFileSync(path.join(this.archiveDir, `period_${p.p}.csv`), csv);
                     continue;
                  }
                  
                  const headerRow = (rows[headerRowIdx] || []).map(h => String(h || '').trim());
                  const tableStarts: number[] = [];
                  headerRow.forEach((h, idx) => {
                     const lower = h.toLowerCase();
                     if (lower.includes('player') || lower === 'name') {
                        if (tableStarts.length === 0 || idx > tableStarts[tableStarts.length - 1] + 2) tableStarts.push(idx);
                     }
                  });

                  const standardizedRows: any[] = [];
                  const standardHeaders = headerRow.slice(tableStarts[0], tableStarts.length > 1 ? tableStarts[1] : undefined).filter(h => h);
                  let sectionIsPitchers = false;

                  for (let i = headerRowIdx + 1; i < rows.length; i++) {
                     const row = rows[i] || [];
                     const rowStr = row.join(' ').toLowerCase();

                     if (rowStr.includes('pitchers') || rowStr.includes('pitching') || rowStr.includes('staff')) {
                         sectionIsPitchers = true;
                     }
                     if (row.some(c => ['OF', 'C', '1B', '2B', 'SS', '3B'].includes(String(c || '').toUpperCase()))) {
                         sectionIsPitchers = false;
                     }

                     tableStarts.forEach((startCol, loopIdx) => {
                        const cellAddress = utils.encode_cell({ r: i, c: startCol });
                        const cell = sheet[cellAddress];
                        const pName = String(cell?.v || '').trim();
                        if (!pName) return;

                        const nextStart = tableStarts[loopIdx + 1] || row.length;
                        const chunk = row.slice(startCol, nextStart);
                        const rowObj: any = {};
                        standardHeaders.forEach((h, hIdx) => { if (hIdx < chunk.length) rowObj[h] = chunk[hIdx]; });
                        
                        rowObj.is_keeper = cell?.s?.font?.bold === true;

                        const pos = String(rowObj.position || rowObj.pos || '').toUpperCase();
                        if (['P', 'SP', 'RP', 'PITCHER', 'STAFF'].includes(pos)) sectionIsPitchers = true;

                        rowObj.is_pitcher = sectionIsPitchers || ['P', 'SP', 'RP'].includes(pos);
                        standardizedRows.push(rowObj);
                     });
                  }

                  const ws = utils.json_to_sheet(standardizedRows, { header: standardHeaders });
                  const csv = utils.sheet_to_csv(ws);
                  fs.writeFileSync(path.join(this.archiveDir, `period_${p.p}.csv`), csv);
                  log(`  Generated period_${p.p}.csv (vertical unroll ${standardizedRows.length} rows)`);
              }

          } catch (unrollErr: any) {
              log(`ERROR unrolling Period ${p.p}: ${unrollErr.message}. Falling back to standard CSV.`);
              const csv = utils.sheet_to_csv(sheet);
              fs.writeFileSync(path.join(this.archiveDir, `period_${p.p}.csv`), csv);
          }
        }
      }

      await this.importToDatabase(periods, log);

      log('Import complete successfully.');
      return { success: true, messages: logs };

    } catch (err: unknown) {
      log(`CRITICAL ERROR: ${err instanceof Error ? err.message : "unknown error"}`);
      return { success: false, messages: logs };
    }
  }

  private async importToDatabase(periods: PeriodDefinition[], log: (msg: string) => void) {
    const leagueId = 1;
    const year = this.year;
    
    // Expected player counts: 23 before 2023, 30 from 2023 onwards
    const expectedPlayers = year <= 2022 ? 23 : 30;
    
    log('Building player knowledge base from existing database...');
    const allStats = await prisma.historicalPlayerStat.findMany({
      select: { playerName: true, fullName: true, mlbId: true, position: true, mlbTeam: true, isPitcher: true },
      distinct: ['playerName'] 
    });
    
    const exactLookup = new Map<string, any>();
    const fuzzyLookup: { last: string; firstInitial: string; isPitcher: boolean; full: any }[] = [];

    allStats.forEach(s => {
      if (!exactLookup.has(s.playerName)) exactLookup.set(s.playerName, s);
      const parts = (s.fullName || '').trim().split(' ');
      if (parts.length >= 2) {
        const last = parts[parts.length - 1].toLowerCase();
        const first = parts[0].toLowerCase();
        fuzzyLookup.push({ last, firstInitial: first[0], isPitcher: s.isPitcher, full: s });
      }
    });

    const findMatch = (rawName: string, isPitcherGuess: boolean): { match: any; note?: string } => {
      if (exactLookup.has(rawName)) return { match: exactLookup.get(rawName) };
      let last = '';
      let firstInit = '';
      const cleanName = rawName.toLowerCase().replace('.', '').replace(',', '');
      const parts = cleanName.split(' ');
      if (parts.length >= 2) {
        if (parts[1].length === 1) { last = parts[0]; firstInit = parts[1]; } 
        else if (parts[0].length === 1) { firstInit = parts[0]; last = parts[parts.length - 1]; }
        else { firstInit = parts[0][0]; last = parts[parts.length - 1]; }
      }
      if (last && firstInit) {
        const candidates = fuzzyLookup.filter(p => p.last === last && p.firstInitial === firstInit && p.isPitcher === isPitcherGuess);
        if (candidates.length === 1) return { match: candidates[0].full, note: `Fuzzy matched "${rawName}" to "${candidates[0].full.fullName}"` };
      }
      return { match: null };
    };

    const season = await prisma.historicalSeason.upsert({
      where: { year_leagueId: { year: this.year, leagueId } },
      create: { year: this.year, leagueId },
      update: {},
    });

    for (const p of periods) {
      const fileName = `period_${p.p}.csv`;
      const csvPath = path.join(this.archiveDir, fileName);
      if (!fs.existsSync(csvPath)) continue;
      log(`Importing Period ${p.p}...`);
      const fileContent = fs.readFileSync(csvPath, 'utf-8');
      const records = parse(fileContent.replace(/^\uFEFF/, ''), {
        columns: (header) => header.map((h: string) => h.toLowerCase().trim()),
        skip_empty_lines: true,
        relax_column_count: true
      });

      const period = await prisma.historicalPeriod.upsert({
        where: { seasonId_periodNumber: { seasonId: season.id, periodNumber: p.p } },
        create: { seasonId: season.id, periodNumber: p.p, startDate: p.start, endDate: p.end },
        update: { startDate: p.start, endDate: p.end }
      });

      await prisma.historicalPlayerStat.deleteMany({ where: { periodId: period.id } });

      const teamValidation: Record<string, { hitters: number; pitchers: number; total: number }> = {};

      for (const rowItem of records) {
        const row = rowItem as any;
        const pName = row.player_name || row.player || row.name || row['player name'];
        const team = row.team_code || row.team || row.user || row['fantasy team'];
        if (!pName || !team) continue;
        
        const teamCode = team.toUpperCase();
        if (!teamValidation[teamCode]) {
            teamValidation[teamCode] = { hitters: 0, pitchers: 0, total: 0 };
        }

        const w = this.toNum(row.w || row.wins);
        const sv = this.toNum(row.sv || row.saves);
        const ip = parseFloat(row.ip || '0') || 0;
        
        const isPitcherFlag = String(row.is_pitcher || '').toLowerCase();
        const rowPos = String(row.position || row.pos || '').toUpperCase();
        const isPitcher = (isPitcherFlag === 'true' || isPitcherFlag === '1' || isPitcherFlag === 'p') || 
                           ((w + sv + ip) > 0) ||
                           (['P', 'SP', 'RP', 'PITCHER', 'STAFF'].includes(rowPos));
        
        if (isPitcher) teamValidation[teamCode].pitchers++;
        else teamValidation[teamCode].hitters++;
        teamValidation[teamCode].total++;

        const position = row.position || row.pos || (isPitcher ? 'P' : null);
        const { match, note } = findMatch(pName, isPitcher);
        if (note && (note.startsWith('AMBIGUOUS') || note.startsWith('Fuzzy'))) log(`[Match] ${note}`);

        await prisma.historicalPlayerStat.create({
          data: {
            periodId: period.id,
            playerName: pName,
            fullName: match?.fullName || pName,
            mlbId: match?.mlbId || null,
            teamCode: teamCode,
            isPitcher,
            position: match?.position || position,
            mlbTeam: match?.mlbTeam || null,
            draftDollars: this.toNum(row.draft_dollars || row.price || row.dollars),
            isKeeper: row.is_keeper === 'true' || row.is_keeper === true,
            AB: this.toNum(row.ab),
            H: this.toNum(row.h),
            R: this.toNum(row.r),
            HR: this.toNum(row.hr),
            RBI: this.toNum(row.rbi),
            SB: this.toNum(row.sb),
            AVG: parseFloat(row.avg || row.ba || '0'),
            GS: this.toNum(row.gs || row.grand_slams || row.grandslams),
            W: w,
            SV: sv,
            K: this.toNum(row.k || row.so || row.strikeouts),
            IP: ip,
            ER: this.toNum(row.er),
            ERA: parseFloat(row.era || '0'),
            WHIP: parseFloat(row.whip || '0'),
            SO: this.toNum(row.sho || row.shutouts || row['shut outs'])
          }
        });
      }

      // Log validation summary for this period
      log(`[Validation] Summary for Period ${p.p}:`);
      Object.entries(teamValidation).forEach(([code, counts]) => {
        const warning = counts.total !== expectedPlayers ? ` ⚠️ (Expected ${expectedPlayers})` : '';
        log(`  - ${code}: ${counts.hitters} Hitters, ${counts.pitchers} Pitchers (Total: ${counts.total})${warning}`);
      });
    }

    // Delete orphaned periods (periods in DB but not in this Excel upload)
    const validPeriodNumbers = periods.map(p => p.p);
    const orphanedPeriods = await prisma.historicalPeriod.findMany({
      where: { 
        seasonId: season.id, 
        periodNumber: { notIn: validPeriodNumbers }
      },
      select: { id: true, periodNumber: true }
    });
    if (orphanedPeriods.length > 0) {
      log(`[Cleanup] Deleting ${orphanedPeriods.length} orphaned periods: ${orphanedPeriods.map(p => p.periodNumber).join(', ')}`);
      for (const orphan of orphanedPeriods) {
        await prisma.historicalPlayerStat.deleteMany({ where: { periodId: orphan.id } });
        await prisma.historicalPeriod.delete({ where: { id: orphan.id } });
      }
    }

    const standingsPath = path.join(this.archiveDir, `season_standings_${this.year}.csv`);
    if (fs.existsSync(standingsPath)) {
        log(`Importing Standings...`);
        const content = fs.readFileSync(standingsPath, 'utf-8');
        const records = parse(content.replace(/^\uFEFF/, ''), {
            columns: (header) => header.map((h: string) => h.toLowerCase().trim()),
            skip_empty_lines: true,
            relax_column_count: true
        });
        await prisma.historicalStanding.deleteMany({ where: { seasonId: season.id } });
        for (const rowItem of records) {
            const row = rowItem as any;
            const teamName = row.team_name || row.team || row.user || row['fantasy team'] || row['name'];
            if (!teamName) continue;
            let teamCode = row.team_code || this.identifyTeam(String(teamName)) || '';
            if (!teamCode) continue;
            await prisma.historicalStanding.create({
                data: {
                    seasonId: season.id,
                    teamCode: teamCode.toUpperCase(),
                    teamName: teamName,
                    totalScore: this.toNum(row.total_score || row.total || row.score || row.pts),
                    finalRank: this.toNum(row.final_rank || row.rank || row.rk || row.pos),
                    R_score: this.toNum(row.r_score || row.r), HR_score: this.toNum(row.hr_score || row.hr), RBI_score: this.toNum(row.rbi_score || row.rbi), SB_score: this.toNum(row.sb_score || row.sb), AVG_score: this.toNum(row.avg_score || row.avg),
                    W_score: this.toNum(row.w_score || row.w), SV_score: this.toNum(row.sv_score || row.sv), K_score: this.toNum(row.k_score || row.k), ERA_score: this.toNum(row.era_score || row.era), WHIP_score: this.toNum(row.whip_score || row.whip),
                }
            });
        }
    }
  }

  private toNum(val: any): number {
    return parseInt(val) || 0;
  }

  private identifyTeam(val: string): string | null {
      if (!val) return null;
      // Aggressive normalization: lowercase and remove all non-alphanumeric chars
      const v = val.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!v) return null;
      
      const debug = this.year === 2009 || this.year === 2004;

      const known: { [name: string]: string } = {
          "dodgerdawgs": "DDG", "dodger": "DDG", "devildawgs": "DEV", "devil": "DEV", "dawgs": "DEV",
          "diamondkings": "DKG", "diamond": "DKG", "kings": "DKG", "dkkings": "DKG",
          "demolitionlumber": "DMK", "demolition": "DMK", "lumber": "DMK",
          "skunkdogs": "SKD", "skunk": "SKD", "skunkdogs2": "SKD",
          "rgingsluggers": "RGS", "ragingsluggers": "RGS", "rging": "RGS", "raging": "RGS", "sluggers": "RGS",
          "losdoyers": "LDY", "doyers": "LDY", "los": "LDY",
          "theshow": "SHO", "show": "SHO",
          "foultip": "FTP", "foul": "FTP", "tip": "FTP",
          "bigunit": "BGU", "unit": "BGU", "big": "BGU",
          "theblacksox": "BSX", "blacksox": "BSX", "sox": "BSX",
          "thefluffers": "FLU", "fluffers": "FLU",
          "the": "SHO",
          // 2009 specific
          "bohica": "BOH", "boh": "BOH",
          "moneyball": "MNB", "money": "MNB", "mnb": "MNB",
          // 2004 specific
          "balcos": "BCS", "thebalcos": "BCS", 
          "vip": "BCS", "thevips": "BCS", "vips": "BCS",
          "sockexchange": "BCS", "nysockexchange": "BCS",
          "brothers": "BRO", "brothersinc": "BRO",
          "crush": "BRO", "thecrush": "BRO"
      };
      
      // 1. Exact match vs normalized names
      if (known[v]) {
        if (debug) console.log(`  [identifyTeam] Matched "${val}" (normalized: "${v}") -> ${known[v]}`);
        return known[v];
      }
      
      // 2. Exact match vs known values (codes)
      const values = new Set(Object.values(known));
      if (values.has(val.trim().toUpperCase())) {
        return val.trim().toUpperCase();
      }

      // 3. Partial match vs normalized names
      const sortedKeys = Object.keys(known).sort((a, b) => b.length - a.length);
      for (const name of sortedKeys) {
          if (name.length > 3 && (v.includes(name) || name.includes(v))) {
             if (debug) console.log(`  [identifyTeam] Fuzzy Matched "${val}" (normalized: "${v}") to "${name}" -> ${known[name]}`);
             return known[name];
          }
      }
      if (debug) console.log(`  [identifyTeam] FAILED to match "${val}" (normalized: "${v}")`);
      return null;
  }
}
