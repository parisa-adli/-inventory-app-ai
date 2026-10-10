# CLAUDE.md — Product Inventory Manager

This file is the entry point for Claude Code on this repo. Read this first, then `tasks/TASK.md`: it holds the build plan, task IDs (`P<phase>.<n>`), what is already done, the dev environment and the open questions. The per-phase specs in `docs/PRDs/` are self-contained (server + client subtasks for one feature slice) and assume everything in earlier phases already works.

**Starting a fresh session?** (1) Read this file. (2) In `tasks/TASK.md` read *Current state*, *Dev Environment*, and the section for the part you were asked to do. (3) Before building, check the *Open Questions* that the part depends on and ask the user about unresolved ones.

## Design
For any UI work, read and follow docs/DESIGN.md first (shadcn/ui; screenshots in docs/design/).

## Source of truth
- `docs/PRD.md` — full product spec. If a task file and the PRD ever disagree, the PRD wins; flag the conflict instead of guessing.
- `docs/PRDs/00-project-setup.md` through `docs/PRDs/06-polish-qa.md` — per-phase specs and acceptance checklists, in build order.
- `tasks/TASK.md` — the working task list derived from the above (task IDs, parts, progress, decisions). Keep its checkboxes and *Current state* up to date when you finish work.

## Tech stack (do not substitute without asking)
- Client: React + Vite, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, React Hook Form + Zod, Recharts
- Server: Node.js + Express, Mongoose (MongoDB)
- Auth: JWT access+refresh in httpOnly Secure cookies, rotation on refresh
- Email: Nodemailer + Brevo SMTP
- Telegram: grammY or node-telegram-bot-api (support both webhook and polling; polling is what actually runs in prod)
- Monorepo: npm workspaces (`client`, `server`, `shared`); everything is TypeScript. `shared/` (`@inventory/shared`) holds constants, Zod schemas, types and seed data, imported by both sides.

### Library versions to code against (latest majors; do not write code for older APIs)
- React 19 (ref is a plain prop, no `forwardRef`), React Router 8 (import everything from `react-router`; `react-router-dom` no longer exists), Tailwind CSS 4 (CSS-first config in `client/src/index.css`, `@tailwindcss/vite`, no `tailwind.config.js`), Vite 8, TanStack Table 9 (`useTable` + `tableFeatures`, not v8's `useReactTable`), Zod 4 (`z.email()`, `error` param instead of `message`), Express 5 (async handlers may throw), Mongoose 9, ESLint 10 flat config (`eslint.config.js`).
- TypeScript is 6.x on purpose: typescript-eslint does not support TS 7 yet. `@types/node` is 24 to match the Node 24 runtime (`.nvmrc`).

## Repo layout
```
/server/src
  /config         (env.ts validated env, load-env.ts, database.ts)
  /models         (Mongoose schemas: User, EmailToken, OtpCode, RefreshToken, ...)
  /routes         (Express routers, mounted from routes/index.ts under /api)
  /middleware     (auth: requireAuth/requireActive, roleGuard: requireRole, validate, errorHandler)
  /services       (jwt, password, email, otp, telegram, ...)
  /utils          (errors: AppError + subclasses, crypto: sha256/randomToken)
  /types          (express.d.ts adds req.user)
  seed.ts         (npm run seed)
/client/src
  main.tsx        (entry: renders <App />)
  /app            (App.tsx, providers.tsx, router.tsx, queryClient.ts, /layouts: AppLayout, AuthLayout)
  /features       (one folder per slice, e.g. auth/, dashboard/; each owns its pages/, components/, hooks/, api/ as needed)
  /components/ui  (shadcn components; shared, feature-agnostic UI only)
  /lib            (axios.ts cookie-based API client, utils.ts)
/shared
  /constants /schemas /types /seed-data
/tests            (Playwright e2e)
/docs             (PRD.md, PRDs/ per-phase specs, seed-data-strategy/)
/tasks            (TASK.md)
```
Directories like `controllers/` (server) and a feature's `hooks/` / `api/` do not exist yet; create them only when a task needs them. Client code goes in `features/<name>/`; only code shared by 2+ features moves to `components/`, `lib/` or `app/`. Request/form Zod schemas live in `shared/schemas` (not duplicated in server or client).

## Commands (run from the repo root)
- `npm ci` install · `npm run dev` runs server (`:5000`) and client (`:5173`, proxies `/api`) · `npm run seed` resets and reseeds the database.
- Checks, run all four before committing: `npm run typecheck` · `npm run lint` · `npm test` (server Vitest) · `npm run build` (client build + bundled server).
- `npm run test:e2e` runs Playwright. On this machine use `PW_CHROMIUM_CHANNEL=msedge` and `--project=chromium` (details in `tasks/TASK.md` → Dev Environment).

## Working conventions
- Every mutating server route is guarded by auth middleware + role-guard middleware — never trust the client for role checks.
- Every stock quantity change (receive, ship, adjustment, or the inline +/- buttons) MUST write a `StockMovement` record in the same transaction/operation as the quantity update. Movements are the audit source of truth — do not let `product.quantity` drift from the sum of its history.
- Every form: React Hook Form + Zod resolver. Every server mutation route: validate the body with the matching Zod schema (from `@inventory/shared`, via the `validate()` middleware) before touching the DB.
- Every server read list endpoint (products, stock-movements, users) supports pagination; wire these into TanStack Query with proper `queryKey`s so filters/sort/page all invalidate correctly.
- Toast on every mutation's success/error (sonner).
- Auth endpoints (login, register, OTP request/verify) are rate-limited.
- Password-reset responses are always generic (no account enumeration). Registration explicitly reveals duplicate emails (confirmed trade-off, see PRD §3).

## How to work through this repo
1. Follow the phase order in `tasks/TASK.md`: Phase 0 (setup), Phase 1 (identity & auth), then categories/suppliers, products, stock movements, dashboard, polish. Every other page sits behind auth, so finish Phase 1 before touching any other feature.
2. Phase 1 is built in four parts (A foundation, B email/password flow, C Telegram, D admin user management), one session and one commit per part. The part boundaries and the tasks in each are defined in `tasks/TASK.md`. Check its *Current state* for which parts are done.
3. After each part or phase, run the app and verify its acceptance checklist before moving on. Don't batch multiple phases into one uncommitted pass.
4. If a task references a decision not in the PRD, stop and ask rather than inventing one (see *Open Questions* in `tasks/TASK.md`).
5. Update `tasks/TASK.md` (checkboxes, *Current state*, resolved questions) as part of the same commit as the work.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` at the repo root, ADRs in `docs/adr/`. See `docs/agents/domain.md`.
