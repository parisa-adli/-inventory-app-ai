import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProductListParams } from '@inventory/shared';
import { getApiError } from '@/lib/apiError';
import { categoriesKeys } from '@/features/categories/hooks/useCategories';
import { dashboardKeys } from '@/features/dashboard/hooks/useDashboard';
import { movementsKeys } from '@/features/movements/hooks/useMovements';
import { suppliersKeys } from '@/features/suppliers/hooks/useSuppliers';
import * as productsApi from '../api/productsApi';

export const productsKeys = {
  all: ['products'] as const,
  list: (params: ProductListParams) => ['products', 'list', params] as const,
};

export const useProducts = (params: ProductListParams) =>
  useQuery({
    queryKey: productsKeys.list(params),
    queryFn: () => productsApi.fetchProducts(params),
    placeholderData: keepPreviousData,
  });

const useInvalidate = (keys: readonly (readonly string[])[]) => {
  const queryClient = useQueryClient();
  return () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
};

export const useCreateProduct = () => {
  // The category and supplier cards show product counts
  const invalidate = useInvalidate([productsKeys.all, categoriesKeys.all, suppliersKeys.all]);
  return useMutation({
    mutationFn: productsApi.createProduct,
    onSuccess: (product) => {
      toast.success(`${product.title} was created`);
      return invalidate();
    },
    onError: (err) => toast.error(getApiError(err).message),
  });
};

/** Also refetches movements (they show the title and SKU) and the dashboard (stock value uses the prices). */
export const useUpdateProduct = () => {
  const invalidate = useInvalidate([
    productsKeys.all,
    categoriesKeys.all,
    suppliersKeys.all,
    movementsKeys.all,
    dashboardKeys.all,
  ]);
  return useMutation({
    mutationFn: productsApi.updateProduct,
    onSuccess: (product) => {
      toast.success(`${product.title} was saved`);
      return invalidate();
    },
    onError: (err) => toast.error(getApiError(err).message),
  });
};
