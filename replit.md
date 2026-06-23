# LoadBoard Pro

A full-stack freight logistics management platform for dispatchers, accountants, and fleet managers. Manage loads, drivers, brokers, weekly performance, and accounting from a single command center.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/loadboard run dev` — run the frontend (proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk auth (`@clerk/express`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`)
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, Recharts, Framer Motion, Wouter
- Auth: Clerk (Replit-managed tenant)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — all Drizzle ORM table definitions (source of truth for DB schema)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/requireAuth.ts` — Clerk auth middleware + role check
- `artifacts/loadboard/src/pages/` — React pages (dashboard, loads, weekly, drivers, accounting, notifications, settings)
- `artifacts/loadboard/src/App.tsx` — Router + Clerk provider setup

## Architecture decisions

- Contract-first API: OpenAPI spec lives in `lib/api-spec`, codegen produces React Query hooks + Zod schemas.
- Role-based access: 4 roles (admin, dispatcher, accounting, driver). Dispatchers only see their own loads. Accounting can only edit invoicedAmount/brokerPaid/notes. Admin-only soft delete.
- Computed fields (rpm, irDiff, biDiff) are calculated at runtime in the API response — not stored in DB.
- `/api/accounting/summary` and `/api/loads/*` share the same Express router (loads router mounted at both `/loads` and `/accounting`).
- JIT user provisioning: new Clerk users get auto-created in the DB on first authenticated request with `dispatcher` role.

## Product

- **Dashboard** — KPI cards (total gross, active loads, avg RPM, broker paid), dispatcher ranking, status breakdown chart
- **Loads** — Full CRUD with search/filter by driver/broker/week/status, computed diff columns
- **Weekly View** — Loads grouped by driver per week with weekly KPI summary
- **Drivers** — Driver roster (OO/CD/Lease), per-driver stats and load history
- **Accounting** — Invoice vs. broker payment reconciliation, outstanding amounts
- **Notifications** — Per-user alerts (e.g. broker underpayments)
- **Settings** — User profile management

## User preferences

- Dark navy command center design (#1A3C5E primary), Inter font
- Role-based data isolation (dispatchers see only their loads)

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after changing schema files
- Do not mount the loads router at both `/loads` and `/accounting` if it causes duplicate middleware execution issues — check route ordering
- `typecheck:libs` must run before leaf artifact typechecks if lib schema changed

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `clerk-auth` skill for Clerk configuration details
