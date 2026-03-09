# FBST Client

React + Vite + TypeScript + Tailwind client for FBST, organized by domain feature modules.

## Architecture

```
client/src/
├── features/              # Domain feature modules
│   ├── auth/              #   Login, signup, password reset, landing pages
│   ├── leagues/           #   League list, rules pages
│   ├── teams/             #   Team pages, grid, roster views
│   ├── players/           #   Player search, detail/edit modals
│   ├── roster/            #   Roster grid, controls, import, management
│   ├── standings/         #   Standings, category, season pages
│   ├── trades/            #   Trade proposals, asset selector
│   ├── waivers/           #   (minimal - no dedicated pages)
│   ├── transactions/      #   Transaction history page
│   ├── auction/           #   Auction draft, 10 components, hooks
│   ├── keeper-prep/       #   Keeper selection, dashboard
│   ├── commissioner/      #   Commissioner tools, controls
│   ├── admin/             #   Admin panel, archive admin
│   ├── archive/           #   Archive/historical data page
│   └── periods/           #   Period, season stat pages
├── components/            # Shared components
│   ├── AppShell.tsx       #   Main app shell layout
│   ├── NavBar.tsx         #   Navigation bar
│   └── ui/                #   shadcn-style primitives (button, card, table, etc.)
├── api/                   # Shared API infra
│   ├── base.ts            #   fetchJsonApi, API_BASE config
│   ├── types.ts           #   Shared request/response types
│   └── index.ts           #   Barrel re-exports from all feature APIs
├── auth/                  # AuthProvider (Supabase context)
├── hooks/                 # Shared hooks (useAuth)
└── lib/                   # Utilities (baseballUtils, supabase client)
```

### Feature Module Structure
```
features/<name>/
├── pages/                 # Route-level page components
│   └── <Page>.tsx
├── components/            # Feature-specific components
│   └── <Component>.tsx
├── api.ts                 # API client functions (uses fetchJsonApi)
├── hooks/                 # Feature-specific hooks (if needed)
├── __tests__/             # Unit tests
│   ├── api.test.ts
│   └── <Page>.test.tsx
└── index.ts               # Re-exports pages for routing
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment (optional, defaults to localhost:4010):
```bash
# client/.env.local
VITE_API_BASE_URL=http://localhost:4010
```

3. Start the development server:
```bash
npm run dev
```

## Scripts

- `npm run dev` — Start development server (Vite, port 3010)
- `npm run build` — TypeScript check + Vite production build
- `npm run preview` — Preview production build
- `npm run lint` — Run ESLint
- `npm run test` — Run all tests

## Conventions

- Import paths use no file extensions
- Default exports for page components, named exports for everything else
- API functions use `fetchJsonApi()` from `api/base.ts`
- Auth token auto-injected by `fetchJsonApi` via Supabase session
- Tailwind for all styling; shadcn-pattern components in `components/ui/`
- Shared API barrel at `api/index.ts` re-exports from all feature APIs

## Testing

```bash
# All client tests
npm run test

# Single feature
npx vitest run src/features/auction/__tests__/

# Watch mode
npx vitest --watch
```
