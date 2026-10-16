# 02 — Categories & Suppliers

Depends on: 01 (needs auth + role-guard working).

## Server
- `Category` model + CRUD routes. Create/edit (`POST`/`PATCH`) are open to staff and admins; `DELETE` is admin only. `DELETE` returns 409 if any `Product` references the category. (Changed 2026-10-16, `CONTRACT-CHANGES.md` C15.)
- `Supplier` model + CRUD routes, same pattern (staff + admin create/edit, admin delete), same 409-on-referenced-by-product rule for `DELETE`.

## Client
- Categories page: shadcn Card grid — title, description, createdAt, product count (aggregate on the server or compute client-side from a products count endpoint). Create/Edit modal (RHF+Zod), Delete with a toast showing the blocking error if products are assigned. The delete action is hidden for staff.
- Suppliers page: same card pattern — name, contactPerson, phone, email, address, notes. Same CRUD/permissions/delete-block behavior.

## Acceptance checklist
- [ ] Staff can view, create and edit on both pages but sees no delete control.
- [ ] Admin can create/edit/delete; deleting a category or supplier with products attached shows a clear blocking error instead of failing silently.
