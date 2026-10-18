import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '@inventory/shared';

/** What each movement type is called on screen (badges, the type filter). */
export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: 'Receive',
  [STOCK_MOVEMENT_TYPES.SHIP]: 'Ship',
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: 'Adjustment',
};

/** "+5" or "−3" (a real minus sign). */
export const formatDelta = (delta: number) => (delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`);
