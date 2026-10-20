import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT, STOCK_MOVEMENT_TYPES, type StockMovementType } from '@inventory/shared';
import { DayPicker } from '@/components/DayPicker';
import { ListMessage } from '@/components/ListMessage';
import { Pager } from '@/components/Pager';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { MovementsSummary } from '../components/MovementsSummary';
import { MovementsTable } from '../components/MovementsTable';
import { toInstantRange } from '../dateRange';
import { MOVEMENT_TYPE_LABELS } from '../format';
import { useMovementUsers, useMovements, useMovementsSummary } from '../hooks/useMovements';

/** The "All …" choice of a filter (a Select item cannot have an empty value). */
const ALL = 'all';

const TYPES: readonly string[] = Object.values(STOCK_MOVEMENT_TYPES);
const isMovementType = (value: string): value is StockMovementType => TYPES.includes(value);

const TYPE_OPTIONS = [
  { value: ALL, label: 'All types' },
  ...Object.entries(MOVEMENT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const FILTER_TRIGGER = 'h-10 w-full gap-3 rounded-lg lg:w-auto';

/**
 * Every stock movement across products, newest first, 20 a page (#33). Read-only. Filters by a product title or SKU
 * search, type, who made it and a From / To pair of local days; the cards total the same filtered movements. Every
 * filter is part of the query keys, and changing one returns to page 1.
 */
export default function Movements() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<StockMovementType | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const hasFilters = Boolean(search || type || user || from || to);

  const filters = {
    ...(search && { search }),
    ...(type && { type }),
    ...(user && { user }),
    ...toInstantRange({ from, to }),
  };
  const query = useMovements({ page, limit: STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT, ...filters });
  const summary = useMovementsSummary(filters);
  const users = useMovementUsers();
  const { data } = query;
  const today = new Date();

  // Any filter change starts again on page 1
  const resettingPage =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  // Stable, so the search box's debounce is not restarted by every render
  const onSearch = useCallback((value: string) => {
    setSearch(value.trim());
    setPage(1);
  }, []);
  const clearFilters = () => {
    setSearch('');
    setType(null);
    setUser(null);
    setFrom(undefined);
    setTo(undefined);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Stock movements</h1>
        <p className="text-sm text-muted-foreground">Every receipt, shipment and adjustment, and who made it.</p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex lg:w-72">
          <SearchInput value={search} onSearch={onSearch} placeholder="Product title or SKU" className="h-10 rounded-lg" />
        </div>
        <Select value={type ?? ALL} onValueChange={resettingPage((value: string) => setType(isMovementType(value) ? value : null))}>
          <SelectTrigger className={FILTER_TRIGGER} aria-label="Type">
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
        <Select value={user ?? ALL} onValueChange={resettingPage((value: string) => setUser(value === ALL ? null : value))}>
          <SelectTrigger className={FILTER_TRIGGER} aria-label="User">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All users</SelectItem>
            {users.data?.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-sm lg:w-auto">From</span>
          <DayPicker
            label="From"
            value={from}
            onChange={resettingPage(setFrom)}
            disabled={[{ after: to ?? today }]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-sm lg:w-auto">To</span>
          <DayPicker
            label="To"
            value={to}
            onChange={resettingPage(setTo)}
            disabled={[{ after: today }, ...(from ? [{ before: from }] : [])]}
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" className="h-10" onClick={clearFilters}>
            <X className="size-4" />
            Clear filters
          </Button>
        )}
      </div>

      <MovementsSummary summary={summary.data} />

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
