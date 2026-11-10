import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "../ToastContext";

function Fire() {
  const { toast } = useToast();
  return <button onClick={() => toast("Saved", "success")}>fire</button>;
}

describe("ToastProvider", () => {
  it("lifts the toast stack above the mobile tab bar via --shell-bottom-inset", () => {
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    act(() => screen.getByText("fire").click());
    const stack = screen.getByRole("alert").parentElement as HTMLElement;
    expect(stack.style.bottom).toContain("var(--shell-bottom-inset");
    expect(stack.style.bottom).toContain("24px");
  });
});
