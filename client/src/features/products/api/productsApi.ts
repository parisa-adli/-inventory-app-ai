import type { CreateProductInput, Product, ProductListParams, ProductsPage, UpdateProductInput } from '@inventory/shared';
import api from '@/lib/axios';

export const fetchProducts = async (params: ProductListParams): Promise<ProductsPage> => {
  const { data } = await api.get<ProductsPage>('/products', { params });
  return data;
};

export const createProduct = async (body: CreateProductInput): Promise<Product> => {
  const { data } = await api.post<Product>('/products', body);
  return data;
};

export const updateProduct = async ({ id, body }: { id: string; body: UpdateProductInput }): Promise<Product> => {
  const { data } = await api.patch<Product>(`/products/${id}`, body);
  return data;
};
