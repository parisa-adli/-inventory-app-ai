# Product Inventory Manager — PRD (v3)

## 1. Overview

A web-based inventory management tool tracking products, categories, suppliers, and stock movements, with a dashboard, role-based access (Admin/Staff), and dual authentication (email+password, Telegram one-time code), unified under a single account per email address.

**Stack**

- Client: React.js + Vite, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, React Hook Form + Zod, Recharts (dashboard chart)
- Server: Node.js, Express
- Database: MongoDB (Mongoose)
- Bot: Telegram Bot (grammY or node-telegram-bot-api), supports both webhook and long-polling modes; **polling in production**
- Email: Nodemailer + Brevo SMTP (verification links, password-reset links)
- Layout direction: LTR

## 2. Roles, Status & Permissions

**Roles:** `admin`, `staff`
**Status:** `pending`, `active`, `rejected`

| Action                                                       | Staff | Admin |
| ------------------------------------------------------------ | ----- | ----- |
| View products/categories/suppliers/stock movements/dashboard | ✅    | ✅    |
| Create/edit products (incl. assigning an existing supplier)  | ✅    | ✅    |
| Adjust stock — receive / ship / manual adjustment            | ✅    | ✅    |
| Archive/unarchive products                                   | ❌    | ✅    |
| Delete products                                              | ❌    | ✅    |
| Create/edit/delete categories                                | ❌    | ✅    |
| Create/edit/delete suppliers                                 | ❌    | ✅    |
| Activate / reject / revoke users                             | ❌    | ✅    |

- Public self-signup (email+password or Telegram) always creates a `staff` account. The first Admin is created via a seed script; further promotions to `admin` are a manual DB/admin action (no self-serve path).
- `rejected` also covers **revoking** an already-active user; it's reversible — an admin can set them back to `active`.

## 3. Authentication & Identity

**Core principle: one account per person, email is the identity anchor.**

### Signup — two independent paths, no linking required at signup time

1. **Email + password** — standard form (name, email, password). Sends an email-verification link.
2. **Telegram** — the Sign up page shows a QR code / "Open Telegram" button (a `t.me/<bot>?start=<nonce>` deep link). The user presses Start in the bot, which sends a 6-digit one-time code. The user enters the code on the website. Once the code is verified the website asks for a **username and an email** to complete registration; the account is then created with `telegramChatId` linked, and an email-verification link is sent (email is required on this path too).

Both paths create the account with `status: "pending"`, `emailVerified: false`, defaulting to `role: "staff"`.

### Duplicate-email handling (confirmed decision)

- **Registration** (either path) explicitly reveals a duplicate: `"This email is already registered."` — required so the Telegram-merge flow below can work. Accepted account-enumeration trade-off for an internal tool.
- **Password-reset** endpoint stays generic (`"If that email exists, we've sent a link"`) regardless of outcome — no enumeration there.
- If the email entered in the **Telegram signup** form already belongs to an existing (password) account: don't create a second account. Send a verification link to that email; only on clicking it does the system link the new `telegramChatId` to the existing account. Until clicked, nothing changes and nobody is signed in.

### Email verification

- Required on every signup path. A `pending` user **cannot be activated by an Admin until `emailVerified: true`.**
- Verification links are single-use, expiring tokens, sent via Brevo SMTP.

### Login — two methods, either works once `active`

1. **Email + password.**
2. **Telegram one-time code** — the Sign in page's Telegram tab runs the same flow as Telegram signup (QR / deep link -> Start in the bot -> 6-digit code -> enter it on the website). If the Telegram account is linked to a user, that user is signed in. If it is not linked, the website continues with the signup form (username + email), so one flow serves both pages.
   - Policy: the attempt lasts 5 minutes (10 once the code is verified and the signup form is shown). The browser is identified by an httpOnly cookie holding a random session id; the nonce in the deep link is a different secret, so someone who only sees the QR code cannot read or finish the attempt. A nonce works once: a second Start with the same nonce is refused and never overwrites the linked Telegram id.
   - Code: 6 digits, generated with `crypto.randomInt`, stored only as an HMAC bound to the session, valid 2 minutes. Max **5 wrong entries** per code, then the attempt is `LOCKED` and the user must "Start over". Resend: **60 s cooldown**, max **3 resends**; each resend gives a new code and resets the wrong-entry counter. Codes are compared in constant time.
   - *(Decision on 2026-10-10: replaces the earlier "scan a QR code and press Start to log in" flow; the code step proves the person holding the browser is the one holding the Telegram account.)*

