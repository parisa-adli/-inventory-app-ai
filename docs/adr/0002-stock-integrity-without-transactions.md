# 2. Stock integrity from an atomic conditional update plus compensation, not transactions

Date: 2026-10-18 · Status: Accepted

## Context

Every stock change must update `Product.quantity` and write a `StockMovement`, quantity must never go negative even when two people ship the last units at once, and the stored quantity must never drift from the sum of the movement history. A multi-document MongoDB transaction would give that directly, but transactions need a replica set: the local development database (`mongodb://localhost:27017/inventory`) is a standalone `mongod`, and the tests would need a replica set as well.

## Decision

The stock module is the only writer of `Product.quantity`, and it does not use transactions:

1. **Atomic guard.** One conditional increment matches the product id, `archivedAt` null and, for a negative delta, `quantity >= |delta|`, and returns the updated document. The movement's `quantityAfter` and price snapshots are read from that document. Two concurrent ships can never both pass the guard for the same units.
2. **Guard miss.** A follow-up read only classifies the failure (not found, then archived, then insufficient stock); integrity never depends on it.
3. **Compensation.** If inserting the movement fails, a compensating increment reverses the delta. If that also fails, the module logs loudly and rethrows the original error.
4. **Reconciliation.** An admin check compares each product's quantity with the sum of its movement deltas, re-checks a mismatch once, and can repair it by setting the quantity to the ledger sum. This catches the double-failure case.

## Consequences

- Works the same on a standalone `mongod` (development, tests on mongodb-memory-server) and on a replica set.
- There is a short window between the increment and the movement insert where the quantity is ahead of the ledger. Reconciliation re-checks before reporting, so an in-flight change is not "fixed".
- The rule in `CLAUDE.md` ("in the same transaction/operation") is met by the guard plus compensation, not by a transaction.
- Only the stock module may write quantity. A static architecture test (part of #27) will enforce this.
