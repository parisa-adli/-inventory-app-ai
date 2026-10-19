import type { StockStatus } from '@inventory/shared';
import { PATHS } from '@/app/paths';

/**
 * The Products page under a dashboard link's view (the `useProductListParams` URL): one stock status, or a product
 * found by its SKU. An archived product is only listed on the Archived tab.
 */
export const productsLink = (view: { stockStatus: StockStatus } | { sku: string; archived?: boolean }) => {
  const params = new URLSearchParams(
    'stockStatus' in view
      ? { stockStatus: view.stockStatus }
      : { ...(view.archived && { status: 'archived' }), search: view.sku }
  );
  return `${PATHS.products}?${params}`;
};
