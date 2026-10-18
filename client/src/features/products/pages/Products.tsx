import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PERMISSIONS, type ProductStatus } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
import { ListMessage } from '@/components/ListMessage';
import { Pager } from '@/components/Pager';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdjustStockDialog } from '../components/AdjustStockDialog';
import { ProductFormDialog } from '../components/ProductFormDialog';
import { ProductsTable } from '../components/ProductsTable';
import { ProductsToolbar } from '../components/ProductsToolbar';
import { StockHistoryDialog } from '../components/StockHistoryDialog';
import { useProductListParams } from '../hooks/useProductListParams';
import { useProducts } from '../hooks/useProducts';

/** `noun` is singular and plural; `where` ends the unfiltered count ("12 products in inventory"). */
const STATUS_VIEWS: Record<ProductStatus, { tab: string; empty: string; noun: [string, string]; where: string }> = {
  active: { tab: 'Active', empty: 'No products yet.', noun: ['product', 'products'], where: ' in inventory' },
  archived: { tab: 'Archived', empty: 'No archived products.', noun: ['archived product', 'archived products'], where: '' },
};

/**
 * Products, 20 a page (#34): Active/Archived tabs, search, category, supplier and stock-status filters and a
 * server-side sort, all kept in the URL so a refresh or a shared link opens the same view.
 */
export default function Products() {
  const list = useProductListParams();
  const { status, page, setPage } = list;
  const view = STATUS_VIEWS[status];
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [historyProductId, setHistoryProductId] = useState<string | null>(null);
  const query = useProducts(list.params);
  const { data } = query;

  // A stale link or a change elsewhere left us past the last page: go to the last one that exists
  useEffect(() => {
    if (data && !query.isPlaceholderData && page > data.totalPages) setPage(data.totalPages, { replace: true });
  }, [data, query.isPlaceholderData, page, setPage]);
  // Looked up in the live list, so the on-hand count in the dialogs follows every refetch
  const editing = data?.items.find((product) => product.id === editingId) ?? null;
  const adjusting = data?.items.find((product) => product.id === adjustingId);
  const showingHistory = data?.items.find((product) => product.id === historyProductId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} ${view.noun[data.total === 1 ? 0 : 1]}${list.hasFilters ? ' match' : view.where}` : 'Your product catalog.'}
          </p>
        </div>
        <Can permission={PERMISSIONS.PRODUCTS_WRITE}>
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Add product
          </Button>
        </Can>
      </div>

      <Tabs value={status} onValueChange={list.setStatus}>
        <TabsList>
          {Object.entries(STATUS_VIEWS).map(([value, { tab }]) => (
            <TabsTrigger key={value} value={value}>
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <ProductsToolbar list={list} />

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
      {data && data.items.length === 0 && (
        <ListMessage>{list.hasFilters ? 'No products match these filters.' : view.empty}</ListMessage>
      )}
      {data && data.items.length > 0 && (
        <>
          <ProductsTable
            products={data.items}
            sort={list.sort}
            order={list.order}
            onSort={list.setSort}
            onEdit={(product) => setEditingId(product.id)}
            onAdjustStock={(product) => setAdjustingId(product.id)}
            onStockHistory={(product) => setHistoryProductId(product.id)}
          />
          <Pager meta={data} onPage={(next) => setPage(next)} />
        </>
      )}

      <ProductFormDialog open={creating} onOpenChange={setCreating} />
      <ProductFormDialog open={!!editing} product={editing} onOpenChange={(open) => !open && setEditingId(null)} />
      <AdjustStockDialog product={adjusting} onOpenChange={(open) => !open && setAdjustingId(null)} />
      <StockHistoryDialog product={showingHistory} onOpenChange={(open) => !open && setHistoryProductId(null)} />
    </div>
  );
}
