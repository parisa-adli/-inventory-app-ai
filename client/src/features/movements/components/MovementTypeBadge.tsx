import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const TYPE_BADGES: Record<StockMovementType, { label: string; variant: BadgeProps['variant'] }> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: { label: 'Receive', variant: 'secondary' },
  [STOCK_MOVEMENT_TYPES.SHIP]: { label: 'Ship', variant: 'outline' },
  // Adjustments stand out: they are the ones with a reason to read
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: { label: 'Adjustment', variant: 'default' },
};

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  const { label, variant } = TYPE_BADGES[type];
  return <Badge variant={variant}>{label}</Badge>;
}
