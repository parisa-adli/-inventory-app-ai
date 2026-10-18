import { useState } from 'react';
import { X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT, STOCK_MOVEMENT_TYPES, type StockMovementType } from '@inventory/shared';
import { ListMessage } from '@/components/ListMessage';
import { Pager } from '@/components/Pager';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '../components/DateRangePicker';
import { MovementsTable } from '../components/MovementsTable';
import { ProductCombobox, type PickedProduct } from '../components/ProductCombobox';
import { toInstantRange } from '../dateRange';
import { MOVEMENT_TYPE_LABELS } from '../format';
import { useMovements } from '../hooks/useMovements';

/** The "All types" choice (a Select item cannot have an empty value). */
const ALL_TYPES = 'all';

const TYPES: readonly string[] = Object.values(STOCK_MOVEMENT_TYPES);
const isMovementType = (value: string): value is StockMovementType => TYPES.includes(value);

const TYPE_OPTIONS = [
  { value: ALL_TYPES, label: 'All types' },
  ...Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

/**
 * Every stock movement across products, newest first, 20 a page (#33). Read-only. Filters by product,
 * type and a range of local days; every filter is part of the query key, and changing one returns to page 1.
 */
export default function Movements() {
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [type, setType] = useState<StockMovementType | null>(null);
  const [dayRange, setDayRange] = useState<DateRange | undefined>();
  const [page, setPage] = useState(1);
  const hasFilters = Boolean(product || type || dayRange?.from);

  const query = useMovements({
    page,
    limit: STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT,
    ...(product && { product: product.id }),
    ...(type && { type }),
    ...toInstantRange(dayRange),
  });
  const { data } = query;

  // Any filter change starts again on page 1
  const resettingPage =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  const clearFilters = () => {
    setProduct(null);
    setType(null);
    setDayRange(undefined);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock movements</h1>
        <p className="text-sm text-muted-foreground">Every receive, ship and adjustment, newest first.</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <ProductCombobox value={product} onChange={resettingPage(setProduct)} />
        <Select value={type ?? ALL_TYPES} onValueChange={resettingPage((value: string) => setType(isMovementType(value) ? value : null))}>
          <SelectTrigger className="h-9 w-full lg:w-44" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker value={dayRange} onChange={resettingPage(setDayRange)} />
        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            <X className="size-4" />
            Clear filters
          </Button>
        )}
      </div>

      {query.isPending && (
        <div className="space-y-2" role="status" aria-label="Loading">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      )}
      {query.isError && !data && (
        <ListMessage>
          <span role="alert">Could not load stock movements. </span>
          <button className="text-foreground underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </ListMessage>
      )}
      {data && data.items.length === 0 && (
        <ListMessage>{hasFilters ? 'No movements match these filters.' : 'No stock movements yet.'}</ListMessage>
      )}
      {data && data.items.length > 0 && (
        <>
          <MovementsTable movements={data.items} />
          <Pager meta={data} onPage={setPage} />
        </>
      )}
    </div>
  );
}
