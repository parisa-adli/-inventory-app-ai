import { ImageIcon } from 'lucide-react';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { STOCK_STATUSES, getStockStatus, type Product, type ProductStatus } from '@inventory/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

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
    cell: (info) => <QuantityCell quantity={info.getValue()} />,
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

function QuantityCell({ quantity }: { quantity: number }) {
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
      <span className="tabular-nums">{quantity}</span>
    </div>
  );
}

/** The products list as a TanStack Table. Paging is server-side (the page's Pager); sorting arrives in #34. */
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
