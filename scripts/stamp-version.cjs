#!/usr/bin/env node
/**
 * Stamp the deployed commit SHA into server/version.txt at build time.
 *
 * Read back at runtime by the /api/health endpoint and asserted by the
 * `verify-deploy` GitHub workflow, which fails (→ emails the repo owner) if
 * prod doesn't report the just-merged commit within ~12 min. This is the
 * alarm that would have caught the 2026-06-29 P3009 freeze: health returned
 * 200 for 8 days while the OLD image kept serving, so a plain health check
 * was useless — only a *version* check detects "new commit never went live".
 *
 * Source order: Railway's build-time RAILWAY_GIT_COMMIT_SHA, then `git`, then
 * "unknown". Never throws — a stamp failure must not break the build.
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

let sha = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "";
if (!sha) {
  try {
    // execFileSync (no shell) with a fixed arg array — no injection surface.
    sha = execFileSync("git", ["rev-parse", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    /* no git in build context */
  }
}
sha = sha || "unknown";

fs.writeFileSync("server/version.txt", sha + "\n");
console.log("[stamp-version] server/version.txt =", sha);
