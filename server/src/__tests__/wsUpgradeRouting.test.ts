/**
 * S8 (UX step F final fix wave): the auction and draft WebSocket servers share
 * one HTTP server. With two `new WebSocketServer({ server, path })` instances,
 * the one whose path doesn't match aborts the handshake with a 400 on the
 * shared socket, so the auction socket never connects (clients sit on
 * "Reconnecting…" and poll every second).
 *
 * This drives the REAL attach functions against a REAL http server with REAL
 * `ws` clients. Only the edges are mocked: Supabase token check and prisma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../db/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    leagueMembership: { findFirst: vi.fn() },
  },
}));
vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("../lib/supabase.js", () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === "good"
          ? { data: { user: { email: "a@example.com" } }, error: null }
          : { data: { user: null }, error: new Error("bad token") },
      ),
    },
  },
}));

import http from "http";
import { WebSocket, type WebSocketServer } from "ws";
import { prisma } from "../db/prisma.js";
import { attachAuctionWs, broadcastState } from "../features/auction/services/auctionWsService.js";
import { attachDraftWs, broadcastDraftState } from "../features/draft/services/draftWsService.js";

const mockPrisma = prisma as any;
const LEAGUE = 7;

let server: http.Server;
let port: number;
let servers: WebSocketServer[] = [];
const sockets: WebSocket[] = [];

beforeEach(async () => {
  vi.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue({ id: 3, name: "A", email: "a@example.com" });
  mockPrisma.leagueMembership.findFirst.mockResolvedValue({ id: 1 });
  server = http.createServer();
  // Same order as index.ts: auction first, then draft.
  servers = [attachAuctionWs(server), attachDraftWs(server)];
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as any).port;
});

afterEach(async () => {
  for (const s of sockets.splice(0)) s.terminate();
  for (const w of servers) w.close();
  await new Promise<void>((r) => server.close(() => r()));
});

function connect(path: string): WebSocket {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  sockets.push(ws);
  return ws;
}

/** Resolves "open" or rejects with the handshake failure. */
function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(e));
    ws.once("unexpected-response", (_req, res) => reject(new Error(`unexpected ${res.statusCode}`)));
  });
}

/** Wait until the server has joined the socket to its room (async auth lookups). */
const settle = () => new Promise((r) => setTimeout(r, 50));

describe("S8: one upgrade router for every WebSocket path", () => {
  it("/ws/auction connects and receives the auction state", async () => {
    const ws = connect(`/ws/auction?token=good&leagueId=${LEAGUE}`);
    await opened(ws);
    await settle();
    const msg = new Promise<string>((r) => ws.once("message", (d) => r(d.toString())));
    broadcastState(LEAGUE, { leagueId: LEAGUE, status: "nominating", teams: [], log: [] } as any);
    const payload = JSON.parse(await msg);
    expect(payload.leagueId).toBe(LEAGUE);
    expect(payload.status).toBe("nominating");
    // The connection is still up (no trailing 400 corrupting the stream).
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it("/ws/draft connects and receives the draft state", async () => {
    const ws = connect(`/ws/draft?token=good&leagueId=${LEAGUE}`);
    await opened(ws);
    await settle();
    const msg = new Promise<string>((r) => ws.once("message", (d) => r(d.toString())));
    broadcastDraftState(LEAGUE, { leagueId: LEAGUE, status: "active", draftedPlayerIds: new Set([1]), autoPickTeams: new Set() } as any);
    const payload = JSON.parse(await msg);
    expect(payload.type).toBe("DRAFT_STATE");
    expect(payload.data.leagueId).toBe(LEAGUE);
    expect(payload.data.draftedPlayerIds).toEqual([1]);
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it("both paths connect at the same time", async () => {
    const a = connect(`/ws/auction?token=good&leagueId=${LEAGUE}`);
    const d = connect(`/ws/draft?token=good&leagueId=${LEAGUE}`);
    await Promise.all([opened(a), opened(d)]);
    expect(a.readyState).toBe(WebSocket.OPEN);
    expect(d.readyState).toBe(WebSocket.OPEN);
  });

  it("an unknown path is rejected (never opens)", async () => {
    const ws = connect(`/ws/nope?token=good&leagueId=${LEAGUE}`);
    await expect(opened(ws)).rejects.toBeTruthy();
    expect(ws.readyState).not.toBe(WebSocket.OPEN);
  });

  it("each service keeps its own auth: a bad token is closed 4001 on both paths", async () => {
    for (const path of ["/ws/auction", "/ws/draft"]) {
      const ws = connect(`${path}?token=bad&leagueId=${LEAGUE}`);
      const code = await new Promise<number>((r) => ws.once("close", (c) => r(c)));
      expect(code).toBe(4001);
    }
  });

  it("each service keeps its membership check: a non-member is closed 4003", async () => {
    mockPrisma.leagueMembership.findFirst.mockResolvedValue(null);
    const ws = connect(`/ws/auction?token=good&leagueId=${LEAGUE}`);
    const code = await new Promise<number>((r) => ws.once("close", (c) => r(c)));
    expect(code).toBe(4003);
  });
});
