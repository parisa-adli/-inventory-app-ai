# TASK.md — Product Inventory Manager Build Plan

Derived from `docs/PRD.md`, the phase files in `docs/PRDs/` (00–06), and `docs/seed-data-strategy/`. **The PRD is the source of truth**; where another doc disagrees, the PRD wins and the conflict is listed in [Open Questions](#open-questions--doc-conflicts).

Work phases in order. Each phase ends with its acceptance checklist, and should be verified (and committed) before the next one starts. Seed data is added **incrementally per phase**, not at the end.

## Conventions

- **ID format:** `P<phase>.<n>`. `[S]` = server, `[C]` = client, `[X]` = shared/cross-cutting.
- **Dependencies** are listed per task as `Deps:`.
- Every mutating route: `requireAuth` → `requireActive` → `requireRole(...)` (where admin-only) → Zod validation → DB.
- Every stock quantity change writes a `StockMovement` **in the same operation** (use a Mongo transaction/session, or an atomic conditional update plus movement insert) with `resultingQuantity` snapshotted.
- Every form: React Hook Form + Zod resolver. Every mutation: success + error toast (sonner).
- Every list endpoint: pagination; TanStack Query keys include all filter/sort/page params.
- Error shape: `{ error: { code, message } }`.

## Current state (already scaffolded, commit `c127d2c`)

| Area | Present | Notes |
| --- | --- | --- |
| Monorepo | `client/`, `server/`, `shared/`, `tests/` (Playwright), CI workflow | Server and shared are **TypeScript** (`.ts`), not `.js` as the docs show |
| Server | `index.ts`, `config/database.ts`, `middleware/{auth,errorHandler,roleGuard}.ts`, `routes/health.ts`, `utils/errors.ts`, `seed.ts` | `npm run seed` = `tsx src/seed.ts`; `server/.env.example` exists |
| Client | Vite + Tailwind, shadcn components (badge, button, card, dialog, dropdown-menu, form, input, label, select, sonner, table, tabs), `lib/axios.ts`, `lib/queryClient.ts`, `AppLayout`, `AuthLayout`, stub `Dashboard`/`Login` | `client/.env.example` exists |
| Shared | constants (roles, account-status, stock-movement-types), `seed-data/` (users, categories, suppliers, products, stock-movements), `schemas/`, `types/` | Seed data is ready; models/seeding logic are not |

Phase 00 is therefore mostly a **verification and gap-fill** pass, not a from-scratch build.

---

## Dependency overview

```
P0 Setup ──► P1 Identity & Auth ──► P2 Categories & Suppliers ──► P3 Products ──► P4 Stock Movements page ──► P5 Dashboard ──► P6 Polish & QA
                                                                      │
                          (seed.ts grows each phase: users → cat/sup → products+movements)
```

---

## Phase 0 — Project Setup

Source: `docs/PRDs/00-project-setup.md`. Deps: none.

### Server
- [ ] **P0.1 [S] Audit existing scaffold against spec.** Confirm Express app boots; JSON parser, cookie parser, CORS (`credentials: true`, origin = client URL), centralized error handler returning `{ error: { code, message } }`.
- [ ] **P0.2 [S] Env vars.** Ensure `server/.env.example` documents: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_DOMAIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MODE` (`webhook|polling`), `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `APP_URL`, `PORT`. Add a typed, validated (Zod) env loader that fails fast on missing values. Add the global `LOW_STOCK_THRESHOLD` constant (used by P3 and P5, single definition in `shared/`).
- [ ] **P0.3 [S] Mongoose connection** via `MONGODB_URI` (`config/database.ts`).
- [ ] **P0.4 [S] `GET /api/health`** returns 200.
- [ ] **P0.5 [S] Seed skeleton.** `seed.ts` connects, exposes `runSeed()`, clears + inserts per entity, disconnects, exits non-zero on failure. Script `npm run seed` in `server/package.json`. *(Seed strategy Phase 00.)*

### Client
- [ ] **P0.6 [C] Providers & defaults.** TanStack Query provider (`retry: 1`, `refetchOnWindowFocus: false`); sonner `<Toaster />` mounted.
- [ ] **P0.7 [C] API wrapper** (`lib/axios.ts`): `withCredentials`/`credentials: 'include'`; response interceptor that calls `/api/auth/refresh` **once** on 401 and retries the original request (guard against refresh loops and concurrent-refresh stampedes).
- [ ] **P0.8 [C] Router** (react-router) with route groups: public (login/register/verify/forgot/reset), pending/rejected screens, protected app shell (Dashboard/Products/Categories/Suppliers/Stock Movements), admin-only group (Users). No auth logic yet.
- [ ] **P0.9 [C] Missing shadcn components** if needed later (`toast` via sonner already present; add `checkbox`, `textarea`, `popover`/`calendar` for date range, `tooltip`, `skeleton` as phases need them).
- [ ] **P0.10 [C] `client/.env.example`** documents API base URL / proxy target; Vite dev proxy to the server.

### Acceptance
- [ ] `GET /api/health` returns 200 through the client dev server (proxy/CORS).
- [ ] Client boots to a blank shell with the router in place.
- [ ] `.env.example` files complete on both client and server.
- [ ] `npm run seed` connects and exits cleanly (no data yet).

---

## Phase 1 — Identity & Auth

Source: `docs/PRDs/01-identity-auth.md`, PRD §2–§3. Deps: **P0**. Nothing else is built until this works end to end.

### Shared
- [ ] **P1.1 [X] Reconcile status/role constants with the PRD.** PRD statuses are `pending | active | rejected`; `shared/constants/account-status.ts` currently has `APPROVED`. Roles are `admin | staff` only. See Open Questions #1–#2. Zod schemas for register/login/OTP/forgot/reset in `shared/schemas`.

### Server — models
- [ ] **P1.2 [S] Models** per PRD §4: `User` (unique lowercase email, optional `passwordHash`, `role`, `status`, `emailVerified`, optional `telegramChatId`), `EmailToken` (`verify-email | reset-password | link-telegram`, hashed token, `expiresAt`, `consumed`; carries `telegramChatId` payload for link-telegram), `OtpCode` (hashed code, `expiresAt`, `attempts`, `lastSentAt`, `consumed`), `RefreshToken` (`tokenHash`, `expiresAt`, `revoked`). Add TTL/unique indexes where appropriate.

### Server — services
- [ ] **P1.3 [S] `services/jwt`**: sign/verify access (15 min) + refresh (7 d); cookie options `httpOnly`, `Secure`, `SameSite=Strict`; **rotation** on refresh (revoke old `RefreshToken`, issue new). Deps: P1.2.
- [ ] **P1.4 [S] `services/email`**: Nodemailer + Brevo SMTP; verification, reset, and telegram-link templates; **dev fallback** that logs the link when SMTP is not configured. Deps: P0.2.
- [ ] **P1.5 [S] `services/otp`**: generate 6-digit code, store hashed; 2-min expiry, max 3 attempts then invalidate, 60-s resend cooldown. Deps: P1.2.
- [ ] **P1.6 [S] `services/telegram`**: grammY bot; **polling** mode (prod) and **webhook** mode selected by `TELEGRAM_MODE`; conversation to collect name + email for signup → calls signup logic; sends OTP codes to `telegramChatId`. Deps: P1.4, P1.5.
- [ ] **P1.7 [S] Password hashing** with bcrypt, **10 rounds** (must match the seed script). Deps: none.

### Server — routes
- [ ] **P1.8 [S] `POST /api/auth/register`**: Zod body; 409 `DUPLICATE_EMAIL` if exists (explicit, intentional); else create `pending`/`staff`/`emailVerified:false`, email verification link. Deps: P1.2, P1.4, P1.7.
- [ ] **P1.9 [S] `POST /api/auth/telegram/signup-webhook`**: new email → create user with `telegramChatId` + verification email; existing email → **no duplicate**, create `link-telegram` EmailToken carrying the new chatId, email confirm link. Deps: P1.6, P1.8. (Protect with a shared secret/bot-only check.)
- [ ] **P1.10 [S] `GET /api/auth/verify-email/:token`**: single-use, expiring; sets `emailVerified` or performs the Telegram link merge. Deps: P1.2.
- [ ] **P1.11 [S] `POST /api/auth/login`**: credentials check; `rejected` → 403 with rejected message; `pending` → tokens issued (client routes via `/me`); `active` → normal. Deps: P1.3.
- [ ] **P1.12 [S] `POST /api/auth/otp/request` and `/otp/verify`**: look up `telegramChatId` by email, send code via bot, verify with the OTP policy; issue tokens. Decide behavior for unknown email / no linked Telegram without leaking more than the PRD permits. Deps: P1.5, P1.6, P1.3.
- [ ] **P1.13 [S] `POST /api/auth/refresh`**, **`POST /api/auth/logout`** (clear cookies + revoke refresh token), **`GET /api/auth/me`** → `{ id, name, email, role, status, emailVerified }`. Deps: P1.3.
- [ ] **P1.14 [S] `POST /api/auth/forgot-password`** (always generic 200) and **`POST /api/auth/reset-password/:token`** (consume token, set new hash; consider revoking existing refresh tokens). Deps: P1.4.
- [ ] **P1.15 [S] Admin users API**: `GET /api/users?status=` (paginated), `PATCH /:id/activate` (**400 if `!emailVerified`**), `PATCH /:id/reject` (also revokes active users; revoke their refresh tokens), `PATCH /:id/reactivate`. Guard: admin only. Deps: P1.16.
- [ ] **P1.16 [S] Middleware**: finish `requireAuth` (cookie access token → `req.user`), `requireRole('admin')`, `requireActive` (applied to all data routes; not to `/auth/*` or admin `/users/*`). Existing stubs in `middleware/`. Deps: P1.3.
- [ ] **P1.17 [S] Rate limiting** (`express-rate-limit`) on login, register, OTP request/verify, forgot-password. Deps: P1.8–P1.14.

### Client
- [ ] **P1.18 [C] Auth context/hook** over `GET /api/auth/me` (TanStack Query) gating the router: unauthenticated → public; `pending` → Awaiting Approval; `rejected` → Rejected; `active` → app shell. Deps: P0.8, P1.13.
- [ ] **P1.19 [C] Pages** (all RHF + Zod): Login (password tab + Telegram-OTP tab: email → code, with resend countdown), Register, "Sign up with Telegram" instructions page with bot deep link, Verify-Email landing, Forgot Password, Reset Password, Awaiting Approval, Rejected/Revoked. Deps: P1.18.
- [ ] **P1.20 [C] Admin Users page** (admin-only route): Pending Users table with Activate (disabled + tooltip when `!emailVerified`) / Reject; second view/filter for active users (revoke) and rejected users (reactivate). Hide admin nav for staff. Deps: P1.15, P1.18.
- [ ] **P1.21 [C] Logout** action in the app shell; clear Query cache on logout.

### Seed (Phase 01)
- [ ] **P1.22 [S] `seedUsers()`**: clear Users; hash passwords (bcrypt, 10); map `manager` → `staff`; return `Map<email, User>`; do **not** seed `EmailToken`/`OtpCode`/`RefreshToken`. Seed set should include: 1 admin, 3 active staff, 1 verified pending, 1 rejected, and (added by P6 or here) 1 **unverified** pending user. Deps: P1.2, P1.7.

### Acceptance (from `01-identity-auth.md`)
- [ ] Register new email → pending, unverified; verification link arrives (or is logged in dev) and sets `emailVerified`.
- [ ] Register same email again → explicit duplicate error.
- [ ] Telegram signup, new email → pending user + verification email.
- [ ] Telegram signup, existing email → no duplicate; confirm email; click links the chatId to the existing account.
- [ ] Login works by password and by Telegram OTP once active.
- [ ] OTP: 2-min expiry, 3 attempts, 60-s resend cooldown.
- [ ] Pending user can log in but sees only Awaiting Approval.
- [ ] Admin cannot activate an unverified user.
- [ ] Rejected user is blocked; admin can reactivate.
- [ ] Access token expires and silently refreshes; logout clears both cookies.
- [ ] Forgot-password response identical whether or not the email exists.
- [ ] `npm run seed` users can log in (`admin@inventory.local` / `Admin@123`, `john.staff@inventory.local` / `Staff@123`).

---

## Phase 2 — Categories & Suppliers

Source: `docs/PRDs/02-categories-suppliers.md`. Deps: **P1** (auth + role guard).

### Server
- [ ] **P2.1 [S] `Category` model** (`title`, `description`, `createdAt`) and **`Supplier` model** (`name`, `contactPerson`, `phone`, `email`, `address`, `notes`, `createdAt`). Zod schemas in `shared/schemas`.
- [ ] **P2.2 [S] Category routes** `GET/POST/PUT/DELETE /api/categories`: reads for any active user; mutations admin-only. `GET` includes `productCount` (aggregate). `DELETE` → **409** if any `Product` references it (the `Product` model arrives in P3, so implement the check against the model by name / add a TODO-guarded check and **re-verify in P3.1**). Categories cannot be archived.
- [ ] **P2.3 [S] Supplier routes**: same pattern, same 409 rule; include `productCount`.

### Client
- [ ] **P2.4 [C] Categories page**: shadcn Card grid (title, description, created date, product count); Create/Edit dialog (RHF+Zod); Delete with confirm and a toast surfacing the 409 message. Create/edit/delete controls hidden for staff. Loading/empty/error states.
- [ ] **P2.5 [C] Suppliers page**: same pattern with the supplier fields.
- [ ] **P2.6 [C] Query hooks** (`useCategories`, `useSuppliers`, mutations with invalidation) — reused by Product filters/forms in P3.

### Seed (Phase 02)
- [ ] **P2.7 [S] `seedCategories()`** (8) → `Map<title, Category>`; **`seedSuppliers()`** (8) → `Map<name, Supplier>`; `runSeed()` order: users → categories → suppliers.

### Acceptance
- [ ] Staff can view both pages, no create/edit/delete controls (and server rejects staff mutations with 403).
- [ ] Admin CRUD works; deleting a category/supplier with products shows a clear blocking error (verify once P3 exists).
- [ ] 8 categories and 8 suppliers visible after `npm run seed`.

---

## Phase 3 — Products (and stock-changing endpoints)

Source: `docs/PRDs/03-products.md`, PRD §4–§6.2. Deps: **P2**.

### Server
- [ ] **P3.1 [S] `Product` model** (`title`, unique `sku`, `category` ref, nullable `supplier` ref, `costPrice`, `salePrice`, `quantity` ≥ 0, `unitOfMeasure` enum `pcs|kg|box|l|m`, `imageUrl`, `status` `active|archived`, timestamps) with indexes for search/sort. **`StockMovement` model** (`product`, `type`, `quantity`, `resultingQuantity`, `note`, `user`, `createdAt`; `note` required when `type === 'adjustment'`). Re-verify P2 delete-blocking now works.
- [ ] **P3.2 [S] Stock service (single choke point)**: one function that applies a quantity change **and** writes the `StockMovement` atomically (transaction, or conditional `findOneAndUpdate` guarding `quantity >= amount` + movement insert). Rules: `receive` adds; `ship` rejects (400) if amount > on-hand; `adjustment` takes a signed delta, requires `note`, cannot go below 0. Used by both endpoints below. Deps: P3.1.
- [ ] **P3.3 [S] `GET /api/products`**: search (title/SKU), `category`, `supplier` (incl. `unassigned`), `status` (default active), `stockStatus` (`in|low|out` using the shared `LOW_STOCK_THRESHOLD`), sort (title/quantity/costPrice/salePrice), pagination; populate category/supplier names.
- [ ] **P3.4 [S] `POST /api/products`, `PUT /api/products/:id`**: staff + admin; Zod-validated; duplicate-SKU → clear 409. Quantity is **not** editable via PUT (stock changes only through the stock service); decide initial quantity on create (see Open Questions #6).
- [ ] **P3.5 [S] Admin-only**: `DELETE /api/products/:id`, `PATCH .../archive`, `PATCH .../unarchive`. Archiving doesn't touch history. Decide delete behavior vs. existing movements (Open Questions #7).
- [ ] **P3.6 [S] `PATCH /api/products/:id/quantity`** (`{ delta: 1 | -1 }`) → `receive`/`ship` of 1 via stock service. Deps: P3.2.
- [ ] **P3.7 [S] `POST /api/products/:id/adjust-stock`** (`{ type, quantity, note? }`) via stock service. Deps: P3.2.
- [ ] **P3.8 [S] `GET /api/products/:id/stock-movements`** (per-product history; may land here or P4.1 — build once, share the query).

### Client
- [ ] **P3.9 [C] Products page header**: search (debounced), Category select, Supplier select (+ "Unassigned"), Stock Status (All/In/Low/Out), Active/Archived tabs. Filters stored in URL search params so the dashboard can deep-link (P5).
- [ ] **P3.10 [C] TanStack Table** (v9 API: `tableFeatures` + `useTable`, row models declared on the features object): Title, SKU, Category, Supplier ("Unassigned" badge), Cost, Sale, Quantity with inline −/+ (− disabled at 0; disable while pending), Unit, Status badge, Actions menu. Server-side sort + pagination; query keys include filters/sort/page.
- [ ] **P3.11 [C] Create/Edit form** (RHF+Zod, shared schema): all fields incl. SKU, unit select, image URL, category, optional supplier.
- [ ] **P3.12 [C] Adjust Stock modal**: tabs Receive / Ship / Manual Adjustment; adjustment requires reason; ship validates against on-hand. Surface server errors in toasts.
- [ ] **P3.13 [C] Stock History modal** (per product: date, type, qty, resulting qty, note, user).
- [ ] **P3.14 [C] Admin-only actions**: Archive/Unarchive/Delete (confirm dialogs), hidden for staff.
- [ ] **P3.15 [C] Invalidation**: stock mutations invalidate products, product history, global movements, and dashboard queries.

### Seed (Phase 03)
- [ ] **P3.16 [S] `seedProducts()`**: resolve `categoryRef` (title) and nullable `supplierRef` (name) → ObjectIds; fail with a descriptive error if a non-null ref is missing; `Map<sku, Product>`.
- [ ] **P3.17 [S] `seedStockMovements()`**: resolve `productRef` (SKU) and `userRef` (email); insert with historical `createdAt`; **validate** each product's `quantity` equals its latest movement's `resultingQuantity`, and flag any product with `quantity > 0` and no history. Fix seed data (not the validator) when mismatches appear. Order: users → categories → suppliers → products → movements.

### Acceptance
- [ ] Staff creates/edits products and adjusts stock (all 3 types); no archive/delete controls and server rejects those with 403.
- [ ] Inline ± appears immediately in Stock History as `receive`/`ship` of 1.
- [ ] Shipping > on-hand is rejected with a clear error; − never possible at 0.
- [ ] Adjustment without a reason rejected client- and server-side.
- [ ] Stock-status filter buckets match `LOW_STOCK_THRESHOLD`.
- [ ] Products with no supplier show "Unassigned" and filter correctly.
- [ ] Concurrent ship requests cannot drive quantity negative or desync from movements.
- [ ] After seed: 32 products, quantities match movement history, 0 validator warnings.

---

## Phase 4 — Stock Movements Page

Source: `docs/PRDs/04-stock-movements.md`. Deps: **P3**.

### Server
- [ ] **P4.1 [S] `GET /api/stock-movements`**: filters `product`, `type`, `dateFrom`, `dateTo` (against `createdAt`; make `dateTo` inclusive of the whole day), `limit`/`page`; newest first; populate product title/SKU and user name. Index on `createdAt` and `product`.
- [ ] **P4.2 [S] Confirm `GET /api/products/:id/stock-movements`** shares the same query/shape and the Stock History modal (P3.13) uses it.

### Client
- [ ] **P4.3 [C] Stock Movements page**: read-only TanStack Table (Date, Product, Type badge, Quantity, Resulting Quantity, Note/Reason, User); filters (product select, type select, date-range picker); pagination; filters in query keys.

### Acceptance
- [ ] Every movement from anywhere (inline ±, modal receive/ship/adjust) appears with the right user.
- [ ] `type=adjustment` shows the reason; receive/ship show a note only if entered.
- [ ] Date-range filter works against `createdAt`.
- [ ] No new seed data needed; all seeded movements visible.

---

## Phase 5 — Dashboard

Source: `docs/PRDs/05-dashboard.md`, PRD §6.1. Deps: **P4** (and P3 for the threshold).

### Server
- [ ] **P5.1 [S] `GET /api/dashboard/summary`**: `totalProducts`, `totalStockValue` (Σ cost × qty), `totalStockIncome` (Σ sale × qty), `lowStockCount`, `outOfStockCount` — **active products only**, aggregation pipeline, same threshold logic as P3.3 (share one helper so they cannot diverge). Define whether "low" excludes "out" (Open Questions #5).
- [ ] **P5.2 [S] `GET /api/dashboard/movements-chart?range=7d|30d|90d`**: receive vs ship quantity per bucket (day; week for 90d), zero-filled buckets, adjustments excluded (or documented).
- [ ] **P5.3 [S] `GET /api/dashboard/alerts`**: low/out-of-stock products, worst-first, capped (~20), with data to link to the pre-filtered Products page.
- [ ] Recent-movements feed **reuses** `GET /api/stock-movements?limit=10` (no new endpoint).

### Client
- [ ] **P5.4 [C] Dashboard page** (default landing for active users): five stat cards (currency formatting); Recent Movements feed (~10, link to product); Alerts table (product, quantity, threshold, status badge, row links to filtered Products page); Recharts In-vs-Out chart with 7/30/90-day selector.
- [ ] **P5.5 [C] Loading/empty/error states** per widget so one failed query doesn't blank the page.

### Seed (Phase 05)
- [ ] **P5.6 [S] Optional**: extend seed movements back 60–90 days if the chart looks sparse (must keep the quantity-consistency validator green).

### Acceptance
- [ ] Card values match manual spot-check on 2–3 seeded products (cost/sale × quantity).
- [ ] Alert table matches the Products page stock-status filter.
- [ ] Chart separates receive vs ship per bucket and updates with the range selector.
- [ ] Recent feed and cards update right after a stock action elsewhere (query invalidation).

---

## Phase 6 — Polish & QA

Source: `docs/PRDs/06-polish-qa.md`, `docs/seed-data-strategy/`. Deps: **P0–P5 complete**.

- [ ] **P6.1 Responsive pass**: desktop-first; check tablet widths for tables and dashboard cards; confirm LTR throughout.
- [ ] **P6.2 Toast audit**: every mutation (products, categories, suppliers, stock, auth, admin user actions) has success and error toasts.
- [ ] **P6.3 Loading/empty/error states** for every Query-backed list (products, categories, suppliers, movements, users, dashboard widgets).
- [ ] **P6.4 Rate-limit verification**: actually trigger limits on login, register, OTP request/verify, forgot-password (e.g. a script or Playwright test) — not just configured.
- [ ] **P6.5 Authorization audit**: for each mutating route, assert staff → 403, unauthenticated → 401, pending/rejected → 403 on data routes. Prefer automated API tests.
- [ ] **P6.6 Seed final audit**: runs clean (no warnings, <30 s, idempotent); data covers in/low/out of stock, ≥1 zero-quantity product, ≥1 archived product, ≥1 product without supplier, ≥1 manual adjustment with a detailed reason, verified-pending, **unverified**-pending, and rejected users; movements span ~90 days.
- [ ] **P6.7 Stock-integrity check**: script/test confirming `product.quantity` equals the movement-history result for every product after a mixed sequence of actions.
- [ ] **P6.8 Playwright e2e** (infra exists in `tests/`): replace `example.spec.ts` with smoke flows — login (admin/staff), staff restrictions, stock adjust → history → dashboard update, pending/rejected screens.
- [ ] **P6.9 README**: install, env vars, dev commands (client + server), `npm run seed` and test accounts, how to test the Telegram flow locally (polling + test bot token), email in dev (Brevo or log-the-link fallback).
- [ ] **P6.10 PRD diff**: re-read `docs/PRD.md` end to end against what was built; list deviations in a `docs/` note rather than leaving them silent.

### Acceptance
- [ ] Fresh DB → `npm run seed` → whole app usable with realistic data.
- [ ] All filters, sorts and aggregations return meaningful results.
- [ ] Every PRD §2 permission-matrix row verified for both roles.

---

## Open Questions / Doc Conflicts

These need a decision (PRD wins by default; per `CLAUDE.md`, stop and ask rather than invent).

1. **Status vocabulary:** PRD uses `active`; `shared/constants/account-status.ts` and seed docs use `approved`. *Proposed:* change the constant to `ACTIVE: 'active'` and update seed data. Needs confirmation.
2. **`manager` role:** seed data (`shared/seed-data/users.ts`) has 2 managers; PRD only has `admin`/`staff`. Seed docs say map manager → staff. *Proposed:* clean the seed data itself to `staff` so shared types stay honest, rather than carrying a mapping.
3. **Task file location:** `CLAUDE.md` points at `docs/tasks/*.md`; the files actually live in `docs/PRDs/`. *Proposed:* update `CLAUDE.md` (or move files).
4. **Language:** docs say `seed.js` / `models/*.js`; the scaffold is TypeScript (`seed.ts`). *Proposed:* stay TypeScript.
5. **Low vs. out of stock:** is "Low Stock" `0 < qty <= threshold` (excluding out) or `qty <= threshold` (including out)? Affects dashboard cards, alerts, and filter. Also the threshold value itself is undefined in the PRD ("global `LOW_STOCK_THRESHOLD`").
6. **Initial quantity on product create:** if a product is created with quantity > 0, should that write an initial `receive` movement (keeps quantities = Σ history)? *Proposed:* yes, auto-write an initial `receive` movement, or start all products at 0.
7. **Deleting a product that has movements:** block, cascade-delete movements, or keep orphans? Affects audit-trail guarantee.
8. **Seed vs. PRD "first Admin via seed script":** the dev seed (`admin@inventory.local` / `Admin@123`) must not be run in production; need a separate minimal admin-bootstrap path (env-provided credentials).
9. **Telegram signup webhook auth:** how does the bot-triggered endpoint authenticate (shared secret header vs. in-process call when running polling mode)?
10. **Image handling:** `imageUrl` only (URL input), or an upload endpoint? Task 03 says "URL input or simple upload-to-URL placeholder".
11. **Adjustment `quantity` semantics:** PRD says signed delta for adjustment; the API body has a single `quantity` field — confirm that negative numbers are allowed for `adjustment` only.
12. **Chart treatment of adjustments:** excluded from In/Out chart (PRD says received vs shipped only) — confirm.

---

## Suggested commit boundaries

One commit (or PR) per phase, following `CLAUDE.md`: don't batch multiple task files into one uncommitted pass. Within P1 and P3, consider splitting server and client into separate commits.
