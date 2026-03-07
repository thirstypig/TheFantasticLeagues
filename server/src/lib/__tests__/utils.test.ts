import { describe, it, expect } from "vitest";
import { toNum, toBool, norm, normCode, parseCsv, splitCsvLine, chunk, parseIntParam } from "../utils.js";

describe("toNum", () => {
  it("converts numeric strings", () => {
    expect(toNum("42")).toBe(42);
    expect(toNum("3.14")).toBe(3.14);
    expect(toNum("-7")).toBe(-7);
  });

  it("passes through numbers", () => {
    expect(toNum(100)).toBe(100);
    expect(toNum(0)).toBe(0);
  });

  it("returns 0 for non-finite values", () => {
    expect(toNum(NaN)).toBe(0);
    expect(toNum(Infinity)).toBe(0);
    expect(toNum(-Infinity)).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum(null)).toBe(0);
    expect(toNum("abc")).toBe(0);
    expect(toNum("")).toBe(0);
  });
});

describe("toBool", () => {
  it("passes through booleans", () => {
    expect(toBool(true)).toBe(true);
    expect(toBool(false)).toBe(false);
  });

  it("converts truthy strings", () => {
    expect(toBool("true")).toBe(true);
    expect(toBool("TRUE")).toBe(true);
    expect(toBool("True")).toBe(true);
    expect(toBool("1")).toBe(true);
    expect(toBool("yes")).toBe(true);
    expect(toBool("YES")).toBe(true);
  });

  it("converts falsy strings", () => {
    expect(toBool("false")).toBe(false);
    expect(toBool("0")).toBe(false);
    expect(toBool("no")).toBe(false);
    expect(toBool("")).toBe(false);
    expect(toBool("random")).toBe(false);
  });

  it("handles numeric input", () => {
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool(2)).toBe(false); // only 1 is truthy
  });

  it("handles string with whitespace", () => {
    expect(toBool("  true  ")).toBe(true);
    expect(toBool("  yes  ")).toBe(true);
  });
});

describe("norm", () => {
  it("trims and converts to string", () => {
    expect(norm("  hello  ")).toBe("hello");
    expect(norm("test")).toBe("test");
  });

  it("handles null/undefined", () => {
    expect(norm(null)).toBe("");
    expect(norm(undefined)).toBe("");
  });

  it("handles numbers", () => {
    expect(norm(42)).toBe("42");
  });
});

describe("normCode", () => {
  it("trims and uppercases", () => {
    expect(normCode("nyy")).toBe("NYY");
    expect(normCode("  bos  ")).toBe("BOS");
  });

  it("handles null/undefined", () => {
    expect(normCode(null)).toBe("");
    expect(normCode(undefined)).toBe("");
  });
});

describe("splitCsvLine", () => {
  it("splits simple comma-separated values", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace from values", () => {
    expect(splitCsvLine("a , b , c")).toEqual(["a", "b", "c"]);
  });

  it("handles quoted fields with commas", () => {
    expect(splitCsvLine('"hello, world",b,c')).toEqual([
      "hello, world",
      "b",
      "c",
    ]);
  });

  it("handles empty fields", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });

  it("handles single value", () => {
    expect(splitCsvLine("only")).toEqual(["only"]);
  });
});

describe("parseCsv", () => {
  it("parses CSV with headers", () => {
    const csv = "Name,Age,City\nAlice,30,NYC\nBob,25,LA";
    const result = parseCsv(csv);
    expect(result).toEqual([
      { Name: "Alice", Age: "30", City: "NYC" },
      { Name: "Bob", Age: "25", City: "LA" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("handles header-only CSV", () => {
    expect(parseCsv("Name,Age")).toEqual([]);
  });

  it("fills missing values with empty string", () => {
    const csv = "A,B,C\n1,2";
    const result = parseCsv(csv);
    expect(result).toEqual([{ A: "1", B: "2", C: "" }]);
  });

  it("handles Windows line endings", () => {
    const csv = "Name,Age\r\nAlice,30\r\nBob,25";
    const result = parseCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].Name).toBe("Alice");
  });
});

describe("chunk", () => {
  it("splits array into chunks of given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("handles exact divisor", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("handles chunk size larger than array", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("handles empty array", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("handles chunk size of 1", () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});

describe("parseIntParam", () => {
  it("parses valid integer strings", () => {
    expect(parseIntParam("42")).toBe(42);
    expect(parseIntParam("0")).toBe(0);
    expect(parseIntParam("-5")).toBe(-5);
  });

  it("parses integer numbers", () => {
    expect(parseIntParam(42)).toBe(42);
  });

  it("returns null for floats", () => {
    expect(parseIntParam(3.14)).toBeNull();
    expect(parseIntParam("3.14")).toBeNull();
  });

  it("returns null for non-numeric values", () => {
    expect(parseIntParam("abc")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(parseIntParam(null)).toBeNull();
    expect(parseIntParam(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseIntParam("")).toBeNull();
    expect(parseIntParam("  ")).toBeNull();
  });

  it("handles strings with whitespace around numbers", () => {
    expect(parseIntParam("  42  ")).toBe(42);
  });

  it("returns null for Infinity and NaN", () => {
    expect(parseIntParam(Infinity)).toBeNull();
    expect(parseIntParam(-Infinity)).toBeNull();
    expect(parseIntParam(NaN)).toBeNull();
  });
});
