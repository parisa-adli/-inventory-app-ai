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
A single-use, expiring link sent to a user's email address, used to verify the email or to reset the password. Using it twice, or after it expires, fails the same way as a link that never existed.
