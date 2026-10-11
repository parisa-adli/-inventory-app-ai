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
- `403 FORBIDDEN` if `emailVerified` is already true. `409 DUPLICATE_EMAIL` if taken. Otherwise: set the new email (stays unverified), discard pending `verify-email` tokens, create a new one, send it. Shares the resend limit (3 / user / hour).
- Response `200 { user, devMailUrl? }`.
- Shared: `changeEmailSchema`, response schema.
- UI: "Change my email" action on the verify screen and Awaiting Approval.

## C4. `devMailUrl` (dev only)

- Present only when `emailMode() === 'log'` (never in production). Added to the bodies of register, resend-verification and `PATCH /auth/email`.
- Consequence: `POST /api/auth/resend-verification` changes from `204` to `200 { devMailUrl? }`; register stays `201 { message, devMailUrl? }`.
- Forgot-password stays an empty 204; the reset link is read from the server console log (`[email:dev] ...`). There is no `server/.mail/` driver; add one only if you want it.

## C5. Rate limits: Mongo-backed, 429 with details

- New model `RateLimitHit` (key, window start, count; TTL purge) and helper `rateLimit({ key, limit, windowMs })` in `middleware/rateLimit.ts`, replacing `express-rate-limit` for the **email** routes only (login, register, forgot, reset, resend, change-email). Telegram limiters are left as they are.
- Limits: forgot 5 / IP / h and 3 / email / h; resend + change-email 3 / user / h combined. Login, register and reset keep their current numbers (10 / 15 min / IP) unless you give new ones.
- Over the limit: `429 { error: { code: 'RATE_LIMITED', message, details: { retryAfter } } }` plus `Retry-After`; identical for real and unknown emails because the check runs before any lookup.
- Client: "Try again in N min" and a disabled resend button.

## C6. Distinguish expired links

- `EmailToken` TTL index changes from `expireAfterSeconds: 0` to 7 days after `expiresAt` (index must be dropped and rebuilt on deploy).
- `consumeEmailToken`: unknown/consumed -> `400 INVALID_TOKEN`; past `expiresAt` -> `400 TOKEN_EXPIRED` (new code). Applies to verify, reset and link-telegram.
- Client shows "This link has expired" with resend (signed in) or sign-in (signed out).

## C7. Admin notification and email-failure tracking

- `sendUserAwaitingApproval(to, adminName, userName, userEmail, url)` added to `services/email.ts`; `url` = `${CLIENT_URL}/users` (page arrives with Part D). Sent to every `active` admin on successful verify of a still-`pending` user; failures are swallowed.
- `User` gets `lastEmailFailedAt: Date` and `lastEmailFailedType: 'verify-email' | 'reset-password' | 'link-telegram'`, set when a send fails and cleared on the next successful send. Not exposed in `AuthUser` / shared types for now. `signupWithTelegram` uses the same `sendTracked`, so Telegram signup and confirm-link mails are tracked too.

## C8. Client landing logic (no wire change)

- One `resolveLandingRoute(user)` replaces `homeFor` in `features/auth/components/guards.tsx`: unverified -> `/verify-email`; rejected -> `/rejected`; pending -> `/awaiting-approval`; else home. (Needs a token-less `/verify-email` screen with resend and change-email.)
- After verify or reset the client refetches `/me`; no change to `POST /auth/refresh`.

## C9. Password rule (applied in commit a4a75e9, confirmed by the user)

- New passwords (register and reset): at least 10 characters, with a letter and a digit, at most 72 bytes. Supersedes min 8 / max 128.
- Why: matches `docs/design/signup-email.png`; bcrypt ignores bytes past 72, so a longer password would be silently truncated.
- Login deliberately accepts any non-empty password so existing and seeded accounts keep working.
- Shared: `passwordField`, `PASSWORD_MIN_LENGTH`, `PASSWORD_MAX_BYTES`, `PASSWORD_HINT` in `shared/schemas/auth.ts`.

## Not applicable (nothing to change)

- Stale JWT: the access token carries only `sub`; `/me` and `requireAuth` read the DB.
- `mustChangePassword`: does not exist, so no `/change-password` gate.
- Lockout clearing on reset: no `loginAttempt` model or lockout exists (rate limiting is per IP). Adding lockout would be a new feature; not proposed.
- Link base: already `CLIENT_URL`. `APP_URL` was dropped (see `tasks/TASK.md`, Open Question 13); the PRD does not mention it.

## Decisions on the open questions

1. C1: the response is `{ verified: true, type }` for both token kinds (revised: the first decision dropped `type`, which broke the Telegram link confirmation, so it was restored). Never the user.
2. C5: login, register, reset and the Telegram limiters keep their current numbers and stay on `express-rate-limit`. Only forgot-password (5/IP/h, 3/email/h) and resend + change-email (3/user/h) use the Mongo limiter.
3. C4: no `server/.mail/` driver. Two modes only: console log (dev, no SMTP) and real SMTP.
4. C8: an unverified account always lands on `/verify-email`, even when it is also rejected.
5. C9: the password rule above is final (confirmed by the user).
