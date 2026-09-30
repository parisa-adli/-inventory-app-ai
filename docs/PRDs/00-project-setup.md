# 00 — Project Setup

## Server
- Init Express app (`/server`), TypeScript optional but recommended.
- Connect Mongoose to MongoDB via `MONGODB_URI` env var.
- Env vars: `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_DOMAIN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MODE` (webhook|polling), `BREVO_SMTP_HOST`, `BREVO_SMTP_PORT`, `BREVO_SMTP_USER`, `BREVO_SMTP_PASS`, `APP_URL` (for building verification/reset links), `PORT`.
- Global middleware: JSON body parser, cookie parser, CORS (credentials: true, origin = client URL), centralized error handler returning `{ error: { code, message } }`.
- Health check route `GET /api/health`.

## Client
- Vite + React app (`/client`), Tailwind configured, shadcn/ui initialized (button, input, dialog, table, dropdown-menu, badge, toast/sonner, form, select, tabs, card).
- TanStack Query provider at the app root, sane defaults (retry: 1, refetchOnWindowFocus: false is fine for an internal tool).
- Axios or fetch wrapper with `credentials: 'include'` so httpOnly cookies are sent; a response interceptor that calls `/api/auth/refresh` once on a 401 and retries the original request.
- Router (react-router) with route groups: public (login/signup/verify/reset), pending/rejected screens, and the protected app shell (Dashboard/Products/Categories/Suppliers/Stock Movements), plus an admin-only route group.

## Acceptance checklist
- [ ] `GET /api/health` returns 200 from the client dev server via proxy/CORS.
- [ ] Client boots to a blank shell with the router in place; no auth logic yet.
- [ ] Env vars documented in `.env.example` on both client and server.
