import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { MOVEMENT_TYPE_LABELS } from '../format';

const TYPE_VARIANTS: Record<StockMovementType, BadgeProps['variant']> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: 'secondary',
  [STOCK_MOVEMENT_TYPES.SHIP]: 'outline',
  // Adjustments stand out: they are the ones with a reason to read
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: 'default',
};

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  return <Badge variant={TYPE_VARIANTS[type]}>{MOVEMENT_TYPE_LABELS[type]}</Badge>;
}
