# FBST — Port Registry
> 📍 Location: `~/projects/fbst`
> 🗓️ Last Updated: 2026-03-08

---

## ✅ This Project's Ports

| Service         | Port  | Command              | Notes                        |
|-----------------|-------|----------------------|------------------------------|
| Frontend        | 3010  | `npm run dev`        | Vite/Next dev server         |
| Backend API     | 4010  | `npm run server`     | Express/Node API             |
| Database (PG)   | 5442  | local postgres       | Always running               |
| Redis           | 6381  | `redis-server`       | Optional / cache             |

---

## 🚫 Reserved Ports — DO NOT USE
> These ports are claimed by other active projects on this machine.
> Assigning any of these to FBST services will cause conflicts.

| Port  | Reason / Owner                              |
|-------|---------------------------------------------|
| 3020  | **fvsppro** — Frontend dev server           |
| 4020  | **fvsppro** — Backend API                   |
| 5443  | **fvsppro** — PostgreSQL                    |
| 6382  | **fvsppro** — Redis                         |
| 3030  | **bbq-judge** — Frontend dev server         |
| 4030  | **bbq-judge** — Backend API                 |
| 5444  | **bbq-judge** — PostgreSQL                  |
| 6383  | **bbq-judge** — Redis                       |
| 3040  | **ktv-singer** — Frontend dev server        |
| 4040  | **ktv-singer** — Backend API                |
| 5445  | **ktv-singer** — PostgreSQL                 |
| 8040  | **ktv-singer** — WebSocket server           |
| 4050  | **tastemakers-backend** — API Server        |
| 4051  | **tastemakers-backend** — Admin/Swagger     |
| 5446  | **tastemakers-backend** — PostgreSQL        |
| 6384  | **tastemakers-backend** — Redis             |

---

## 🤖 Claude Context Prompt
> Paste this at the start of any Claude session when working on FBST:

```
I am working on the FBST project located at ~/projects/fbst.

Port assignments for THIS project:
- Frontend: 3010
- API: 4010
- PostgreSQL: 5442
- Redis: 6381

The following ports are RESERVED by other projects on this machine and must
NEVER be suggested or used for FBST:
3020, 4020, 5443, 6382 (fvsppro)
3030, 4030, 5444, 6383 (bbq-judge)
3040, 4040, 5445, 8040 (ktv-singer)
4050, 4051, 5446, 6384 (tastemakers-backend)

Always use ports in the 3010/4010/5442/6381 range for any new FBST services.
If you need to add a new service, suggest ports in the 3011-3019 or 4011-4019 range.
```

---

## 🆕 Available Overflow Ports (if you add new services)
| Range         | Use for                          |
|---------------|----------------------------------|
| 3011 – 3019   | Additional FBST frontend services|
| 4011 – 4019   | Additional FBST backend services |
| 5442x         | Additional FBST DB instances     |
