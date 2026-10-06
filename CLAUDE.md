# CLAUDE.md — Product Inventory Manager

This file is the entry point for Claude Code on this repo. Read this first, then work through `docs/tasks/*.md` **in numeric order**. Each task file is self-contained (server + client subtasks for one feature slice) and assumes everything in earlier task files already works.

## Source of truth
- `docs/PRD.md` — full product spec. If a task file and the PRD ever disagree, the PRD wins; flag the conflict instead of guessing.
- `docs/tasks/00-project-setup.md` through `docs/tasks/06-polish-qa.md` — build order.

## Tech stack (do not substitute without asking)
- Client: React + Vite, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, React Hook Form + Zod, Recharts
- Server: Node.js + Express, Mongoose (MongoDB)
- Auth: JWT access+refresh in httpOnly Secure cookies, rotation on refresh
- Email: Nodemailer + Brevo SMTP
- Telegram: grammY or node-telegram-bot-api (support both webhook and polling; polling is what actually runs in prod)

### Library versions to code against (latest majors; do not write code for older APIs)
- React 19 (ref is a plain prop, no `forwardRef`), React Router 8 (import everything from `react-router`; `react-router-dom` no longer exists), Tailwind CSS 4 (CSS-first config in `client/src/index.css`, `@tailwindcss/vite`, no `tailwind.config.js`), Vite 8, TanStack Table 9 (`useTable` + `tableFeatures`, not v8's `useReactTable`), Zod 4 (`z.email()`, `error` param instead of `message`), Express 5 (async handlers may throw), Mongoose 9, ESLint 10 flat config (`eslint.config.js`).
- TypeScript is 6.x on purpose: typescript-eslint does not support TS 7 yet. `@types/node` is 24 to match the Node 24 runtime (`.nvmrc`).

## Repo layout
```
/server
  /src
    /models        (Mongoose schemas)
    /routes
    /controllers
    /middleware     (auth, role-guard, error handler)
    /services       (otp, email, telegram, jwt)
    /validation     (Zod schemas)
    seed.js
/client
  /src
    /pages          (Dashboard, Products, Categories, Suppliers, StockMovements, auth pages)
    /components
    /hooks          (TanStack Query hooks)
    /schemas        (Zod, mirrored from server/validation where practical)
    /api            (fetch wrappers, cookie-based, credentials: 'include')
docs/
  PRD.md
  tasks/
```

## Working conventions
- Every mutating server route is guarded by auth middleware + role-guard middleware — never trust the client for role checks.
- Every stock quantity change (receive, ship, adjustment, or the inline +/- buttons) MUST write a `StockMovement` record in the same transaction/operation as the quantity update. Movements are the audit source of truth — do not let `product.quantity` drift from the sum of its history.
- Every form: React Hook Form + Zod resolver. Every server mutation route: validate the body with the matching Zod schema before touching the DB.
- Every server read list endpoint (products, stock-movements, users) supports pagination; wire these into TanStack Query with proper `queryKey`s so filters/sort/page all invalidate correctly.
- Toast on every mutation's success/error (shadcn toast).
- Auth endpoints (login, register, OTP request/verify) are rate-limited.
- Password-reset responses are always generic (no account enumeration). Registration explicitly reveals duplicate emails (confirmed trade-off, see PRD §3).

## How to work through this repo
1. Do `00-project-setup.md` first — nothing else compiles without it.
2. Do `01-identity-auth.md` next and get it fully working (register, verify, login both ways, pending/rejected screens, admin approval) before touching any other feature — every other page sits behind this.
3. `02-categories-suppliers.md`, then `03-products.md` (products depend on categories/suppliers existing), then `04-stock-movements.md` (depends on products), then `05-dashboard.md` (depends on products + movements), then `06-polish-qa.md`.
4. After each task file, run the app and verify the acceptance checklist at the bottom of that file before moving on. Don't batch multiple task files into one uncommitted pass.
5. If a task file references a decision not in the PRD, stop and ask rather than inventing one.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default five-role vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `CONTEXT.md` at the repo root, ADRs in `docs/adr/`. See `docs/agents/domain.md`.
