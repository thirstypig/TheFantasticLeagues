import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseFrontmatter,
  applyBlock,
  statusBlock,
  trackedFiles,
  GENERATED_OUTPUTS,
  KNOWN_TYPES,
  KNOWN_STATUS,
  START,
  END,
} from "../refresh-docs.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const rd = (p) => readFileSync(join(REPO_ROOT, p), "utf8");

describe("parseFrontmatter", () => {
  it("parses scalars and strips quotes", () => {
    const fm = parseFrontmatter(`---\nid: DOC-001\ntitle: "A Title"\nstatus: active\n---\n\nbody`);
    expect(fm).toMatchObject({ id: "DOC-001", title: "A Title", status: "active" });
  });

  it("returns null when there is no frontmatter", () => {
    expect(parseFrontmatter("# Heading\n\nbody")).toBeNull();
  });

  it("does not treat a mid-document --- rule as frontmatter", () => {
    expect(parseFrontmatter("# Title\n\n---\n\nid: not-frontmatter\n")).toBeNull();
  });
});

/**
 * THE convergence guard.
 *
 * stats.md reports a line total computed over tracked files. It is itself a tracked
 * file, so counting it means writing it changes the number it just wrote — the
 * generator never converges. That shipped on 2026-07-24 and was caught only because
 * `--check` happened to be run twice.
 *
 * These tests fail if a future generated output is added without being excluded.
 */
