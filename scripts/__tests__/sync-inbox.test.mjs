import { describe, it, expect } from "vitest";
import { validate, render, KIND_ORDER } from "../sync-inbox.mjs";

const base = (over = {}) => ({
  id: "C-001",
  doc: "DOC-001",
  path: "docs/README-DOCS.md",
  kind: "question",
  status: "open",
  author: "claude",
  created: "2026-07-23T10:00:00Z",
  body: "a question",
  resolution: null,
  ...over,
});

const resolved = (over = {}) =>
  base({
    id: "C-900",
    status: "resolved",
    resolution: { note: "did the thing", link: "DOC-009", resolvedAt: "2026-07-23T11:00:00Z", resolvedBy: "james" },
    ...over,
  });

/**
 * The link requirement is the only thing separating this from a checklist people
 * clear rather than resolve. If it is ever relaxed, resolutions become unverifiable
 * six months later — which is the entire failure mode the inbox exists to prevent.
 */
describe("validate — resolution integrity", () => {
  it("accepts a well-formed set", () => {
    expect(validate([base(), resolved()])).toEqual([]);
  });

  it("REJECTS a resolved comment with no link", () => {
    const errs = validate([resolved({ resolution: { note: "fixed it", link: "" } })]);
    expect(errs.join(" ")).toMatch(/no link/i);
  });

  it("REJECTS a resolved comment with no note", () => {
    const errs = validate([resolved({ resolution: { note: "", link: "DOC-009" } })]);
    expect(errs.join(" ")).toMatch(/no note/i);
  });

  it("REJECTS a resolved comment with no resolution block at all", () => {
    const errs = validate([base({ status: "resolved", resolution: null })]);
    expect(errs.join(" ")).toMatch(/no resolution block/i);
  });

  it("does NOT require a resolution for open or in_review comments", () => {
    expect(validate([base({ status: "open" }), base({ id: "C-002", status: "in_review" })])).toEqual([]);
  });
});

describe("validate — schema", () => {
  it("rejects duplicate ids", () => {
    expect(validate([base(), base()]).join(" ")).toMatch(/duplicate id/i);
  });

  it("rejects a comment with no id", () => {
    expect(validate([base({ id: undefined })]).join(" ")).toMatch(/no id/i);
  });

  it("rejects an off-vocabulary kind", () => {
    expect(validate([base({ kind: "urgent" })]).join(" ")).toMatch(/unknown kind/i);
  });

  it("rejects an off-vocabulary status", () => {
    expect(validate([base({ status: "wontfix" })]).join(" ")).toMatch(/unknown status/i);
  });

  it("rejects an unparseable created timestamp", () => {
    expect(validate([base({ created: "yesterday" })]).join(" ")).toMatch(/created/i);
  });

  it("reports every problem, not just the first", () => {
    expect(validate([base({ kind: "urgent", status: "wontfix" })]).length).toBe(2);
  });
});

describe("render — ordering", () => {
  const set = [
    base({ id: "C-1", kind: "note", created: "2026-07-23T09:00:00Z", body: "NOTE-BODY" }),
    base({ id: "C-2", kind: "question", created: "2026-07-23T08:00:00Z", body: "QUESTION-BODY" }),
    base({ id: "C-3", kind: "change_request", created: "2026-07-23T07:00:00Z", body: "CHANGE-BODY" }),
  ];

  it("puts change_request FIRST even when it is the oldest", () => {
    const out = render(set);
    const pos = (s) => out.indexOf(s);
    expect(pos("## Change requests")).toBeGreaterThan(-1);
    expect(pos("## Change requests")).toBeLessThan(pos("## Questions"));
    expect(pos("## Questions")).toBeLessThan(pos("## Notes"));
  });

  it("declares the canonical kind order", () => {
    expect(KIND_ORDER).toEqual(["change_request", "question", "note"]);
  });

  it("sorts newest-first within a section", () => {
    const out = render([
      base({ id: "C-old", kind: "question", created: "2026-07-01T00:00:00Z", body: "OLDER" }),
      base({ id: "C-new", kind: "question", created: "2026-07-20T00:00:00Z", body: "NEWER" }),
    ]);
    expect(out.indexOf("NEWER")).toBeLessThan(out.indexOf("OLDER"));
  });

  it("omits sections that have no open items", () => {
    const out = render([base({ kind: "question" })]);
    expect(out).toContain("## Questions");
    expect(out).not.toContain("## Change requests");
    expect(out).not.toContain("## Notes");
  });
});

describe("render — open vs resolved separation", () => {
  it("counts only non-resolved items as open", () => {
    const out = render([base(), base({ id: "C-2" }), resolved()]);
    expect(out).toMatch(/\*\*2 open\*\*/);
    expect(out).toMatch(/1 resolved/);
  });

  it("puts resolved items in the Resolved table, not an open section", () => {
    const out = render([resolved({ body: "RESOLVED-BODY" })]);
    expect(out).toContain("## Resolved (1)");
    expect(out).toContain("Inbox clear");           // no open items
    expect(out).not.toContain("## Questions");
  });

  it("surfaces the resolution link in the table so it stays auditable", () => {
    expect(render([resolved()])).toContain("DOC-009");
  });

  it("says 'Inbox clear' when nothing is open", () => {
    expect(render([resolved()])).toContain("Inbox clear");
  });
});

describe("render — output contract", () => {
  it("emits frontmatter the docs board can index", () => {
    const out = render([base()]);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("type: inbox");
    expect(out).toContain("id: DOC-020");
  });

  it("marks the file as generated so nobody hand-edits it", () => {
    expect(render([base()])).toMatch(/GENERATED by scripts\/sync-inbox\.mjs/);
  });

  it("escapes pipes so a body containing | cannot break the resolved table", () => {
    const out = render([resolved({ resolution: { note: "a | b", link: "X", resolvedBy: "james", resolvedAt: "2026-07-23T11:00:00Z" } })]);
    expect(out).toContain("a \\| b");
  });
});
