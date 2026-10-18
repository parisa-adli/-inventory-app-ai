import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ProductListParams } from '@inventory/shared';
import { getApiError } from '@/lib/apiError';
import { categoriesKeys } from '@/features/categories/hooks/useCategories';
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

export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: productsApi.createProduct,
    onSuccess: (product) => {
      toast.success(`${product.title} was created`);
      // The category and supplier cards show product counts
      return Promise.all(
        [productsKeys.all, categoriesKeys.all, suppliersKeys.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      );
    },
    onError: (err) => toast.error(getApiError(err).message),
  });
};
