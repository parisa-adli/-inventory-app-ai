import { ACCOUNT_STATUS, STOCK_MOVEMENT_TYPES, USER_ROLES, signedDelta, type StockMovementType } from '../constants';
import type { SeedProduct } from './products';
import { seedUsers } from './users';

/**
 * Seed stock movements (#38), generated rather than written by hand: an opening balance about 90 days back,
 * then receives, ships and the odd adjustment, ending on each product's `targetQuantity`. The seed replays
 * them in order through the stock module, so every seeded quantity is a ledger sum like real stock.
 *
 * Deterministic: each product's ledger comes from a fixed-seed generator keyed by its SKU, and the dates are
 * whole days before the UTC day of `now`, so two seeds on the same day produce identical movements.
 */
export interface SeedMovement {
  productRef: string;
  type: StockMovementType;
  /** As the stock module takes it: positive for receive / ship, signed for an adjustment. */
  quantity: number;
  note: string | null;
  userRef: string;
  occurredAt: Date;
}

/** How far back the opening balances are. */
const SEED_HISTORY_DAYS = 90;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

const OPENING_BALANCE_USER = seedUsers.find((user) => user.role === USER_ROLES.ADMIN)!.email;
const STOCK_KEEPERS = seedUsers.filter((user) => user.status === ACCOUNT_STATUS.ACTIVE).map((user) => user.email);

const WRITE_OFF_REASONS = [
  'Cycle count, aisle 4: units found crushed under a collapsed pallet. Written off; photos attached to the damage report.',
  'Water damage after the roof leak over bay C. Packaging soaked and unsellable; disposed of per the facilities ticket.',
  'Customer return inspected and failed QA (missing parts). Not resellable, scrapped instead of restocked.',
  'Quarterly stock take: count came in lower than the system. Likely an unrecorded sample given to a site visit.',
];
const FOUND_REASONS = [
  'Quarterly stock take: extra units found mislabelled in the overflow bin. Relabelled and added back.',
  'Supplier over-delivered on the last purchase order; they confirmed in writing that we can keep the extra units.',
  'Returned demo stock from the sales team, checked complete and in original packaging.',
];

/** FNV-1a: a stable 32-bit seed from a SKU. */
const hashSeed = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
};

/** mulberry32: a small seeded generator of numbers in [0, 1). */
const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
};

const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

const generateLedger = (product: SeedProduct, today: number): SeedMovement[] => {
  const random = seededRandom(hashSeed(product.sku));
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  /** A time on the given day, inside the given working hours. */
  const at = (daysAgo: number, fromHour: number, toHour: number) =>
    new Date(today - daysAgo * DAY_MS + between(fromHour, toHour - 1) * HOUR_MS + between(0, 59) * MINUTE_MS);

  const movements: SeedMovement[] = [];
  let onHand = 0;
  const add = (type: StockMovementType, quantity: number, note: string | null, userRef: string, occurredAt: Date) => {
    movements.push({ productRef: product.sku, type, quantity, note, userRef, occurredAt });
    onHand += signedDelta(type, quantity);
  };
  const salesOrder = () => `Sales order SO-${between(10000, 19999)}`;
  const purchaseOrder = () => `PO-${between(2400, 2999)}${product.supplierRef ? ` from ${product.supplierRef}` : ', local purchase'}`;

  // A product's usual stock, its daily chance of an order, and how big an order is
  const usualStock = Math.round(Math.max(product.targetQuantity, 12) * (1.5 + random() * 1.5));
  const shipChance = 0.25 + random() * 0.35;
  const largestShip = Math.max(1, Math.round(usualStock * 0.15));

  add(STOCK_MOVEMENT_TYPES.RECEIVE, usualStock, 'Opening balance', OPENING_BALANCE_USER, at(SEED_HISTORY_DAYS, 8, 9));

  for (let daysAgo = SEED_HISTORY_DAYS - 1; daysAgo >= 2; daysAgo--) {
    if (onHand > 0 && random() < shipChance) {
      const quantity = Math.min(onHand, between(1, largestShip));
      add(STOCK_MOVEMENT_TYPES.SHIP, quantity, salesOrder(), pick(STOCK_KEEPERS), at(daysAgo, 9, 13));
    }
    if (onHand < usualStock * 0.3 && random() < 0.5) {
      add(STOCK_MOVEMENT_TYPES.RECEIVE, usualStock - onHand + between(0, largestShip), purchaseOrder(), pick(STOCK_KEEPERS), at(daysAgo, 13, 16));
    }
    if (random() < 0.015) {
      const writeOff = onHand >= 3 && random() < 0.6;
      const quantity = writeOff ? -between(1, Math.min(3, onHand)) : between(1, 3);
      add(STOCK_MOVEMENT_TYPES.ADJUSTMENT, quantity, pick(writeOff ? WRITE_OFF_REASONS : FOUND_REASONS), pick(STOCK_KEEPERS), at(daysAgo, 16, 18));
    }
  }

  // Yesterday's movement lands the ledger on the target
  const gap = product.targetQuantity - onHand;
  if (gap < 0) add(STOCK_MOVEMENT_TYPES.SHIP, -gap, salesOrder(), pick(STOCK_KEEPERS), at(1, 9, 17));
  if (gap > 0) add(STOCK_MOVEMENT_TYPES.RECEIVE, gap, purchaseOrder(), pick(STOCK_KEEPERS), at(1, 9, 17));

  return movements;
};

/** Every product's ledger, oldest first per product. Never-stocked products have none. */
export const generateSeedMovements = (products: readonly SeedProduct[], now: Date): SeedMovement[] => {
  const today = startOfUtcDay(now);
  return products.filter((product) => !product.neverStocked).flatMap((product) => generateLedger(product, today));
};
