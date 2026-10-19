import { Link } from 'react-router';
import { PATHS } from '@/app/paths';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { MovementTypeBadge } from '@/features/movements/components/MovementTypeBadge';
import { formatDelta } from '@/features/movements/format';
import { useMovements } from '@/features/movements/hooks/useMovements';
import { productsLink } from '../productsLink';
import { formatRelativeTime } from '../relativeTime';
import { Widget, WidgetEmpty, WidgetError } from './Widget';

/** The movements list's own query and key, so every stock change refreshes the feed with the Movements page. */
const RECENT_MOVEMENTS_PARAMS = { page: 1, limit: 10 };

/** The 10 latest movements of any type, newest first (`GET /api/stock-movements?limit=10`, no endpoint of its own),
 * then a link to the Movements page. */
export function RecentMovements() {
  // Times are relative to when the feed was fetched (render must stay pure); every refetch moves them on
  const { data, dataUpdatedAt, isPending, isError, refetch } = useMovements(RECENT_MOVEMENTS_PARAMS);
  return (
    <Widget title="Recent movements" description="The latest receipts, shipments and adjustments.">
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : isError ? (
        <WidgetError what="recent movements" onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <WidgetEmpty>No stock movements yet.</WidgetEmpty>
      ) : (
        <ul className="divide-y">
          {data.items.map((movement) => (
            <li key={movement.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <MovementTypeBadge type={movement.type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link to={productsLink(movement.product)} className="truncate font-medium hover:underline">
                    {movement.product.title}
                  </Link>
                  {movement.product.archived && <Badge variant="secondary">Archived</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {movement.user.name} ·{' '}
                  <time dateTime={movement.occurredAt} title={formatDateTime(movement.occurredAt)}>
                    {formatRelativeTime(movement.occurredAt, dataUpdatedAt)}
                  </time>
                </p>
              </div>
              <span className="font-medium tabular-nums">{formatDelta(movement.delta)}</span>
            </li>
          ))}
        </ul>
      )}
      {!isPending && !isError && (
        <p className="text-sm">
          <Link to={PATHS.movements} className="font-medium hover:underline">
            View all movements
          </Link>
        </p>
      )}
    </Widget>
  );
}
