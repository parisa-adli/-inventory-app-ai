export const STOCK_MOVEMENT_TYPES = {
  RECEIVE: 'receive',
  SHIP: 'ship',
  ADJUST: 'adjust',
} as const;

export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[keyof typeof STOCK_MOVEMENT_TYPES];
