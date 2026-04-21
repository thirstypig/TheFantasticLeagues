# 🗂️ Master Port Registry — All Projects
> 📍 Canonical location: `~/Projects/MASTER-PORTS.md`
> 🗓️ Last Updated: 2026-04-20
> ⚠️ This is the single source of truth. Update this file first, then mirror to each project's local copy.

Copies of this file live in each active project root (e.g., `~/Projects/bahtzang-trader/MASTER-PORTS.md`). They must stay byte-identical to the root copy.

---

## Global Port Map

| Product / Service                     | Frontend | API  | WebSocket | PostgreSQL | Redis | Admin | Notes |
|---------------------------------------|----------|------|-----------|------------|-------|-------|-------|
| **thefantasticleagues-app** (fbst)    | 3010     | 4010 | —         | 5442       | 6381  | —     | Split client/server; Vite HMR at 24680 |
| **thefantasticleagues-www**           | 3011     | —    | —         | —          | —     | —     | Astro dev (TinaCMS wrapper) |
| **bbq-judge / thejudgetool**          | 3030     | 4030 | —         | 5444       | 6383  | —     | Next.js app |
| **bbq-judge / thejudgetool.com-www**  | 3031     | —    | —         | —          | —     | —     | Reserved slot for marketing dev port |
| **ktv-singer**                        | 3040     | 4040 | 8040      | 5445       | 6385  | —     | Multi-repo (app/server/shared/tvos/web/infra) |
| **tastemakers-web**                   | 3050     | —    | —         | —          | —     | —     | Next.js (public) |
| **tastemakers-backend**               | —        | 4050 | —         | 5446       | 6384  | 4051  | Admin panel on 4051 |
| **alephco.io-app** (Aleph)            | —        | 4060 | —         | (Supabase) | —     | —     | **Unified** Express+Vite on one port; Vite HMR 24681 |
| **alephco.io-www**                    | 3060     | —    | —         | —          | —     | —     | `python3 -m http.server 3060` (static) |
| **bahtzang-trader / frontend**        | 3070     | —    | —         | —          | —     | —     | Next.js 14; moved from 3060 (was conflicting) |
| **bahtzang-trader / backend**         | —        | 4070 | —         | (Supabase) | —     | —     | FastAPI/uvicorn; moved from 4060 |
| **tabledrop / apps/web**              | 3080     | —    | —         | —          | —     | —     | Next.js; moved from 3060 |
| **jameschang.co**                     | 3090     | —    | —         | —          | —     | —     | Personal site |
| **thirstypig**                        | 4321     | —    | —         | —          | —     | —     | Astro default |
| **cooper-stack3**                     | —        | 4100 | —         | —          | —     | —     | Express server (rarely run) |

---

## Port Ranges by Product (Reserved Blocks)

Each product owns a 10-port block (3XX0–3XX9 frontend, 4XX0–4XX9 API). Sub-services expand within-block — never cross-assign.

| Frontend Range | API Range   | PG   | Redis | Owner                                |
|----------------|-------------|------|-------|--------------------------------------|
| 3010 – 3019    | 4010 – 4019 | 5442 | 6381  | thefantasticleagues (app + www)      |
| 3020 – 3029    | 4020 – 4029 | 5443 | 6382  | **AVAILABLE** (reclaimed from fsvppro) |
| 3030 – 3039    | 4030 – 4039 | 5444 | 6383  | bbq-judge (app + www)                |
| 3040 – 3049    | 4040 – 4049 | 5445 | 6385  | ktv-singer (+ WebSocket 8040–8049)   |
| 3050 – 3059    | 4050 – 4059 | 5446 | 6384  | tastemakers (web + backend + admin)  |
| 3060 – 3069    | 4060 – 4069 | —    | —     | alephco.io (app + www, Supabase-backed) |
| 3070 – 3079    | 4070 – 4079 | —    | —     | bahtzang-trader (frontend + backend) |
| 3080 – 3089    | 4080 – 4089 | 5448 | 6387  | tabledrop                            |
| 3090 – 3099    | —           | —    | —     | jameschang.co (static)               |
| 4100 – 4109    | —           | —    | —     | cooper-stack3                        |
| 4321           | —           | —    | —     | thirstypig (Astro default)           |
| 3110 – 3119    | 4110 – 4119 | 5449 | 6388  | **AVAILABLE** — reserved for future  |
| 3120 – 3129    | 4120 – 4129 | 5450 | 6389  | **AVAILABLE** — reserved for future  |
| 3130 – 3139    | 4130 – 4139 | 5451 | 6390  | **AVAILABLE** — reserved for future  |
| 8040 – 8049    | —           | —    | —     | ktv-singer (WebSocket)               |
| 24680 – 24689  | —           | —    | —     | Vite HMR (per-project, pick any)     |

