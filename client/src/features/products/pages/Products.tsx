import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PERMISSIONS, PRODUCTS_PAGE_SIZE_DEFAULT } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
import { ListMessage } from '@/components/ListMessage';
import { Pager } from '@/components/Pager';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdjustStockDialog } from '../components/AdjustStockDialog';
import { ProductFormDialog } from '../components/ProductFormDialog';
import { ProductsTable } from '../components/ProductsTable';
import { StockHistoryDialog } from '../components/StockHistoryDialog';
import { useProducts } from '../hooks/useProducts';

/** Active products, title A→Z, 20 a page. Search, filters, sort and URL state arrive in #34. */
export default function Products() {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const query = useProducts({ page, limit: PRODUCTS_PAGE_SIZE_DEFAULT });
  const { data } = query;
  // Looked up in the live list, so the on-hand count in the dialogs follows every refetch
  const adjusting = data?.items.find((product) => product.id === adjustingId);
  const showingHistory = data?.items.find((product) => product.id === historyProductId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} ${data.total === 1 ? 'product' : 'products'} in inventory` : 'Your product catalog.'}
          </p>
        </div>
        <Can permission={PERMISSIONS.PRODUCTS_WRITE}>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add product
          </Button>
        </Can>
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
          <span role="alert">Could not load products. </span>
          <button className="text-foreground underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </ListMessage>
      )}
      {data && data.items.length === 0 && <ListMessage>No products yet.</ListMessage>}
      {data && data.items.length > 0 && (
        <>
          <ProductsTable
            products={data.items}
            onAdjustStock={(product) => setAdjustingId(product.id)}
            onStockHistory={(product) => setHistoryProductId(product.id)}
          />
          <Pager meta={data} onPage={setPage} />
        </>
      )}

      <ProductFormDialog open={creating} onOpenChange={setCreating} />
      <AdjustStockDialog product={adjusting} onOpenChange={(open) => !open && setAdjustingId(null)} />
      <StockHistoryDialog product={showingHistory} onOpenChange={(open) => !open && setHistoryProductId(null)} />
    </div>
  );
}
