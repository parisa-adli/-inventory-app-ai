import type { StockMovementsSummary } from '@inventory/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useMoney } from '@/lib/money';

const units = new Intl.NumberFormat();

const CARDS: { key: keyof StockMovementsSummary; label: string; money?: true }[] = [
  { key: 'unitsIn', label: 'Units in' },
  { key: 'unitsOut', label: 'Units out' },
  { key: 'inboundValue', label: 'Inbound value', money: true },
  { key: 'income', label: 'Income', money: true },
];

/** Units and money moved by receives and ships under the page's filters (skeletons until the first answer). */
export function MovementsSummary({ summary }: { summary: StockMovementsSummary | undefined }) {
  const formatMoney = useMoney();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map(({ key, label, money }) => (
        <section key={key} aria-label={label} className="rounded-xl border bg-card px-4 py-3">
          <h2 className="text-xs text-muted-foreground">{label}</h2>
          {summary ? (
            <p className="mt-1 text-xl font-semibold tabular-nums">{money ? formatMoney(summary[key]) : units.format(summary[key])}</p>
          ) : (
            <Skeleton className="mt-1 h-7 w-24" />
          )}
        </section>
      ))}
    </div>
  );
}
