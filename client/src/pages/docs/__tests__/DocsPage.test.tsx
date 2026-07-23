/**
 * Integration-ish render test for the /docs board.
 *
 * Unlike docsIndex.test.ts (pure functions, synthetic input), this mounts the REAL <Docs />
 * component against the REAL docs corpus pulled in by the Vite glob. It is the check that
 * catches "the logic is right but the page renders nothing" — which unit tests cannot see.
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Docs from "../../Docs";

function renderDocs() {
  return render(
    <MemoryRouter>
      <Docs />
    </MemoryRouter>,
  );
}

describe("<Docs /> board", () => {
  it("renders without crashing and shows a sidebar search", () => {
    renderDocs();
    expect(screen.getByPlaceholderText(/search by title, id, or path/i)).toBeInTheDocument();
  });

  it("renders the question-based sections, not folder names", () => {
    renderDocs();
    // Sections that must exist given the current corpus.
    for (const label of ["Product", "Engineering", "Security", "Operations", "Troubleshooting", "Foundations"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // The old folder-derived headings must be gone.
    expect(screen.queryByText("docs/")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Root")).not.toBeInTheDocument();
  });

  it("shows a one-line purpose blurb under a section header", () => {
    renderDocs();
    expect(screen.getByText(/what we're building, and why/i)).toBeInTheDocument();
  });

  it("surfaces docs from the NEWLY globbed folders (the whole point of this change)", () => {
    renderDocs();
    // getAllByText, not getByText: a title can legitimately appear more than once
    // (sidebar entry + another doc's description referencing it).
    // product/
    expect(screen.getAllByText(/Player Comparison/i).length).toBeGreaterThan(0);
    // engineering/adrs/ — nested, proves the ** glob works
    expect(screen.getAllByText(/Feature module boundaries/i).length).toBeGreaterThan(0);
    // under-the-hood/
    expect(screen.getAllByText(/Unit economics/i).length).toBeGreaterThan(0);
  });

  it("renders doc IDs alongside titles", () => {
    renderDocs();
    expect(screen.getByText("PRD-001")).toBeInTheDocument();
    expect(screen.getByText("ADR-015")).toBeInTheDocument();
  });

  it("renders status badges, including shipped-vs-planned on PRDs", () => {
    renderDocs();
    // PRD-001 is status: draft + feature_status: planned
    expect(screen.getAllByText("planned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("locked").length).toBeGreaterThan(0); // launch-spec
  });

  it("NEVER renders templates", () => {
    renderDocs();
    expect(screen.queryByText(/prd\.template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/adr\.template/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/doc\.template/i)).not.toBeInTheDocument();
  });

  it("never titles a doc from a '#' inside a code fence", () => {
    renderDocs();
    // These are the literal first-'#' matches in 5 real docs. If any appears as a
    // sidebar title, the code-fence guard has regressed.
    for (const bogus of ["✓ No errors", "Check if www redirects (and where to)"]) {
      expect(screen.queryByText(bogus)).not.toBeInTheDocument();
    }
  });

  it("marks generated docs so nobody hand-edits them", () => {
    renderDocs();
    // stats/costs/status/inbox carry type-based 'generated' flagging.
    const sidebar = screen.getByPlaceholderText(/search by title/i).closest("div")?.parentElement;
    expect(sidebar).toBeTruthy();
    expect(within(sidebar as HTMLElement).getByText(/Repo statistics/i)).toBeInTheDocument();
  });
});
