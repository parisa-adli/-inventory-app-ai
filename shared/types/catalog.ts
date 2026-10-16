/** Paging fields of every paginated list response. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> extends PageMeta {
  items: T[];
}

/** `details` of a 409 CATEGORY_IN_USE / SUPPLIER_IN_USE. Archived products count too. */
export interface InUseDetails {
  productCount: number;
  archivedCount: number;
}

export interface Category {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** List rows only; POST/PATCH answers carry no count. Includes archived products. */
export interface CategoryListItem extends Category {
  productCount: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierListItem extends Supplier {
  productCount: number;
}

/** GET /api/categories */
export type CategoriesPage = Paginated<CategoryListItem>;
/** GET /api/suppliers */
export type SuppliersPage = Paginated<SupplierListItem>;
