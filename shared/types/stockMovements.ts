import type { StockMovementType } from '../constants/stock-movement-types';
import type { Paginated } from './catalog';

/** A ledger entry as the API sends it (POST /api/stock-movements, and the movements list). */
export interface StockMovement {
  id: string;
  type: StockMovementType;
  /** Signed: +5 received, −3 shipped or written off. */
  delta: number;
  quantityAfter: number;
  /** The product's cost and sale price when the movement happened. */
  unitCost: number;
  unitPrice: number;
  note: string | null;
  occurredAt: string;
  product: { id: string; title: string; sku: string; archived: boolean };
  user: { id: string; name: string };
}

/** GET /api/stock-movements */
export type StockMovementsPage = Paginated<StockMovement>;

/** A product whose quantity disagrees with the sum of its movement deltas. */
export interface ReconcileMismatch {
  productId: string;
  sku: string;
  quantity: number;
  ledgerSum: number;
  /** Only with `fix=true`: whether the quantity was set to the ledger sum. */
  fixed?: boolean;
}

/** GET /api/admin/reconcile */
export interface ReconcileReport {
  checked: number;
  mismatches: ReconcileMismatch[];
}
