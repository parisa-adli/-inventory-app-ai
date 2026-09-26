# 02 — Categories & Suppliers

Depends on: 01 (needs auth + role-guard working).

## Server
- `Category` model + CRUD routes. Mutations (`POST`/`PUT`/`DELETE`) require `requireRole('admin')`. `DELETE` returns 409 if any `Product` references the category.
- `Supplier` model + CRUD routes, same admin-gated pattern, same 409-on-referenced-by-product rule for `DELETE`.

## Client
- Categories page: shadcn Card grid — title, description, createdAt, product count (aggregate on the server or compute client-side from a products count endpoint). Create/Edit modal (RHF+Zod), Delete with a toast showing the blocking error if products are assigned. All mutation buttons hidden/disabled for staff.
- Suppliers page: same card pattern — name, contactPerson, phone, email, address, notes. Same CRUD/permissions/delete-block behavior.

## Acceptance checklist
- [ ] Staff can view both pages but sees no create/edit/delete controls.
- [ ] Admin can create/edit/delete; deleting a category or supplier with products attached shows a clear blocking error instead of failing silently.
