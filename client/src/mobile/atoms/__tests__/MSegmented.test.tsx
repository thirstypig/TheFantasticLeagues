import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MSegmented } from "../MSegmented";

describe("MSegmented", () => {
  it("active segment uses Field; inactive does not", () => {
    render(<MSegmented options={["A", "B"] as const} active="A" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "A" }).style.background).toBe("var(--am-field)");
    expect(screen.getByRole("tab", { name: "B" }).style.background).not.toBe("var(--am-field)");
  });
});
