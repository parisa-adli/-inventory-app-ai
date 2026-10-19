import { STOCK_STATUSES, getStockStatus, type StockStatus } from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const STOCK_BADGES: Record<StockStatus, { label: string; variant: BadgeProps['variant'] }> = {
  [STOCK_STATUSES.IN]: { label: 'In stock', variant: 'success' },
  [STOCK_STATUSES.LOW]: { label: 'Low stock', variant: 'warning' },
  [STOCK_STATUSES.OUT]: { label: 'Out of stock', variant: 'destructive' },
};

/** In stock / Low stock / Out of stock, from the quantity, as a tinted badge with a dot (DESIGN.md §2.2). */
export function StockStatusBadge({ quantity }: { quantity: number }) {
  const { label, variant } = STOCK_BADGES[getStockStatus(quantity)];
  return (
    <Badge variant={variant} className="gap-1.5 rounded-md font-medium">
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </Badge>
  );
}
