import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import type { StockMovement } from '@inventory/shared';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatDelta } from '../format';
import { MovementTypeBadge } from './MovementTypeBadge';

// Module scope: TanStack Table v9 wants stable features and columns
const features = tableFeatures({});
const column = createColumnHelper<typeof features, StockMovement>();

const RIGHT_ALIGNED = new Set(['delta', 'quantityAfter']);

const columns = column.columns([
  column.accessor('occurredAt', {
    header: 'Date',
    cell: (info) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(info.getValue())}</span>,
  }),
  column.accessor('product', {
    header: 'Product',
    cell: (info) => {
      const product = info.getValue();
      return (
        <div className="min-w-40">
          <div className="flex items-center gap-2">
            <span className="font-medium">{product.title}</span>
            {product.archived && <Badge variant="secondary">Archived</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">{product.sku}</div>
        </div>
      );
    },
  }),
  column.accessor('type', { header: 'Type', cell: (info) => <MovementTypeBadge type={info.getValue()} /> }),
  column.accessor('delta', {
    header: 'Change',
    cell: (info) => <span className="font-medium">{formatDelta(info.getValue())}</span>,
  }),
  column.accessor('quantityAfter', { header: 'After' }),
  column.accessor('note', {
    header: 'Note',
    cell: (info) => <span className="block min-w-40 whitespace-normal text-muted-foreground">{info.getValue() ?? '—'}</span>,
  }),
  column.accessor((movement) => movement.user.name, {
    id: 'user',
    header: 'By',
    cell: (info) => <span className="whitespace-nowrap">{info.getValue()}</span>,
  }),
]);

/** Every movement, read-only (#33). Paging and filtering are server-side. */
export function MovementsTable({ movements }: { movements: StockMovement[] }) {
  const table = useTable({ features, columns, data: movements, getRowId: (movement) => movement.id });

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className={cn(RIGHT_ALIGNED.has(header.column.id) && 'text-right')}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className={cn(RIGHT_ALIGNED.has(cell.column.id) && 'text-right tabular-nums')}>
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
