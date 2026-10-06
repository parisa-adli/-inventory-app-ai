# TASK.md — Product Inventory Manager Build Plan

Derived from `docs/PRD.md`, the phase files in `docs/PRDs/` (00–06), and `docs/seed-data-strategy/`. **The PRD is the source of truth**; where another doc disagrees, the PRD wins and the conflict is listed in [Open Questions](#open-questions--doc-conflicts).

Work phases in order. Each phase ends with its acceptance checklist, and should be verified (and committed) before the next one starts. Seed data is added **incrementally per phase**, not at the end.

**Fresh session?** Read `CLAUDE.md` (conventions, library versions, commands), then [Current state](#current-state-as-of-commit-eabaff0-pushed-to-originmain), [Dev Environment](#dev-environment), and the section for the part you are doing. Task status is the checkbox on each task line; `[x]` = done and verified.

## Conventions

- **ID format:** `P<phase>.<n>`. `[S]` = server, `[C]` = client, `[X]` = shared/cross-cutting.
- **Dependencies** are listed per task as `Deps:`.
- Every mutating route: `requireAuth` → `requireActive` → `requireRole(...)` (where admin-only) → Zod validation → DB.
- Every stock quantity change writes a `StockMovement` **in the same operation** (use a Mongo transaction/session, or an atomic conditional update plus movement insert) with `resultingQuantity` snapshotted.
- Every form: React Hook Form + Zod resolver. Every mutation: success + error toast (sonner).
- Every list endpoint: pagination; TanStack Query keys include all filter/sort/page params.
- Error shape: `{ error: { code, message } }`.

## Current state (as of commit `eabaff0`, pushed to `origin/main`)

History: `c127d2c` scaffold → `b173a2a` Phase 1 Part A + server dependency upgrades → `eabaff0` full dependency modernization.

| Area | State |
| --- | --- |
| Monorepo | npm workspaces `client/`, `server/`, `shared/`; `tests/` (Playwright smoke tests in `tests/smoke.spec.ts`); `.nvmrc` = Node 24; `package-lock.json` is tracked; CI (`.github/workflows/playwright.yml`) runs Playwright. All code is **TypeScript** (`.ts`/`.tsx`), not `.js` as the older docs show. |
| Server (`server/src`) | `index.ts` (Express 5: json, cookie-parser, CORS with credentials, error handler), `config/{database,env,load-env}.ts`, `models/{User,EmailToken,OtpCode,RefreshToken}.ts`, `services/{jwt,password}.ts`, `middleware/{auth,roleGuard,validate,errorHandler}.ts`, `utils/{errors,crypto}.ts`, `types/express.d.ts` (`req.user`), `routes/health.ts` (**the only route — no auth or users routes yet**), `seed.ts` (`seedUsers()` only). |
| Client (`client/src`) | React 19 + Vite 8 + Tailwind 4. shadcn components in `components/ui` (badge, button, card, dialog, dropdown-menu, form, input, label, select, sonner, table, tabs); `lib/{axios,utils}.ts`; `app/{App,providers,router,queryClient}` and `app/layouts/{AppLayout,AuthLayout}`; feature folders `features/auth/pages/Login` and `features/dashboard/pages/Dashboard` (stubs); the router only has `/` and `/login`. No auth logic yet. |
| Shared (`shared/`) | `constants` (roles, account-status, stock-movement-types), `schemas/auth.ts`, `types/auth.ts` (`AuthUser`), `seed-data/` for every entity (only users are consumed so far). |
| Tooling | TypeScript 6.0.3 (TS 7 is blocked by typescript-eslint), ESLint 10 flat config, Vitest 5 (22 server unit tests passing), `tsdown` server bundle (`server/dist/index.mjs`), `npm audit`: 0 vulnerabilities. Commands are in `CLAUDE.md`. |

**Progress:** Phase 0 is done except the unchecked items below (P0.2 and P0.8 are partial, P0.9 is deferred). **Phase 1: Part A done; Parts B, C and D not started.** Phases 2–6 not started.

---

## Dev Environment

- **Runtime:** Node 24 (`.nvmrc`), npm workspaces, install with `npm ci`. Server `http://localhost:5000`, client `http://localhost:5173` (Vite proxies `/api` to the server). `npm run dev` starts both.
- **MongoDB:** local instance, database **`inventory_app_claude`** (`MONGODB_URI=mongodb://localhost:27017/inventory_app_claude` in `server/.env`). `server/.env` is gitignored: copy `server/.env.example`, which defaults to a database named `inventory`, and set the URI. `npm run seed` wipes and recreates the seeded collections in that database.
- **Email (Brevo SMTP) is NOT configured.** There are no real `BREVO_SMTP_*` credentials, and `.env.example` only has placeholders. Part B must implement the development **"log-the-link" fallback** in `services/email`: when SMTP is not configured (missing or placeholder values), print the verification/reset link to the server console instead of sending, so every flow can be tested locally.
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
  - *Status: partial.* `.env.example` is complete, and `server/src/config/env.ts` validates (Zod, fail-fast) only `NODE_ENV`, the two JWT secrets, `COOKIE_DOMAIN` and the token TTLs. Still to add: `BREVO_SMTP_*`, `APP_URL`, `CLIENT_URL`, `TELEGRAM_*` (as each part needs them) and `LOW_STOCK_THRESHOLD`. `config/database.ts` and `index.ts` still read some vars from `process.env` directly.
- [x] **P0.3 [S] Mongoose connection** via `MONGODB_URI` (`config/database.ts`).
- [x] **P0.4 [S] `GET /api/health`** returns 200.
- [x] **P0.5 [S] Seed skeleton.** `seed.ts` connects, exposes `runSeed()`, clears + inserts per entity, disconnects, exits non-zero on failure. Script `npm run seed` in `server/package.json`. *(Seed strategy Phase 00.)*

### Client
- [x] **P0.6 [C] Providers & defaults.** TanStack Query provider (`retry: 1`, `refetchOnWindowFocus: false`); sonner `<Toaster />` mounted.
- [x] **P0.7 [C] API wrapper** (`lib/axios.ts`): `withCredentials`/`credentials: 'include'`; response interceptor that calls `/api/auth/refresh` **once** on 401 and retries the original request (guard against refresh loops and concurrent-refresh stampedes). *Implemented, but see the deadlock risk under Part B known issues.*
- [ ] **P0.8 [C] Router** (react-router) with route groups: public (login/register/verify/forgot/reset), pending/rejected screens, protected app shell (Dashboard/Products/Categories/Suppliers/Stock Movements), admin-only group (Users). No auth logic yet.
  - *Status: partial.* The router currently has only `/` and `/login`. The route groups are completed in Part B (P1.18).
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
| **B — Email/password flow** | email service, register, verify-email, login, refresh/logout/me, forgot/reset, rate limiting for those routes; client auth context + email/password pages | P1.4, P1.8, P1.10 (verify-email only), P1.11, P1.13, P1.14, P1.17 (B's routes), P1.18, P1.19 (B's pages), P1.21 | ⏳ next |
| **C — Telegram** | OTP service, Telegram bot, signup webhook + link-telegram merge, OTP routes; client OTP tab + Telegram signup page | P1.5, P1.6, P1.9, P1.12, plus the Telegram extensions of P1.10, P1.17, P1.19 | not started |
| **D — Admin user management** | users API + Admin Users page; run the full Phase 1 acceptance checklist | P1.15, P1.20, acceptance | not started |

---

### Part A — Foundation ✅ (commit `b173a2a`)

- [x] **P1.1 [X · A] Constants, schemas and types reconciled with the PRD.** `ACCOUNT_STATUS` is `pending | active | rejected` (`ACTIVE: 'active'`; `APPROVED` removed) and `USER_ROLES` is `admin | staff`. Zod 4 schemas in `shared/schemas/auth.ts`: `registerSchema`, `loginSchema`, `otpRequestSchema`, `otpVerifySchema`, `forgotPasswordSchema`, `resetPasswordSchema` (email is trimmed + lowercased then validated; password min 8, max 128; OTP code is exactly 6 digits). `AuthUser` (the `/auth/me` shape) in `shared/types/auth.ts`. All exported from `@inventory/shared`.
- [x] **P1.2 [S · A] Models** in `server/src/models/` per PRD §4: `User` (unique lowercase email, optional `passwordHash`, `role` default `staff`, `status` default `pending`, `emailVerified` default false, optional `telegramChatId` with a sparse unique index), `EmailToken` (`verify-email | reset-password | link-telegram`, `tokenHash`, `expiresAt`, `consumed`, optional `telegramChatId` payload for link-telegram), `OtpCode` (hashed `code`, `expiresAt`, `attempts`, `lastSentAt`, `consumed`), `RefreshToken` (`tokenHash` unique, `expiresAt`, `revoked`). `expiresAt` has a TTL index on all three token models.
- [x] **P1.3 [S · A] `services/jwt.ts`**: access token 15 min (JWT, `ACCESS_TOKEN_TTL`) and refresh token 7 d (JWT signed with `JWT_REFRESH_SECRET`, unique `jti`, only its sha256 is stored in `RefreshToken`). Cookies `access_token` and `refresh_token` (`httpOnly`, `Secure`, `SameSite=Strict`; refresh cookie `path=/api/auth`). Exports: `issueSession(res, user)`, `rotateRefreshToken(rawToken, res)` (atomic claim; presenting an already-revoked token revokes all of that user's tokens = reuse detection), `revokeRefreshToken(rawToken)`, `revokeAllUserTokens(userId)`, `clearAuthCookies(res)`, `signAccessToken`, `verifyAccessToken`, `ACCESS_COOKIE`, `REFRESH_COOKIE`, `durationToMs`.
- [x] **P1.7 [S · A] Password hashing**: `services/password.ts` — `hashPassword`, `verifyPassword`, `BCRYPT_ROUNDS = 10` (bcrypt 6). The seed uses the same function.
- [x] **P1.16 [S · A] Middleware**: `requireAuth` (verifies the access cookie and **re-reads the user from the DB**, so a reject/revoke applies immediately; sets `req.user = { id, role, status }`), `requireActive` (403 unless `status === 'active'`; use on all data routes, not on `/auth/*` or the admin `/users/*` routes), `requireRole(...roles)`, `validate(zodSchema)` (replaces `req.body` with the parsed value; ZodError → 400 `VALIDATION_ERROR` via `errorHandler`). Express 5 forwards rejected promises from async middleware/handlers to the error handler, so no try/catch wrapper is needed.
- [x] **P1.22 [S · A] `seedUsers()`** in `server/src/seed.ts`: clears Users, hashes passwords, inserts the 7 users from `@inventory/shared` seed data, returns `Map<email, User>`; does not seed `EmailToken`/`OtpCode`/`RefreshToken`. The seed data itself was cleaned (no manager role; added an unverified pending user) — see Open Question #2. Accounts: see [Dev Environment](#dev-environment).

**Verified in Part A:** `tsc`, lint, 22 unit tests (password, access tokens, middleware, shared schemas), seed twice (7 users), and a throwaway script for refresh rotation + reuse detection. **Not covered by committed tests:** rotation, reuse detection and `requireAuth`'s DB lookup (they need a Mongo instance); consider adding tests for them while building Part B.

**Building blocks Parts B–D must reuse (do not rebuild):** `AppError` and subclasses in `utils/errors.ts` (use `new AppError(409, 'DUPLICATE_EMAIL', ...)`, because `ConflictError` hard-codes the code `CONFLICT`), `sha256`/`randomToken` in `utils/crypto.ts` (store only hashes of email tokens and OTP codes), `validate()`, the shared Zod schemas, `AuthUser`, and the `User`/`EmailToken`/`OtpCode`/`RefreshToken` models. `cookie-parser` is already mounted. `nodemailer` 10 (ships its own types) and `grammy` are installed; `express-rate-limit` is **not** installed yet. There is no HTTP-level test tooling (no supertest); decide in Part B whether to add it.

---

### Part B — Email/password flow ⏳ next

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
- [ ] **P1.4 [S · B] `services/email`**: Nodemailer + Brevo SMTP; templates for verification and password reset (the telegram-link template is added in Part C but design the service to support it); **dev fallback** that logs the link to the console when SMTP is not configured (see [Dev Environment](#dev-environment)). Links point at the client landing pages — see Open Question #13. Deps: P0.2.
- [ ] **P1.8 [S · B] `POST /api/auth/register`**: `validate(registerSchema)`; 409 `DUPLICATE_EMAIL` ("This email is already registered.") if the email exists (explicit, intentional); else create the user as `pending` / `staff` / `emailVerified: false`, create a `verify-email` `EmailToken` (hashed, expiring, single-use), and email the link. Deps: P1.2, P1.4, P1.7.
- [ ] **P1.10 [S · B] `GET /api/auth/verify-email/:token`**: single-use, expiring; look the token up by `sha256`, mark it consumed, set `emailVerified: true`. Handle only `verify-email` tokens here; Part C adds the `link-telegram` branch, so structure it as a switch on token type. Deps: P1.2.
- [ ] **P1.11 [S · B] `POST /api/auth/login`**: `validate(loginSchema)`; check credentials with `verifyPassword`; `rejected` → 403 with a rejected message; `pending` → tokens are still issued (the client routes by `/me`); `active` → normal. Use `issueSession`. Deps: P1.3.
- [ ] **P1.13 [S · B] `POST /api/auth/refresh`** (`rotateRefreshToken` from the `refresh_token` cookie), **`POST /api/auth/logout`** (revoke the refresh token + `clearAuthCookies`), **`GET /api/auth/me`** (`requireAuth`; returns `AuthUser`: `{ id, name, email, role, status, emailVerified }`). Deps: P1.3, P1.16.
- [ ] **P1.14 [S · B] `POST /api/auth/forgot-password`** (always the same generic 200; if the account exists create a `reset-password` token and email the link) and **`POST /api/auth/reset-password/:token`** (`validate(resetPasswordSchema)`, consume the token, set the new hash, and revoke the user's refresh tokens with `revokeAllUserTokens`). Deps: P1.4.
- [ ] **P1.17 [S · B] Rate limiting** (`express-rate-limit`) on register, login, forgot-password and reset-password. The OTP routes are limited in Part C. Limits are not specified in the PRD — see Open Question #14. Deps: the routes above.

#### Client
- [ ] **P1.18 [C · B] Auth context/hook** over `GET /api/auth/me` (TanStack Query) gating the router: unauthenticated → public routes; `pending` → Awaiting Approval; `rejected` → Rejected; `active` → app shell. Also complete **P0.8**: route groups for public, pending/rejected, protected app shell and an admin-only group. Deps: P0.8, P1.13.
- [ ] **P1.19 [C · B] Pages (all React Hook Form + Zod, using the shared schemas)**: Login (**password form only** — the Telegram OTP tab is Part C), Register, Verify-Email landing (reads the token from the URL and calls the API), Forgot Password, Reset Password, Awaiting Approval, Rejected/Revoked. Toast on every mutation. Deps: P1.18.
- [ ] **P1.21 [C · B] Logout** action in the app shell; clear the Query cache on logout. Deps: P1.13, P1.18.

#### Part B: known issues and hand-offs
- **Refresh-interceptor deadlock to fix (`client/src/lib/axios.ts`).** On a 401, the response interceptor calls `POST /auth/refresh`. If that refresh request itself returns 401 (or `/auth/me` is called while logged out), the refresh request goes through the same interceptor, sees `isRefreshing === true` and queues itself behind the refresh it is part of — it never settles. Exclude `/auth/refresh` (and ideally `/auth/login`, `/auth/me`) from the retry logic and verify that an unauthenticated visit to `/` ends on the login page and does not hang.
- The `link-telegram` verification branch (P1.10), OTP routes/limits (P1.17), the OTP login tab and the Telegram signup page (P1.19) belong to **Part C**. Do not build them in Part B.
- A pending user cannot be approved until Part D exists. Test the pending/rejected/unverified screens with the seeded accounts in [Dev Environment](#dev-environment).
- Cookies are `Secure`; see Dev Environment for browser notes.

#### Part B acceptance (subset of the Phase 1 checklist below)
Register → pending, unverified, link arrives in the console/inbox and sets `emailVerified` · duplicate register → explicit error · password login works · pending user sees only Awaiting Approval · rejected user is blocked · access token silently refreshes, logout clears both cookies · forgot-password is identical for known and unknown emails · seeded accounts can log in. Also run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the Playwright smoke tests.

---

### Part C — Telegram

Deps: Part B (the email service and the verify-email route are extended here). Needs a Telegram test bot token (`TELEGRAM_BOT_TOKEN`; see P6.9 for local testing).

- [ ] **P1.5 [S · C] `services/otp`**: generate a 6-digit code, store it hashed; 2-min expiry, max 3 attempts then invalidate, 60-s resend cooldown. Deps: P1.2.
- [ ] **P1.6 [S · C] `services/telegram`**: grammY bot; **polling** mode (prod) and **webhook** mode selected by `TELEGRAM_MODE`; conversation to collect name + email for signup → calls the signup logic; sends OTP codes to `telegramChatId`. Deps: P1.4, P1.5.
- [ ] **P1.9 [S · C] `POST /api/auth/telegram/signup-webhook`**: new email → create the user with `telegramChatId` + verification email; existing email → **no duplicate**, create a `link-telegram` `EmailToken` carrying the new chatId, email a confirm link. See Open Question #9 for how the endpoint is authenticated. Deps: P1.6, P1.8.
- [ ] **P1.12 [S · C] `POST /api/auth/otp/request` and `/otp/verify`**: look up `telegramChatId` by email, send the code via the bot, verify with the OTP policy, issue tokens (`issueSession`). Decide the behavior for an unknown email or no linked Telegram without leaking more than the PRD permits. Deps: P1.5, P1.6, P1.3.
- [ ] **P1.10 (extension) [S · C]** add the `link-telegram` branch to verify-email: on click, attach the stored `telegramChatId` to the existing account.
- [ ] **P1.17 (extension) [S · C]** rate-limit the OTP request/verify routes.
- [ ] **P1.19 (extension) [C · C]** Login page **Telegram OTP tab** (email → code, with a resend countdown) and the "Sign up with Telegram" instructions page with a bot deep link.

---

### Part D — Admin user management

Deps: Parts B (login and the auth context) and A (`requireRole`).

- [ ] **P1.15 [S · D] Admin users API**: `GET /api/users?status=` (paginated), `PATCH /:id/activate` (**400 if `!emailVerified`**), `PATCH /:id/reject` (also revokes active users; call `revokeAllUserTokens`), `PATCH /:id/reactivate`. Guard: `requireAuth` → `requireRole('admin')`. Deps: P1.16 ✅.
- [ ] **P1.20 [C · D] Admin Users page** (admin-only route): Pending Users table with Activate (disabled + tooltip when `!emailVerified`) / Reject; a second view/filter for active users (revoke) and rejected users (reactivate). Hide the admin nav for staff. Deps: P1.15, P1.18.
- [ ] Run the full acceptance checklist below, then mark Phase 1 done.

---

### Acceptance (from `01-identity-auth.md`, tagged by the part that makes it testable)
- [ ] **B** Register new email → pending, unverified; verification link arrives (or is logged in dev) and sets `emailVerified`.
- [ ] **B** Register same email again → explicit duplicate error.
- [ ] **C** Telegram signup, new email → pending user + verification email.
- [ ] **C** Telegram signup, existing email → no duplicate; confirm email; click links the chatId to the existing account.
- [ ] **B / C** Login works by password (B) and by Telegram OTP (C) once active.
- [ ] **C** OTP: 2-min expiry, 3 attempts, 60-s resend cooldown.
- [ ] **B** Pending user can log in but sees only Awaiting Approval.
- [ ] **D** Admin cannot activate an unverified user.
- [ ] **B / D** Rejected user is blocked (B); admin can reactivate (D).
- [ ] **B** Access token expires and silently refreshes; logout clears both cookies.
- [ ] **B** Forgot-password response identical whether or not the email exists.
- [ ] **B** Seeded users can log in (`admin@inventory.local` / `Admin@123`, `john.staff@inventory.local` / `Staff@123`).

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
- [ ] **P6.8 Playwright e2e** (infra exists in `tests/`): extend `tests/smoke.spec.ts` (the stock `example.spec.ts` is already gone) with flows — login (admin/staff), staff restrictions, stock adjust → history → dashboard update, pending/rejected screens.
- [ ] **P6.9 README**: install, env vars, dev commands (client + server), `npm run seed` and test accounts, how to test the Telegram flow locally (polling + test bot token), email in dev (Brevo or log-the-link fallback).
- [ ] **P6.10 PRD diff**: re-read `docs/PRD.md` end to end against what was built; list deviations in a `docs/` note rather than leaving them silent.

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
5. **Low vs. out of stock:** is "Low Stock" `0 < qty <= threshold` (excluding out) or `qty <= threshold` (including out)? Affects dashboard cards, alerts, and filter. Also the threshold value itself is undefined in the PRD ("global `LOW_STOCK_THRESHOLD`").
6. **Initial quantity on product create:** if a product is created with quantity > 0, should that write an initial `receive` movement (keeps quantities = Σ history)? *Proposed:* yes, auto-write an initial `receive` movement, or start all products at 0.
7. **Deleting a product that has movements:** block, cascade-delete movements, or keep orphans? Affects audit-trail guarantee.
8. **Seed vs. PRD "first Admin via seed script":** the dev seed (`admin@inventory.local` / `Admin@123`) must not be run in production; need a separate minimal admin-bootstrap path (env-provided credentials).
9. **Telegram signup webhook auth:** how does the bot-triggered endpoint authenticate (shared secret header vs. in-process call when running polling mode)?
10. **Image handling:** `imageUrl` only (URL input), or an upload endpoint? Task 03 says "URL input or simple upload-to-URL placeholder".
11. **Adjustment `quantity` semantics:** PRD says signed delta for adjustment; the API body has a single `quantity` field — confirm that negative numbers are allowed for `adjustment` only.
12. **Chart treatment of adjustments:** excluded from In/Out chart (PRD says received vs shipped only) — confirm.
13. **Base URL of the emailed links (needed in Part B).** `.env.example` has `APP_URL=http://localhost:5000` (the API), but verification and reset links open client pages (Verify-Email landing, Reset Password) that then call the API, and the client runs on `CLIENT_URL` (`http://localhost:5173`). *Proposed:* build links from the client origin (`${CLIENT_URL}/verify-email/:token`, `${CLIENT_URL}/reset-password/:token`) and either point `APP_URL` at the client or drop it. Ask before building P1.4.
14. **Unspecified numbers (needed in Part B).** The PRD says tokens are "expiring" and auth routes are "rate-limited" but gives no values. *Proposed:* verify-email token 24 h, reset-password token 1 h; per-IP limits on register/login/forgot/reset (e.g. 10 requests per 15 min). Confirm or change before P1.4 / P1.17.

---

## Suggested commit boundaries

One commit (or PR) per phase, following `CLAUDE.md`: don't batch multiple task files into one uncommitted pass. Phase 1 is committed per part (A–D); within Part B and Phase 3, consider splitting server and client into separate commits. Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` before each commit.