**Free capacity:** 4 full product slots (fsvppro reclaim + 3 reserved).

---

## 🤖 Master Claude Context Prompt
> Use this when asking Claude questions that span multiple projects:

```
I manage multiple projects on this machine. The global port registry:

thefantasticleagues-app  → FE: 3010 | API: 4010 | PG: 5442 | Redis: 6381
thefantasticleagues-www  → FE: 3011
bbq-judge/thejudgetool   → FE: 3030 | API: 4030 | PG: 5444 | Redis: 6383
ktv-singer               → FE: 3040 | API: 4040 | WS: 8040 | PG: 5445 | Redis: 6385
tastemakers-web          → FE: 3050
tastemakers-backend      → API: 4050 | Admin: 4051 | PG: 5446 | Redis: 6384
alephco.io-app (Aleph)   → Unified FE+API on 4060 (Supabase DB)
alephco.io-www           → FE: 3060 (static)
bahtzang-trader/frontend → FE: 3070
bahtzang-trader/backend  → API: 4070 (Supabase DB)
tabledrop/apps/web       → FE: 3080
jameschang.co            → FE: 3090
thirstypig               → FE: 4321 (Astro default)
cooper-stack3            → API: 4100

Never cross-assign ports between projects. Each product owns its 10-port block
(e.g., thefantasticleagues owns 3010-3019 and 4010-4019). If a new service
needs a port, assign it within the owning project's reserved range. Consult
the AVAILABLE rows in MASTER-PORTS.md before creating any new product.
```

---

## 🚑 Quick Conflict Check
Run this anytime to see what's actually listening:

```bash
lsof -i -P -n | grep LISTEN | grep -E '3010|3011|3030|3031|3040|3050|3060|3070|3080|3090|4010|4030|4040|4050|4051|4060|4070|4100|4321|5442|5444|5445|5446|5448|6381|6383|6384|6385|6387|8040|24680|24681'
```

---

## 📐 Conventions

- **10-port blocks per product.** Frontend block mirrors the API block (3010↔4010, 3030↔4030, etc.) so the math stays easy.
- **-www marketing sites** share the same block as their -app sibling, offset by 1 (e.g., app=3010, www=3011).
- **Databases follow convention:** PG starts at 5442 (+1 per product), Redis at 6381 (+1 per product). Skip numbers as needed to avoid OS-reserved ranges.
- **Unified-server apps** (alephco.io-app) only claim the API port; the "Frontend" column is empty because Vite is served through the Express process.
- **When retiring a product**, mark its block as `**AVAILABLE**` with a dated note; do not delete the row for 30 days so in-flight work can find it.
- **Vite HMR ports** (24680+) are per-project and rarely conflict; just keep them distinct if two Vite dev servers run side-by-side.

---

## 📝 Changelog

- **2026-04-20** — Major restructure: added alephco.io, bahtzang-trader, tabledrop, jameschang.co, thirstypig, cooper-stack3, and `-www` marketing sites. Resolved 3 port conflicts (3060, 4060, 3030). Retired fsvppro block.
- **2026-03-08** — Initial 5-project registry (fbst, fvsppro, bbq-judge, ktv-singer, tastemakers).
