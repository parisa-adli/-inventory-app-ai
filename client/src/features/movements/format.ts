import { STOCK_MOVEMENT_TYPES, type StockMovement, type StockMovementType } from '@inventory/shared';

/** What each movement type is called on screen (badges, the type filter). */
export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: 'Receive',
  [STOCK_MOVEMENT_TYPES.SHIP]: 'Ship',
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: 'Adjustment',
};

/** "+5" or "−3" (a real minus sign). */
export const formatDelta = (delta: number) => (delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`);

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
/** "$1,250.00" */
export const formatMoney = (value: number) => money.format(value);

/**
 * What a movement is worth, as the summary cards count it: a receive brings units in at their unit cost, a ship takes
 * them out at their unit price (income, so positive), and an adjustment is signed at unit cost (a write-off is negative).
 */
export const movementValue = ({ type, delta, unitCost, unitPrice }: StockMovement) =>
  type === STOCK_MOVEMENT_TYPES.SHIP ? Math.abs(delta) * unitPrice : delta * unitCost;
