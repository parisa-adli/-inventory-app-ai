# 3. Products store an archive timestamp instead of a status

Date: 2026-10-18 · Status: Accepted

## Context

The PRD gives Product a stored `status: active | archived`. Archiving freezes a product: no stock change of any kind, and it leaves the active catalog while keeping its history.

## Decision

Product stores `archivedAt` (a date, or null when active) instead of `status`. The API derives `status: active | archived` from it for responses and still accepts `status` as a list filter. The stock module's atomic guard matches `archivedAt: null`, so archiving and a stock change cannot interleave into a change on an archived product.

## Consequences

- Records when a product was archived at no extra cost, and there is no second field to keep in step.
- Queries filter on `archivedAt` being null or set, never on a stored status. The Phase 2 product-reference helper (category/supplier delete guard) follows the same rule.
- The wire contract still speaks of `status`, so the client is unaffected. The deviation is recorded in `CONTRACT-CHANGES.md`.
