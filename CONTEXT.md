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
What a `pending` user sees after signing in: they have a session but no access to data until an admin activates them.

**Session**
One signed-in browser or device, from the moment someone signs in on it until it is signed out: a short-lived access cookie plus a longer-lived refresh cookie that is silently renewed while the browser is used. Renewing never starts a new session; signing in again does. An account can have several sessions at once, and the Profile page lists them with the device, when it signed in and when it was last active. Signing out, **Sign out everywhere**, changing or resetting the password, or being rejected ends it.
_Avoid_: "token" for the whole thing (a token is one cookie's value), "logged in", "device" alone (one device can hold sessions in two browsers).

**Sign out everywhere**
Ends every **Session** of the account at once, including the one used to ask for it; other browsers lose access immediately, not when their cookies run out. The account itself and its sign-in methods are unchanged.
_Avoid_: "log out all", "revoke tokens".

**Sign-in method**
A way into an account: a password, a **Telegram link**, or both. An account must always keep at least one; the last one cannot be removed, by the user or by an admin.
_Avoid_: "credential" in user-facing text, "login method".

**Guest**
A browser with no **Session**. A guest can only sign in, sign up, ask for a password reset, or use an **Emailed link**.
_Avoid_: "logged out", "anonymous".

**Gate**
A state of a signed-in account that keeps it out of the app: an email that is not a **Verified email**, a `pending` account, or a `rejected` one. When several apply, the unverified email comes first, then rejected, then pending.
_Avoid_: "unauthorized", "blocked".

**Gate screen**
The page that explains a **Gate** and what to do next (verify your email, **Awaiting approval**, rejected). A gated user is always sent to theirs, and nowhere else in the app.

**Emailed link**
A single-use, expiring link sent to a user's email address, used to verify the email, to reset the password, or to confirm a **Telegram link**. Using it twice, or a link that never existed, fails as invalid; a link that has expired is told apart so the person can ask for a new one.

## Telegram

**Telegram link**
The association between one account and one Telegram chat. An account has at most one, and a chat belongs to at most one account. It is created by **Telegram signup**, by confirming an **Emailed link**, or from the Profile page by scanning the QR code and entering the **Verification code** while signed in. It is a **Sign-in method**.

**Telegram signup**
Creating an account from a verified Telegram chat: scan the QR code, press Start in the bot, enter the **Verification code** on the website, then give a username and an email. It always yields a `pending` staff account with no password. If the email already has an account, nothing is created or linked until the owner confirms by **Emailed link**.
_Avoid_: "Telegram registration", "webhook signup".

**Telegram sign in**
The same steps as **Telegram signup**, for a chat that already has a **Telegram link**: after the **Verification code** the user is signed in and no details are asked. One flow serves both pages; whether it signs in or signs up depends only on whether the chat is linked.

**Verification code**
A 6-digit code the bot sends to a chat after Start so the person at the browser proves they hold that Telegram account. Valid for 2 minutes, 5 wrong entries, at most 3 new codes and one per minute. Shown to people as "code" or "verification code".
_Avoid_: "OTP" in user-facing text, "PIN", "login code" (it is also used for signup).

## Stock

**Stock movement**
One recorded change to a product's stock: a receive (goods arrive), a ship (goods leave) or an adjustment (a correction up or down, always with a reason). It records the signed change, the quantity after it, the prices at that moment, when it happened and who made it. Movements are never edited or deleted; a mistake is corrected by a new adjustment.
_Avoid_: "transaction", "stock change" for the record itself, "adjust" (the type is `adjustment`).

**Ledger**
All **Stock movements** of a product, taken together. A product's quantity must always equal the sum of its ledger; the ledger is the truth and the stored quantity follows it.
_Avoid_: "history" for the data itself ("Stock History" is the name of the dialog that shows it), "log".

**Opening balance**
The first receive in a product's **Ledger**, bringing in the stock it already had when tracking began. A new product starts at zero, so its stock enters only through movements.

**Reconciliation**
An admin check that compares every product's quantity with the sum of its **Ledger** and lists the products that disagree. On request it repairs them by setting the quantity to the ledger sum; it never writes a movement.
_Avoid_: "audit", "recount" (nothing is physically counted).

**Archived product**
A product retired from the active catalog. It keeps its **Ledger**, stays visible in history, and is frozen: no **Stock movement** of any kind. Archiving is reversible by an admin.
_Avoid_: "deleted", "inactive", "disabled". Deleting is a separate action, possible only for a product with no movements.

**Stock status**
How much of a product is on hand, in three buckets that never overlap: out of stock (0), low stock (1 to 10) and in stock (more than 10).
_Avoid_: "status" alone (a product's status is active or archived).
