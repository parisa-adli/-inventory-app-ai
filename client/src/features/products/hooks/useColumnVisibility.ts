import { useState } from 'react';
import type { ColumnVisibilityState } from '@tanstack/react-table';

/** The table columns the Columns menu can hide, by id, with the name it shows (all but select, Product and Actions). */
export const HIDEABLE_COLUMNS: Record<string, string> = {
  category: 'Category',
  supplier: 'Supplier',
  costPrice: 'Cost',
  salePrice: 'Sale',
  quantity: 'Quantity',
  stock: 'Stock',
};

/** Which columns this viewer hid, kept in their browser only. Storage can be missing or blocked: then all show. */
const VISIBILITY_KEY = 'products.columns';

const loadVisibility = (): ColumnVisibilityState => {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(VISIBILITY_KEY) ?? '{}');
    return saved && typeof saved === 'object' ? (saved as ColumnVisibilityState) : {};
  } catch {
    return {};
  }
};

const saveVisibility = (visibility: ColumnVisibilityState) => {
  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visibility));
  } catch {
    // Not remembered; the choice still applies until the page reloads
  }
};

/** The page owns it: the Columns menu sits in the toolbar, the table reads it. */
export function useColumnVisibility() {
  const [columnVisibility, setState] = useState(loadVisibility);
  const setColumnVisibility = (next: ColumnVisibilityState) => {
    setState(next);
    saveVisibility(next);
  };
  return { columnVisibility, setColumnVisibility };
}

export type ColumnVisibility = ReturnType<typeof useColumnVisibility>;
