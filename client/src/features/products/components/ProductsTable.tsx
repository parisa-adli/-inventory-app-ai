import type { ReactNode } from 'react';
import { ImageIcon, Minus, Plus } from 'lucide-react';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import {
  PERMISSIONS,
  STOCK_MOVEMENT_TYPES,
  STOCK_STATUSES,
  getStockStatus,
  type Product,
  type ProductStatus,
} from '@inventory/shared';
import { useCan } from '@/features/auth/hooks/useCan';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useRecordMovement } from '../hooks/useRecordMovement';

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });

// Module scope: TanStack Table v9 wants stable features and columns
const features = tableFeatures({});
const column = createColumnHelper<typeof features, Product>();

const STATUS_BADGES: Record<ProductStatus, { label: string; variant: BadgeProps['variant'] }> = {
  active: { label: 'Active', variant: 'outline' },
  archived: { label: 'Archived', variant: 'secondary' },
};

/** Right-aligned number columns (DESIGN.md table pattern). */
const NUMERIC = new Set(['costPrice', 'salePrice', 'quantity']);

const columns = column.columns([
  column.accessor('title', {
    header: 'Title',
    cell: ({ row }) => <ProductCell product={row.original} />,
  }),
  column.accessor('sku', { header: 'SKU', cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue()}</span> }),
  column.accessor((product) => product.category.name, {
    id: 'category',
    header: 'Category',
    cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
  }),
  column.accessor((product) => product.supplier?.name ?? null, {
    id: 'supplier',
    header: 'Supplier',
    cell: (info) => info.getValue() ?? <Badge variant="outline" className="text-muted-foreground">Unassigned</Badge>,
  }),
  column.accessor('costPrice', { header: 'Cost', cell: (info) => money.format(info.getValue()) }),
  column.accessor('salePrice', { header: 'Sale', cell: (info) => money.format(info.getValue()) }),
  column.accessor('quantity', {
    header: 'Quantity',
    cell: ({ row }) => <QuantityCell product={row.original} />,
  }),
  column.accessor('unitOfMeasure', { header: 'Unit', cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span> }),
  column.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const { label, variant } = STATUS_BADGES[info.getValue()];
      return <Badge variant={variant}>{label}</Badge>;
    },
  }),
]);

function ProductCell({ product }: { product: Product }) {
  return (
    <div className="flex items-center gap-3">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt="" className="size-10 shrink-0 rounded-md border object-cover" />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted" aria-hidden>
          <ImageIcon className="size-4 text-muted-foreground" />
        </div>
      )}
      <span className="font-medium">{product.title}</span>
    </div>
  );
}

function QuantityCell({ product }: { product: Product }) {
  const { quantity } = product;
  const stock = getStockStatus(quantity);
  return (
    <div className="flex items-center justify-end gap-2">
      {stock === STOCK_STATUSES.LOW && (
        <Badge variant="warning">Low stock</Badge>
      )}
      {stock === STOCK_STATUSES.OUT && (
        <Badge variant="outline" className="text-muted-foreground">
          Out of stock
        </Badge>
      )}
      <QuantityStepper product={product}>
        <span className="min-w-6 text-center tabular-nums">{quantity}</span>
      </QuantityStepper>
    </div>
  );
}

/**
 * Inline −/+ (#30): a ship or a receive of 1, through the same ledger as every other stock change.
 * Not optimistic; both buttons wait while one runs. Archived products are frozen, so they get none.
 */
function QuantityStepper({ product, children }: { product: Product; children: ReactNode }) {
  const canAdjust = useCan(PERMISSIONS.STOCK_ADJUST);
  const record = useRecordMovement();
  if (!canAdjust || product.status === 'archived') return children;

  const step = (type: typeof STOCK_MOVEMENT_TYPES.RECEIVE | typeof STOCK_MOVEMENT_TYPES.SHIP) =>
    record.mutate({ productId: product.id, type, quantity: 1 });
  return (
    <div className="flex items-center gap-1" aria-busy={record.isPending}>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Ship 1 ${product.title}`}
        disabled={record.isPending || product.quantity === 0}
        onClick={() => step(STOCK_MOVEMENT_TYPES.SHIP)}
      >
        <Minus />
      </Button>
      {children}
      <Button
        variant="outline"
        size="icon"
        aria-label={`Receive 1 ${product.title}`}
        disabled={record.isPending}
        onClick={() => step(STOCK_MOVEMENT_TYPES.RECEIVE)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** The products list as a TanStack Table. Paging is server-side (the page's Pager); sorting arrives in #34. Quantity has inline −/+ (#30). */
export function ProductsTable({ products }: { products: Product[] }) {
  const table = useTable({ features, columns, data: products, getRowId: (product) => product.id });

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id} className={cn(NUMERIC.has(header.column.id) && 'text-right')}>
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
                <TableCell key={cell.id} className={cn(NUMERIC.has(cell.column.id) && 'text-right tabular-nums')}>
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
