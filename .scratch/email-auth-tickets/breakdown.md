# Email-auth follow-up tickets: decisions and breakdown

Status: **approved, NOT published.** Publish with `/to-tickets` (or by hand with `gh issue create`) after `/clear`.
Tracker: GitHub Issues via `gh` (`docs/agents/issue-tracker.md`). Repo remote: `origin` -> `parisa-adli/-inventory-app-ai`.
Label for every ticket: `ready-for-agent` (decision 3).

## Decisions
1. Tickets 3 and 4 (Part D) stay **separate**.
2. The **code review happens before the merge** (it is ticket 1 and blocks the merge).
3. The manual live check (ticket 6) is labelled `ready-for-agent`, not `ready-for-human`.
4. GitHub CLI installed (winget, v2.102.0). **Not yet logged in**; run `gh auth login` before publishing.

## Context to carry over
- `email-auth` @ `3c2add1` holds C1-C8 (email flow). `telegram-otp-auth` @ `e436673` holds the Telegram one-time-code flow. Neither is merged or pushed.
- A merge stops on 7 files (rate limiter exports, auth route imports, `authApi` imports, `Login` page, `telegramSignup` imports, `01-identity-auth.md`, `TASK.md`). Resolve by intent: keep the Telegram routes/limits, keep the email-auth Mongo limiter, `{ verified, type }`, and 10+ password rule.
- Decided behaviour: unverified users go to `/verify-email`, then Awaiting Approval while pending; password rule is 10+ chars with a letter and a digit (max 72 bytes); verify response is `{ verified: true, type }`.
- Part D (admin approval) does not exist yet; the admin notification mail links to `/users`.
- Contract and rationale: `CONTRACT-CHANGES.md`, `tasks/TASK.md` ("Email flow revision").

## Tickets (dependency order)

### 1. Review the email-auth work against the contract
**Blocked by:** None (can start immediately)
**What to build:** A `/code-review` of everything on `email-auth` since `main`, checked against `CONTRACT-CHANGES.md` (C1-C8), the PRD and the existing tests. Output is a findings list; each real finding becomes its own small follow-up ticket. Nothing is fixed inside this ticket.
- [ ] Review covers server, shared types, client and docs
- [ ] Every finding is classified: blocks merge / can follow merge
- [ ] Blocking findings are filed as tickets that block ticket 2

### 2. Merge `telegram-otp-auth` into `email-auth`
**Blocked by:** 1 (and any blocking findings it files)
**What to build:** One branch where email and Telegram sign up / sign in both work: all conflicts resolved by intent, shared types and API contracts agreed, docs consistent.
- [ ] Typecheck, lint, server tests, build and Playwright all pass on the merged branch
- [ ] Telegram OTP flow tests (wrong codes, resend limits, expiry) still pass
- [ ] `TASK.md` / PRD describe the merged behaviour; no duplicated sections

### 3. Admin approves or rejects a pending user
**Blocked by:** 2
**What to build:** A Users page for admins listing pending users. Activate is refused (400, and disabled with a tooltip) while `emailVerified` is false; reject is allowed. The user then gets the app or the Rejected screen on their next load. The admin notification mail's `/users` link opens this page.
- [ ] Server routes are guarded by auth + admin role + Zod validation
- [ ] Activating an unverified user is rejected server-side
- [ ] Toasts on every mutation; pagination on the list
- [ ] Tests cover the guard, status changes and the client states

### 4. Admin revokes and reactivates users
**Blocked by:** 3
**What to build:** A users list for active and rejected accounts with revoke (active to rejected) and reactivate (rejected to active), reversible as the PRD requires.
- [ ] Revoked users lose access on their next request; sessions keep working only per existing rules
- [ ] Reactivated users can sign in again
- [ ] Tests cover both transitions and the admin-only guard

### 5. Journey test: sign up, verify, approve, in
**Blocked by:** 3
**What to build:** A server-backed end-to-end test for both the email and the Telegram sign-up paths: account stays pending, `/verify-email` then Awaiting Approval, then the dashboard once an admin approves.
- [ ] Runs against a real server and test database, not stubs
- [ ] Covers email sign up and Telegram sign up
- [ ] Asserts stored status and verification state at each step

### 6. Manual live check with the real bot and mail
**Blocked by:** 2
**What to build:** Run the real flows end to end: Telegram new email, existing-email merge, wrong codes and lockout, resend limits; and configure Brevo SMTP to confirm real delivery of verification, reset and admin mails. Note: needs the user's bot token and SMTP credentials, so an agent can only prepare the checklist and script.
- [ ] Checklist written and each step marked pass/fail
- [ ] Only one polling consumer per bot token during the run
- [ ] Failures are filed as separate tickets
