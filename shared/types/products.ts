import type { UnitOfMeasure } from '../constants/units';
import type { Paginated } from './catalog';

/** A category or supplier as a product carries it. A category's name is its title. */
export interface ProductRef {
  id: string;
  name: string;
}

/** Derived from `archivedAt` (`docs/adr/0003`); never stored. */
export type ProductStatus = 'active' | 'archived';

export interface Product {
  id: string;
  title: string;
  sku: string;
  category: ProductRef;
  /** null: the product is "Unassigned". */
  supplier: ProductRef | null;
  costPrice: number;
  salePrice: number;
  quantity: number;
  unitOfMeasure: UnitOfMeasure;
  imageUrl: string | null;
  status: ProductStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/products */
export type ProductsPage = Paginated<Product>;
