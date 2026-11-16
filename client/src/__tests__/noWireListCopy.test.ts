import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The feature is called "List" in everything a user sees. Code names, routes and
// file names keep "WireList". This walks non-test source and flags string
// literals / JSX text that still say "Wire List" (any case).
const SRC = path.resolve(__dirname, "..");
// The help text itself must say "wire list".
const EXEMPT = new Set([path.join(SRC, "components/shared/ListHelp.tsx")]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) && !EXEMPT.has(full)) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

describe("no visible 'Wire List' copy", () => {
  it("has no string literal or JSX text saying Wire List", () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const code = stripComments(fs.readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        // Quoted/JSX-inline text, or a JSX text line that is plain words only.
        if (
          /["'>`]\s*[^"'<`]*\bWire List\b/i.test(line) ||
          /^\s*[^<>{}=;()"'`]*\bWire List\b/i.test(line)
        ) {
          hits.push(`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
