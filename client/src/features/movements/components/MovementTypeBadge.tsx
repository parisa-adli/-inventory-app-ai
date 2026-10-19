import { ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MOVEMENT_TYPE_LABELS } from '../format';

const TYPE_BADGES: Record<StockMovementType, { variant: BadgeProps['variant']; icon: LucideIcon; className?: string }> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: { variant: 'success', icon: ArrowDownToLine },
  [STOCK_MOVEMENT_TYPES.SHIP]: { variant: 'info', icon: ArrowUpFromLine },
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: { variant: 'secondary', icon: SlidersHorizontal, className: 'text-muted-foreground' },
};

export function MovementTypeBadge({ type }: { type: StockMovementType }) {
  const { variant, icon: Icon, className } = TYPE_BADGES[type];
  return (
    <Badge variant={variant} className={cn('gap-1 rounded-md font-medium', className)}>
      <Icon className="size-3.5" aria-hidden />
      {MOVEMENT_TYPE_LABELS[type]}
    </Badge>
  );
}
