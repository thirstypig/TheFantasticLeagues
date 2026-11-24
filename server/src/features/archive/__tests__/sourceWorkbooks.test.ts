import { describe, expect, it } from "vitest";
import { SOURCE_WORKBOOKS, sourceWorkbookFor, workbookObjectKey } from "../sourceWorkbooks.js";

describe("source workbook registry", () => {
  it("has exactly one workbook for every archived season, 2003 through 2025", () => {
    const years = SOURCE_WORKBOOKS.map((w) => w.year);
    expect(years).toEqual(Array.from({ length: 23 }, (_, i) => 2003 + i));
  });

  it("records a real SHA-256 and size for each, and keys storage by the hash", () => {
    for (const w of SOURCE_WORKBOOKS) {
      expect(w.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(w.bytes).toBeGreaterThan(0);
      expect(workbookObjectKey(w)).toBe(`${w.sha256}.xls`);
    }
  });

  it("names each file for its own season, except 2003, whose rosters live in the 2004 workbook", () => {
    for (const w of SOURCE_WORKBOOKS) {
      expect(w.fileName).toContain(String(w.year === 2003 ? 2004 : w.year));
    }
    expect(sourceWorkbookFor(2003)!.sha256).toBe(sourceWorkbookFor(2004)!.sha256);
  });

  it("has no workbook for a season that isn't archived", () => {
    expect(sourceWorkbookFor(2026)).toBeUndefined();
  });
});
