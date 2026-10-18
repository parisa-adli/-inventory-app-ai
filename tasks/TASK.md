# TASK.md — Product Inventory Manager Build Plan

Derived from `docs/PRD.md`, the phase files in `docs/PRDs/` (00–06), and `docs/seed-data-strategy/`. **The PRD is the source of truth**; where another doc disagrees, the PRD wins and the conflict is listed in [Open Questions](#open-questions--doc-conflicts).

Work phases in order. Each phase ends with its acceptance checklist, and should be verified (and committed) before the next one starts. Seed data is added **incrementally per phase**, not at the end.

**Fresh session?** Read `CLAUDE.md` (conventions, library versions, commands), then [Current state](#current-state), [Dev Environment](#dev-environment), and the section for the part you are doing. Task status is the checkbox on each task line; `[x]` = done and verified.

## Conventions

- **ID format:** `P<phase>.<n>`. `[S]` = server, `[C]` = client, `[X]` = shared/cross-cutting.
- **Dependencies** are listed per task as `Deps:`.
- Every guarded route spreads a helper from `middleware/guards.ts` (`can(PERMISSIONS.X)`; `authenticated` for no specific permission; `signedIn` only for self-service gate routes) → Zod validation → DB. Never chain the guards by hand. Permissions per role: `ROLE_PERMISSIONS` in `shared/constants/permissions.ts` (P1.25). Phase 2–5 routes use: reads `INVENTORY_VIEW`; product create/edit `PRODUCTS_WRITE`; stock changes `STOCK_ADJUST`; archive/unarchive `PRODUCTS_ARCHIVE`; delete product `PRODUCTS_DELETE`; stock reconciliation `STOCK_RECONCILE` (admin; #28); category / supplier create + edit `CATEGORIES_WRITE` / `SUPPLIERS_WRITE` (staff + admin), delete `CATEGORIES_DELETE` / `SUPPLIERS_DELETE` (admin; C15). Client controls are hidden with `<Can>` / `useCan`.
- Every stock quantity change writes a `StockMovement` **in the same operation**: an atomic conditional update plus the movement insert, with a compensating update if the insert fails, no transactions (`docs/adr/0002`). The movement snapshots `quantityAfter` (the PRD's `resultingQuantity`, renamed in `CONTRACT-CHANGES.md` C17).
- Every form: React Hook Form + Zod resolver. Every mutation: success + error toast (sonner).
- Every list endpoint: pagination; TanStack Query keys include all filter/sort/page params.
- Error shape: `{ error: { code, message } }`.

## Current state

History: `c127d2c` scaffold → `b173a2a` Phase 1 Part A + server dependency upgrades → `eabaff0` full dependency modernization → `72fd3c2` client `app/` + `features/` structure → `4af5afb` Phase 1 Part B server → Part B client → Part C Telegram (latest commit).

| Area | State |
| --- | --- |
| Monorepo | npm workspaces `client/`, `server/`, `shared/`; `tests/` (Playwright smoke tests in `tests/smoke.spec.ts`); `.nvmrc` = Node 24; server tests that touch Mongo use the separate `inventory_app_claude_test` database; `package-lock.json` is tracked; CI (`.github/workflows/playwright.yml`) runs Playwright. All code is **TypeScript** (`.ts`/`.tsx`), not `.js` as the older docs show. |
| Server (`server/src`) | `index.ts` (Express 5: json, cookie-parser, CORS with credentials, error handler), `config/{database,env,load-env}.ts`, `models/{User,EmailToken,AuthSession,RefreshToken,RateLimitHit}.ts`, `services/{jwt,password}.ts`, `middleware/{auth,roleGuard,validate,errorHandler}.ts`, `utils/{errors,crypto}.ts`, `types/express.d.ts` (`req.user`), `app.ts` (`createApp()`, importable by tests; `index.ts` only connects and listens), `routes/{health,auth}.ts` (**auth routes under `/api/auth` exist; no users routes yet**), `services/{email,emailToken}.ts`, `middleware/rateLimit.ts`, `utils/authUser.ts`, `test/db.ts`, `seed.ts` (`seedUsers()` only). Part C added `services/{telegram,telegramAuth,telegramSignup}.ts`, `POST/GET /api/auth/telegram/{start,status,verify,resend,complete}` (QR -> bot code -> code on the website -> username + email, see Part C revision), the `link-telegram` branch of verify-email, and the webhook route (webhook mode only). |
| Client (`client/src`) | React 19 + Vite 8 + Tailwind 4. shadcn components in `components/ui` (alert-dialog, avatar, badge, button, card, dialog, dropdown-menu, form, input, label, select, sheet, skeleton, sonner, table, tabs, tooltip); `lib/{axios,utils}.ts`; `app/{App,providers,router,queryClient}` and `app/layouts/{AppLayout,AuthLayout}`; `features/auth/{api,hooks,components,pages}` (login with Password/Telegram tabs, register, signup/telegram, verify-email, forgot/reset password, awaiting-approval, rejected) , `features/dashboard/pages/Dashboard` (stub), `features/users` (Admin Users) and `features/profile` (Profile page, Part E). Router (P1.23): a data router (`createBrowserRouter` in `app/router.tsx`) whose route groups are guarded by middleware from `features/auth/routeGuards.ts` (`requireGuest`, `requireSignedIn`, `requireGate`, `requireRole`): guest pages, open emailed-link pages, gate screens, the signed-in app shell under `/app` (paths in `app/paths.ts`; `/` and `/app` redirect to `/app/dashboard`; any unknown URL, inside or outside `/app`, shows an in-shell "Page not found" (`app/layouts/NotFound`) behind `requireSignedIn`, URL kept) and the admin-only group (`/app/users`; staff see an in-shell "You don't have access to this page"). A guest is sent to `/login?next=<page>`; `safeNext`/`resolveLandingRoute` in `features/auth/landing.ts` decide where a signed-in user goes. `App.tsx` re-runs the guards (`router.revalidate()`) whenever the cached user changes, and `lib/axios.ts` marks the browser a guest when a refresh fails mid-use. Cold load shows `app/layouts/AppSkeleton`; a failed session check shows `app/layouts/RouteError`. App shell (`app/layouts/AppNav.tsx`, see DESIGN.md §4): a left sidebar with the "Inventory Manager" logo and icon links Dashboard/Products/Categories/Suppliers/Movements (+ Users for admins), a top bar with an account dropdown (email, Profile → `/app/profile` (Part E), Sign out), and below `md` the sidebar opens as a left drawer (shadcn Sheet). Links to pages that don't exist yet (Products until P3, `/app/movements` until P4) show the in-shell "Page not found". Phase 2 added `features/{catalog,categories,suppliers}` (`/app/categories`, `/app/suppliers`, behind `requirePermission(INVENTORY_VIEW)`); `TextField` moved to `components/TextField.tsx`. Auth pages, gate screens and emailed links stay at the root. |
| Shared (`shared/`) | `constants` (roles, account-status, stock-movement-types, stock-status, permissions), `schemas/auth.ts`, `types/auth.ts` (`AuthUser`), `seed-data/` for every entity (only users are consumed so far). |
| Tooling | TypeScript 6.0.3 (TS 7 is blocked by typescript-eslint), ESLint 10 flat config, Vitest 5 (471 server tests passing; `routes/signupJourney.test.ts` is the sign up -> verify -> approve -> in journey for email and Telegram, real app + test DB, only mail/Telegram transports mocked), `tsdown` server bundle (`server/dist/index.mjs`), `npm audit`: 0 vulnerabilities. Commands are in `CLAUDE.md`. `npm run live-check` is the pre-flight for the manual real bot/mail run (`docs/live-check.md`). |

**Progress (Phase 2, 2026-10-16):** Phase 2 Categories & Suppliers is done (server `8e23ae3` + client commit); see its section for the decisions. The delete guard is re-verified in P3.1.

**Progress:** Phase 0 is done except the unchecked items below (P0.2 and P0.8 are partial, P0.9 is deferred). **Phase 1: Parts A, B and C done (C: the manual check with the real bot is still to be run by the user); Part D: admin approve, reject, revoke and reactivate are done; the server half of admin user management v2 (P1.24) is done, its client half is not; the Phase 1 acceptance run remains. Part E (Profile & sessions) done; its live-bot link check is still to be run by the user. P1.29 (users list sort/filters/search, pending badge, mobile cards): slice 1/5 (#21, shared `SearchInput` + `Pager`) and slice 2/5 (#22: sort, role/email-status filters and search in a toolbar, all list state in the URL, page size 20, Role column, `GET /api/users` `sort`/`order` per `CONTRACT-CHANGES.md` C16) done; slice 3/5 (#23: `lastLoginAt`, the Recently active sort and the Last sign-in column) done; slice 4/5 (#24: the pending-count badge on the Users nav link, sidebar and drawer, and on the Pending tab) done; slice 5/5 (#25: account cards below `sm`, actions extracted into `UserActions`) done, so P1.29 is done. Follow-up #26 done: the Pending list refreshes whenever the badge's count changes.** Phases 3–6 not started.

**Progress (P3/P4 prefactor #28, 2026-10-18):** groundwork for the stock ledger spec (#27), no user-visible change: ADRs `docs/adr/0001`–`0003` (Q&A precedence over the PRD, atomic guard + compensation instead of transactions, `archivedAt` instead of a stored status), the stock terms in `CONTEXT.md`, the movement type renamed `adjust` → `adjustment` (seed data included), `LOW_STOCK_THRESHOLD` + `getStockStatus` in `shared/constants/stock-status.ts`, the admin-only `STOCK_RECONCILE` permission, `CONTRACT-CHANGES.md` C17–C23, and the mongodb-memory-server harness `server/src/test/memoryDb.ts` (for the new stock and product test files only; every other DB test stays on the local `_test` database; `mongod` is cached in the root `node_modules/.cache/mongodb-memory-server`).

**Progress (#29, 2026-10-18):** the products tracer bullet. Server: `models/Product.ts` (`archivedAt`, quantity 0 at creation), `services/products.ts`, `POST /api/products` (staff + admin) and a basic `GET /api/products` (active only, title A→Z, 20 a page); `services/productRefs.ts` reads the Product model, so the Phase 2 delete guard counts real products (re-verified). Shared: `UNITS_OF_MEASURE`, `shared/schemas/products.ts` (API + form schemas, one set of messages), `shared/types/products.ts`. Client: `/app/products` (`features/products`): a TanStack Table v9 table, the create dialog, toasts; the `warning` Badge variant for Low stock; `TextField` / `FormField` take RHF's transformed-values generic. Tests: `routes/products.test.ts` (memory server), product schema tests, access-matrix rows, `tests/products.spec.ts`.

**Progress (#30, 2026-10-18):** inline −/+ and the stock module. Server: `models/StockMovement.ts` (signed `delta`, `quantityAfter`, `unitCost`/`unitPrice` snapshots, `note`, `user`, `occurredAt`; update and delete hooks refuse), `services/stock.ts` (`recordMovement`: one conditional increment, then a follow-up read classifies a miss as 404 `NOT_FOUND` / 409 `PRODUCT_ARCHIVED` / 409 `INSUFFICIENT_STOCK` with `details.onHand`; a failed movement insert is compensated, a failed compensation is logged and the original error rethrown), `services/stockMovements.ts` (the API shape), `POST /api/stock-movements` (`can(STOCK_ADJUST)`). Shared: `createStockMovementSchema` + `stockMovementRuleError` (one set of rules for the schema and the module), the `StockMovement` type. Client: −/+ in the Quantity cell (`useRecordMovement`, not optimistic, disabled while pending, − disabled at 0, a 409 toasts and refetches; invalidates products, `stock-movements` and `dashboard` keys). Tests: `services/stock.test.ts` (concurrency, classification, snapshots, compensation, hooks), `routes/stockMovements.test.ts`, `architecture.test.ts` (nothing outside `services/stock.ts` writes quantity), an access-matrix row, the −/+ tests in `tests/products.spec.ts`.

---

## Dev Environment

- **Runtime:** Node 24 (`.nvmrc`), npm workspaces, install with `npm ci`. Server `http://localhost:5000`, client `http://localhost:5173` (Vite proxies `/api` to the server). `npm run dev` starts both.
- **MongoDB:** local instance, database **`inventory_app_claude`** (`MONGODB_URI=mongodb://localhost:27017/inventory_app_claude` in `server/.env`). `server/.env` is gitignored: copy `server/.env.example`, which defaults to a database named `inventory`, and set the URI. `npm run seed` wipes and recreates the seeded collections in that database.
- **Email (Brevo SMTP) is NOT configured.** There are no real `BREVO_SMTP_*` credentials, and `.env.example` only has placeholders. `services/email` implements the development **"log-the-link" fallback**: when SMTP is not configured (missing or placeholder `your-…` values) and `NODE_ENV` is not `production`, the verification/reset link is printed to the server console (`[email:dev] …`). In production without SMTP nothing is ever logged and mail-sending routes answer 503 `EMAIL_UNAVAILABLE`. Links use `CLIENT_URL`.
- **Server tests:** `npm test` needs the local MongoDB. DB-backed tests run against `inventory_app_claude_test` (set in `server/vitest.config.ts`); `server/src/test/db.ts` refuses to touch any database whose name does not end in `_test`, and the test DB is dropped afterwards. Exception: the stock and product test files (#27) use mongodb-memory-server (`server/src/test/memoryDb.ts`), which starts its own `mongod` from the root `node_modules/.cache/mongodb-memory-server`. On a clean cache the first run downloads a ~780 MB archive (about 3 minutes here).
- **Rate limits:** login 10 / register 10 / reset 10 per 15 min per IP and the Telegram QR routes are in memory (`express-rate-limit`; restart the dev server to reset them). Forgot-password (5 per IP and 3 per email per hour) and resend-verification + change-email (3 per user per hour, shared) are kept in Mongo (`RateLimitHit`, `rateLimit()` in `middleware/rateLimit.ts`) and answer 429 `RATE_LIMITED` with `details.retryAfter` and a `Retry-After` header. Clear the `ratelimithits` collection to reset them. Set `TRUST_PROXY` to the number of reverse proxies in production.
- **Playwright:** the Chromium download times out on this network. Run e2e against the installed Edge with `PW_CHROMIUM_CHANNEL=msedge npx playwright test --project=chromium` (or `PW_CHROMIUM_CHANNEL=msedge npm run test:e2e -- --project=chromium`). The config starts the client dev server itself (reuses one already running). Firefox and WebKit have not been run locally; CI runs all three.
- **Cookies:** auth cookies are `httpOnly; Secure; SameSite=Strict`; the refresh cookie is scoped to `path=/api/auth`. `Secure` cookies are still accepted on `http://localhost` by Chromium and Firefox, but not by Safari.
- **Seeded test accounts** (`npm run seed`; source `shared/seed-data/users.ts`; the `telegramChatId` values in it are fake):

| Email | Password | Role / status |
| --- | --- | --- |
| `admin@inventory.local` | `Admin@123` | admin, active |
| `john.staff@inventory.local` | `Staff@123` | staff, active |
| `emily.staff@inventory.local` | `Staff@123` | staff, active |
| `sarah.manager@inventory.local` | `Manager@123` | staff, active (the former "manager"; email kept) |
| `pending@inventory.local` | `Pending@123` | staff, pending, email verified |
| `unverified@inventory.local` | `Unverified@123` | staff, pending, email **not** verified |
| `rejected@inventory.local` | `Rejected@123` | staff, rejected |

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
- [x] **P0.1 [S] Audit existing scaffold against spec.** Confirm Express app boots; JSON parser, cookie parser, CORS (`credentials: true`, origin = client URL), centralized error handler returning `{ error: { code, message } }`.
- [ ] **P0.2 [S] Env vars.** Ensure `server/.env.example` documents: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_DOMAIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MODE` (`webhook|polling`), `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `APP_URL`, `PORT`. Add a typed, validated (Zod) env loader that fails fast on missing values. Add the global `LOW_STOCK_THRESHOLD` constant (used by P3 and P5, single definition in `shared/`).
  - *Status: partial.* `.env.example` is complete, and `server/src/config/env.ts` validates (Zod, fail-fast) only `NODE_ENV`, the two JWT secrets, `COOKIE_DOMAIN` and the token TTLs. Part B added `PORT`, `MONGODB_URI`, `CLIENT_URL`, `EMAIL_FROM` and `BREVO_SMTP_*` (the mail settings stay optional in the schema on purpose, see Part B decisions), `APP_URL` was dropped (Open Question #13), and `database.ts`/`index.ts` now read from `env`. `TELEGRAM_*` and `PUBLIC_URL` were added in Part C. `LOW_STOCK_THRESHOLD` is not an env var: it is the shared constant `LOW_STOCK_THRESHOLD = 10` in `shared/constants/stock-status.ts` (#28).
- [x] **P0.3 [S] Mongoose connection** via `MONGODB_URI` (`config/database.ts`).
- [x] **P0.4 [S] `GET /api/health`** returns 200.
- [x] **P0.5 [S] Seed skeleton.** `seed.ts` connects, exposes `runSeed()`, clears + inserts per entity, disconnects, exits non-zero on failure. Script `npm run seed` in `server/package.json`. *(Seed strategy Phase 00.)*

### Client
- [x] **P0.6 [C] Providers & defaults.** TanStack Query provider (`retry: 1`, `refetchOnWindowFocus: false`); sonner `<Toaster />` mounted.
- [x] **P0.7 [C] API wrapper** (`lib/axios.ts`): `withCredentials`/`credentials: 'include'`; response interceptor that calls `/api/auth/refresh` **once** on 401 and retries the original request (guard against refresh loops and concurrent-refresh stampedes). *Implemented, but see the deadlock risk under Part B known issues.*
- [x] **P0.8 [C] Router** (react-router) with route groups: public (login/register/verify/forgot/reset), pending/rejected screens, protected app shell (Dashboard/Products/Categories/Suppliers/Stock Movements), admin-only group (Users). No auth logic yet.
  - *Done in Part B (P1.18).* The admin-only group exists but has no routes until Part D.
- [ ] **P0.9 [C] Missing shadcn components** if needed later (`toast` via sonner already present; add `checkbox`, `textarea`, `popover`/`calendar` for date range, `tooltip`, `skeleton` as phases need them).
- [x] **P0.10 [C] `client/.env.example`** documents API base URL / proxy target; Vite dev proxy to the server.

### Acceptance
- [x] `GET /api/health` returns 200 through the client dev server (proxy/CORS).
- [x] Client boots to a blank shell with the router in place.
- [x] `.env.example` files complete on both client and server.
- [x] `npm run seed` connects and exits cleanly (it now seeds users; see Phase 1 Part A).

---

## Phase 1 — Identity & Auth

Source: `docs/PRDs/01-identity-auth.md`, PRD §2–§3. Deps: **P0**. Nothing else is built until this works end to end.

### Parts

Phase 1 is built and committed in four parts, one session and one commit per part. Every task below is labelled with its part.

| Part | Scope | Tasks | Status |
| --- | --- | --- | --- |
| **A — Foundation** | constants/schemas, models, JWT + password services, auth middleware, `seedUsers()` | P1.1, P1.2, P1.3, P1.7, P1.16, P1.22 | ✅ done (`b173a2a`) |
| **B — Email/password flow** | email service, register, verify-email, login, refresh/logout/me, forgot/reset, rate limiting for those routes; client auth context + email/password pages | P1.4, P1.8, P1.10 (verify-email only), P1.11, P1.13, P1.14, P1.17 (B's routes), P1.18, P1.19 (B's pages), P1.21 | ✅ done |
| **C — Telegram** | Telegram bot, signup + link-telegram merge, Telegram sign in / sign up by one-time code from the bot (`AuthSession`, see Part C revision); client Email/Telegram tabs on Sign in and Sign up | P1.5, P1.6, P1.9, P1.12, plus the Telegram extensions of P1.10, P1.17, P1.19 | ✅ done (live-bot manual check pending) |
| **D — Admin user management** | users API + Admin Users page; run the full Phase 1 acceptance checklist | P1.15, P1.20, acceptance | not started |
| **E — Profile & sessions** | Profile page: display name, sign-in methods (add / change / remove password, link / unlink Telegram), device sessions and sign out everywhere (`CONTRACT-CHANGES.md` C13) | P1.26, P1.27, P1.28 | ✅ done (live-bot link check pending: `docs/live-check.md` P1–P5) |

---

### Part A — Foundation ✅ (commit `b173a2a`)

- [x] **P1.1 [X · A] Constants, schemas and types reconciled with the PRD.** `ACCOUNT_STATUS` is `pending | active | rejected` (`ACTIVE: 'active'`; `APPROVED` removed) and `USER_ROLES` is `admin | staff`. Zod 4 schemas in `shared/schemas/auth.ts`: `registerSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema` (email is trimmed + lowercased then validated; password: at least 10 characters with a letter and a digit, at most 72 bytes, supersedes the original min 8 / max 128; the OTP code schema was removed in Part C). `AuthUser` (the `/auth/me` shape) in `shared/types/auth.ts`. All exported from `@inventory/shared`.
- [x] **P1.2 [S · A] Models** in `server/src/models/` per PRD §4: `User` (unique lowercase email, optional `passwordHash`, `role` default `staff`, `status` default `pending`, `emailVerified` default false, optional `telegramChatId` with a sparse unique index), `EmailToken` (`verify-email | reset-password | link-telegram`, `tokenHash`, `expiresAt`, `consumed`, optional `telegramChatId` payload for link-telegram), ~~`OtpCode`~~ (removed in Part C, replaced by `TelegramLogin`) (hashed `code`, `expiresAt`, `attempts`, `lastSentAt`, `consumed`), `RefreshToken` (`tokenHash` unique, `expiresAt`, `revoked`). `expiresAt` has a TTL index on all three token models.
- [x] **P1.3 [S · A] `services/jwt.ts`**: access token 15 min (JWT, `ACCESS_TOKEN_TTL`) and refresh token 7 d (JWT signed with `JWT_REFRESH_SECRET`, unique `jti`, only its sha256 is stored in `RefreshToken`). Cookies `access_token` and `refresh_token` (`httpOnly`, `Secure`, `SameSite=Strict`; refresh cookie `path=/api/auth`). Exports: `issueSession(res, user)`, `rotateRefreshToken(rawToken, res)` (atomic claim; presenting an already-revoked token revokes all of that user's tokens = reuse detection), `revokeRefreshToken(rawToken)`, `revokeAllUserTokens(userId)`, `clearAuthCookies(res)`, `signAccessToken`, `verifyAccessToken`, `ACCESS_COOKIE`, `REFRESH_COOKIE`, `durationToMs`.
- [x] **P1.7 [S · A] Password hashing**: `services/password.ts` — `hashPassword`, `verifyPassword`, `BCRYPT_ROUNDS = 10` (bcrypt 6). The seed uses the same function.
- [x] **P1.16 [S · A] Middleware**: `requireAuth` (verifies the access cookie and **re-reads the user from the DB**, so a reject/revoke applies immediately; sets `req.user = { id, role, status }`), `requireActive` (403 unless `status === 'active'`; use on all data routes, not on `/auth/*` or the admin `/users/*` routes), `requireRole(...roles)`, `validate(zodSchema)` (replaces `req.body` with the parsed value; ZodError → 400 `VALIDATION_ERROR` via `errorHandler`). Express 5 forwards rejected promises from async middleware/handlers to the error handler, so no try/catch wrapper is needed.
- [x] **P1.22 [S · A] `seedUsers()`** in `server/src/seed.ts`: clears Users, hashes passwords, inserts the 7 users from `@inventory/shared` seed data, returns `Map<email, User>`; does not seed `EmailToken`/`AuthSession`/`RefreshToken` (originally `OtpCode`, see Part C). The seed data itself was cleaned (no manager role; added an unverified pending user) — see Open Question #2. Accounts: see [Dev Environment](#dev-environment).

**Verified in Part A:** `tsc`, lint, 22 unit tests (password, access tokens, middleware, shared schemas), seed twice (7 users), and a throwaway script for refresh rotation + reuse detection. **Not covered by committed tests:** rotation, reuse detection and `requireAuth`'s DB lookup (they need a Mongo instance); consider adding tests for them while building Part B.

**Building blocks Parts B–D must reuse (do not rebuild):** `AppError` and subclasses in `utils/errors.ts` (use `new AppError(409, 'DUPLICATE_EMAIL', ...)`, because `ConflictError` hard-codes the code `CONFLICT`), `sha256`/`randomToken` in `utils/crypto.ts` (store only hashes of email tokens and OTP codes), `validate()`, the shared Zod schemas, `AuthUser`, and the `User`/`EmailToken`/`AuthSession`/`RefreshToken` models (`OtpCode` was never built; see Part C). `cookie-parser` is already mounted. `nodemailer` 10 (ships its own types) and `grammy` are installed; `express-rate-limit` is **not** installed yet. There is no HTTP-level test tooling (no supertest); decide in Part B whether to add it.

---

### Part B — Email/password flow ✅

**Work order and dependencies** (✅ = already done in Part A):

| # | Task | Needs |
| --- | --- | --- |
| 1 | P1.4 email service | P0.2 — extend `config/env.ts` first (see Open Question #13) |
| 2 | P1.8 register | P1.2 ✅, P1.4, P1.7 ✅ |
| 3 | P1.10 verify-email (verify-email tokens only) | P1.2 ✅, tokens created by P1.8 |
| 4 | P1.11 login | P1.3 ✅, P1.7 ✅ |
| 5 | P1.13 refresh / logout / me | P1.3 ✅, P1.16 ✅ |
| 6 | P1.14 forgot / reset password | P1.4 |
| 7 | P1.17 rate limiting (Part B routes) | tasks 2, 4, 6 (install `express-rate-limit`) |
| 8 | P1.18 auth context + router groups | P0.8 (finish it), P1.13 |
| 9 | P1.19 Part B pages | P1.18 |
| 10 | P1.21 logout in the app shell | P1.13, P1.18 |

Mount the new routers under `/api/auth` from `server/src/routes/index.ts`. Part B routes need an *active* user only for data routes; the `/auth/*` routes use `requireAuth` alone where they need a session (`/me`, `/logout`).

#### Server
- [x] **P1.4 [S · B] `services/email`**: Nodemailer + Brevo SMTP; templates for verification and password reset (the telegram-link template is added in Part C but design the service to support it); **dev fallback** that logs the link to the console when SMTP is not configured (see [Dev Environment](#dev-environment)). Links point at the client landing pages — see Open Question #13. Deps: P0.2.
- [x] **P1.8 [S · B] `POST /api/auth/register`**: `validate(registerSchema)`; 409 `DUPLICATE_EMAIL` ("This email is already registered.") if the email exists (explicit, intentional); else create the user as `pending` / `staff` / `emailVerified: false`, create a `verify-email` `EmailToken` (hashed, expiring, single-use), and email the link. Deps: P1.2, P1.4, P1.7.
- [x] **P1.10 [S · B] `GET /api/auth/verify-email/:token`**: single-use, expiring; look the token up by `sha256`, mark it consumed, set `emailVerified: true`. Handle only `verify-email` tokens here; Part C adds the `link-telegram` branch, so structure it as a switch on token type. Deps: P1.2.
- [x] **P1.11 [S · B] `POST /api/auth/login`**: `validate(loginSchema)`; check credentials with `verifyPassword`; `rejected` → 403 with a rejected message; `pending` → tokens are still issued (the client routes by `/me`); `active` → normal. Use `issueSession`. Deps: P1.3.
- [x] **P1.13 [S · B] `POST /api/auth/refresh`** (`rotateRefreshToken` from the `refresh_token` cookie), **`POST /api/auth/logout`** (revoke the refresh token + `clearAuthCookies`), **`GET /api/auth/me`** (`requireAuth`; returns `AuthUser`: `{ id, name, email, role, status, emailVerified }`). Deps: P1.3, P1.16.
- [x] **P1.14 [S · B] `POST /api/auth/forgot-password`** (always the same generic 200; if the account exists create a `reset-password` token and email the link) and **`POST /api/auth/reset-password/:token`** (`validate(resetPasswordSchema)`, consume the token, set the new hash, and revoke the user's refresh tokens with `revokeAllUserTokens`). Deps: P1.4.
- [x] **P1.17 [S · B] Rate limiting** (`express-rate-limit`) on register, login, forgot-password and reset-password. The OTP routes are limited in Part C. Limits are not specified in the PRD — see Open Question #14. Deps: the routes above.

#### Client
- [x] **P1.18 [C · B] Auth context/hook** over `GET /api/auth/me` (TanStack Query) gating the router: unauthenticated → public routes; `pending` → Awaiting Approval; `rejected` → Rejected; `active` → app shell. Also complete **P0.8**: route groups for public, pending/rejected, protected app shell and an admin-only group. Deps: P0.8, P1.13.
- [x] **P1.19 [C · B] Pages (all React Hook Form + Zod, using the shared schemas)**: Login (**password form only** — the Telegram OTP tab is Part C), Register, Verify-Email landing (reads the token from the URL and calls the API), Forgot Password, Reset Password, Awaiting Approval, Rejected/Revoked. Toast on every mutation. Deps: P1.18.
- [x] **P1.21 [C · B] Logout** action in the app shell; clear the Query cache on logout. Deps: P1.13, P1.18.

#### Part B: known issues and hand-offs
- **Refresh-interceptor deadlock: fixed in Part B (`client/src/lib/axios.ts`).** Original problem: On a 401, the response interceptor calls `POST /auth/refresh`. If that refresh request itself returns 401 (or `/auth/me` is called while logged out), the refresh request goes through the same interceptor, sees `isRefreshing === true` and queues itself behind the refresh it is part of — it never settles. The retry now skips `/auth/refresh`, `/auth/login`, `/auth/register`, `/auth/forgot-password` and `/auth/reset-password`. `/auth/me` is deliberately **still retried**, so a reload after the 15-minute access token expired refreshes silently; excluding it would log the user out. Verified: an unauthenticated visit to `/` ends on `/login`.
- The `link-telegram` verification branch (P1.10), OTP routes/limits (P1.17), the OTP login tab and the Telegram signup page (P1.19) belong to **Part C**. Do not build them in Part B.
- A pending user cannot be approved until Part D exists. Test the pending/rejected/unverified screens with the seeded accounts in [Dev Environment](#dev-environment).
- Cookies are `Secure`; see Dev Environment for browser notes.

#### Email flow revision (branch `email-auth`, see `CONTRACT-CHANGES.md`)
Applied on top of Part B without reworking it:
- **Password rule:** 10+ characters with a letter and a digit, at most 72 bytes (register and reset only; login accepts any non-empty password). Supersedes the earlier "min 8".
- **`GET /auth/verify-email/:token`** returns `{ verified: true, type }` (`type` is `verify-email` or `link-telegram`; never the user). The landing page uses `type` to show the Telegram or the email copy. Verifying a still-pending user emails every active admin (`sendUserAwaitingApprovalEmail`, fire-and-forget; link `CLIENT_URL/users`, a page that arrives with Part D).
- **`POST /auth/forgot-password`** and **`POST /auth/reset-password/:token`** return an empty 204. Forgot answers before any lookup; reset hashes the password before spending the token and issues no session (the client clears its cached user and shows a notice on `/login`).
- **`PATCH /auth/email`** (unverified users only; 409 `DUPLICATE_EMAIL`, 403 `FORBIDDEN` when verified) re-sends verification and invalidates the old link; shares the resend budget.
- **`POST /auth/resend-verification`** now answers 200 `{ devMailUrl? }` (was 204). `devMailUrl` also appears on register and `PATCH /auth/email`, only while mail is logged to the console (no SMTP, not production).
- **Expired links:** `EmailToken` rows are kept 7 days past `expiresAt`; an expired link answers 400 `TOKEN_EXPIRED`, an unknown or used one 400 `INVALID_TOKEN`. `connectDatabase` runs `EmailToken.syncIndexes()` so existing databases pick up the new TTL.
- **`User.lastEmailFailedAt` / `lastEmailFailedType`** are set when a mail fails and cleared by the next successful send (not exposed to the client).
- **Client:** `resolveLandingRoute` (`features/auth/landing.ts`): unverified -> `/verify-email`, then rejected, then pending. `/verify-email` (no token) offers resend (with a Retry-After countdown), change email and "I've verified". Duplicate email on sign up is shown on the field. Secondary auth pages use the DESIGN.md tokens.
- **Telegram signup mail failures are tracked:** `signupWithTelegram` sends through `sendTracked`, so a failed verify or confirm-link mail sets `lastEmailFailedAt/Type` on the account (cleared by the next successful send). `server/src/routes/signupPersistence.test.ts` asserts the stored state of email and Telegram sign ups and that neither flow overwrites the other's data.
- Not built (not in this repo): lockout / `loginAttempt`, `mustChangePassword`, a `server/.mail/` driver.

#### Decisions made in Part B (deviations from the original task text)
- **Emailed links use `CLIENT_URL`** (`/verify-email/:token`, `/reset-password/:token`); `APP_URL` was removed. Verify-email token 24 h, reset token 1 h.
- **Added `POST /api/auth/resend-verification`** (needs a session, rate-limited, 204, no-op if already verified) and a "Resend" button on Awaiting Approval for unverified users. Not in the PRD; approved by the user because an unverified user could otherwise never be approved.
- **`POST /auth/logout` has no `requireAuth`**: it revokes the refresh cookie's token if present, clears both cookies, and always returns 204, so an expired access token cannot block logout.
- **Registration issues no session**; the client shows "check your email". Reset-password revokes all sessions and the client redirects to Login (no auto-login).
- **Login**: wrong password, unknown email and passwordless accounts all return 401 `INVALID_CREDENTIALS` (dummy bcrypt compare for unknown emails); `rejected` returns 403 `ACCOUNT_REJECTED` only after a correct password. Error codes: `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`, `ACCOUNT_REJECTED`, `DUPLICATE_EMAIL`, `INVALID_TOKEN`, `RATE_LIMITED`, `EMAIL_UNAVAILABLE`.
- **Mail down in production** fails every mail-sending request the same way (503, checked before any DB access) so forgot-password cannot reveal which accounts exist; a failed register send deletes the new user and token. This is a request-time failure, not a startup failure, so the SMTP variables stay optional in `env.ts`.
- **Route gating**: unauthenticated → `/login` with a return-to path; pending → `/awaiting-approval`; rejected → `/rejected`; active users on `/login` are redirected home. Unknown paths show an in-shell "Page not found" (guests go to `/login?next=` first); only `/` and `/app` redirect to the dashboard.
- ~~**Known gap:** a non-401 error from `/auth/me` (for example the API being down) is treated as logged out by the guards.~~ Since P1.23 it shows an error page with "Try again" instead.

#### Part B acceptance (subset of the Phase 1 checklist below)
Register → pending, unverified, link arrives in the console/inbox and sets `emailVerified` · duplicate register → explicit error · password login works · pending user sees only Awaiting Approval · rejected user is blocked · access token silently refreshes, logout clears both cookies · forgot-password is identical for known and unknown emails · seeded accounts can log in. Also run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the Playwright smoke tests.

---

### Part C — Telegram ✅

Deps: Part B (the email service and the verify-email route are extended here). A real bot exists (`@inventory_app_claude_bot`, token in the gitignored `server/.env`). Telegram allows **one polling consumer per token**; see P6.9.

#### Decisions made for Part C (grilling session; the PRD is otherwise unchanged)

#### Part C revision (2026-10-10, second pass): one Telegram flow for sign in and sign up
The user asked for both sign up and sign in to support Email **and** Telegram, with Telegram verified by a one-time code from the bot. This **replaces** the QR-login (`TelegramLogin`, `pollToken`) and the in-bot name + email dialogue described in the bullets below; bullets that mention them are kept for history and marked *(superseded)*.
- **Flow (same on Sign in and Sign up):** Telegram tab shows QR + "Open Telegram" -> bot `/start <nonce>` sends a 6-digit code in the chat -> the website switches to the code step (`docs/design/enter-otp.png`) -> on a correct code: a Telegram account that is already linked signs in; an unlinked one gets the **details step** (Username prefilled from the Telegram name, Email) and, on submit, an account is created and signed in.
- **Model `AuthSession`** (PRD §4): `sessionIdHash`, `nonceHash` (both unique, sha256), `purpose` (`LOGIN`|`SIGNUP`, set at verification), `status` (`PENDING -> AWAITING_OTP -> AWAITING_PROFILE -> COMPLETED`, plus `EXPIRED`/`LOCKED`), `user`, `attempts`, `resends`, `completeAttempts`, `expiresAt` (5 min, TTL index), `lastSentAt`, `otpExpiresAt` (+2 min), `otpHash`, `prefillDisplayName`, `telegramId` (Number, indexed), `telegramUsername`. No collection existed before, so nothing had to be matched. `AWAITING_PROFILE` is an addition to the requested status list: it is the state between "code verified" and "details submitted".
- **Secrets:** the raw session id lives only in an httpOnly, `secure`, `sameSite=lax` cookie `tg_auth_session` (path `/api/auth/telegram`); the nonce only in the deep link. Both are `randomToken(24)` and stored as sha256. The OTP is `randomOtp()` (`crypto.randomInt`) and stored as an **HMAC** (key `JWT_ACCESS_SECRET`, bound to `sessionIdHash`), because a plain sha256 of a 6-digit code is trivially brute-forceable from a leaked row. Comparison is `safeEqual` (constant time). All of this lives in `utils/crypto.ts`.
- **Routes:** `POST /telegram/start`, `GET /telegram/status`, `POST /telegram/verify {code}`, `POST /telegram/resend`, `POST /telegram/complete {name, email}`. Dead, expired, locked or completed sessions are rejected by every route and by the bot. `GET status` answers `EXPIRED` for an unknown cookie.
- **Limits:** 5 wrong codes -> `LOCKED` ("Start over"); resend cooldown 60 s from `lastSentAt`, max 3 resends, each resend resets `attempts`; the details form is capped at 5 submissions (`completeAttempts`). Verified or resent codes are claimed atomically (`findOneAndUpdate` on the hash / `lastSentAt`), so parallel requests cannot reuse a code or double-send. A nonce is claimed only while the session is `PENDING`, so a second `/start` never overwrites `telegramId`.
- **After the code is verified** the session lifetime is extended to 10 min so the details form can be filled in without the 5-minute QR timer.
- **Existing email at the details step:** same PRD rule as before: no second account; a `link-telegram` confirm link is emailed, the response is `outcome: 'link-sent'` and **nobody is signed in** until the owner clicks the link. New email: pending, unverified, passwordless staff user + verify-email link, signed in (client routes them to Awaiting approval).
- **`completeAttempts`** (it did not exist in code): counts submissions of the details form; 5 submissions lock the session. A failed submission (email could not be sent, nothing created) puts the session back to `AWAITING_PROFILE`.
- **Rejected users** never get a session through this flow either (403 `ACCOUNT_REJECTED` at verify).
- **Bot:** `/start <nonce>` only; `/start` without a payload and any other text get "open the website and choose Telegram". Private chats only. The reply with the code is the only place a code is sent besides `resend`, which uses `sendTelegramMessage`. With no bot configured (dev/test) resent codes are printed to the server console; in production the routes answer 503 `TELEGRAM_UNAVAILABLE`.
- **Rate limits** (per IP, 15 min, 429 `RATE_LIMITED`): start 10, status 600 (polled every 2 s), verify 30, resend 10, complete 10.
- **Client:** `TelegramAuthPanel` (QR, code and details steps) + `useTelegramAuth` + `OtpInput` replace `TelegramQrPanel` / `useTelegramQrLogin`. The page stops polling once the status is `AWAITING_OTP`, on expiry and on unmount. `VITE_TELEGRAM_BOT_USERNAME` is no longer used (the server builds the deep link from `TELEGRAM_BOT_USERNAME`).
- **Removed:** `models/TelegramLogin`, `services/{telegramLogin,telegramConversation}` (+ tests), `POST /telegram/login[/poll]`, `telegramLoginPollSchema`.
- **New secrets helper:** `npm run generate-secrets` prints `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TELEGRAM_WEBHOOK_SECRET` using `randomToken`.
- **Open risks / follow-ups:** (1) Telegram-created accounts are `pending` like every signup; if instead they should be active immediately the PRD's approval model must change (not done). (2) Anyone who starts the flow with a victim's email can only create a pending, unverified account (same as password signup), but the code step means they must also hold the Telegram account. (3) Tests for the new flow are **not written yet** (user asked to skip tests for now); the old QR-login tests were removed with the code they covered.

- **Scope:** all of Part C ships in one part: signup (new email and existing-email merge), the `link-telegram` branch, and Telegram sign in. *(Sign in and the bot-side signup were reworked, see the revision below.)*
- **No public `signup-webhook` HTTP route (PRD deviation, resolves Open Question #9).** The bot runs in the server process and calls a `signupWithTelegram()` service function directly, so there is no unauthenticated "create a user and email any address" endpoint. `TELEGRAM_WEBHOOK_SECRET` is used only as Telegram's `secret_token` for webhook mode.
- *(superseded in part: see revision)* **Bot unconfigured** (token missing or a `your-…` placeholder), non-production: the bot does not start (nothing can approve a QR login from Telegram; tests call `approveTelegramLogin` directly). Production without a token: the QR login routes answer 503 `TELEGRAM_UNAVAILABLE`, checked before any DB access. *(Originally: OTP codes printed to the console.)*
- **Modes:** `TELEGRAM_MODE=polling` (default, prod) or `webhook`. Webhook mode serves Telegram updates at `POST /api/telegram/webhook` (grammY `webhookCallback`, `secret_token` checked) and calls `setWebhook(PUBLIC_URL + path)` on boot. `PUBLIC_URL` and a non-placeholder `TELEGRAM_WEBHOOK_SECRET` are required only in webhook mode. Only polling is tested locally.
- *(superseded: the bot only handles `/start <nonce>` now)* **Bot commands:** `/start` (also with the `signup` deep-link payload) and `/cancel` only. `/start` asks for the name, then the email, both validated with the shared `registerSchema` field rules (invalid → re-ask). Other text gets "Send /start to sign up." Private chats only. Conversation state is in memory with a ~10 min timeout. The conversation is a pure `handleMessage(chatId, text)` state machine so it is testable without grammY.
- *(still valid; now reached from the details step instead of the bot dialogue)* **Signup outcomes (reply wording is generic about the account):**
  1. New email → create pending, unverified, staff user with `telegramChatId` and no password, send the verify-email link. If the mail cannot go out, delete the user and token and tell the user to try later (same rule as `/register`).
  2. Email already registered → reveal it (PRD), discard older pending `link-telegram` tokens for that user, create a new one carrying the chatId, email the confirm link.
  3. This chat is already linked to an account → create nothing; reply "this Telegram is already linked, log in with a code".
- **Link click** (`GET /api/auth/verify-email/:token`, `link-telegram` branch): attaches the chatId **only** (no `emailVerified` change, per PRD). If the account already has a different chatId it is **replaced**. If the chatId has meanwhile been linked to another account → `INVALID_TOKEN`, nothing linked. `link-telegram` token TTL 24 h. The response carries the token type so the landing page can say "Telegram linked".
- *(superseded by the revision)* **QR login start/poll** (replaced the original OTP request/verify, see implementation notes): start returns a deep link and a poll token; poll answers `pending | unlinked | expired`, or `approved` with the session. An approved attempt is handed out once. Pending and unverified users can log in (session, routed by `/me`); a `rejected` user gets 403 `ACCOUNT_REJECTED` at poll time.
- *(superseded)* **Bot side:** `/start login_<token>` approves the attempt for the account linked to the chat; an unlinked chat is told to sign up and the browser sees `unlinked`; an expired or replayed code is told to press Start over.
- *(superseded: see revision)* **Rate limits** (per IP, 15 min, 429 `RATE_LIMITED`): `telegram/login` 10, `telegram/login/poll` 600 (polled every 2 s). The single-use, 5-minute token is the main control.
- *(superseded: no client bot handle any more)* **Client bot handle** comes from `VITE_TELEGRAM_BOT_USERNAME` (also in `client/.env.example`); the deep link is `https://t.me/<handle>?start=signup`.
- **Out of Part C (follow-ups):** Telegram notifications when an admin activates/rejects a user (not in the PRD; add after Part D); connecting Telegram from a profile page (no profile page exists).
- **Accepted risk:** anyone can Telegram-signup with another person's email, leaving a pending, unverified account whose chat can sign in with its code. Identical to the password signup path (PRD §3), so no extra mitigation.

#### Server
- [x] **P0.2 (finish) [S · C] Env**: add to `config/env.ts`: `TELEGRAM_BOT_TOKEN` (optional; placeholder detection like email), `TELEGRAM_BOT_USERNAME` (`^[A-Za-z0-9_]{5,32}$`), `TELEGRAM_MODE` (`polling|webhook`, default `polling`), `TELEGRAM_WEBHOOK_SECRET`, `PUBLIC_URL`; the last two required only when mode is `webhook`. Fix `.env.example` (`PUBLIC_URL` was the wrong port; document that it is the public HTTPS origin, webhook mode only).
- [x] **P1.5 [S · C] ~~`services/otp`~~ → ~~`services/telegramLogin`~~ → `services/telegramAuth` + `models/AuthSession`**: `createAuthSession`, `startFromBot` (called by the bot), `getAuthSessionStatus`, `verifyOtp`, `resendOtp`, `completeTelegramSignup`; hashes only, 5-attempt lock, resend cooldown/cap. Deps: P1.2.
- [x] **P1.6 [S · C] `services/telegram`**: grammY bot, polling/webhook per `TELEGRAM_MODE`, the `/start <nonce>` handler that sends the code, `sendTelegramMessage()` for resent codes, `telegramDeepLink()`, `assertTelegramAvailable()`. Started from `index.ts` (not from `createApp()`, so tests never start a bot). Deps: P1.4, P1.5.
- [x] **P1.9 [S · C] `services/telegramSignup` — `signupWithTelegram({ chatId, name, email })`**: the three outcomes above; extends `createEmailToken` with an optional `telegramChatId` and the `link-telegram` TTL; adds a link-telegram email template to `services/email`. (Replaces the HTTP route; see decisions. Now called from `completeTelegramSignup` and returns `{ outcome, user? }`.) Deps: P1.6, P1.8.
- [x] **P1.12 [S · C] `POST /api/auth/telegram/{start,verify,resend,complete}` and `GET /telegram/status`**: see the Part C revision. `verify` and `complete` issue the session with `issueSession` and return `{ status: 'COMPLETED', user }`. Deps: P1.5, P1.6, P1.3.
- [x] **P1.10 (extension) [S · C]** `link-telegram` branch in verify-email (`consumeEmailToken(raw, ['verify-email', 'link-telegram'])`, switch on type).
- [x] **P1.17 (extension) [S · C]** `telegramStartLimiter` (10), `telegramStatusLimiter` (600; the browser polls every 2 s), `telegramVerifyLimiter` (30), `telegramResendLimiter` (10), `telegramCompleteLimiter` (10) in `middleware/rateLimit.ts`.

#### Client
- [x] **P1.19 (extension) [C · C]** Sign in page rebuilt to `docs/design/signin-email.png` / `signin-telegram.png`: `Email | Telegram` tabs, password eye toggle, "Forgot password?" next to the label, "Don't have an account? Sign up". The Telegram tab runs the Telegram flow (QR -> code -> details only for a new Telegram account, see Part C revision; `TelegramAuthPanel`, `useTelegramAuth`, `OtpInput`).
- [x] **P1.19 (extension) [C · C]** Sign up page rebuilt to `docs/design/signup-email.png`: `Email | Telegram` tabs, Name / Email / Password / Confirm password (`registerFormSchema` in `@inventory/shared`), "Already have an account? Sign in". The Telegram tab runs the same flow as Sign in (no static `?start=signup` link any more). The separate `/signup/telegram` page was removed. The verify-email landing page handles the `link-telegram` response.

#### Part C: implementation notes
- *(partly removed: the QR-login and conversation tests went away with their code; new-flow tests are still to be written)* **Tests added:** `services/{telegramLogin,telegramSignup,telegramConversation}.test.ts`, `routes/telegram.test.ts` (QR login routes + link-telegram), plus the Sign in / Sign up / QR smoke tests in `tests/smoke.spec.ts`. `vitest.config.ts` pins `TELEGRAM_BOT_TOKEN` to a placeholder so a real token in `server/.env` never reaches tests.
- **Smoke tests repaired:** three existing assertions were stale since the login redesign / Tailwind 4 (`Log in` h2, `Inventory Manager` h1 30px, `rgb(255,255,255)`); they now match the current UI.
- **Verify-email responses carry `type`** (`verify-email` | `link-telegram`); the client landing page branches on it.
- *(superseded by the one-time-code revision: Telegram sign in and sign up are one flow with a code entered on the website)* **QR login replaces OTP (decided 2026-10-10 after the user supplied `docs/design/signin-telegram.png`).** The email -> 6-digit code flow, `services/otp`, the `OtpCode` model, `/auth/otp/*` and the earlier `/signup/telegram` page were removed; the PRD (§3, §4, §6.6, §7) was updated. `TelegramLogin` documents carry two hashed secrets (`startHash` in the QR code, `pollHash` in the browser) and expire after 5 minutes via a TTL index.
- **Password rule (revised on branch `email-auth`): at least 10 characters, with a letter and a digit, at most 72 bytes** (bcrypt ignores the rest), matching `docs/design/signup-email.png`. Applies to register and reset only; login accepts any non-empty password so the seeded accounts still work. This supersedes the earlier "min 8" decision. The Sign up form also has the Confirm password field and the show/hide toggle.
- **QR login risk to keep in mind:** like every QR login, it can be phished (an attacker shows their QR code and tricks the owner into pressing Start). Pressing Start is the only approval step, as the design specifies; an explicit Approve/Deny button in the bot would be the mitigation if wanted.
- **Dependency added:** `qrcode.react` (client).
- **Webhook mode is untested locally** (only polling is). Boot with a placeholder token prints the dev fallback and keeps the server up.
- **Manual check still to run** with the real bot (polling): new-email signup, existing-email merge, repeat `/start`, QR login of a linked account (scan, Start, browser signs in), QR login from an unlinked chat, expired QR code and Start over. Only one polling consumer per token: stop other dev servers first.

#### Tests
- *(to write for the new flow: nonce single use + expiry, wrong code x5 -> LOCKED, resend cooldown/cap, expired code, details step outcomes, rejected user)* Vitest (Mongo test DB), old list: QR login service (single use, expiry, start token cannot be polled, replayed Start); `signupWithTelegram` outcomes 1–3; link-telegram consume incl. replace and chat-already-linked-elsewhere; the conversation state machine incl. the `login_` payload; QR login route rules (pending/approved/unlinked/expired, rejected, 503 in production without a token).
- Playwright smoke (updated to the new flow, stubbed API, not run yet): Sign in page (tabs, eye toggle), Telegram QR flow with a stubbed API (QR, countdown, polling, unlinked, Start over), Sign up page (confirm password, Telegram tab).

#### Part C acceptance
Telegram signup with a new email → pending user + verification email · with an existing email → no duplicate, confirm email, click links the chatId · repeat `/start` from a linked chat creates nothing · QR login works once linked; single use, 5-min expiry, Start over gives a fresh code · an unlinked chat never gets a session · pending user logs in by QR and sees only Awaiting Approval · rejected user is blocked · `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass.

---

### Part D — Admin user management

Deps: Parts B (login and the auth context) and A (`requireRole`).

- [x] **P1.15 [S · D] Admin users API** (`routes/users.test.ts`): `GET /api/users?status=&page=&limit=`, `PATCH /:id/activate` (400 `EMAIL_NOT_VERIFIED`; pending only, else 409 `NOT_PENDING`), `PATCH /:id/reject` (pending **or active** -> rejected, i.e. revoke; calls `revokeAllUserTokens`; 409 `NOT_ACTIVE_OR_PENDING` if already rejected; 409 `CANNOT_REVOKE_SELF`), `PATCH /:id/reactivate` (rejected -> active; 409 `NOT_REJECTED`, 400 `EMAIL_NOT_VERIFIED` for a rejected user who never verified). Guard: `requireAuth` -> `requireActive` -> `requireRole('admin')`. A revoked user loses access on the next request because `requireAuth` re-reads the status; their refresh tokens are revoked so the session cannot be renewed.
- [x] **P1.20 [C · D] Admin Users page** (admin-only route, `tests/users.spec.ts`): Pending / Active / Rejected tabs. Pending: Activate (disabled + tooltip when `!emailVerified`) / Reject with confirm. Active: Revoke with confirm (not offered on your own row). Rejected: Reactivate (disabled + tooltip when unverified). Pagination per tab; admin nav hidden for staff.
- [x] **P1.23 [C] Route guards** (`tests/route-guards.spec.ts`), not in the PRD; the decisions came out of a design session. The component guards (`guards.tsx`) are replaced by React Router middleware on the layout routes, so redirects happen before render with no flash of the wrong screen. A guest on an app route goes to `/login?next=<page>`. `next` is honoured only for a user with no **Gate** and only as a same-origin path that is not a guest page or gate screen. A signed-in user on a guest page goes to `resolveLandingRoute`, and a gated user anywhere in the app goes to their gate screen. Staff on an admin route see "You don't have access to this page" inside the shell with the URL kept, and any unknown URL shows "Page not found" inside the shell (never a redirect to the dashboard). The server's `requireRole` stays the real boundary. `me` is read cache-first (`ensureQueryData` with `revalidateIfStale`). Sign in/out, Telegram sign-in and a cleared gate re-run the guards through `router.revalidate()`. Sign out goes to a plain `/login`, so the next person is not sent into the previous user's page. A refresh failing on any call other than `/auth/me` marks the browser a guest (`setOnSessionEnded`). There was no `/login` reload loop to fix: `fetchMe` already maps a failed refresh to a guest, and an e2e test pins that.
- [ ] **P1.24 [S+C · D] Guard chain + admin user management v2** (see `CONTRACT-CHANGES.md` C11). **Server done, client not started; leave unchecked until the client lands.**
  - *Server (done):* one guard per file with specific codes (`EMAIL_UNVERIFIED`, `ACCOUNT_PENDING`, `ACCOUNT_REJECTED`, `PASSWORD_CHANGE_REQUIRED`, `FORBIDDEN`) composed in `middleware/guards.ts` (the admin routes now use `can(USERS_MANAGE)`, see P1.25); `PATCH /api/users/:id`, temp password, manual verify, admin resend, Telegram unlink, list filters (role/verified/search, pending first); `POST /api/auth/password`; rules in `services/userAdmin.ts`. Tests: `routes/accessMatrix.test.ts` (every guarded route × anonymous/unverified/pending/rejected/staff/admin) and `routes/usersAdmin.test.ts` (one test per rule).
  - *Client (to do):* route on the new gate codes and on `mustChangePassword` (a change-password screen), move the Users page to `PATCH /users/:id` and add the new actions/filters, then drop the legacy activate/reject/reactivate routes and settle `CANNOT_MODIFY_SELF` / `LAST_ADMIN`.
- [x] **P1.25 [X · D] RBAC foundation** (`CONTRACT-CHANGES.md` C12): `PERMISSIONS`, `ROLE_PERMISSIONS`, `hasPermission` in `shared/constants/permissions.ts` (fixed in code; `ROLE_HIERARCHY` removed). Server: `requirePermission` replaces `requireRole`, `can(...)` replaces `adminOnly`/`withRole`; `server/src/permissions.test.ts` pins the PRD §2 table. Client: `useCan`, `<Can>`, route `requirePermission` (replaces `requireRole`), nav items filtered by permission.
- [x] **P1.29 [S+C · D] Users list: sort, filters, search, pending badge, mobile cards** (planned 2026-10-17 from a Q&A session; write contract entry C16 in `CONTRACT-CHANGES.md` when building). Deps: P1.15, P1.20, P2.4 (the catalog list pattern). **Not in scope:** row-action dropdown (the inline buttons stay), Telegram bot notify on approve/reject, required reject reason, the temp-password / verify-manually confirmations, glossary/ADR. The list response keeps its current `{ items, page, limit, total, totalPages }` shape (already the catalog shape).
  - *Decisions:*
    - **Layout kept.** The table and the Pending / Active / Rejected tabs stay as they are; the tab is the `status` filter and Pending stays the default tab. Actions remain inline buttons (no dropdown).
    - **Ordering.** `pendingRank` is dropped (every list is already status-filtered by its tab). Default is newest first. Sort presets in one "Sort by" select (as in `CatalogToolbar`): **Newest** (default), **Oldest**, **Name A→Z**, **Name Z→A**, **Recently active** (`lastLoginAt` desc, never-signed-in last). Ties by `_id`; name sorts case-insensitive (collation).
    - **Filters.** Search (name or email, debounced 300 ms), role (All / Admin / Staff), email status (All / Verified / Not verified), in a toolbar above the table.
    - **URL state.** `?status=&search=&role=&verified=&sort=&order=&page=`, with defaults left out, so a refresh or shared link reproduces the view. A filter, sort or tab change resets the page to 1. Filters persist across tabs. "Clear filters" appears while any filter is set. Empty state with filters: "No users match these filters"; the per-tab empty text stays for the no-filter case.
    - **Page size 20** (`USERS_PAGE_SIZE_DEFAULT` 10 → 20).
    - **`lastLoginAt`** (new, nullable on `User`): stamped when `issueSession` starts a new session family (password sign-in, Telegram sign-in, the sessions issued after a password reset/change), **not** on refresh rotation. Exposed on `AdminUser`, shown as "Last sign-in" ("Never" when null).
    - **Pending badge.** `usePendingCount()` = `GET /users?status=pending&limit=1` reading only `total`, key `['users', 'pending-count']` (under `usersKeys.all`, so every user mutation invalidates it). It refetches every 60 s and on window focus, and is enabled only with `USERS_MANAGE`. The count shows as a badge on the **Users** sidebar link (sidebar and mobile drawer) and on the **Pending** tab; nothing at 0. No toast.
    - **Pending list follows the badge (#26, decided 2026-10-17).** The list itself does not poll. When a pending-count fetch returns a different `total` than the cached one, it invalidates the cached pending lists (`usersKeys.lists()` with `status: pending`), skipping lists fetched since the count started. A list fetch still in flight is restarted, because it may have begun before the change. There is one poll, and an unchanged count costs no list request. Known limitation: if one account leaves Pending and another arrives between two polls, the total is unchanged and the list waits for its own staleness or a mutation. Rejected options: polling the list as well (two polls can disagree for a moment), and accepting the mismatch. Test: `tests/users.spec.ts` "a rise on focus also refreshes the Pending list".
    - **Mobile.** Below `sm`, one card per account (name, email, email-status badge, role, signed up, last sign-in, the same action buttons). From `sm` up, the existing table plus Role and Last sign-in columns. One component tree with two presentations, like the catalog grid.
  - *Server / shared:*
    - `shared/schemas/users.ts`: `USER_SORTS = ['createdAt', 'name', 'lastLoginAt']`. `listUsersQuerySchema` gains `sort` (default `createdAt`) and optional `order`. `defaultUserSortOrder`: name → asc, else desc. Reuse `SORT_ORDERS` from `schemas/catalog.ts` (moved to `schemas/sort.ts` and merged into `defaultSortOrder` in P6.11). **Done (#22, `lastLoginAt` in #23).**
    - `shared/types/users.ts`: `AdminUser.lastLoginAt: string | null`. **Done (#23).**
    - `models/User.ts`: `lastLoginAt: Date | null`, index `{ lastLoginAt: -1, _id: -1 }`. **Done (#23).**
    - `services/jwt.ts`: `issueSession` sets `lastLoginAt` when no family is passed. **Done (#23).** (Password reset issues no session today, so only sign-ins and the password change stamp it.)
    - `services/userAdmin.ts` `listUsers`: replace the `pendingRank` stage with the requested sort (a has-login rank keeps nulls last for `lastLoginAt`, name collation, `_id` tie-break); `toAdminUser` maps `lastLoginAt`. **Done (#22; `lastLoginAt` in #23).**
    - Seed: active seeded users get a `lastLoginAt`; pending users stay null. **Done (#23):** relative to seeding time (`lastLoginHoursAgo` in `shared/seed-data/users.ts`); the rejected user stays null too.
    - Tests (`routes/usersAdmin.test.ts`): each sort including nulls-last, the default order, page size 20, `lastLoginAt` set on sign-in and unchanged by a refresh. **Done (#22) for createdAt / name sorts both ways, case-insensitive names, `_id` tie-break paging, default newest first, page size 20, 400 on unknown sort/order, filters + sort. #23: `lastLoginAt` set by password and Telegram sign-in and by a password change, unchanged by a refresh, in the list response; `sort=lastLoginAt` both ways with never-signed-in last and `_id` tie-break paging (Telegram case in `telegramAuth.flow.test.ts`).**
  - *Client:*
    - `features/users/hooks/useUserListParams.ts` (new): URL-backed list state built like `features/catalog/hooks/useCatalogSearchParams.ts` (same `pick` / `update` / default-omission logic) with its own `USER_SORT_PRESETS`. It is a separate hook; the catalog one is not generalised. **Done (#22).**
    - Shared pieces: the debounced search box moves out of `features/catalog/components/CatalogToolbar.tsx` into `components/SearchInput.tsx`, and `features/catalog/components/Pager.tsx` moves to `components/Pager.tsx`. Each is used by 2 features once the Users page lands; catalog behaviour is unchanged, except that `SearchInput` fixes Back→Forward across a search (the box stayed empty and the debounce wiped `search` from the URL; regression test `tests/search-input.spec.ts`). **Done (#21).**
    - `features/users/components/UsersToolbar.tsx` (new): `SearchInput`, role select, email-status select, Sort by, Clear filters. **Done (#22).**
    - `features/users/hooks/useUsers.ts`: `UsersListParams` gains the filter/sort fields (the query key already holds the whole params object). Add `usePendingCount()`. **Params done (#22); `usePendingCount()` done (#24): `staleTime: 0` so focus and mounts refetch despite the app-wide 5 min `staleTime` and `refetchOnWindowFocus: false`; `select` reads `total`.**
    - `features/users/pages/Users.tsx`: `useUserListParams` replaces the `useState` status/page. Add the toolbar and the Pending-tab badge, and use the shared `Pager` instead of the hand-rolled Prev/Next. The existing buttons and tooltips are extracted into `UserActions`, used by the table row and by a new `UserCard` (`sm:hidden`; the table `hidden sm:block`). The page still steps back after the last row on a page is handled, now via `setPage(page - 1, { replace: true })`. **Done (#22): URL state, toolbar, Role column, shared `Pager`, "No users match these filters.", step-back, and a page past the end goes to the last page. Done (#23): Last sign-in column ("Never" when null) and the Recently active preset. Done (#24): Pending-tab badge (`features/users/components/PendingCountBadge.tsx`, shared with the nav; visible number plus sr-only "awaiting approval"). Done (#25): `UserActions` (the page passes one `UserActionHandlers` object to every row and card; a `fullWidth` card variant) and `UserCard` (an `article` named by the user, its actions in an equal-column grid), plus `EmailStatusBadge` shared by both; `formatDate` moved from `features/catalog/format.ts` to `lib/format.ts` (used by both features). Pattern documented in `docs/DESIGN.md` (Table with phone cards).**
    - `app/layouts/AppNav.tsx`: the Users item shows the pending-count badge. **Done (#24):** a `NavItem.badge` component, rendered in both the sidebar and the drawer.
    - Tests (`tests/users.spec.ts`): filters, search and sorts appear in the URL and survive a reload; the badge rises after a new registration and drops after Activate (**done #24**, stubbed: totals on link, tab and drawer, rise on focus and on the 60 s poll via `page.clock`, drop after Activate and Reject, nothing at 0, no `/users` request for staff; specs whose admin pages don't otherwise stub `/api/users` now stub the count, since its 401 against a running server would end the stubbed session); at mobile viewport, cards and no table (**done #25**: 375 px cards with no table and no horizontal scroll, Activate and Reject-with-confirm from a card, the disabled-Activate tooltip on focus; at 1280 px the table and no cards). `tests/categories-suppliers.spec.ts` still passes after the extraction.
  - *Acceptance:*
    - [x] Every filter, sort and search narrows or orders the list; a refresh or shared link reproduces the view. (#22: `routes/usersAdmin.test.ts` + `tests/users.spec.ts`; Recently active comes with `lastLoginAt`.)
    - [x] Recently active puts never-signed-in users last. (#23: `routes/usersAdmin.test.ts` + `tests/users.spec.ts`.)
    - [x] A new sign-up raises the Pending badge (sidebar + tab) within 60 s or on focus, without a reload; Activate / Reject lowers it right away. (#24: `tests/users.spec.ts`, stubbed API.)
    - [x] At 375 px the page shows cards with working actions and no horizontal scroll; the table shows from `sm` up. (#25: `tests/users.spec.ts`, stubbed API.)
    - [x] `npm run typecheck`, `lint`, `test`, `build` pass; users and catalog e2e pass. (#25: full chromium e2e run, 86 passed.)
- [ ] Run the full acceptance checklist below, then mark Phase 1 done.

### Part E — Profile & sessions ✅

Not in the original PRD; designed in a grilling session (2026-10-15) from `docs/design/{profile,set-password-to-profile,password-and-telegram-linked}.png`, then added to the PRD (§3 Sessions, §4, §6.7, §7), `CONTEXT.md` (**Session**, **Sign out everywhere**, **Sign-in method**) and `CONTRACT-CHANGES.md` C13. Decisions:
- Every new self-service route is `authenticated` (gated users never reach the Profile page; a temporary-password user uses `POST /auth/password`). Mutations answer `{ user }`; `AuthUser` gained `hasPassword`, `telegramLinked`, `telegramUsername`.
- An account always keeps one sign-in method. Removing one is a single conditional update (self password, self unlink, admin unlink), so parallel removals cannot strip both: 409 `LAST_SIGN_IN_METHOD`. No re-authentication for removing the password (forgot-password is the way back); adding or removing a method keeps other sessions.
- Linking Telegram reuses the sign-in flow: `POST /auth/telegram/link` starts an `AuthSession` with purpose `LINK` bound to the caller; `/status`, `/resend`, `/verify` are shared. Verify checks the caller's access cookie before the code (401 lets the client refresh and retry without spending it; another user: 403, attempt ends), links atomically (409 `TELEGRAM_IN_USE`) and issues no new session. The bot's code text says it is for linking.
- A Session is a refresh-token family (`familyId` kept across rotation; `userAgent`, `ip`, `lastUsedAt`). Device names come from a small parser in `services/deviceSessions.ts` (no new dependency). Sign out everywhere includes this browser.
- `User.sessionsValidAfter` + an ms issue time in the access token (`ts`) end other browsers at once on sign out everywhere, password change / reset, temporary password and refresh-token reuse (`endAllSessions`). **Not** on admin reject (`revokeAllUserTokens` only), so a rejected user still reaches the rejected screen; the status check already blocks data.
- `telegramUsername` is stored at link and signup and refreshed on each Telegram sign in (only when it changed).

- [x] **P1.26 [X · E] Contract + shared** (C13): `updateProfileSchema`, `setPasswordSchema`, `deviceSessionSchema` / `DeviceSession`, `sessionsResponseSchema`; `AuthUser` + three fields.
- [x] **P1.27 [S · E] Server**: `PATCH /auth/me`, `POST /auth/password/set`, `DELETE /auth/password`, `DELETE /auth/telegram`, `POST /auth/telegram/link` (+ LINK branch of verify), `GET`/`DELETE /auth/sessions`; admin unlink refuses the last method. `services/{signInMethods,deviceSessions}.ts`, `services/jwt.ts` (`issueSession(req, res, user, family?)`, `endAllSessions`), `userFromAccessCookie` in `middleware/requireAuth.ts`. Tests: `routes/{profile,sessions,telegramLink}.test.ts` and the access matrix rows.
- [x] **P1.28 [C · E] Client**: `features/profile` (Profile page at `/app/profile`: Account, Sign-in methods, Active sessions cards; link dialog; `ConfirmButton` on shadcn `AlertDialog`). The Telegram QR and code steps moved to `features/auth/components/TelegramSteps.tsx`, shared by sign in / sign up and the link dialog; `useTelegramAuth({ start, onCompleted })`. Pattern documented in `docs/DESIGN.md`. Tests: `tests/profile.spec.ts`.
- [ ] Live check with the real bot: `docs/live-check.md` P1–P5 (user).

---

### Acceptance (from `01-identity-auth.md`, tagged by the part that makes it testable)
- [x] **B** Register new email → pending, unverified; verification link arrives (or is logged in dev) and sets `emailVerified`.
- [x] **B** Register same email again → explicit duplicate error.
- [x] **C** Telegram signup, new email → pending user + verification email. *(automated; live bot pending)*
- [x] **C** Telegram signup, existing email → no duplicate; confirm email; click links the chatId to the existing account. *(automated; live bot pending)*
- [x] **B / C** Login works by password (B) and by Telegram one-time code (C) once active.
- [x] **C** Telegram code flow: nonce single use, 5-min expiry, 5 wrong codes lock, resend 60 s / max 3, Start over gives a fresh QR code. *(implemented; not yet verified by tests or against the live bot)*
- [x] **B** Pending user can log in but sees only Awaiting Approval.
- [x] **D** Admin cannot activate an unverified user. *(server 400 + disabled button with tooltip)*
- [ ] **B / D** Rejected user is blocked (B); admin can reactivate (D).
- [x] **B** Access token expires and silently refreshes; logout clears both cookies.
- [x] **B** Forgot-password response identical whether or not the email exists.
- [x] **B** Seeded users can log in (`admin@inventory.local` / `Admin@123`, `john.staff@inventory.local` / `Staff@123`).

---

## Phase 2 — Categories & Suppliers

Source: `docs/PRDs/02-categories-suppliers.md`. Deps: **P1** (auth + role guard).

### Server
#### Decisions (grilling session 2026-10-16; contract in `CONTRACT-CHANGES.md` C14)
- **One pattern for both** (`server/src/services/catalog.ts`, `routes/catalogRouter.ts`): `GET` `can(INVENTORY_VIEW)`; `POST` and **`PATCH /:id`** (replaces PUT; absent = unchanged, `null` clears an optional field, title/name never cleared) `can(CATEGORIES_WRITE)` / `can(SUPPLIERS_WRITE)` (staff + admin); `DELETE /:id` `can(CATEGORIES_DELETE)` / `can(SUPPLIERS_DELETE)` (admin). *Changed after the first commit: the user let staff create and edit (C15); originally one admin-only `*_MANAGE`.*
- **List:** `?search=&page=&limit=&sort=&order=`, limit 1–100 (default 12), `sort` = `name|createdAt|productCount` (default **createdAt desc, newest first**; name defaults to asc, productCount to desc; ties by name). Search is an escaped, case-insensitive substring: categories title + description, suppliers name + contact person + email. Response `{ items, page, limit, total, totalPages }` (`Paginated` / `PageMeta`, like users).
- **productCount** on list items only, archived products included (so "0 products" = deletable). **Delete:** 409 `CATEGORY_IN_USE` / `SUPPLIER_IN_USE` with `details: { productCount, archivedCount }` while any product, archived included, uses the record. Both read the Product model (`services/productRefs.ts`; swapped from the raw `products` collection in #29), archived meaning `archivedAt` is set.
- **Uniqueness:** `titleKey` / `nameKey` (trim, collapse spaces, lowercase) with a unique index, set in a pre-validate hook, never sent; 409 `DUPLICATE_CATEGORY` / `DUPLICATE_SUPPLIER`. Unknown/malformed id: 404.
- **Seed:** categories and suppliers are **upserted by key, not wiped** (exception to "reset"), so ids survive a re-seed and hand-made records stay.
- **Client:** card grid with Edit / Delete icon buttons on each card (Delete admin only), 12 a page, Prev/Next "Page N of M"; `?search=&page=&sort=&order=` in the URL (debounced search resets the page; a page past the end is replaced by the last); one "Sort by" select (Newest (default), Oldest, Name A→Z / Z→A, Most products). `CategoryFormDialog` / `SupplierFormDialog` create + edit with `onSaved`, for reuse by the P3 product form (its "+ New" options behind `<Can permission={CATEGORIES_WRITE}>`, so staff get them too); product selects call the list with `limit=100&sort=name`. Delete: confirm → DELETE → on 409 the same dialog says "Used by N products (M archived)" with a link to `/app/products?category=<id>` (`&status=archived` when all are archived), plus the error toast.

- [x] **P2.1 [S] `Category` model** (`title`, `description`, timestamps, `titleKey`) and **`Supplier` model** (`name`, `contactPerson`, `phone`, `email`, `address`, `notes`, timestamps, `nameKey`). Zod schemas in `shared/schemas/{catalog,categories,suppliers}.ts`, types in `shared/types/catalog.ts`.
- [x] **P2.2 [S] Category routes** `GET/POST/PATCH/DELETE /api/categories` (see decisions). Categories cannot be archived. Tests: `routes/catalog.test.ts`, access-matrix rows.
- [x] **P2.3 [S] Supplier routes**: same pattern, same 409 rule, `productCount`.

### Client
- [x] **P2.4 [C] Categories page** (`features/categories`): card grid (title, description, created date, product count), `CategoryFormDialog`, delete dialog with the 409 reason, controls hidden for staff, skeleton/empty/error states. Shared pieces in `features/catalog` (URL state, toolbar, pager, card, delete dialog, `createCatalogHooks`).
- [x] **P2.5 [C] Suppliers page** (`features/suppliers`): same pattern; email as `mailto:`, phone as `tel:`.
- [x] **P2.6 [C] Query hooks** `useCategories` / `useSuppliers` (+ create/update/delete with toasts and invalidation of the whole resource). Tests: `tests/categories-suppliers.spec.ts`.

### Seed (Phase 02)
- [x] **P2.7 [S] `seedCategories()`** (8) → `Map<title, Category>`; **`seedSuppliers()`** (8) → `Map<name, Supplier>`; upserted by key; `runSeed()` order: users → categories → suppliers.

### Acceptance
- [x] Staff can view, create and edit on both pages; no delete control, and the server rejects a staff delete with 403 (C15).
- [x] Admin CRUD works; deleting a category/supplier with products shows a clear blocking error. *(Re-verified with real products in #29: `routes/catalog.test.ts` now creates Product documents, and the running app answered 409 with `{ productCount: 1, archivedCount: 0 }`, then `archivedCount: 1` once the product was archived.)*
- [x] 8 categories and 8 suppliers visible after `npm run seed` (ids unchanged by a re-seed).

---

## Phase 3 — Products (and stock-changing endpoints)

Source: `docs/PRDs/03-products.md`, PRD §4–§6.2. Deps: **P2**.

### Server
- [ ] **P3.1 [S] `Product` model** (`title`, unique `sku`, `category` ref, nullable `supplier` ref, `costPrice`, `salePrice`, `quantity` ≥ 0, `unitOfMeasure` enum `pcs|kg|box|l|m`, `imageUrl`, `status` `active|archived`, timestamps) with indexes for search/sort. **`StockMovement` model** (`product`, `type`, `quantity`, `resultingQuantity`, `note`, `user`, `createdAt`; `note` required when `type === 'adjustment'`). Re-verify P2 delete-blocking now works: swap `services/productRefs.ts` (raw `products` collection) to the Product model; the archived check there assumes `status: 'archived'`.
  - *#29: the `Product` model is done (`models/Product.ts`, with `archivedAt` instead of `status` per C18, quantity defaulting to 0) and `productRefs.ts` reads it; the P2 delete guard is re-verified.*
  - *#30: `StockMovement` is done (`models/StockMovement.ts`, per C17: signed `delta`, `quantityAfter`, price snapshots, `occurredAt`; indexed newest-first globally and per product; update and delete hooks refuse). The search/sort indexes for products come with #34.*
- [x] **P3.2 [S] Stock service (single choke point)**: one function that applies a quantity change **and** writes the `StockMovement` atomically (transaction, or conditional `findOneAndUpdate` guarding `quantity >= amount` + movement insert). Rules: `receive` adds; `ship` rejects (400) if amount > on-hand; `adjustment` takes a signed delta, requires `note`, cannot go below 0. Used by both endpoints below. Deps: P3.1.
  - *#30: `services/stock.ts` `recordMovement` (docs/adr/0002: conditional increment + compensation, no transaction). Ship over on-hand is 409 `INSUFFICIENT_STOCK` (C20), not 400; archived products are frozen (409 `PRODUCT_ARCHIVED`). Enforced as the only quantity writer by `server/src/architecture.test.ts`. `reconcile` / `repairQuantity` come with the reconciliation ticket.*
- [ ] **P3.3 [S] `GET /api/products`**: search (title/SKU), `category`, `supplier` (incl. `unassigned`), `status` (default active), `stockStatus` (`in|low|out` using the shared `LOW_STOCK_THRESHOLD`), sort (title/quantity/costPrice/salePrice), pagination; populate category/supplier names.
  - *#29: the basic list is done: active products only, title A→Z (case-insensitive), 20 a page (max 100), category and supplier as `{ id, name }`, a derived `status`. Search, filters and sorts come with #34.*
- [ ] **P3.4 [S] `POST /api/products`, `PUT /api/products/:id`**: staff + admin; Zod-validated; duplicate-SKU → clear 409. Quantity is **not** editable via PUT (stock changes only through the stock service); decide initial quantity on create (see Open Questions #6).
  - *#29: `POST` is done (`can(PRODUCTS_WRITE)`, `createProductSchema` in `shared/schemas/products.ts`): SKU trimmed + upper-cased, `[A-Z0-9-]`, ≤ 32, unique (409 `DUPLICATE_SKU`); prices ≥ 0 with ≤ 2 decimals; unit `pcs|kg|box|l|m`; optional http(s) `imageUrl`; optional supplier; every product starts at 0 and a non-zero `quantity` is a 400. An unknown category or supplier id is a 400 `VALIDATION_ERROR` ("Category not found" / "Supplier not found"; confirmed by the user 2026-10-18, see `CONTRACT-CHANGES.md` decision 10). Edit is `PATCH` (C21), in #35. Tests: `routes/products.test.ts` (mongodb-memory-server), access-matrix rows.*
- [ ] **P3.5 [S] Admin-only**: `DELETE /api/products/:id`, `PATCH .../archive`, `PATCH .../unarchive`. Archiving doesn't touch history. Decide delete behavior vs. existing movements (Open Questions #7).
- [x] **P3.6 [S] `PATCH /api/products/:id/quantity`** (`{ delta: 1 | -1 }`) → `receive`/`ship` of 1 via stock service. Deps: P3.2.
  - *#30: replaced by `POST /api/stock-movements` `{ productId, type, quantity: 1 }` (C19), guarded by `STOCK_ADJUST`; answers 201 with the movement.*
- [x] **P3.7 [S] `POST /api/products/:id/adjust-stock`** (`{ type, quantity, note? }`) via stock service. Deps: P3.2.
  - *#30: the same `POST /api/stock-movements` (C19) takes all three types: receive/ship a positive whole amount, adjustment a signed non-zero one with a required reason; `occurredAt` is never accepted. The Adjust Stock dialog that uses it comes later (P3.12).*
- [ ] **P3.8 [S] `GET /api/products/:id/stock-movements`** (per-product history; may land here or P4.1 — build once, share the query).

### Client
- [ ] **P3.9 [C] Products page header**: search (debounced), Category select, Supplier select (+ "Unassigned"), Stock Status (All/In/Low/Out), Active/Archived tabs. Filters stored in URL search params so the dashboard can deep-link (P5).
- [ ] **P3.10 [C] TanStack Table** (v9 API: `tableFeatures` + `useTable`, row models declared on the features object): Title, SKU, Category, Supplier ("Unassigned" badge), Cost, Sale, Quantity with inline −/+ (− disabled at 0; disable while pending), Unit, Status badge, Actions menu. Server-side sort + pagination; query keys include filters/sort/page.
  - *#29: the table is built (`features/products/components/ProductsTable.tsx`): image placeholder + title + SKU, Category, Supplier ("Unassigned" badge), Cost, Sale, Quantity with the Low/Out stock badge, Unit, Status; the `Pager` below it. Row actions, sorting and URL state come with #31–#36.*
  - *#30: inline −/+ in the Quantity cell (`QuantityStepper`): `−`, value, `+` as outline icon buttons (DESIGN.md), hidden without `STOCK_ADJUST` and on archived products.*
- [ ] **P3.11 [C] Create/Edit form** (RHF+Zod, shared schema): all fields incl. SKU, unit select, image URL, category, optional supplier.
  - *#29: the create dialog is done (`ProductFormDialog`, `productFormSchema`, no quantity field, a duplicate SKU on the field and in a toast). Edit comes with #35, the "+ New category/supplier" options later.*
- [ ] **P3.12 [C] Adjust Stock modal**: tabs Receive / Ship / Manual Adjustment; adjustment requires reason; ship validates against on-hand. Surface server errors in toasts.
- [ ] **P3.13 [C] Stock History modal** (per product: date, type, qty, resulting qty, note, user).
- [ ] **P3.14 [C] Admin-only actions**: Archive/Unarchive/Delete (confirm dialogs), hidden for staff.
- [ ] **P3.15 [C] Invalidation**: stock mutations invalidate products, product history, global movements, and dashboard queries.
  - *#30: `useRecordMovement` invalidates `products`, `stock-movements` (the root the history dialog and movements page will share, `features/movements/hooks/useMovements.ts`) and `dashboard` (`features/dashboard/hooks/useDashboard.ts`) on success and on error. Ticked when the history dialog and movements page use those keys.*

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
- [ ] **P6.4 Rate-limit verification**: actually trigger limits on login, register, Telegram start/verify/resend/complete, forgot-password (e.g. a script or Playwright test) — not just configured.
- [ ] **P6.5 Authorization audit**: for each mutating route, assert staff → 403, unauthenticated → 401, pending/rejected → 403 on data routes. Prefer automated API tests.
- [ ] **P6.6 Seed final audit**: runs clean (no warnings, <30 s, idempotent); data covers in/low/out of stock, ≥1 zero-quantity product, ≥1 archived product, ≥1 product without supplier, ≥1 manual adjustment with a detailed reason, verified-pending, **unverified**-pending, and rejected users; movements span ~90 days.
- [ ] **P6.7 Stock-integrity check**: script/test confirming `product.quantity` equals the movement-history result for every product after a mixed sequence of actions.
- [ ] **P6.8 Playwright e2e** (infra exists in `tests/`): extend `tests/smoke.spec.ts` (the stock `example.spec.ts` is already gone) with flows — login (admin/staff), staff restrictions, stock adjust → history → dashboard update, pending/rejected screens.
- [ ] **P6.9 README**: install, env vars, dev commands (client + server), `npm run seed` and test accounts, how to test the Telegram flow locally (polling + test bot token), email in dev (Brevo or log-the-link fallback).
- [ ] **P6.10 PRD diff**: re-read `docs/PRD.md` end to end against what was built; list deviations in a `docs/` note rather than leaving them silent.
- [x] **P6.11 [X] Consolidate list-sort helpers** (deferred from the P1.29 #22 review, 2026-10-17; kept duplicated on purpose so that slice didn't touch the catalog code). (1) Move `SORT_ORDERS` / `SortOrder` out of `shared/schemas/catalog.ts` into a neutral shared module, so `shared/schemas/users.ts` no longer imports from the catalog schema. (2) Merge `defaultUserSortOrder` (`schemas/users.ts`) and `defaultSortOrder` (`schemas/catalog.ts`): same rule, name → asc, otherwise desc. (3) Share `NAME_COLLATION` between `server/src/services/catalog.ts` and `services/userAdmin.ts`. No wire change. `useUserListParams` and `useCatalogSearchParams` stay separate hooks (P1.29 decision). Catalog and users server tests and e2e must still pass. **Done (2026-10-17):** `SORT_ORDERS`, `SortOrder` and the single `defaultSortOrder(sort)` live in `shared/schemas/sort.ts` (`defaultUserSortOrder` is gone); `NAME_COLLATION` is exported from `server/src/utils/text.ts`. Verified: typecheck, lint, 478 server tests, build, and the users + categories/suppliers e2e (39 passed, Edge).

### Acceptance
- [ ] Fresh DB → `npm run seed` → whole app usable with realistic data.
- [ ] All filters, sorts and aggregations return meaningful results.
- [ ] Every PRD §2 permission-matrix row verified for both roles.

---

## Open Questions / Doc Conflicts

These need a decision (PRD wins by default; per `CLAUDE.md`, stop and ask rather than invent).

1. ✅ **Resolved — status vocabulary.** The PRD wins: `ACCOUNT_STATUS` is now `pending | active | rejected` (`ACTIVE: 'active'`; `APPROVED` was removed from `shared/constants/account-status.ts` and the seed data).
2. ✅ **Resolved — `manager` role.** There is no manager role anywhere. The seed data itself was cleaned instead of mapping at seed time: the former manager is seeded as `staff` (`sarah.manager@inventory.local`, email kept because seeded stock movements reference it), and an unverified pending user was added. The seed has 7 users: 1 admin, 3 active staff, 2 pending (1 verified, 1 not), 1 rejected. `docs/seed-data-strategy/*` was updated to match.
3. ✅ **Resolved — task file location.** The per-phase specs live in `docs/PRDs/` (not `docs/tasks/`). `CLAUDE.md` now points to `docs/PRDs/` and to this file.
4. ✅ **Resolved — language.** TypeScript everywhere (`seed.ts`, `models/*.ts`, ...). Read `.js` in the older docs as `.ts`.
5. ✅ **Resolved (2026-10-18, #27/#28) — low vs. out of stock.** Threshold 10, and low excludes out: out = 0, low = 1–10, in = more than 10. One helper, `getStockStatus` with `LOW_STOCK_THRESHOLD` in `shared/constants/stock-status.ts`, used by the products filter and the dashboard. Original question: is "Low Stock" `0 < qty <= threshold` (excluding out) or `qty <= threshold` (including out)? Affects dashboard cards, alerts, and filter. Also the threshold value itself is undefined in the PRD ("global `LOW_STOCK_THRESHOLD`").
6. ✅ **Resolved (#27, applied in #29) — every product starts at 0**; stock only enters through a recorded receive, and creation rejects a non-zero quantity. Original question: **Initial quantity on product create:** if a product is created with quantity > 0, should that write an initial `receive` movement (keeps quantities = Σ history)? *Proposed:* yes, auto-write an initial `receive` movement, or start all products at 0.
7. **Deleting a product that has movements:** block, cascade-delete movements, or keep orphans? Affects audit-trail guarantee.
8. **Seed vs. PRD "first Admin via seed script":** the dev seed (`admin@inventory.local` / `Admin@123`) must not be run in production; need a separate minimal admin-bootstrap path (env-provided credentials).
9. ✅ **Resolved for Part C — Telegram signup webhook auth.** There is no HTTP `signup-webhook` route: the in-process bot calls `signupWithTelegram()` directly (a deliberate deviation from the PRD route list, to avoid an unauthenticated user-creating endpoint). Telegram's own webhook updates (webhook mode only) use a separate `/api/telegram/webhook` guarded by `secret_token`. See *Decisions made for Part C*.
10. ✅ **Resolved (#27, applied in #29) — URL only**, an optional http(s) `imageUrl`; no upload. Original question: **Image handling:** `imageUrl` only (URL input), or an upload endpoint? Task 03 says "URL input or simple upload-to-URL placeholder".
11. ✅ **Resolved (#27, applied in #30) — adjustment is a signed, non-zero amount; receive and ship take a positive one.** Original question: **Adjustment `quantity` semantics:** PRD says signed delta for adjustment; the API body has a single `quantity` field — confirm that negative numbers are allowed for `adjustment` only.
12. **Chart treatment of adjustments:** excluded from In/Out chart (PRD says received vs shipped only) — confirm.
13. ✅ **Resolved in Part B — base URL of emailed links.** Links are built from `CLIENT_URL`; `APP_URL` was dropped. Original question: `.env.example` has `APP_URL=http://localhost:5000` (the API), but verification and reset links open client pages (Verify-Email landing, Reset Password) that then call the API, and the client runs on `CLIENT_URL` (`http://localhost:5173`). *Proposed:* build links from the client origin (`${CLIENT_URL}/verify-email/:token`, `${CLIENT_URL}/reset-password/:token`) and either point `APP_URL` at the client or drop it. Ask before building P1.4.
14. ✅ **Resolved in Part B — token lifetimes and rate limits.** Verify 24 h, reset 1 h; per-IP, 15-min window: login 10, register 10, forgot-password 5, reset-password 10, resend-verification 10 (429 `RATE_LIMITED`). Original question: The PRD says tokens are "expiring" and auth routes are "rate-limited" but gives no values. *Proposed:* verify-email token 24 h, reset-password token 1 h; per-IP limits on register/login/forgot/reset (e.g. 10 requests per 15 min). Confirm or change before P1.4 / P1.17.
15. ✅ **Resolved (2026-10-17, P1.29) — users list ordering.** The PRD and `01-identity-auth.md` say "pending rows first"; the pending-first sort (`pendingRank`) is dropped in favour of user-chosen sorts (default newest first). Waiting applicants stay visible because the Pending tab is the default view and a pending-count badge shows on the Users sidebar link and the Pending tab. A deliberate deviation from the PRD wording, confirmed by the user.

---

## Suggested commit boundaries

One commit (or PR) per phase, following `CLAUDE.md`: don't batch multiple task files into one uncommitted pass. Phase 1 is committed per part (A–D); within Part B and Phase 3, consider splitting server and client into separate commits. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` before each commit.