A `pending` user can still log in (either method) but is routed to an **"awaiting approval"** screen — no access to data. A `rejected` user sees a rejected/revoked message and cannot proceed until reactivated.

### Password reset

- Email-link based only (Nodemailer + Brevo SMTP): request → generic response → single-use expiring reset link → set new password.
- (Telegram-based reset was considered but superseded — email is the reset channel now that it's the identity anchor.)

### Sessions

- On successful login, issue JWT **access** + **refresh** tokens as **httpOnly cookies**, `Secure` flag (HTTPS only), `SameSite=Strict`.
- Default lifetimes (flagged assumption, unchanged after review): access 15 min, refresh 7 days, with rotation (new refresh token + revoke old one on each use).
- `POST /api/auth/refresh` rotates tokens; `POST /api/auth/logout` clears cookies + revokes the refresh token server-side.

## 4. Data Models

### User

```
{
  _id, name, email (unique, lowercase), passwordHash (optional if telegram-only until they set one),
  role: "admin" | "staff",
  status: "pending" | "active" | "rejected",
  emailVerified: Boolean,
  telegramChatId: String (optional),
  createdAt
}
```

### EmailToken (verification + password reset, single-use)

```
{
  _id, user: ref User,
  type: "verify-email" | "reset-password" | "link-telegram",
  tokenHash: String,
  expiresAt: Date,
  consumed: Boolean,
  createdAt
}
```

### AuthSession (one Telegram sign in / sign up attempt)

```
{
  _id,
  sessionIdHash: String,        // sha256 of the session id held in the browser cookie (unique)
  nonceHash: String,            // sha256 of the nonce in the t.me deep link (unique, single use)
  purpose: "LOGIN" | "SIGNUP",  // set when the code is verified: linked account vs new account
  status: "PENDING" | "AWAITING_OTP" | "AWAITING_PROFILE" | "COMPLETED" | "EXPIRED" | "LOCKED",
  user: ref User (optional),    // set when the attempt signed someone in or created the account
  attempts: Number,             // wrong entries for the current code (max 5)
  resends: Number,              // codes re-sent (max 3)
  completeAttempts: Number,     // submissions of the username + email form (max 5)
  expiresAt: Date,              // createdAt + 5 min (TTL index); +10 min from the moment the code is verified
  lastSentAt: Date,             // resend cooldown (60 s)
  otpExpiresAt: Date,           // lastSentAt + 2 min
  otpHash: String,              // HMAC of the code; the plain code is never stored
  prefillDisplayName: String,   // Telegram first + last name, prefilled in the signup form
  telegramId: Number,           // indexed; stored on User as String `telegramChatId` (private chat id == user id)
  telegramUsername: String,     // may be absent
  createdAt, updatedAt
}
```

### RefreshToken

```
{ _id, user: ref User, tokenHash, expiresAt, revoked: Boolean, createdAt }
```

### Category

```
{ _id, title, description, createdAt }
```

Cannot be archived. Deletion blocked (409) if any product references it.

### Supplier

```
{ _id, name, contactPerson, phone, email, address, notes, createdAt }
```

Deletion blocked (409) if any product references it.

### Product

```
{
  _id, title, sku (unique),
  category: ref Category,
  supplier: ref Supplier | null,      // optional — see rules below
  costPrice: Number,                   // backs "stock value"
  salePrice: Number,                   // backs "stock income"
  quantity: Number,
  unitOfMeasure: "pcs" | "kg" | "box" | "l" | "m",  // extendable enum
  imageUrl: String (optional),
  status: "active" | "archived",
  createdAt, updatedAt
}
```

### StockMovement — **source of truth**; every quantity change must write one

```
{
  _id, product: ref Product,
  type: "receive" | "ship" | "adjustment",
  quantity: Number,          // magnitude for receive/ship; signed delta for adjustment
  resultingQuantity: Number, // snapshot of product.quantity right after this movement
  note: String,               // optional for receive/ship, REQUIRED (reason) for adjustment
  user: ref User,              // who performed it
  createdAt
}
```

## 5. Business Rules

- **Every stock change** (ship/receive modal, manual adjustment, inline +/- buttons) writes a `StockMovement`; `product.quantity` is a live cache always kept in sync with it.
- Inline table +/- buttons: +1 → `receive` movement qty 1; −1 → `ship` movement qty 1.
- **Ship cannot exceed on-hand quantity** — reject with an error if it would take quantity below 0. Same guard applies to a negative `adjustment` delta.
- **Manual adjustment** requires a `note` (reason) and can move quantity up or down directly (e.g. correcting a miscount, damage write-off).
- Category/Supplier deletion blocked (409) while any product references them.
- Categories cannot be archived (only products can).
- **Supplier is optional on a product.** Products with no supplier show as "Unassigned" in the table and are filterable that way. Staff or Admin can assign/change a product's supplier at any time via the product edit form (assigning ≠ managing supplier records, which stays admin-only).
- Archive/unarchive: admin-only, reversible, doesn't touch movement history; archived products excluded from default list, visible under an "Archived" tab.

## 6. Pages & Features

### 6.1 Dashboard

- Cards: Total Products, Total Stock Value (Σ costPrice × quantity, active products), Total Stock Income potential (Σ salePrice × quantity, active products), Low Stock count, Out of Stock count.
- Recent Stock Movements feed (latest N, all types).
- Low/Out-of-Stock alert table (products at or below threshold, or at 0).
- Chart: stock In vs Out over time (received vs shipped quantities, aggregated by day/week over a selectable range) — Recharts.

### 6.2 Products

- Header: search (title/SKU), category filter, supplier filter (incl. "Unassigned"), stock-status filter (All/In Stock/Low Stock/Out of Stock), Active/Archived toggle.
- TanStack Table: Title, SKU, Category, Supplier, Cost Price, Sale Price, Quantity (inline − / +), Unit, Status, Actions. Sortable: Title, Quantity, Cost/Sale Price. Paginated.
- Row actions: Edit (RHF+Zod, incl. SKU, unit, image, cost/sale price, category, supplier), Archive/Unarchive (admin only), Delete (admin only), Stock History modal (this product's movements incl. adjustments), Adjust Stock modal (Receive / Ship / Manual Adjustment tabs — adjustment requires a reason).

### 6.3 Categories

Cards (title, description, created date, product count). Full CRUD, admin only. Delete blocked if products assigned. Cannot be archived.

### 6.4 Suppliers

Same card pattern (name, contact person, phone, email, address, notes). Full CRUD, admin only. Delete blocked if products assigned.

### 6.5 Stock Movements

Global read-only table: Date, Product, Type (receive/ship/adjustment), Quantity, Resulting Quantity, Note/Reason, User. Filters: product, type, date range. Paginated.

### 6.6 Auth Pages

- Sign in: `Email | Telegram` tabs. The Telegram tab runs the Telegram flow below.
- Signup: `Email | Telegram` tabs. The Email tab is the email+password form; the Telegram tab runs the same Telegram flow.
- Telegram flow (both pages, `docs/design/signin-telegram.png` -> `docs/design/enter-otp.png`): **QR step** (QR code, "Open Telegram", `Expires in m:ss`, "Start over"; on expiry the code is replaced by a message and "Start over") -> **code step** (6 boxes, `Expires in m:ss`, `Resend code (0:49)`, "Start over"; inline errors for wrong, expired and locked) -> **details step**, only for a Telegram account that is not linked yet (Username prefilled from the Telegram name, Email) -> signed in, or "check your email" when the email already had an account.
- Email verification landing page (consumes the link token).
- Forgot/reset password pages.
- "Awaiting approval" screen (pending, post-login).
- "Rejected/revoked" screen.
- Admin: "Pending Users" panel (activate/reject, blocked until `emailVerified`), and a users list to revoke/reactivate active users.

## 7. API Endpoints (suggested)

```
Auth
POST /api/auth/register                 (email+password; explicit DUPLICATE_EMAIL on conflict)
POST /api/auth/login                    (email+password)
POST /api/auth/telegram/start           (creates an AuthSession, sets the session cookie -> deepLink, expiresAt)
GET  /api/auth/telegram/status          (cookie -> status, otpExpiresAt, resendAvailableAt, prefillDisplayName)
POST /api/auth/telegram/verify          ({ code } -> signed in, or AWAITING_PROFILE for a new Telegram account)
POST /api/auth/telegram/resend          (new code to the linked Telegram account; 60 s cooldown, max 3)
POST /api/auth/telegram/complete        ({ name, email } -> account created + signed in, or confirm link emailed)
POST /api/auth/refresh` rotates tokens; `POST /api/auth/logout` clears cookies + revokes the refresh token server-side.

## 4. Data Models

### User

```
{
  _id, name, email (unique, lowercase), passwordHash (optional if telegram-only until they set one),
  role: "admin" | "staff",
  status: "pending" | "active" | "rejected",
  emailVerified: Boolean,
  telegramChatId: String (optional),
  createdAt
}
```

### EmailToken (verification + password reset, single-use)

```
{
  _id, user: ref User,
  type: "verify-email" | "reset-password" | "link-telegram",
  tokenHash: String,
  expiresAt: Date,
  consumed: Boolean,
  createdAt
}
```

### AuthSession (one Telegram sign in / sign up attempt)

```
{
  _id,
  sessionIdHash: String,        // sha256 of the session id held in the browser cookie (unique)
  nonceHash: String,            // sha256 of the nonce in the t.me deep link (unique, single use)
  purpose: "LOGIN" | "SIGNUP",  // set when the code is verified: linked account vs new account
  status: "PENDING" | "AWAITING_OTP" | "AWAITING_PROFILE" | "COMPLETED" | "EXPIRED" | "LOCKED",
  user: ref User (optional),    // set when the attempt signed someone in or created the account
  attempts: Number,             // wrong entries for the current code (max 5)
  resends: Number,              // codes re-sent (max 3)
  completeAttempts: Number,     // submissions of the username + email form (max 5)
  expiresAt: Date,              // createdAt + 5 min (TTL index); +10 min from the moment the code is verified
  lastSentAt: Date,             // resend cooldown (60 s)
  otpExpiresAt: Date,           // lastSentAt + 2 min
  otpHash: String,              // HMAC of the code; the plain code is never stored
  prefillDisplayName: String,   // Telegram first + last name, prefilled in the signup form
  telegramId: Number,           // indexed; stored on User as String `telegramChatId` (private chat id == user id)
  telegramUsername: String,     // may be absent
  createdAt, updatedAt
}
```

### RefreshToken

```
{ _id, user: ref User, tokenHash, expiresAt, revoked: Boolean, createdAt }
```

### Category

```
{ _id, title, description, createdAt }
```

Cannot be archived. Deletion blocked (409) if any product references it.

### Supplier

```
{ _id, name, contactPerson, phone, email, address, notes, createdAt }
```

Deletion blocked (409) if any product references it.

### Product

```
{
  _id, title, sku (unique),
  category: ref Category,
  supplier: ref Supplier | null,      // optional — see rules below
  costPrice: Number,                   // backs "stock value"
  salePrice: Number,                   // backs "stock income"
  quantity: Number,
  unitOfMeasure: "pcs" | "kg" | "box" | "l" | "m",  // extendable enum
  imageUrl: String (optional),
  status: "active" | "archived",
  createdAt, updatedAt
}
```

### StockMovement — **source of truth**; every quantity change must write one

```
{
  _id, product: ref Product,
  type: "receive" | "ship" | "adjustment",
  quantity: Number,          // magnitude for receive/ship; signed delta for adjustment
  resultingQuantity: Number, // snapshot of product.quantity right after this movement
  note: String,               // optional for receive/ship, REQUIRED (reason) for adjustment
  user: ref User,              // who performed it
  createdAt
}
```

## 5. Business Rules

- **Every stock change** (ship/receive modal, manual adjustment, inline +/- buttons) writes a `StockMovement`; `product.quantity` is a live cache always kept in sync with it.
- Inline table +/- buttons: +1 → `receive` movement qty 1; −1 → `ship` movement qty 1.
- **Ship cannot exceed on-hand quantity** — reject with an error if it would take quantity below 0. Same guard applies to a negative `adjustment` delta.
- **Manual adjustment** requires a `note` (reason) and can move quantity up or down directly (e.g. correcting a miscount, damage write-off).
- Category/Supplier deletion blocked (409) while any product references them.
- Categories cannot be archived (only products can).
- **Supplier is optional on a product.** Products with no supplier show as "Unassigned" in the table and are filterable that way. Staff or Admin can assign/change a product's supplier at any time via the product edit form (assigning ≠ managing supplier records, which stays admin-only).
- Archive/unarchive: admin-only, reversible, doesn't touch movement history; archived products excluded from default list, visible under an "Archived" tab.

## 6. Pages & Features

### 6.1 Dashboard

- Cards: Total Products, Total Stock Value (Σ costPrice × quantity, active products), Total Stock Income potential (Σ salePrice × quantity, active products), Low Stock count, Out of Stock count.
- Recent Stock Movements feed (latest N, all types).
- Low/Out-of-Stock alert table (products at or below threshold, or at 0).
- Chart: stock In vs Out over time (received vs shipped quantities, aggregated by day/week over a selectable range) — Recharts.

### 6.2 Products

- Header: search (title/SKU), category filter, supplier filter (incl. "Unassigned"), stock-status filter (All/In Stock/Low Stock/Out of Stock), Active/Archived toggle.
- TanStack Table: Title, SKU, Category, Supplier, Cost Price, Sale Price, Quantity (inline − / +), Unit, Status, Actions. Sortable: Title, Quantity, Cost/Sale Price. Paginated.
- Row actions: Edit (RHF+Zod, incl. SKU, unit, image, cost/sale price, category, supplier), Archive/Unarchive (admin only), Delete (admin only), Stock History modal (this product's movements incl. adjustments), Adjust Stock modal (Receive / Ship / Manual Adjustment tabs — adjustment requires a reason).

### 6.3 Categories

Cards (title, description, created date, product count). Full CRUD, admin only. Delete blocked if products assigned. Cannot be archived.

### 6.4 Suppliers

Same card pattern (name, contact person, phone, email, address, notes). Full CRUD, admin only. Delete blocked if products assigned.

### 6.5 Stock Movements

Global read-only table: Date, Product, Type (receive/ship/adjustment), Quantity, Resulting Quantity, Note/Reason, User. Filters: product, type, date range. Paginated.

### 6.6 Auth Pages

- Sign in: `Email | Telegram` tabs. The Telegram tab runs the Telegram flow below.
- Signup: `Email | Telegram` tabs. The Email tab is the email+password form; the Telegram tab runs the same Telegram flow.
- Telegram flow (both pages, `docs/design/signin-telegram.png` -> `docs/design/enter-otp.png`): **QR step** (QR code, "Open Telegram", `Expires in m:ss`, "Start over"; on expiry the code is replaced by a message and "Start over") -> **code step** (6 boxes, `Expires in m:ss`, `Resend code (0:49)`, "Start over"; inline errors for wrong, expired and locked) -> **details step**, only for a Telegram account that is not linked yet (Username prefilled from the Telegram name, Email) -> signed in, or "check your email" when the email already had an account.
- Email verification landing page (consumes the link token).
- Forgot/reset password pages.
- "Awaiting approval" screen (pending, post-login).
- "Rejected/revoked" screen.
- Admin: "Pending Users" panel (activate/reject, blocked until `emailVerified`), and a users list to revoke/reactivate active users.

## 7. API Endpoints (suggested)

```
Auth
POST /api/auth/register                 (email+password; explicit DUPLICATE_EMAIL on conflict)
POST /api/auth/telegram/signup-webhook  (bot-triggered; explicit duplicate handling -> sends merge-verification email)
POST /api/auth/login                    (email+password)
POST /api/auth/telegram/login           (creates a QR login attempt -> deepLink, pollToken, expiresAt)
POST /api/auth/telegram/login/poll      (pollToken -> pending | unlinked | expired | approved + tokens)
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
GET  /api/auth/verify-email/:token
POST /api/auth/forgot-password          (always generic response)
POST /api/auth/reset-password/:token

Users (admin)
GET   /api/users?status=pending
PATCH /api/users/:id/activate           (blocked if !emailVerified)
PATCH /api/users/:id/reject
PATCH /api/users/:id/reactivate

Categories / Suppliers
GET/POST/PUT/DELETE /api/categories     (mutations admin only)
GET/POST/PUT/DELETE /api/suppliers      (mutations admin only)

Products
GET    /api/products   (search, category, supplier, status, stockStatus, sort, page)
POST   /api/products
PUT    /api/products/:id
DELETE /api/products/:id                (admin)
PATCH  /api/products/:id/archive        (admin)
PATCH  /api/products/:id/unarchive      (admin)
PATCH  /api/products/:id/quantity       (body: { delta: 1 | -1 })
POST   /api/products/:id/adjust-stock   (body: { type: "receive"|"ship"|"adjustment", quantity, note? })

Stock Movements
GET /api/stock-movements                (product, type, dateFrom, dateTo, page)
GET /api/products/:id/stock-movements

Dashboard
GET /api/dashboard/summary              (cards)
GET /api/dashboard/movements-chart       (in vs out over time)
GET /api/dashboard/alerts                (low/out-of-stock table)
```

## 8. Non-Functional Notes

- Zod schemas shared/mirrored client (RHF resolver) ↔ server (request validation).
- TanStack Query for all server-state.
- Pagination on Products, Stock Movements.
- Toast on every mutation.
- Responsive, desktop-first, LTR layout.
- Rate-limit auth endpoints (login, register, every Telegram auth route) against brute force; the per-session attempt, resend and form-submission caps are the main control on the code.

## 9. Out of Scope (v1)

- Multi-warehouse / location tracking
- Barcode scanning
- Purchase orders beyond the supplier link on a product
- SMS-based OTP (the Telegram one-time code is in scope)
