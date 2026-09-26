# 06 — Polish & QA

Depends on: 00–05 all working.

- Global responsive pass (desktop-first, but check tablet widths for the tables and dashboard cards); confirm LTR layout throughout.
- Toast coverage audit: every mutation (products, categories, suppliers, stock actions, auth actions, admin user actions) shows a success and an error toast.
- Loading/empty/error states for every TanStack Query-backed list (products, categories, suppliers, movements, dashboard).
- Rate-limit check on auth endpoints (login, register, OTP request/verify, forgot-password) — confirm limits are actually enforced, not just documented.
- Seed script sanity pass: one admin (active), one staff (active), a few categories/suppliers/products spanning in-stock/low-stock/out-of-stock, and enough stock movements (incl. at least one manual adjustment) to make the dashboard chart and feed non-empty.
- README pass: env vars, install, dev run commands for client+server, how to test the Telegram flow locally (polling mode + a test bot token), how to trigger a real email via Brevo SMTP in dev (or a documented dev fallback, e.g. logging the link instead of sending).
- Re-read `docs/PRD.md` end to end once and diff it against what was actually built; list any deviations instead of silently leaving them.
