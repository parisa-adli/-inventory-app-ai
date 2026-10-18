# CONTRACT-CHANGES.md

Proposed changes to the shared/API contract for the **email auth** work (branch `email-auth`).
Status: **CONFIRMED by the user and applied** on `email-auth` (server + shared, then client; PRD and TASK.md brought in line).
Names below use this repo's actual names; the right-hand column of the first table maps the decision wording to them.

## Name mapping (decision wording -> this repo)

| Decision wording | In this repo |
| --- | --- |
| `verificationToken` model | `EmailToken` (`server/src/models/EmailToken.ts`) |
| `POST /auth/email/verify {token}` | `GET /api/auth/verify-email/:token` (also serves `link-telegram`) |
| `POST /password/reset/request` / `.../complete` | `POST /api/auth/forgot-password` / `POST /api/auth/reset-password/:token` |
| verify/resend | `POST /api/auth/resend-verification` |
| `CLIENT_ORIGIN` | `CLIENT_URL` (already used by `services/email.ts`) |
| `MAIL_DRIVER=console` | `emailMode() === 'log'` (non-production, SMTP not configured) |
| `loginAttempt`, `mustChangePassword`, `routes.ts` comment, `server/.mail/` | do not exist in this repo (see "Not applicable") |

## C1. Verify email returns `{ verified: true, type }`

- Route: `GET /api/auth/verify-email/:token`, public, token is the proof (unchanged).
- Today (main): `200 { type, message }`. Applied: `200 { verified: true, type }` with `type: 'verify-email' | 'link-telegram'`; never the user. `message` is dropped; the client writes its own copy. `type` is kept so the landing page and the Telegram link flow can tell the two links apart.
- Side effect: after a successful `verify-email`, email every ACTIVE admin that the user is awaiting approval (fire-and-forget; see C7).
- Shared: `VerifyEmailResponse` and `EmailLinkType` in `shared/types/auth.ts`.

## C2. Forgot / reset responses become empty 204

- `POST /api/auth/forgot-password`: today `200 { message }`; proposed `204`. Order: validate -> per-IP and per-email limit -> `204` immediately -> look up user, issue token, send mail in the background. Same for real and unknown emails.
- `POST /api/auth/reset-password/:token`: today `200 { message }`; proposed `204`, no tokens issued. All refresh tokens stay revoked. Client clears its cached session and goes to `/login` with a "Password updated, sign in" notice.
- Reset for a Telegram-only account stays allowed (sets a password); no change.

## C3. Change email: `PATCH /api/auth/email`

