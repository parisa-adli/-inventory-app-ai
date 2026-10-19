import type { StockMovementsSummary } from '@inventory/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '../format';

const units = new Intl.NumberFormat();

const CARDS: { key: keyof StockMovementsSummary; label: string; format: (value: number) => string }[] = [
  { key: 'unitsIn', label: 'Units in', format: (value) => units.format(value) },
  { key: 'unitsOut', label: 'Units out', format: (value) => units.format(value) },
  { key: 'inboundValue', label: 'Inbound value', format: formatMoney },
  { key: 'income', label: 'Income', format: formatMoney },
];

/** Units and money moved by receives and ships under the page's filters (skeletons until the first answer). */
export function MovementsSummary({ summary }: { summary: StockMovementsSummary | undefined }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map(({ key, label, format }) => (
        <section key={key} aria-label={label} className="rounded-xl border bg-card px-4 py-3">
          <h2 className="text-xs text-muted-foreground">{label}</h2>
          {summary ? (
            <p className="mt-1 text-xl font-semibold tabular-nums">{format(summary[key])}</p>
          ) : (
            <Skeleton className="mt-1 h-7 w-24" />
          )}
        </section>
      ))}
    </div>
  );
}
