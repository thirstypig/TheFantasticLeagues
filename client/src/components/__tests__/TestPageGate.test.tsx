import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ value: { isAdmin: false, loading: false } }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => auth.value }));

import { TestPageGate } from "../TestPageGate";

const renderGate = () =>
  render(<MemoryRouter><TestPageGate name="NBA"><div>mock dashboard</div></TestPageGate></MemoryRouter>);

describe("TestPageGate", () => {
  it("shows a site admin the test page under a banner that says it's sample data", () => {
    auth.value = { isAdmin: true, loading: false };
    renderGate();
    expect(screen.getByText("mock dashboard")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toMatch(/Test page \(NBA\): sample data, not a real league/);
  });

  it("keeps the mock data from everyone else", () => {
    auth.value = { isAdmin: false, loading: false };
    renderGate();
    expect(screen.queryByText("mock dashboard")).toBeNull();
    expect(screen.getByText(/This page is a test and isn’t open to league members/)).toBeTruthy();
  });

  it("shows nothing while sign-in is still loading", () => {
    auth.value = { isAdmin: false, loading: true };
    const { container } = renderGate();
    expect(container.textContent).toBe("");
  });
});
