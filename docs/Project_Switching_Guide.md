# Project Switching & Simultaneous Configuration Guide

This guide outlines the best practices for switching between the **FBST** and **TrustDesk** projects to ensure a fast, collision-free experience.

## 1. The "Clean Swap" Process (One at a time)

Follow these steps when moving from one project to the other to ensure no ports or processes are left "zombie."

### Exiting a Project
1. **Stop the Server**: `Ctrl+C` in your terminal.
2. **Clear Background Processes**: Run the cleanup script (details below) or `killall -9 node tsx`.
3. **Save Work**: Ensure your `task.md` is updated.

### Entering the New Project (FBST)
1. **Sync Code**: `git pull origin main` (if applicable)
2. **Install Dependencies**: `npm install`
3. **Run Setup Script**: Run `./scripts/switch.sh` to clear ports and start.

---

## 2. Running Both Simultaneously

To run FBST and TrustDesk at the same time without port conflicts, you must differentiate their **Backend** and **Frontend/HMR** ports.

### Default Port Mappings (per MASTER-PORTS.md)
- **FBST**:
  - Backend: `4010`
  - Frontend: `3010`
  - Vite HMR: `24678`
- **FSVP Pro**:
  - Backend: `4020`
  - Frontend: `3020`
  - Vite HMR: `24679`

### How to Adjust FBST Ports (If needed)
If you prefer to move FBST to different ports:

1. **Backend Port**: Create/Update `.env` with `PORT=4010`.
2. **Frontend Port**: Update `client/vite.config.ts`:
   ```typescript
   server: {
     port: 3010,
     proxy: {
       "/api": "http://localhost:4010",
     },
   }
   ```
3. **Vite HMR Port**: Update `client/vite.config.ts`:
   ```typescript
   server: {
     hmr: {
       port: 24680,
     }
   }
   ```

---

## 3. Automation Scripts

Use the provided scripts to automate the "reset and run" behavior.

### `scripts/switch.sh` (FBST)
This script kills any process on default ports (4010, 3010, 24678) before calling `npm run dev`.

```bash
#!/bin/bash
./scripts/switch.sh
```
