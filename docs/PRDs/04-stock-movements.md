# 04 — Stock Movements Page

Depends on: 03 (movements are already being written by product actions; this task is the global read surface).

## Server
- `GET /api/stock-movements` — filters: product, type (receive/ship/adjustment), dateFrom/dateTo; pagination; sorted newest first. Populate product title/sku and user name for display.
- `GET /api/products/:id/stock-movements` — same shape, scoped to one product (used by the product Stock History modal from task 03, confirm it's wired to this endpoint).

## Client
- Stock Movements page: TanStack Table — Date, Product, Type (badge), Quantity, Resulting Quantity, Note/Reason, User. Filter controls (product select, type select, date range picker). Paginated. Read-only — no row actions.

## Acceptance checklist
- [ ] Every movement created anywhere in the app (inline +/-, receive/ship/adjustment modal) shows up here with the correct user attributed.
- [ ] Filtering by type=adjustment shows the reason in the Note column; receive/ship show it only if one was entered.
- [ ] Date-range filter works against createdAt.
