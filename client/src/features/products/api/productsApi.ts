import type {
  AssignSupplierInput,
  CreateProductInput,
  Product,
  ProductListParams,
  ProductsPage,
  UpdateProductInput,
} from '@inventory/shared';
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

/** PATCH /products/supplier: one supplier (or `null`) for the selected products. */
export const assignSupplier = async (body: AssignSupplierInput): Promise<{ updated: number }> => {
  const { data } = await api.patch<{ updated: number }>('/products/supplier', body);
  return data;
};

/** PATCH /products/:id/archive or /unarchive (admin). */
export const setProductArchived = async ({ id, archived }: { id: string; archived: boolean }): Promise<Product> => {
  const { data } = await api.patch<Product>(`/products/${id}/${archived ? 'archive' : 'unarchive'}`);
  return data;
};

/** DELETE /products/:id (admin): only a product that never had a movement. */
export const deleteProduct = async (product: Product): Promise<Product> => {
  await api.delete(`/products/${product.id}`);
  return product;
};
