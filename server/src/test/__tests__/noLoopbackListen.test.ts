import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import supertest from "supertest";

// Todo #318. On macOS a test server started with `listen(0)` (every interface)
// can share its port with any process holding 127.0.0.1:<port> or 0.0.0.0:<port>,
// and an IPv4 connection to 127.0.0.1 then reaches the wrong server (a route that
// can only return 400 came back 404). Linux refuses that double bind, so CI never
// saw it. The fix: test clients connect over [::1] (supertest via the
// src/test/ipv6Loopback.ts setup file), and test servers listen with no host so
// they accept [::1]. This guards both halves.
const SRC = path.resolve(__dirname, "../..");
const LOOPBACK_LISTEN = /\.listen\([^)]*["'`](127\.0\.0\.1|localhost|::1)["'`]/;
const IPV4_CLIENT = /(wss?|https?):\/\/(127\.0\.0\.1|localhost):\$\{/;

function testFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) testFiles(full, out);
    else if (/\.test\.ts$/.test(e.name) && full !== __filename) out.push(full);
  }
  return out;
}

function hits(re: RegExp): string[] {
  return testFiles(SRC).flatMap((f) =>
    fs
      .readFileSync(f, "utf8")
      .split("\n")
      .flatMap((line, i) => (re.test(line) ? [`${path.relative(SRC, f)}:${i + 1}`] : [])),
  );
}

describe("test servers and clients avoid the macOS IPv4 port collision", () => {
  it("the patterns catch the cases that caused the flake", () => {
    expect(LOOPBACK_LISTEN.test(`server.listen(0, "127.0.0.1", r)`)).toBe(true);
    expect(LOOPBACK_LISTEN.test(`server.listen(0, r)`)).toBe(false);
    expect(IPV4_CLIENT.test("new WebSocket(`ws://127.0.0.1:${port}${path}`)")).toBe(true);
    expect(IPV4_CLIENT.test("new WebSocket(`ws://[::1]:${port}${path}`)")).toBe(false);
  });

  it("no server test listens on a loopback-only host", () => {
    expect(hits(LOOPBACK_LISTEN)).toEqual([]);
  });

  it("no server test connects to 127.0.0.1/localhost on a test port", () => {
    expect(hits(IPV4_CLIENT)).toEqual([]);
  });

  it("supertest connects over [::1] and still works", async () => {
    const app = express().get("/ping", (req, res) => res.json({ remote: req.socket.remoteAddress }));
    const res = await supertest(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.body.remote).toBe("::1");
  });
});
