import { useId } from 'react';
import { Link } from 'react-router';
import {
  STOCK_STATUSES,
  type DashboardPeriodSummary,
  type DashboardSummary,
  type StockStatus,
} from '@inventory/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoney } from '@/lib/money';
import { useDashboardPeriodSummary, useDashboardSummary } from '../hooks/useDashboard';
import { useDashboardRange } from '../hooks/useDashboardRange';
import { productsLink } from '../productsLink';
import { WidgetError } from './Widget';

const units = new Intl.NumberFormat();

interface CardSpec<T> {
  key: keyof T;
  label: string;
  money?: true;
  stockStatus?: StockStatus;
}

const NOW_CARDS: CardSpec<DashboardSummary>[] = [
  { key: 'totalProducts', label: 'Active products' },
  { key: 'totalStockValue', label: 'Stock value', money: true },
  { key: 'lowStockCount', label: 'Low stock', stockStatus: STOCK_STATUSES.LOW },
  { key: 'outOfStockCount', label: 'Out of stock', stockStatus: STOCK_STATUSES.OUT },
];

const PERIOD_CARDS: CardSpec<DashboardPeriodSummary>[] = [
  { key: 'inboundValue', label: 'Inbound value', money: true },
  { key: 'income', label: 'Income', money: true },
  { key: 'cogs', label: 'COGS', money: true },
  { key: 'grossProfit', label: 'Gross profit', money: true },
];

/** One labelled row of four stat cards. Cards with a stock status open the Products page under it: the whole card is the link. */
function CardGroup<T extends object>({
  title,
  cards,
  data,
  error,
}: {
  title: string;
  cards: CardSpec<T>[];
  data: T | undefined;
  error?: { what: string; onRetry: () => void };
}) {
  const titleId = useId();
  const formatMoney = useMoney();
  return (
    <section aria-labelledby={titleId} className="space-y-2">
      <h2 id={titleId} className="text-base text-muted-foreground">
        {title}
      </h2>
      {error ? (
        <WidgetError what={error.what} onRetry={error.onRetry} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map(({ key, label, money, stockStatus }) => (
            <section
              key={String(key)}
              aria-label={label}
              className="relative min-w-0 rounded-xl border bg-card px-3 py-2 sm:px-4 sm:py-3 has-[a:hover]:bg-muted/40 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
            >
              <h3 className="text-xs text-muted-foreground">
                {stockStatus ? (
                  <Link to={productsLink({ stockStatus })} className="outline-none after:absolute after:inset-0">
                    {label}
                  </Link>
                ) : (
                  label
                )}
              </h3>
              {data ? (
                <p className="mt-1 text-lg font-semibold break-words tabular-nums sm:text-2xl">
                  {money ? formatMoney(data[key] as number) : units.format(data[key] as number)}
                </p>
              ) : (
                <Skeleton className="mt-1 h-7 w-20 sm:h-8 sm:w-24" />
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Two rows of cards: "Right now" over the active products (stock on hand, C26), then what the receives and ships in
 * the dashboard's range were worth. Each row loads, fails and retries on its own.
 */
export function SummaryCards() {
  const { params, label } = useDashboardRange();
  const now = useDashboardSummary();
  const period = useDashboardPeriodSummary(params);
  return (
    <div className="space-y-4">
      <CardGroup
        title="Right now"
        cards={NOW_CARDS}
        data={now.data}
        error={now.isError ? { what: 'the stock totals', onRetry: () => void now.refetch() } : undefined}
      />
      <CardGroup
        title={label}
        cards={PERIOD_CARDS}
        data={period.data}
        error={period.isError ? { what: 'the totals for this range', onRetry: () => void period.refetch() } : undefined}
      />
    </div>
  );
}
