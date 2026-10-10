# 01 — Identity & Auth

> **Superseded in part (2026-10-10):** Telegram sign in and sign up are one flow: QR / deep link -> Start in the bot -> 6-digit code entered on the website -> (new Telegram accounts only) username + email. The models are `AuthSession` (not `OtpCode`/`TelegramLogin`) and the routes are `/api/auth/telegram/{start,status,verify,resend,complete}`; there is no `/auth/otp/*` route. See `docs/PRD.md` §3-§4, `tasks/TASK.md` (Part C) and `docs/design/{signin-telegram,enter-otp}.png`. The OTP lines below are kept for history only.

Depends on: 00. Nothing else in the app should be built until this works end to end.

## Server

**Models:** `User`, `EmailToken`, `OtpCode`, `RefreshToken` — exactly as in `docs/PRD.md` §4.

**Register (email+password)** — `POST /api/auth/register`
- Body: name, email, password (Zod-validated).
- If email already exists → 409 with an explicit `DUPLICATE_EMAIL` error (confirmed trade-off, not generic).
- Else: create User (`status: pending`, `role: staff`, `emailVerified: false`), hash password, create an `EmailToken` (`type: verify-email`), email the verification link via Brevo SMTP.

**Telegram signup webhook** — `POST /api/auth/telegram/signup-webhook`
- Called by the bot after it collects name + email from the user in chat.
- If email doesn't exist yet → create User (`status: pending`, `role: staff`, `emailVerified: false`, `telegramChatId` set), send verification email.
- If email already belongs to an existing account → do NOT create a duplicate or link yet. Create an `EmailToken` (`type: link-telegram`) carrying the new `telegramChatId`, email a "confirm this is you" link to that address. Only on click does the chatId get attached to the existing account.

**Email verification** — `GET /api/auth/verify-email/:token`
- Consumes the token, sets `emailVerified: true` (or performs the pending telegram-link merge for `link-telegram` tokens). Single-use, expiring.

**Login (password)** — `POST /api/auth/login`
- Validate credentials. If `status === "rejected"` → 403 rejected message. If `status === "pending"` → still issue tokens but the client will route to the awaiting-approval screen based on `/api/auth/me`. If active → normal.

**OTP login** — `POST /api/auth/otp/request` (email → looks up `telegramChatId`, sends 6-digit code via bot) and `POST /api/auth/otp/verify` (email+code → tokens). Enforce: 2 min expiry, max 3 attempts then invalidate, 60s resend cooldown. Rate-limit both routes.

**Sessions**
- On any successful login/verify, issue access+refresh JWTs as httpOnly, Secure, SameSite=Strict cookies. Access 15 min, refresh 7 days, rotate refresh on every `/api/auth/refresh` call (invalidate the old `RefreshToken` doc, issue a new one).
- `GET /api/auth/me` returns `{ id, name, email, role, status, emailVerified }` — this is what the client uses to route pending/rejected/active users.
- `POST /api/auth/logout` clears both cookies and revokes the refresh token.

**Password reset**
- `POST /api/auth/forgot-password` — ALWAYS returns a generic 200 regardless of whether the email exists (no enumeration here, unlike registration). If it exists, create an `EmailToken` (`type: reset-password`) and email the link.
- `POST /api/auth/reset-password/:token` — consumes token, sets new password hash.

**Admin user management**
- `GET /api/users?status=pending` (admin only).
- `PATCH /api/users/:id/activate` — admin only; **reject with 400 if `emailVerified` is false.**
- `PATCH /api/users/:id/reject` — admin only; also usable to revoke an already-active user (reversible).
- `PATCH /api/users/:id/reactivate` — admin only, sets a rejected user back to active.

**Middleware**
- `requireAuth` — verifies access token from cookie, attaches `req.user`.
- `requireRole('admin')` — 403 if not admin.
- `requireActive` — 403 (or redirect signal) if `req.user.status !== 'active'`, used on all data routes except `/auth/*` and `/users/*` admin actions.

## Client
- Pages: Login (password tab + "Login with Telegram OTP" tab with email→code two-step), Register (email+password form), a static "Start the bot to sign up with Telegram" instructions page with a deep link, Verify-Email landing page, Forgot Password, Reset Password.
- Auth context/hook backed by `GET /api/auth/me` (TanStack Query), used to gate the router: unauthenticated → public routes; `pending` → Awaiting Approval screen; `rejected` → Rejected screen; `active` → app shell.
- Admin "Pending Users" panel: table of pending users, Activate (disabled + tooltip if `emailVerified` is false) / Reject actions. Separate panel or filter to revoke/reactivate active users.
- All forms via React Hook Form + Zod.

## Acceptance checklist
- [ ] Register with a new email → pending, unverified; verification email arrives (or is logged in dev) and clicking it sets emailVerified.
- [ ] Register again with the same email → explicit duplicate error, not generic.
- [ ] Telegram signup with a brand-new email → pending user created, verification email sent.
- [ ] Telegram signup with an email that already has a password account → no duplicate created; confirmation email sent; clicking it links the chatId to the existing account.
- [ ] Login works via password and via Telegram OTP once active.
- [ ] OTP enforces 2 min expiry, 3 attempts, 60s resend cooldown.
- [ ] Pending user can log in but only sees the awaiting-approval screen.
- [ ] Admin cannot activate a user whose email isn't verified.
- [ ] Rejected user is blocked; admin can reactivate them.
- [ ] Access token expires and silently refreshes via the refresh cookie; logout clears both cookies.
- [ ] Forgot-password always returns the same generic response whether or not the email exists.
