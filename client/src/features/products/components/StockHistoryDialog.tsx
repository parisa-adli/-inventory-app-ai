import { useState } from 'react';
import { STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT, type Product } from '@inventory/shared';
import { ListMessage } from '@/components/ListMessage';
import { Pager } from '@/components/Pager';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MovementTypeBadge } from '@/features/movements/components/MovementTypeBadge';
import { formatDelta } from '@/features/movements/format';
import { useMovements } from '@/features/movements/hooks/useMovements';
import { formatDateTime } from '@/lib/format';

interface StockHistoryDialogProps {
  /** The dialog is open while a product is given. */
  product: Product | null;
  onOpenChange: (open: boolean) => void;
}

/** One product's movements, newest first (#32). Read-only; archived products keep their history. */
export function StockHistoryDialog({ product, onOpenChange }: StockHistoryDialogProps) {
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Stock history</DialogTitle>
          {product && (
            <DialogDescription>
              {product.title} ({product.sku}): {product.quantity} {product.unitOfMeasure} on hand.
            </DialogDescription>
          )}
        </DialogHeader>
        {/* Keyed, so another product starts on page 1 */}
        {product && <ProductLedger key={product.id} productId={product.id} />}
      </DialogContent>
    </Dialog>
  );
}

/** The product's ledger, a page at a time. */
function ProductLedger({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const query = useMovements({ product: productId, page, limit: STOCK_MOVEMENTS_PAGE_SIZE_DEFAULT });
  const { data } = query;

  if (!data && query.isError) {
    return (
      <ListMessage>
        <span role="alert">Could not load the stock history. </span>
        <button className="text-foreground underline" onClick={() => query.refetch()}>
          Try again
        </button>
      </ListMessage>
    );
  }
  if (!data) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>
    );
  }
  if (data.items.length === 0) return <ListMessage>No stock movements yet.</ListMessage>;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">After</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(movement.occurredAt)}</TableCell>
                <TableCell>
                  <MovementTypeBadge type={movement.type} />
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatDelta(movement.delta)}</TableCell>
                <TableCell className="text-right tabular-nums">{movement.quantityAfter}</TableCell>
                <TableCell className="min-w-40 whitespace-normal text-muted-foreground">{movement.note ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{movement.user.name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pager meta={data} onPage={setPage} />
    </div>
  );
}
