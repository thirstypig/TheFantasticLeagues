import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RulesEditor } from "../RulesEditor";
import { fetchJsonApi } from "../../../../api/base";

vi.mock("../../../../auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: 1, isAdmin: true } }),
}));
vi.mock("../../../../contexts/ToastContext", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("../../../../api/base", () => ({
  API_BASE: "/api",
  fetchJsonApi: vi.fn(),
}));

const rule = (id: number, key: string, value: string) => ({
  id,
  leagueId: 20,
  category: "scoring",
  key,
  value,
  label: key,
  isLocked: false,
});

async function openEditor(pitching: string) {
  vi.mocked(fetchJsonApi).mockResolvedValue({
    rules: [
      rule(1, "hitting_stats", '["R","HR","RBI","SB","AVG"]'),
      rule(2, "pitching_stats", pitching),
    ],
    grouped: {},
  });
  const onSaved = vi.fn();
  render(<RulesEditor leagueId={20} canEdit onSaved={onSaved} />);
  fireEvent.click(await screen.findByRole("button", { name: /Edit Rules/ }));
}

beforeEach(() => vi.clearAllMocks());

describe("RulesEditor category checklists", () => {
  it("offers exactly the scorable hitting categories", async () => {
    await openEditor('["W","S"]');
    const names = ["R", "HR", "RBI", "SB", "AVG"];
    for (const n of names) {
      expect(screen.getAllByRole("button", { name: n }).length).toBeGreaterThanOrEqual(1);
    }
    for (const n of ["OPS", "WAR", "H", "2B", "OBP", "SLG", "TB"]) {
      expect(screen.queryByRole("button", { name: n })).toBeNull();
    }
  });

  it("shows a stored S as a checked SV", async () => {
    await openEditor('["W","S"]');
    expect(screen.queryByRole("button", { name: "S" })).toBeNull();
    const sv = screen.getByRole("button", { name: "SV" });
    expect(sv.style.background).toContain("irid");
  });

  it("writes SV (never S) when toggling another category", async () => {
    await openEditor('["W","S"]');
    fireEvent.click(screen.getByRole("button", { name: "ERA" }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => {
      const put = vi.mocked(fetchJsonApi).mock.calls.find(([, o]) => (o as any)?.method === "PUT");
      expect(put).toBeDefined();
      const body = JSON.parse((put![1] as any).body);
      expect(body.updates).toEqual([{ id: 2, value: '["W","SV","ERA"]' }]);
    });
  });

  it("drops unscorable stored keys on toggle", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      rules: [rule(1, "hitting_stats", '["R","OPS"]'), rule(2, "pitching_stats", '["W"]')],
      grouped: {},
    });
    render(<RulesEditor leagueId={20} canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit Rules/ }));
    fireEvent.click(screen.getByRole("button", { name: "HR" }));
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/ }));
    await waitFor(() => {
      const put = vi.mocked(fetchJsonApi).mock.calls.find(([, o]) => (o as any)?.method === "PUT");
      expect(JSON.parse((put![1] as any).body).updates).toEqual([{ id: 1, value: '["R","HR"]' }]);
    });
  });

  it("dedupes read-only chips after normalizing", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      rules: [rule(1, "hitting_stats", '["R"]'), rule(2, "pitching_stats", '["S","SV"]')],
      grouped: {},
    });
    render(<RulesEditor leagueId={20} canEdit />);
    await screen.findByRole("button", { name: /Edit Rules/ });
    expect(screen.getAllByText("SV")).toHaveLength(1);
  });

  it("read-only chips show what is scored, not the stored old-default lists", async () => {
    vi.mocked(fetchJsonApi).mockResolvedValue({
      rules: [
        rule(1, "hitting_stats", '["R","HR","RBI","SB","AVG","OPS","H","2B","3B","BB"]'),
        rule(2, "pitching_stats", '["QS","HLD"]'),
      ],
      grouped: {},
    });
    render(<RulesEditor leagueId={20} canEdit />);
    await screen.findByRole("button", { name: /Edit Rules/ });
    for (const n of ["R", "HR", "RBI", "SB", "AVG", "W", "SV", "ERA", "WHIP", "K"]) {
      expect(screen.getAllByText(n)).toHaveLength(1);
    }
    for (const n of ["OPS", "H", "2B", "3B", "BB", "QS", "HLD"]) {
      expect(screen.queryByText(n)).toBeNull();
    }
  });
});
