# 05 — Dashboard

Depends on: 04 (needs products + movements data to aggregate).

## Server
- `GET /api/dashboard/summary` — returns: totalProducts (active), totalStockValue (Σ costPrice × quantity, active products), totalStockIncome (Σ salePrice × quantity, active products), lowStockCount, outOfStockCount. Compute on the fly (aggregation pipeline); don't cache-invalidate prematurely — fine to compute per request for this scale.
- `GET /api/dashboard/movements-chart?range=7d|30d|90d` — aggregates `receive` vs `ship` quantities bucketed by day (or week for longer ranges) over the requested range.
- `GET /api/dashboard/alerts` — list of products at/under the low-stock threshold or at 0, sorted worst-first, capped (e.g. top 20) with a link into the Products page filtered accordingly.
- Reuse the existing `GET /api/stock-movements?limit=10` (from task 04) for the "recent movements" feed instead of a new endpoint.

## Client
- Dashboard page (likely the default landing route once active):
  - Card row: Total Products, Total Stock Value, Total Stock Income, Low Stock, Out of Stock.
  - Recent Stock Movements feed (compact list, last ~10, links to the product).
  - Low/Out-of-Stock alert table (product, quantity, threshold, status badge), each row links to that product (pre-filtered Products page).
  - Chart (Recharts line or bar): stock In vs Out over time, with a range selector (7/30/90 days).

## Acceptance checklist
- [ ] Card values match a manual spot-check against a couple of seeded products (cost/sale price × quantity math).
- [ ] Low/out-of-stock alert table matches the same threshold logic used by the Products page filter.
- [ ] Chart correctly separates receive vs ship volume per bucket and updates when the range selector changes.
- [ ] Recent movements feed reflects new movements immediately after an action elsewhere in the app (TanStack Query invalidation wired correctly).
