export const STOCK_MOVEMENT_TYPES = {
  RECEIVE: 'receive',
  SHIP: 'ship',
  ADJUSTMENT: 'adjustment',
} as const;

export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[keyof typeof STOCK_MOVEMENT_TYPES];

/** The change a movement makes to the quantity: a ship takes its amount away; receive and adjustment amounts already carry their sign. */
export const signedDelta = (type: StockMovementType, quantity: number): number =>
  type === STOCK_MOVEMENT_TYPES.SHIP ? -quantity : quantity;