- Body `{ email }` (same normalized email field as register). Requires session.
- `403 FORBIDDEN` if `emailVerified` is already true. `409 DUPLICATE_EMAIL` if taken. Otherwise: set the new email (stays unverified), discard pending `verify-email` and `link-telegram` tokens (a Telegram link mailed to the old address must not work), create a new `verify-email` one, send it. Shares the resend limit (3 / user / hour).
- Response `200 { user, devMailUrl? }`.
- Shared: `changeEmailSchema`, response schema.
- UI: "Change my email" action on the verify screen (`VerifyEmailPending`) only. Awaiting Approval has no such action: a user who reaches it is already verified and would get the 403 above (revised, #18).
- Guard: `requireAuth` only; no `requireActive`, no `requireRole`. Decision: the route is for unverified users, who are `pending` (awaiting approval) by definition, so `requireActive` would lock out the exact users it exists for, and it is self-service on the caller's own account (`req.user.id`), so a role check has no meaning. It matches `/me` and `/resend-verification`. Abuse is bounded by the shared resend limit, the verified-user 403 and the duplicate check. Covered by the `PATCH /api/auth/email` tests (401 without a session, success for pending and active users).

## C4. `devMailUrl` (dev only)

- Present only when `emailMode() === 'log'` (never in production). Added to the bodies of register, resend-verification and `PATCH /auth/email`.
- Consequence: `POST /api/auth/resend-verification` changes from `204` to `200 { devMailUrl? }`; register stays `201 { message, devMailUrl? }`.
- Forgot-password stays an empty 204; the reset link is read from the server console log (`[email:dev] ...`). There is no `server/.mail/` driver; add one only if you want it.

## C5. Rate limits: Mongo-backed, 429 with details

- New model `RateLimitHit` (key, window start, count; TTL purge) and helper `createMongoLimiter({ key, limit, windowMs })` in `middleware/rateLimit.ts` (the `express-rate-limit` factory is `createIpLimiter`; every limit lives in `RATE_LIMITS`; both answer by passing a `RateLimitedError` to `errorHandler`, which adds `details.retryAfter` when set), replacing `express-rate-limit` for the **email** routes only (login, register, forgot, reset, resend, change-email). Telegram limiters are left as they are.
- Limits: forgot 5 / IP / h and 3 / email / h; resend + change-email 3 / user / h combined. Login, register and reset keep their current numbers (10 / 15 min / IP) unless you give new ones.
- Over the limit: `429 { error: { code: 'RATE_LIMITED', message, details: { retryAfter } } }` plus `Retry-After`; identical for real and unknown emails because the check runs before any lookup. Validation runs before the limiter (decision 7 below).
- Client: "Try again in N min" and a disabled resend button.

## C6. Distinguish expired links

- `EmailToken` TTL index changes from `expireAfterSeconds: 0` to 7 days after `expiresAt` (index must be dropped and rebuilt on deploy).
- `consumeEmailToken`: unknown/consumed -> `400 INVALID_TOKEN`; past `expiresAt` -> `400 TOKEN_EXPIRED` (new code). Applies to verify, reset and link-telegram.
- Client shows "This link has expired" with resend (signed in) or sign-in (signed out).

## C7. Admin notification and email-failure tracking

- `sendUserAwaitingApproval(to, adminName, userName, userEmail, url)` added to `services/email.ts`; `url` = `${CLIENT_URL}/users` (page arrives with Part D). Sent to every `active` admin on successful verify of a still-`pending` user; failures are swallowed.
- `User` gets `lastEmailFailedAt: Date` and `lastEmailFailedType: 'verify-email' | 'reset-password' | 'link-telegram'`, set when a send fails and cleared on the next successful send. Not exposed in `AuthUser` / shared types for now. `sendTracked` and `notifyAdminsAwaitingApproval` live in `services/accountMail.ts` (they touch `User`; `services/email.ts` only sends). A failed admin notice is logged, never silent. `signupWithTelegram` uses the same `sendTracked`, so Telegram signup and confirm-link mails are tracked too.

## C8. Client landing logic (no wire change)

- One `resolveLandingRoute(user)` replaces `homeFor` in `features/auth/components/guards.tsx`: unverified -> `/verify-email`; rejected -> `/rejected`; pending -> `/awaiting-approval`; else home. (Needs a token-less `/verify-email` screen with resend and change-email.)
- After verify or reset the client refetches `/me`; no change to `POST /auth/refresh`.

## C9. Password rule (applied in commit a4a75e9, confirmed by the user)

- New passwords (register and reset): at least 10 characters, with a letter and a digit, at most 72 bytes. Supersedes min 8 / max 128.
- Why: matches `docs/design/signup-email.png`; bcrypt ignores bytes past 72, so a longer password would be silently truncated.
- Login deliberately accepts any non-empty password so existing and seeded accounts keep working.
- Shared: `passwordField`, `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_BYTES`, `PASSWORD_HINT` in `shared/schemas/auth.ts`.

## C10. Additions outside the original proposal (recorded in #18)

- `TRUST_PROXY` (`server/src/config/env.ts`, `app.ts`, `.env.example`): number of reverse proxies in front of the server, default `0`. When `> 0`, `app.set('trust proxy', n)` so the per-IP limiters (C5) see the real client IP. Not set in dev.
- `errorHandler` logs only unexpected errors: an `AppError` with a status below 500 (401, 409, 429 ...) is no longer written to the console; non-`AppError`s and `AppError`s >= 500 still log the stack.
- Client restyle with no wire change: `TextField` (`features/auth/components`) renders hints through `FormDescription` and gets `aria-pressed` on the password reveal button; the full-screen auth spinner in `guards.tsx` uses theme tokens (`border-border`, `border-primary`) instead of fixed grays.
- `useCooldown` (`features/auth/hooks/useCooldown.ts`): a seconds countdown started from the server's `retryAfter`, used by `VerifyEmailPending` to keep the resend button disabled (C5 "disabled resend button").

## C11. Guard chain and admin user management v2 (Part D server, 2026-10-14)

Server half only; the client moves over in its own session. `/shared` was unfrozen for this by the user.

**Guards** (`server/src/middleware/`, one per file; routes spread `signedIn`, `authenticated`, `withRole(...)` or `adminOnly` from `guards.ts`):
`requireAuth` (401 `UNAUTHORIZED`) -> `requireVerified` (403 `EMAIL_UNVERIFIED`) -> `requireActive` (403 `ACCOUNT_PENDING` / `ACCOUNT_REJECTED`) -> `requirePasswordChanged` (403 `PASSWORD_CHANGE_REQUIRED`) -> `requireRole` (403 `FORBIDDEN`). Before this, every gate answered a generic 403 `FORBIDDEN`. `requireAuth` re-reads role, status, emailVerified and mustChangePassword from the DB on every request (not the token), so a rejection or demotion applies on the next request instead of after the 15-minute access token expires.
`/auth/me`, `/auth/resend-verification`, `PATCH /auth/email` and the new `POST /auth/password` use `signedIn` (session only); logout stays unguarded; everything under `/api/users` is `adminOnly`.

**New endpoints** (all `adminOnly`):
- `GET /api/users` gains `role`, `verified` (`true|false`) and `search` (name or email, case-insensitive); pending users are listed first, then newest first (**superseded by C16**: user-chosen sort, newest first by default).
- `PATCH /api/users/:id` `{ role?, status?: 'active'|'rejected', statusReason? }` -> `AdminUser`. 400 `EMAIL_NOT_VERIFIED` (activate unverified), 403 `FORBIDDEN` (self reject/demote, last active admin), 409 `CONFLICT` (changed concurrently), 404.
- `POST /api/users/:id/password/temp` -> `{ temporaryPassword }` once (`Cache-Control: no-store`); sets `mustChangePassword`, revokes refresh tokens.
- `POST /api/users/:id/email/verify-manually` -> `AdminUser` (idempotent).
- `POST /api/users/:id/email/verify/resend` -> `{ devMailUrl? }`; 409 `CONFLICT` if already verified.
- `DELETE /api/users/:id/credentials/telegram` -> `AdminUser` (idempotent).
- `PATCH /:id/{activate,reject,reactivate}` are kept (same codes as before) and now run the same rules, so `reject` also refuses the last active admin.

**Self-service:** `POST /api/auth/password` `{ currentPassword, newPassword }` (`signedIn`, 10 / 15 min / IP) -> `{ user }`, clears `mustChangePassword`, revokes all refresh tokens and issues a fresh session. Wrong current password: **400** `INVALID_CREDENTIALS` (not 401, so the client's refresh interceptor does not retry it). `reset-password` also clears `mustChangePassword`.

**Shared:** `listUsersQuerySchema` (+ role, verified, search), `updateUserSchema`, `STATUS_REASON_MAX`, `USER_SEARCH_MAX`, `changePasswordSchema`; `AuthUser.mustChangePassword` (+ `authUserSchema`); `AdminUser` + `mustChangePassword`, `statusReason`, `statusChangedAt`, `statusChangedBy`; `TempPasswordResponse`. `User` model gains the same four fields.

**Rules:** rejection never changes `role`, so reinstating restores it; `statusReason` is optional, kept only while rejected; `statusChangedAt/By` are written on every admin status change.

**Proposed codes (not applied; `FORBIDDEN` is used for now):**
- `CANNOT_MODIFY_SELF` (403): an admin rejects or demotes their own account via `PATCH /users/:id`. (The legacy `PATCH /:id/reject` keeps its 409 `CANNOT_REVOKE_SELF`; unify on one code when the client moves.)
- `LAST_ADMIN` (403 or 409): the change would leave no active admin.

## C12. RBAC permission map (no wire change)

- `shared/constants/permissions.ts`: `PERMISSIONS` (`inventory.view`, `products.write`, `stock.adjust`, `products.archive`, `products.delete`, `categories.manage`, `suppliers.manage`, `users.manage`), `ROLE_PERMISSIONS` (staff: the first three; admin: all; *the two manage permissions were split in C15*) and `hasPermission(role, permission)`. Taken from PRD §2; fixed in code, not stored in the DB. `ROLE_HIERARCHY` (unused) removed.
- Server: `requirePermission(...)` replaces `requireRole`; `can(...)` replaces `adminOnly` / `withRole` (C11's `adminOnly` routes are now `can(USERS_MANAGE)`). Same status codes (403 `FORBIDDEN`).
- Client works out permissions from `AuthUser.role` with the shared map, so `/me` is unchanged.

## C13. Profile & sessions (Phase 1 Part E, 2026-10-15; approved by the user)

Self-service for the signed-in user: display name, sign-in methods (add / change / remove password, link / unlink Telegram) and device sessions. Design: `docs/design/{profile,set-password-to-profile,password-and-telegram-linked}.png`. Terms: **Session**, **Sign out everywhere**, **Sign-in method** in `CONTEXT.md`.

**`AuthUser`** (+ `authUserSchema`) gains `hasPassword: boolean`, `telegramLinked: boolean`, `telegramUsername: string | null` (Telegram `@handle` without the `@`; null when unlinked or the Telegram account has none). Every endpoint returning `AuthUser` carries them, `/me` included.

**New endpoints.** All `authenticated` (verified, active, no forced password change); a temporary-password user still goes through `POST /auth/password`. Mutations answer `{ user: AuthUser }` unless noted.
- `PATCH /api/auth/me` `{ name }` (`updateProfileSchema` = `registerSchema.pick({ name: true })`).
- `POST /api/auth/password/set` `{ newPassword }` (`setPasswordSchema`, the C9 rule) for an account without a password; **409 `PASSWORD_ALREADY_SET`** otherwise. Other sessions are kept. Limiter: the change-password one (10 / 15 min / IP).
- `DELETE /api/auth/password`: removes the password; **409 `LAST_SIGN_IN_METHOD`** without a Telegram link. No re-auth; forgot-password is the recovery path. Other sessions are kept. Same limiter.
- `DELETE /api/auth/telegram`: unlinks the caller's chat (and discards a pending link-telegram email); **409 `LAST_SIGN_IN_METHOD`** without a password. Other sessions are kept.
- `POST /api/auth/telegram/link` -> `201 { deepLink, expiresAt }` (same shape as `/telegram/start`), sets the `tg_auth_session` cookie for an `AuthSession` with purpose `LINK` bound to the caller. **409 `TELEGRAM_ALREADY_LINKED`** if the caller already has a chat; 503 `TELEGRAM_UNAVAILABLE` as for `/start`. Telegram start limiter.
- `GET /api/auth/sessions` -> `{ items: DeviceSession[] }`, `DeviceSession = { id, device, ip, signedInAt, lastActiveAt, current }` (ISO dates; `device` e.g. "Chrome on Windows" or "Unknown device"; `current` = the browser asking). Live sessions only, current first, then most recently active. Not paginated (one user's live sessions).
- `DELETE /api/auth/sessions` -> `204`: **Sign out everywhere**, this browser included; cookies cleared.

**Changed endpoints.**
- `POST /api/auth/telegram/verify` on a `LINK` session: links the chat and answers the existing `{ status: 'COMPLETED', user }`, but **issues no new session** (the caller keeps theirs); the Telegram cookie is cleared. 401 `UNAUTHORIZED` when the access cookie is missing or expired (the client refreshes and retries), 403 `FORBIDDEN` when it belongs to another user (the attempt ends), **409 `TELEGRAM_IN_USE`** when the chat belongs to another account or the caller linked one meanwhile (the attempt ends). Login and signup attempts are unchanged. `/status` and `/resend` are unchanged.
- `DELETE /api/users/:id/credentials/telegram` (admin): **409 `LAST_SIGN_IN_METHOD`** for a user without a password (issue a temporary password first). Otherwise unchanged.
- Sessions end at once everywhere: `User.sessionsValidAfter` is set on sign out everywhere, change password, reset password, temporary password and refresh-token reuse (`endAllSessions` in `services/jwt.ts`), and `requireAuth` answers 401 for an access token issued before it. Before this, other browsers kept working for up to the 15-minute access token lifetime. Change password still keeps the caller signed in with a fresh session.
  - **Not admin reject** (changed during implementation, from the approved Q16 list): a rejected user is already shut out of every data route on the next request (`requireActive` re-reads the status), so ending the access token adds no protection. It would only take away the "rejected" screen the browser reaches through `/me`. Reject keeps revoking refresh tokens only (`revokeAllUserTokens`), as before.

**Race safety.** Removing a sign-in method (self password, self unlink, admin unlink) is one conditional update that requires the other method to still exist, so two parallel removals can never leave an account with none. Linking is conditional on the caller having no chat.

**Models (no wire change).** `User` + `telegramUsername`, `sessionsValidAfter`; `telegramUsername` is written on link, Telegram signup and every Telegram sign in. `RefreshToken` + `familyId` (one per **Session**, kept across rotation), `familyCreatedAt`, `lastUsedAt`, `userAgent`, `ip` (`req.ip`, honours `TRUST_PROXY`; deleted with the token by the TTL index). Rows from before this change count as their own session. `AuthSession.purpose` + `LINK` (set at creation). The bot sends link-specific text for `LINK` codes.

**Shared:** `updateProfileSchema`, `setPasswordSchema`, `deviceSessionSchema` / `DeviceSession`, `SessionsResponse`; `AuthUser` + the three fields above.

## C14. Categories & suppliers (Phase 2, 2026-10-16; approved by the user)

Designed in a grilling session. PRD §4 fields are unchanged; the endpoints in PRD §5 change as follows. Both entities follow one pattern (`services/catalog.ts`); `name` below means `title` on categories.

**Endpoints.** `GET /api/categories` and `GET /api/suppliers` are `can(INVENTORY_VIEW)`. `POST /`, `PATCH /:id` and `DELETE /:id` were `can(CATEGORIES_MANAGE)` / `can(SUPPLIERS_MANAGE)` (admin); **superseded by C15** (staff create/edit, admin delete).
- **`PATCH /:id` replaces `PUT /:id`.** Partial body: an absent field is unchanged, `null` clears an optional field (it is stored as absent). Title/name cannot be cleared. An empty body is 400. `POST` leaves empty optional fields out; an empty string is 400 on both.
- **List query** (`catalogListQuerySchema`): `search` (case-insensitive substring, regex characters literal; categories: title + description, suppliers: name + contact person + email), `page` (default 1), `limit` (1–100, default 12), `sort` = `name | createdAt | productCount` (default `createdAt`, newest first), `order` = `asc | desc` (default asc for name, desc otherwise). Ties sort by name A→Z; names compare case-insensitively.
- **List response** `{ items, page, limit, total, totalPages }` (`Paginated<T>` / `PageMeta`, same shape as `GET /api/users`). Items carry **`productCount`**, archived products included, so "0 products" means it can be deleted. `POST` (201) and `PATCH` (200) answer the record without a count. `DELETE` answers 204.
- **Errors:** 409 `CATEGORY_IN_USE` / `SUPPLIER_IN_USE` while any product (archived included) references the record, with `error.details = { productCount, archivedCount }` (new: `AppError` can carry `details`). 409 `DUPLICATE_CATEGORY` / `DUPLICATE_SUPPLIER` when the normalized name (trim, collapse spaces, lowercase) is taken. 404 `NOT_FOUND` for an unknown or malformed id.

**Field rules** (trimmed): category title 1–80, description ≤500; supplier name 1–100, contactPerson ≤100, phone ≤30 (`^[+\d][\d\s()\-.]*$`), email (lowercased), address ≤300, notes ≤1000.

**Models (no wire change).** `Category.titleKey` / `Supplier.nameKey` (unique, set in a pre-validate hook, never sent). `timestamps: true`, so records also answer `updatedAt`.

**Until P3:** the delete guard and `productCount` read the raw `products` collection (`services/productRefs.ts`); P3.1 swaps them to the Product model.

**Seed:** categories and suppliers are upserted by normalized name instead of wiped, so their ids survive a re-seed.

**Shared:** `catalogListQuerySchema`, `create/update/…FormSchema` for both entities, `Category`, `Supplier`, `CategoryListItem`, `SupplierListItem`, `PageMeta`, `Paginated`, `InUseDetails`.

## C15. Staff create and edit categories & suppliers (2026-10-16; requested by the user)

PRD §2 changed: staff may create and edit categories and suppliers; delete stays admin only (the same split as products).
- **Permissions** (`shared/constants/permissions.ts`): `categories.manage` / `suppliers.manage` are replaced by `categories.write` + `categories.delete` and `suppliers.write` + `suppliers.delete`. Staff get both `*.write`.
- **Endpoints:** `POST` and `PATCH /:id` on `/api/categories` and `/api/suppliers` are `can(CATEGORIES_WRITE)` / `can(SUPPLIERS_WRITE)`, so staff now get 201 / 200 instead of 403. `DELETE /:id` is `can(CATEGORIES_DELETE)` / `can(SUPPLIERS_DELETE)`, unchanged for staff (403 `FORBIDDEN`). Everything else in C14 stands.
- **Client:** staff see "Add …" and the card's Edit; Delete is admin only. The P3 product form's "+ New category / supplier" follows `*_WRITE`, so staff get it too.

## C16. Users list sort and page size (P1.29, 2026-10-17; approved by the user)

`GET /api/users` (`listUsersQuerySchema`). The response shape `{ items, page, limit, total, totalPages }` is unchanged.
- **`sort`** = `createdAt | name | lastLoginAt` (`USER_SORTS`; default `createdAt`) and an optional **`order`** = `asc | desc` (the catalog `SORT_ORDERS`; default asc for name, desc otherwise, `defaultUserSortOrder`). An unknown value is 400 `VALIDATION_ERROR`.
- Names sort case-insensitively (collation). Every sort breaks ties by `_id` in the same direction, so paging never repeats or skips a user.
- **The pending-first rank is removed** (every Users tab already filters by status): with no `sort` the list is newest first. A deliberate deviation from the PRD's "pending rows first", see `tasks/TASK.md` Open Question 15.
- **Default `limit` 10 → 20** (`USERS_PAGE_SIZE_DEFAULT`); the maximum stays 100.
- **`sort=lastLoginAt`** (#23; desc by default): accounts that never signed in come last in both directions.
- **`AdminUser.lastLoginAt`**: ISO string or null. Set whenever a new Session (refresh-token family) is issued: password or Telegram sign-in, and the fresh session after `POST /api/auth/password`. Not changed by `POST /api/auth/refresh`.

**Shared:** `USER_SORTS`, `UserSort`, `defaultUserSortOrder`, `AdminUser.lastLoginAt`. `User` model gains `lastLoginAt` (index `{ lastLoginAt: -1, _id: -1 }`).

## Products & stock ledger (P3/P4, spec #27; agreed in the design Q&A, 2026-10-18)

Where the PRD and the agreed Q&A conflict, the Q&A wins (`docs/adr/0001`). C17–C23 are agreed but not yet applied; each is marked applied when the #27 commit that implements it lands. Already applied in the prefactor (#28): the movement type `adjustment` (was `adjust`), `LOW_STOCK_THRESHOLD = 10` with `getStockStatus` (out = 0, low = 1–10, in = more than 10), and the `STOCK_RECONCILE` permission.

## C17. StockMovement stores a signed delta and snapshots

- PRD: magnitude `quantity` and `resultingQuantity`. Agreed: signed **`delta`** (non-zero integer), **`quantityAfter`**, the price snapshots **`unitCost` / `unitPrice`** (new) and **`occurredAt`** (defaults to now; only the seed backdates it). Date filtering and newest-first sorting use `occurredAt`.
- Movements cannot be updated or deleted (model hooks).

## C18. Product stores `archivedAt` instead of `status`

*Applied in #29 (the Product model, the derived `status` in responses, and the category/supplier delete guard counting `archivedAt` as archived). The `status` filter lands with #34.*

- PRD: stored `status: active | archived`. Agreed: `archivedAt` (date or null). Responses carry a derived `status`, and `GET /api/products` still accepts `status` as a filter (`docs/adr/0003`).

## C19. Stock changes and history go through `/api/stock-movements`

- `POST /api/stock-movements` `{ productId, type, quantity, note? }` **replaces** `PATCH /api/products/:id/quantity` and `POST /api/products/:id/adjust-stock`. Receive and ship take a positive `quantity`; adjustment takes a signed non-zero one and requires a `note`. The inline +/- buttons post a receive or ship of 1.
- `GET /api/stock-movements?product=` **replaces** `GET /api/products/:id/stock-movements` (the Stock History dialog filters by product).

## C20. Shipping more than is on hand is 409 `INSUFFICIENT_STOCK`

- PRD: 400. Agreed: 409 `INSUFFICIENT_STOCK` with `details: { onHand }`. Any stock change on an archived product is 409 `PRODUCT_ARCHIVED`; archived is reported before insufficient.

## C21. Product edit is `PATCH`

*Partly applied in #29: creation rejects a non-zero `quantity` (400 `VALIDATION_ERROR`). The `PATCH` itself lands with #35.*

- PRD: `PUT /api/products/:id`. Agreed: `PATCH /api/products/:id`, following the Phase 2 convention (an absent field is unchanged, `null` clears supplier / image URL). `quantity` is rejected as unknown on edit, and product creation rejects any non-zero quantity: every product starts at 0.

## C22. Admin reconciliation endpoint and `STOCK_RECONCILE` (new)

- `GET /api/admin/reconcile[?fix=true]` → `{ checked, mismatches: [{ productId, sku, quantity, ledgerSum, fixed? }] }`, behind the admin-only `STOCK_RECONCILE` permission (added in #28).
- Known wording conflict, accepted from the Q&A: it is a GET that writes when `fix=true`.

## C23. Seed: about 60 generated products

- The seed replaces the 32 hand-written products with about 60 generated ones across 6 of the 8 categories. Quantities are no longer stored in the seed data: they come from replayed movements (an opening balance about 90 days ago, then a fixed-seed history), and the seed fails if reconciliation reports any mismatch.

## Not applicable (nothing to change)

- Stale JWT: the access token carries only `sub`; `/me` and `requireAuth` read the DB.
- ~~`mustChangePassword`: does not exist, so no `/change-password` gate.~~ Added in C11.
- Lockout clearing on reset: no `loginAttempt` model or lockout exists (rate limiting is per IP). Adding lockout would be a new feature; not proposed.
- Link base: already `CLIENT_URL`. `APP_URL` was dropped (see `tasks/TASK.md`, Open Question 13); the PRD does not mention it.

## Decisions on the open questions

1. C1: the response is `{ verified: true, type }` for both token kinds (revised: the first decision dropped `type`, which broke the Telegram link confirmation, so it was restored). Never the user.
2. C5: login, register, reset and the Telegram limiters keep their current numbers and stay on `express-rate-limit`. Only forgot-password (5/IP/h, 3/email/h) and resend + change-email (3/user/h) use the Mongo limiter.
3. C4: no `server/.mail/` driver. Two modes only: console log (dev, no SMTP) and real SMTP.
4. C8: an unverified account always lands on `/verify-email`, even when it is also rejected.
5. C9: the password rule above is final (confirmed by the user).
6. Error toasts (#8): every auth mutation toasts its error (CLAUDE.md: toast on every mutation's success/error), including verify-email, change-email (duplicate email) and reset-password (invalid/expired link). The inline UI on those pages stays as well, so no exception is recorded in `docs/DESIGN.md`.
7. C5 limiter order (#15): validate runs before the limiter on `forgot-password` (IP and email) and `PATCH /auth/email`, so a malformed body spends no budget. Changed.
8. C5 budget on 403/409 (#15): a change-email `403` (already verified) or `409` (duplicate) still spends the shared 3/user/hour budget. Kept: the limiter runs before any lookup by design, and the 409 is an email-existence probe that the budget bounds. Only requests that pass validation count.
9. Cleanup (#11): `EMAIL_TOKEN_TYPES` / `EmailTokenType` live in `shared/constants`; `EmailLinkType` derives from it. The client's `getLinkErrorKind` (`lib/apiError.ts`) is the one place that maps INVALID_TOKEN / TOKEN_EXPIRED. `sendUserAwaitingApprovalEmail` takes one object. `RequireStatus` and `RequireUnverified` share one guard. Declined: the `location.state.notice` read in `Login.tsx` (a single use; a helper would add indirection, not remove duplication).
