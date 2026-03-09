# 🗂️ Master Port Registry — All Projects
> 📍 Location: `~/projects/PORTS.md`
> 🗓️ Last Updated: 2026-03-08
> ⚠️ This is the single source of truth. Update this file whenever ports change.

---

## Global Port Map

| Project                | Frontend | API  | WebSocket | PostgreSQL | Redis | Admin |
|------------------------|----------|------|-----------|------------|-------|-------|
| **fbst**               | 3010     | 4010 | —         | 5442       | 6381  | —     |
| **fvsppro**            | 3020     | 4020 | —         | 5443       | 6382  | —     |
| **bbq-judge**          | 3030     | 4030 | —         | 5444       | 6383  | —     |
| **ktv-singer**         | 3040     | 4040 | 8040      | 5445       | 6385  | —     |
| **tastemakers-backend**| —        | 4050 | —         | 5446       | 6384  | 4051  |

---

## Port Ranges by Project

| Range         | Owner                   |
|---------------|-------------------------|
| 3010 – 3019   | fbst                    |
| 3020 – 3029   | fvsppro                 |
| 3030 – 3039   | bbq-judge               |
| 3040 – 3049   | ktv-singer              |
| 3050 – 3059   | tastemakers (future FE) |
| 4010 – 4019   | fbst                    |
| 4020 – 4029   | fvsppro                 |
| 4030 – 4039   | bbq-judge               |
| 4040 – 4049   | ktv-singer              |
| 4050 – 4059   | tastemakers-backend     |
| 5442          | fbst (PG)               |
| 5443          | fvsppro (PG)            |
| 5444          | bbq-judge (PG)          |
| 5445          | ktv-singer (PG)         |
| 5446          | tastemakers-backend (PG)|
| 6381          | fbst (Redis)            |
| 6382          | fvsppro (Redis)         |
| 6383          | bbq-judge (Redis)       |
| 6384          | tastemakers-backend (Redis)|
| 6385          | ktv-singer (Redis)      |
| 8040 – 8049   | ktv-singer (WebSocket)  |

---

## 🤖 Master Claude Context Prompt
> Use this when asking Claude questions that span multiple projects:

```
I am managing 5 active projects on this machine. The global port registry is:

fbst              → Frontend: 3010 | API: 4010 | PG: 5442 | Redis: 6381
fvsppro           → Frontend: 3020 | API: 4020 | PG: 5443 | Redis: 6382
bbq-judge         → Frontend: 3030 | API: 4030 | PG: 5444 | Redis: 6383
ktv-singer        → Frontend: 3040 | API: 4040 | WS: 8040  | PG: 5445 | Redis: 6385
tastemakers-backend → API: 4050 | Admin: 4051 | PG: 5446 | Redis: 6384

When suggesting ports for ANY of these projects, never cross-assign ports between 
projects. Each project owns its range (e.g., fbst owns 3010-3019 and 4010-4019).
If a new service needs a port, assign it within the owning project's reserved range.
```

---

## 🚑 Quick Conflict Check
Run this anytime to see what's actually running:

```bash
lsof -i -P -n | grep LISTEN | grep -E '3010|3020|3030|3040|4010|4020|4030|4040|4050|4051|5442|5443|5444|5445|5446|6381|6382|6383|6384|6385|8040'
```
