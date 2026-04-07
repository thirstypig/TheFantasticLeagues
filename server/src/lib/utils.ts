
/**
 * Returns tomorrow at 00:00 Pacific time.
 * Used for roster effective dates — both acquiredAt and releasedAt
 * are set to this so old owner keeps today's stats, new owner starts tomorrow.
 */
export function nextDayEffective(): Date {
  const now = new Date();
  // Get today's date in Pacific time (handles PST/PDT automatically)
  const pacific = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(now); // "2026-03-30" (YYYY-MM-DD format from en-CA locale)
  // Parse as a plain date (noon UTC avoids any date-boundary issues)
  const today = new Date(pacific + "T12:00:00Z");
  today.setUTCDate(today.getUTCDate() + 1);
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

/** Get ISO week key like "2026-W13" for weekly dedup. */
export function getWeekKey(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** Convert ISO weekKey like "2026-W14" to the Monday Date of that week. */
export function weekKeyToMonday(weekKey: string): Date {
  const [yearStr, weekStr] = weekKey.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7; // Mon=1..Sun=7
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dow + 1 + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Format a weekKey as a compact label like "Mar 24". */
export function weekKeyLabel(weekKey: string): string {
  const monday = weekKeyToMonday(weekKey);
  return monday.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse baseball innings pitched notation to true decimal.
 * MLB uses "5.2" to mean 5⅔ innings (not 5.2 decimal).
 * The fractional part represents thirds: .0=0, .1=⅓, .2=⅔.
 */
export function parseIP(v: unknown): number {
  const s = String(v ?? "0").trim();
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 10); // .1 or .2
  return whole + frac / 3;
}

export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes";
  }
  return v === 1;
}

export function norm(v: unknown): string {
  return String(v ?? "").trim();
}

export function normCode(v: unknown): string {
  return norm(v).toUpperCase();
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const results: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    results.push(arr.slice(i, i + size));
  }
  return results;
}

export function mustOneOf(v: string, allowed: string[], name: string): string {
  if (!allowed.includes(v)) throw new Error(`Invalid ${name}. Allowed: ${allowed.join(", ")}`);
  return v;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseIntParam(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}
