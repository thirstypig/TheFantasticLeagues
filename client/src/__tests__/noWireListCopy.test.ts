import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// The feature is called "List" in everything a user sees. Code names, routes and
// file names keep "WireList". This parses non-test source and flags every piece
// of user-visible text (JSX text, string and template literals) that still says
// "Wire List" (any case). Parsing instead of matching lines means multi-line JSX
// text with punctuation can't slip through, and comments are never seen (todo #316).
const SRC = path.resolve(__dirname, "..");
// The help text itself must say "wire list".
const EXEMPT = new Set([path.join(SRC, "components/shared/ListHelp.tsx")]);
const WIRE_LIST = /\bwire\s+list\b/i;

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

/** Returns "line: text" for each text node in `source` that says Wire List. */
function findWireListCopy(source: string, fileName: string): string[] {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    let text: string | undefined;
    if (ts.isJsxText(node)) text = node.text;
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    if (text !== undefined && WIRE_LIST.test(text)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push(`${line + 1}: ${text.trim().replace(/\s+/g, " ")}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("findWireListCopy", () => {
  it("flags multi-line JSX text containing punctuation", () => {
    const src = `export const A = () => (\n  <p>\n    Open your Wire List (period); then = save\n  </p>\n);\n`;
    expect(findWireListCopy(src, "a.tsx")).toEqual(["3: Open your Wire List (period); then = save"]);
  });

  it("flags string, attribute and template literals", () => {
    const src = [
      `const a = "Wire List";`,
      `const b = <X title='wire list' />;`,
      "const c = `Your ${n} WIRE LIST items`;",
      "const d = `wire list`;",
    ].join("\n");
    expect(findWireListCopy(src, "b.tsx")).toHaveLength(4);
  });

  it("ignores identifiers, import paths and comments", () => {
    const src = [
      `import { WireListPanel } from "./WireListPanel";`,
      `// Wire List was renamed`,
      `/* the Wire List page */`,
      `const wireListApi = useWireList();`,
      `export const P = () => <WireListPanel />; // Wire List`,
    ].join("\n");
    expect(findWireListCopy(src, "c.tsx")).toEqual([]);
  });
});

describe("no visible 'Wire List' copy", () => {
  it("has no JSX text or string literal saying Wire List", () => {
    const hits = walk(SRC).flatMap((file) =>
      findWireListCopy(fs.readFileSync(file, "utf8"), file).map(
        (h) => `${path.relative(SRC, file)}:${h}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});
