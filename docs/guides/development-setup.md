# Development Setup

## Port Assignments

| Project | Service | Port |
|---------|---------|------|
| **FBST** | Vite dev server | **3010** |
| **FBST** | Express API server | **4010** |
| **FBST** | PostgreSQL | **5442** |
| **FBST** | Redis | **6381** |

See `MASTER-PORTS.md` for full details. **Do NOT change without updating all references.**

## Starting the App (two terminals)

```bash
# Terminal 1: Express API server
npm run server        # Starts on :4010

# Terminal 2: Vite dev server (proxies /api → :4010)
npm run dev           # Starts on :3010, open http://localhost:3010
```

## Commands

- `npm run test` (from root) — runs all tests
- `npm run test:server` — server unit + integration tests
- `npm run test:client` — client unit tests
- `npm run build` — production build (client + server)
- `npm run check` — run all tests + TypeScript checks in parallel
