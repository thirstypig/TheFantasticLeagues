import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  stripCodeFences,
  tidyFilename,
  extractTitle,
  extractDescription,
  sectionFor,
  isExcluded,
  badgesFor,
  buildIndex,
  searchDocs,
  groupBySection,
  SECTIONS,
} from "../docsIndex";

/* ── frontmatter ──────────────────────────────────────────────────── */

describe("parseFrontmatter", () => {
  it("parses scalars, inline lists, and strips quotes", () => {
    const { fm, body } = parseFrontmatter(
      `---\nid: PRD-001\ntitle: "Player Comparison"\ntags: [players, transactions]\nlinks: []\n---\n\n# Heading\n`,
    );
    expect(fm?.id).toBe("PRD-001");
    expect(fm?.title).toBe("Player Comparison");
    expect(fm?.tags).toEqual(["players", "transactions"]);
    expect(fm?.links).toEqual([]);
    expect(body.trim()).toBe("# Heading");
  });

  it("returns null and the untouched body when there is no frontmatter", () => {
    const { fm, body } = parseFrontmatter("# Just a heading\n\ntext");
    expect(fm).toBeNull();
    expect(body).toBe("# Just a heading\n\ntext");
  });

  it("does not treat a mid-document --- rule as frontmatter", () => {
    const { fm } = parseFrontmatter("# Title\n\n---\n\nkey: not-frontmatter\n");
    expect(fm).toBeNull();
  });
});

/* ── the code-fence guard — the whole reason this module exists ───── */

describe("stripCodeFences", () => {
  it("removes backtick-fenced blocks", () => {
    expect(stripCodeFences("a\n```bash\n# not a title\n```\nb")).not.toContain("# not a title");
  });

  it("removes tilde-fenced blocks", () => {
    expect(stripCodeFences("a\n~~~\n# not a title\n~~~\nb")).not.toContain("# not a title");
  });

  it("leaves prose untouched", () => {
    expect(stripCodeFences("# Real title\n\ntext")).toContain("# Real title");
  });
});

describe("extractTitle", () => {
  it("prefers frontmatter title over an H1", () => {
    expect(extractTitle("docs/x.md", `---\ntitle: From frontmatter\n---\n\n# From H1\n`)).toBe("From frontmatter");
  });

  it("falls back to the first H1 when there is no frontmatter title", () => {
    expect(extractTitle("docs/x.md", "# From H1\n\ntext")).toBe("From H1");
  });

  it("IGNORES a '#' inside a code fence — the real bug this guards", () => {
    // Verbatim shape of docs/solutions/integration-issues/untyped-fetch-wrapper-api-contracts.md,
    // which without the guard is titled "✓ No errors" in the sidebar.
    const raw = ["Some prose.", "", "```bash", "npx tsc --noEmit", "# ✓ No errors", "```", "", "More prose."].join("\n");
    expect(extractTitle("docs/solutions/untyped-fetch.md", raw)).not.toBe("✓ No errors");
    expect(extractTitle("docs/solutions/untyped-fetch.md", raw)).toBe("Untyped fetch");
  });

  it("picks the real H1 when a fenced '#' appears BEFORE it", () => {
    const raw = ["```sh", "# install first", "```", "", "# Actual Title", "", "body"].join("\n");
    expect(extractTitle("docs/x.md", raw)).toBe("Actual Title");
  });

  it("falls back to a tidied filename when there is no title at all", () => {
    expect(extractTitle("docs/product/feature-intake-rules.md", "just prose\n")).toBe("Feature intake rules");
  });

  it("strips trailing closing hashes from an H1", () => {
    expect(extractTitle("docs/x.md", "# Title ###\n")).toBe("Title");
  });
});

describe("tidyFilename", () => {
  it.each([
    ["docs/product/feature-intake-rules.md", "Feature intake rules"],
    ["docs/README-DOCS.md", "README DOCS"],
    ["deep/nested/some_snake_case.md", "Some snake case"],
  ])("%s → %s", (path, expected) => {
    expect(tidyFilename(path)).toBe(expected);
  });
});

/* ── descriptions ─────────────────────────────────────────────────── */

describe("extractDescription", () => {
  it("prefers the frontmatter description", () => {
    expect(extractDescription(`---\ndescription: The one-liner\n---\n\n# T\n\nprose`)).toBe("The one-liner");
  });

  it("skips headings, quotes, tables, rules and HTML comments", () => {
    const raw = ["# Title", "", "> a quote", "| a | table |", "<!-- a comment -->", "", "The real first line."].join("\n");
    expect(extractDescription(raw)).toBe("The real first line.");
  });

  it("never lifts prose out of a code fence", () => {
    expect(extractDescription("# T\n\n```\nnot prose\n```\n\nreal prose")).toBe("real prose");
  });

  it("truncates long descriptions and marks the cut with an ellipsis", () => {
    const out = extractDescription(`---\ndescription: ${"x".repeat(300)}\n---\n`);
    expect(out.length).toBeLessThanOrEqual(140);
    expect(out.endsWith("…")).toBe(true);
  });

  it("leaves short descriptions unmodified", () => {
    expect(extractDescription(`---\ndescription: Short and fine.\n---\n`)).toBe("Short and fine.");
  });
});

/* ── sectioning: by intent, not folder ────────────────────────────── */

