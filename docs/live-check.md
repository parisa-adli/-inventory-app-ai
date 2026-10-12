# Manual live check: real Telegram bot and real mail

Runs the email-auth and Telegram flows against the real bot and Brevo SMTP (issue #6). Automated tests mock both
transports, so this is the only place real delivery is confirmed. Mark each step `PASS` or `FAIL` in the Result
column and file every failure as its own issue (label `needs-triage`, title `Live check: <step id> <what broke>`).

## Setup (once)
1. `server/.env`: real `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MODE=polling`, `BREVO_SMTP_USER`,
   `BREVO_SMTP_PASS`, and `EMAIL_FROM` set to a **verified Brevo sender**. `CLIENT_URL=http://localhost:5173` so mailed links open the local client.
2. **One polling consumer per bot token.** Stop every other process using this token (a second `npm run dev`,
   a deployed instance, another machine) before starting. Two pollers split the updates and codes will randomly "not arrive".
3. `npm run live-check -- --send-to <your inbox>` must print only `PASS`. It checks the token, the bot username,
   that no webhook owns the bot, the SMTP login, and sends one test mail.
4. `npm run seed`, then `npm run dev`. Watch the server log for `Telegram bot @<name>: polling` exactly once.
5. Have ready: a Telegram account **not yet linked** to any user, two mailboxes you can read (`A`, `B`), and the admin
   login `admin@inventory.local` (see `tasks/TASK.md` > Dev Environment). Give the admin account mailbox `A` if you want to
   receive the admin notification (edit the seeded admin's email in Mongo, or create an admin with your address).

Limits (from `services/telegramAuth.ts`): code valid 2 min, resend cooldown 60 s, 3 resends, 5 wrong codes, 5 failed
profile submissions, QR/session valid 5 min, profile step 10 min.

## Checklist

| ID | Step | Expect | Result |
| --- | --- | --- | --- |
| M1 | Register by email with mailbox `A` | 201; verification mail arrives in `A` from the verified sender; link opens `/verify-email/<token>` | |
| M2 | Click the link | "Email verified"; user is Awaiting Approval; admin notification mail arrives (to the admin address) linking to `/users` | |
| M3 | Click the same link again | Invalid or already-used link message | |
| M4 | Admin approves on `/users` | User reloads and reaches the dashboard | |
| M5 | Forgot password for `A` | Always the generic response; reset mail arrives; link sets a new password (10+ chars, letter + digit); old password refused | |
| M6 | Forgot password for an unknown address | Same generic response; **no** mail arrives | |
| T1 | Login > Telegram tab, scan the QR (or open the deep link), press Start | Bot replies with a 6 digit code | |
| T2 | Enter the code | Asked for username + email (new Telegram account) | |
| T3 | Submit a new email `B` | Account created, signed in as pending; verification mail arrives in `B`; confirming it moves the user to Awaiting Approval | |
| T4 | Sign out, Telegram sign in again with the same Telegram account | Straight in (no profile step) | |
| T5 | New Telegram account (or unlink in Mongo), submit **existing** email `A` | Message that a confirm link was mailed; **nobody signed in**; no second user in Mongo | |
| T6 | Click the confirm link in `A` | Telegram chat attached to the existing account; `emailVerified` unchanged | |
| T7 | Telegram sign in with that account | Signs in as the existing `A` account | |
| W1 | Start a session, enter 4 wrong codes, then the right one | Right code still works; remaining-attempts text counts down | |
| W2 | Start a session, enter 5 wrong codes | Locked (423 `TOO_MANY_ATTEMPTS`); the correct code is now refused; "Start over" gives a fresh session | |
| W3 | Wait 2 min without entering the code, then enter it | Expired message; resend works | |
| R1 | Press resend inside the 60 s cooldown | Refused with the wait time; no new Telegram message | |
| R2 | Resend 3 times (waiting 60 s each), then a 4th time | 4th refused (`RESEND_LIMIT`); each earlier resend delivered a new code and invalidated the old one | |
| R3 | Resend verification mail from the awaiting-approval screen 4 times in an hour | 4th refused (shared budget of 3 per hour with change-email) | |
| X1 | Change email while still unverified (`PATCH /auth/email` from the UI; refused once verified) | New verification mail goes to the **new** address; old link no longer works | |
| X2 | Reject a user, then try to sign in (email and Telegram) | Rejected screen / 403; reactivate restores access | |

## Report
- Date, who ran it, bot username, Brevo sender: _fill in_
- Failures filed as issues: _list numbers_
- Anything skipped and why: _fill in_
