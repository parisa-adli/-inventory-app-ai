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
- `GET /api/users` gains `role`, `verified` (`true|false`) and `search` (name or email, case-insensitive); pending users are listed first, then newest first.
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