describe("sectionFor", () => {
  it("files by frontmatter type, even when the folder disagrees", () => {
    // A PRD parked in the engineering folder still belongs to Product.
    expect(sectionFor("docs/engineering/PRD-009-thing.md", { type: "prd" })).toBe("product");
  });

  it.each([
    [{ type: "adr" }, "engineering"],
    [{ type: "privacy" }, "security"],
    [{ type: "risk" }, "security"],
    [{ type: "costs" }, "operations"],
    [{ type: "runbook" }, "operations"],
    [{ type: "solution" }, "troubleshooting"],
    [{ type: "glossary" }, "foundations"],
    [{ type: "note" }, "notes"],
  ])("type %o → %s", (fm, expected) => {
    expect(sectionFor("docs/whatever.md", fm)).toBe(expected);
  });

  it("uses the path override when there is no frontmatter", () => {
    expect(sectionFor("docs/solutions/architecture/x.md", null)).toBe("troubleshooting");
    expect(sectionFor("docs/runbooks/x.md", null)).toBe("operations");
    expect(sectionFor("docs/guides/x.md", null)).toBe("foundations");
  });

  it("flags security docs that predate the schema", () => {
    expect(sectionFor("docs/SECURITY.md", null)).toBe("security");
  });

  it("puts root docs in foundations", () => {
    expect(sectionFor("CLAUDE.md", null)).toBe("foundations");
  });
});

/* ── exclusions ───────────────────────────────────────────────────── */

describe("isExcluded", () => {
  it("excludes every template", () => {
    expect(isExcluded("docs/_templates/prd.template.md")).toBe(true);
    expect(isExcluded("docs/_templates/adr.template.md")).toBe(true);
  });

  it("excludes underscore-prefixed files", () => {
    expect(isExcluded("docs/_comments.json")).toBe(true);
  });

  it("keeps real docs", () => {
    expect(isExcluded("docs/product/prds/PRD-001-player-comparison.md")).toBe(false);
    expect(isExcluded("docs/README-DOCS.md")).toBe(false);
  });

  it("buildIndex drops excluded files entirely", () => {
    const out = buildIndex([
      { path: "docs/_templates/prd.template.md", raw: "---\nid: PRD-###\n---\n# T" },
      { path: "docs/product/launch-spec.md", raw: "---\nid: DOC-002\ntitle: Launch\n---\n# L" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("DOC-002");
  });
});

/* ── badges ───────────────────────────────────────────────────────── */

describe("badgesFor", () => {
  it("renders the doc status", () => {
    expect(badgesFor({ status: "locked" }).map((b) => b.label)).toEqual(["locked"]);
  });

  it("adds the feature status for PRDs — shipped vs planned", () => {
    const labels = badgesFor({ type: "prd", status: "draft", feature_status: "planned" }).map((b) => b.label);
    expect(labels).toEqual(["draft", "planned"]);
  });

  it("does NOT show feature_status on non-PRDs", () => {
    expect(badgesFor({ type: "adr", status: "active", feature_status: "shipped" }).map((b) => b.label)).toEqual(["active"]);
  });

  it("ignores off-vocabulary values instead of rendering junk", () => {
    expect(badgesFor({ status: "phases-1-3-complete" })).toEqual([]);
  });

  it("returns nothing without frontmatter", () => {
    expect(badgesFor(null)).toEqual([]);
  });
});

/* ── search + grouping ────────────────────────────────────────────── */

describe("searchDocs", () => {
  const docs = buildIndex([
    { path: "docs/product/prds/PRD-001-player-comparison.md", raw: `---\nid: PRD-001\ntitle: Player Comparison\ntype: prd\n---\n# x` },
    { path: "docs/engineering/adrs/ADR-015-feature-module-boundaries.md", raw: `---\nid: ADR-015\ntitle: Feature module boundaries\ntype: adr\n---\n# y` },
  ]);

  it("matches on id", () => expect(searchDocs(docs, "ADR-015")).toHaveLength(1));
  it("matches on title, case-insensitively", () => expect(searchDocs(docs, "player")).toHaveLength(1));
  it("matches on path", () => expect(searchDocs(docs, "adrs/")).toHaveLength(1));
  it("returns everything for an empty query", () => expect(searchDocs(docs, "   ")).toHaveLength(2));
  it("returns nothing for no match", () => expect(searchDocs(docs, "zzzz")).toHaveLength(0));
});

describe("groupBySection", () => {
  it("orders sections most-referenced first, foundations near the bottom", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      "product", "engineering", "security", "operations", "troubleshooting", "foundations", "notes",
    ]);
  });

  it("omits empty sections", () => {
    const groups = groupBySection(
      buildIndex([{ path: "docs/product/x.md", raw: "---\nid: DOC-1\ntitle: X\ntype: prd\n---\n# X" }]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].meta.key).toBe("product");
  });

  it("every section carries a purpose blurb", () => {
    expect(SECTIONS.every((s) => s.blurb.length > 0)).toBe(true);
  });
});

/* ── generated docs ───────────────────────────────────────────────── */

describe("generated flag", () => {
  it.each(["stats", "costs", "status", "inbox"])("marks type=%s as generated", (type) => {
    const [doc] = buildIndex([{ path: `docs/under-the-hood/x.md`, raw: `---\nid: DOC-9\ntitle: X\ntype: ${type}\n---\n# X` }]);
    expect(doc.generated).toBe(true);
  });

  it("does not mark authored docs as generated", () => {
    const [doc] = buildIndex([{ path: "docs/product/x.md", raw: `---\nid: DOC-9\ntitle: X\ntype: prd\n---\n# X` }]);
    expect(doc.generated).toBe(false);
  });
});
