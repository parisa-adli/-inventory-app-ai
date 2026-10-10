# Context

Language of the Product Inventory Manager. Terms only; no implementation details.

## Accounts

**Account status**
Where a user stands with the business: `pending` (signed up, not yet decided), `active` (may use the app), `rejected` (blocked; also used to revoke an active user, and reversible by an admin).
_Avoid_: "approved" (the status is `active`), "banned", "disabled".

**Verified email**
The user has proved they own their email address by using the link we sent. Independent of **Account status**: a user can be pending and verified, or pending and unverified. An admin cannot activate an unverified user.
_Avoid_: "confirmed", "activated" (activation is the admin's decision, not the email's).

**Awaiting approval**
What a `pending` user sees after logging in: they have a session but no access to data until an admin activates them.

**Session**
A logged-in browser: a short-lived access cookie plus a longer-lived refresh cookie. Logging out, resetting a password or being rejected ends it.
_Avoid_: "token" for the whole thing (a token is one cookie's value).

**Emailed link**
A single-use, expiring link sent to a user's email address, used to verify the email, to reset the password, or to confirm a **Telegram link**. Using it twice, or after it expires, fails the same way as a link that never existed.

## Telegram

**Telegram link**
The association between one account and one Telegram chat. An account has at most one, and a chat belongs to at most one account. It is created by **Telegram signup**
Creating an account from a verified Telegram chat: scan the QR code, press Start in the bot, enter the **Verification code** on the website, then give a username and an email. It always yields a `pending` staff account with no password. If the email already has an account, nothing is created or linked until the owner confirms by **Emailed link**.
_Avoid_: "Telegram registration", "webhook signup".

**Telegram sign in**
The same steps as **Telegram signup**, for a chat that already has a **Telegram link**: after the **Verification code** the user is signed in and no details are asked. One flow serves both pages; whether it signs in or signs up depends only on whether the chat is linked.

**Verification code**
A 6-digit code the bot sends to a chat after Start so the person at the browser proves they hold that Telegram account. Valid for 2 minutes, 5 wrong entries, at most 3 new codes and one per minute. Shown to people as "code" or "verification code".
_Avoid_: "OTP" in user-facing text, "PIN", "login code" (it is also used for signup).