describe("self-reference / convergence", () => {
  it("every file the generator writes is excluded from its own line counts", () => {
    // The write targets, read straight out of main()'s output list.
    const src = rd("scripts/refresh-docs.mjs");
    const written = [...src.matchAll(/\{\s*path:\s*"([^"]+)"\s*,\s*content:/g)].map((m) => m[1]);
    expect(written.length).toBeGreaterThan(0);
    for (const p of written) {
      expect(GENERATED_OUTPUTS.has(p), `${p} is generated but not in GENERATED_OUTPUTS — stats.md will never converge`).toBe(true);
    }
  });

  it("also excludes the inbox, which sync-inbox.mjs generates", () => {
    expect(GENERATED_OUTPUTS.has("docs/INBOX.md")).toBe(true);
  });

  it("the excluded set is non-empty and all paths actually exist", () => {
    expect(GENERATED_OUTPUTS.size).toBeGreaterThanOrEqual(4);
    for (const p of GENERATED_OUTPUTS) expect(() => rd(p)).not.toThrow();
  });
});

describe("applyBlock — the README/CLAUDE marker block", () => {
  const block = statusBlock(trackedFiles());

  it("is idempotent: re-applying a current block reports no change", () => {
    // Assumes `npm run docs:refresh` has been run (CI runs --check, which enforces it).
    for (const f of ["README.md", "CLAUDE.md"]) {
      const r = applyBlock(f, block);
      expect(r.changed, `${f} would change — run npm run docs:refresh`).toBe(false);
    }
  });

  it("produces exactly one marker pair — never nests or duplicates", () => {
    for (const f of ["README.md", "CLAUDE.md"]) {
      const { next } = applyBlock(f, block);
      expect(next.split(START).length - 1).toBe(1);
      expect(next.split(END).length - 1).toBe(1);
    }
  });

  it("never removes existing content outside the markers", () => {
    for (const f of ["README.md", "CLAUDE.md"]) {
      const before = rd(f);
      const { next } = applyBlock(f, block);
      const outside = (s) => s.slice(0, s.indexOf(START)) + s.slice(s.indexOf(END) + END.length);
      expect(outside(next)).toBe(outside(before));
    }
  });

  it("appends markers when a file has none, rather than dropping the block", () => {
    // package.json has no markers; applyBlock must append, not silently no-op.
    const r = applyBlock("package.json", block);
    expect(r.action).toBe("markers appended");
    expect(r.next).toContain(START);
    expect(r.next.startsWith(rd("package.json").trimEnd())).toBe(true); // original preserved
  });

  it("reports skipped for a file that does not exist", () => {
    expect(applyBlock("does-not-exist.md", block).action).toBe("skipped (missing)");
  });
});

/**
 * The KNOWN_TYPES / KNOWN_STATUS sets carry a comment saying they are "kept in sync
 * by hand" with docs/README-DOCS.md §4. Hand-sync decays; this enforces it, so the
 * off-vocabulary counts in stats.md stay meaningful.
 */
describe("controlled vocabulary stays in sync with README-DOCS", () => {
  const readme = rd("docs/README-DOCS.md");

  it("every type listed in README-DOCS §4 is known to the generator", () => {
    const section = readme.slice(readme.indexOf("## 4. The `type` list"), readme.indexOf("## 5."));
    // Only the ` · `-separated vocabulary runs, not surrounding prose — otherwise the
    // literal word `type` in "The `type` list" is scraped as if it were a type.
    const types = section
      .split("\n")
      .filter((l) => l.includes("` · `") || /^`[a-z-]+`( ·|$)/.test(l.trim()))
      .flatMap((l) => [...l.matchAll(/`([a-z][a-z-]*)`/g)].map((m) => m[1]));
    expect(types.length).toBeGreaterThan(10);
    const missing = [...new Set(types)].filter((t) => !KNOWN_TYPES.has(t));
    expect(missing, `types documented in README-DOCS §4 but unknown to refresh-docs.mjs: ${missing.join(", ")}`).toEqual([]);
  });

  it("the status vocabulary matches the documented five", () => {
    expect([...KNOWN_STATUS].sort()).toEqual(["active", "deprecated", "done", "draft", "locked"]);
    for (const s of KNOWN_STATUS) expect(readme).toContain(`\`${s}\``);
  });
});

/**
 * todo #309 — the filename is the ONLY source of truth for a todo's status.
 *
 * Status used to live in two places that disagreed: 87 of 308 files said
 * `complete` in the filename and `status: pending` in the frontmatter. Nothing
 * READ the frontmatter key (refresh-docs derives open/closed from the filename
 * at both call sites), so no count was ever wrong — but every human and agent
 * that opened one of those files read "pending" on finished work.
 *
 * The fix was to delete the second source rather than synchronise it. This
 * test is what stops it growing back: a template or a copied file that
 * reintroduces `status:` fails here.
 */
describe("todos — one source of truth for status", () => {
  const todoFiles = readdirSync(join(REPO_ROOT, "todos")).filter((f) => f.endsWith(".md"));

  it("has todo files to check", () => {
    expect(todoFiles.length).toBeGreaterThan(0);
  });

  it("no todo carries a frontmatter status: key — the filename decides", () => {
    const offenders = todoFiles.filter((f) => {
      const body = rd(join("todos", f));
      if (!body.startsWith("---")) return false;
      const end = body.indexOf("\n---", 3);
      if (end === -1) return false;
      return /^status:/m.test(body.slice(0, end));
    });
    expect(offenders, `status: is not read by anything — the filename is the source of truth. Remove it from: ${offenders.join(", ")}`).toEqual([]);
  });

  it("every todo has frontmatter and a priority", () => {
    const bad = todoFiles.filter((f) => {
      const body = rd(join("todos", f));
      if (!body.startsWith("---")) return true;
      const end = body.indexOf("\n---", 3);
      return end === -1 || !/^priority:\s*p[0-3]\s*$/m.test(body.slice(0, end));
    });
    expect(bad, `missing frontmatter or priority: ${bad.join(", ")}`).toEqual([]);
  });

  it("filename state is always pending or complete", () => {
    const bad = todoFiles.filter((f) => !["pending", "complete"].includes(f.split("-")[1]));
    expect(bad, `unexpected state segment: ${bad.join(", ")}`).toEqual([]);
  });
});
