import { Link } from 'react-router';
import { STOCK_STATUSES, type DashboardSummary, type StockStatus } from '@inventory/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoney } from '@/lib/money';
import { useDashboardSummary } from '../hooks/useDashboard';
import { productsLink } from '../productsLink';
import { WidgetError } from './Widget';

const units = new Intl.NumberFormat();

const CARDS: { key: keyof DashboardSummary; label: string; money?: true; stockStatus?: StockStatus }[] = [
  { key: 'totalProducts', label: 'Total products' },
  { key: 'totalStockValue', label: 'Total stock value', money: true },
  { key: 'totalStockIncome', label: 'Total stock income', money: true },
  { key: 'lowStockCount', label: 'Low stock', stockStatus: STOCK_STATUSES.LOW },
  { key: 'outOfStockCount', label: 'Out of stock', stockStatus: STOCK_STATUSES.OUT },
];

/**
 * The five stat cards over the active products (C26), in the movements summary style. Low and Out open the Products
 * page under the same stock-status filter: the whole card is the link.
 */
export function SummaryCards() {
  const { data, isError, refetch } = useDashboardSummary();
  const formatMoney = useMoney();
  if (isError) return <WidgetError what="the stock totals" onRetry={() => void refetch()} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {CARDS.map(({ key, label, money, stockStatus }) => (
        <section
          key={key}
          aria-label={label}
          className="relative rounded-xl border bg-card px-4 py-3 has-[a:hover]:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
        >
          <h2 className="text-xs text-muted-foreground">
            {stockStatus ? (
              <Link
                to={productsLink({ stockStatus })}
                className="outline-none after:absolute after:inset-0"
              >
                {label}
              </Link>
            ) : (
              label
            )}
          </h2>
          {data ? (
            <p className="mt-1 text-xl font-semibold tabular-nums">{money ? formatMoney(data[key]) : units.format(data[key])}</p>
          ) : (
            <Skeleton className="mt-1 h-7 w-24" />
          )}
        </section>
      ))}
    </div>
  );
}
