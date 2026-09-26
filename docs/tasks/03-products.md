# 03 — Products

Depends on: 02 (products reference Category and optionally Supplier).

## Server
- `Product` model per PRD §4: title, sku (unique), category ref, supplier ref (nullable), costPrice, salePrice, quantity, unitOfMeasure, imageUrl, status.
- `GET /api/products` — search (title/sku), filter by category/supplier (`unassigned` = no supplier)/status/stockStatus (computed from quantity vs the global `LOW_STOCK_THRESHOLD` constant — in/low/out), sort (title/quantity/costPrice/salePrice), pagination.
- `POST` / `PUT` — Zod-validated, admin+staff allowed. `DELETE`, `PATCH .../archive`, `PATCH .../unarchive` — admin only.
- `PATCH /api/products/:id/quantity` — body `{ delta: 1 | -1 }`. Applies the delta, clamps at 0 minimum (reject if it would go negative), and **writes a StockMovement** in the same operation (`receive` for +1, `ship` for -1), with `resultingQuantity` snapshotted. Staff+admin allowed.
- `POST /api/products/:id/adjust-stock` — body `{ type: "receive"|"ship"|"adjustment", quantity, note? }`.
  - `receive`: quantity += amount.
  - `ship`: reject with 400 if amount > current quantity; else quantity -= amount.
  - `adjustment`: requires `note` (reason); quantity can move by a signed delta directly, still cannot go below 0.
  - Always writes a `StockMovement` with `resultingQuantity`. Staff+admin allowed.

## Client
- Products page header: search input, Category select, Supplier select (with an "Unassigned" option), Stock Status select (All/In Stock/Low Stock/Out of Stock), Active/Archived tabs.
- TanStack Table: Title, SKU, Category, Supplier ("Unassigned" badge if none), Cost Price, Sale Price, Quantity (with inline − / + buttons wired to the quantity-delta endpoint), Unit, Status badge, Actions menu. Sortable columns via TanStack Table + server-side sort param. Paginated.
- Edit/Create form (RHF+Zod): all fields incl. SKU, unit-of-measure select, image (URL input or simple upload-to-URL placeholder), category select, supplier select (optional).
- Stock History modal: per-product movements table (date, type, quantity, resultingQuantity, note, user).
- Adjust Stock modal: tabs for Receive / Ship / Manual Adjustment; adjustment tab requires a reason field; ship tab blocks/validates against current on-hand.
- Archive/Unarchive/Delete actions visible only to admin.

## Acceptance checklist
- [ ] Staff can create/edit products and adjust stock (all 3 types) but has no archive/delete controls.
- [ ] Inline +/- buttons update quantity and appear immediately in that product's Stock History as a receive/ship of 1.
- [ ] Shipping more than on-hand is rejected with a clear error, both via the modal and (implicitly) never possible via the − button once at 0.
- [ ] Manual adjustment without a reason is rejected client- and server-side.
- [ ] Stock-status filter correctly buckets products using the global low-stock threshold.
- [ ] Products with no supplier show "Unassigned" and are filterable as such.
