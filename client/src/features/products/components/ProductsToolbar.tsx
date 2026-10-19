import { Plus, X } from 'lucide-react';
import { PERMISSIONS, STOCK_STATUSES, UNASSIGNED_SUPPLIER } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/features/categories/hooks/useCategories';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import type { ColumnVisibility } from '../hooks/useColumnVisibility';
import { ALL_OPTION, type ProductListState } from '../hooks/useProductListParams';
import { ColumnsMenu } from './ColumnsMenu';

/** Same query as the create dialog's selects, so the two share a cache entry. */
const PICKER_PARAMS = { limit: 100, sort: 'name' } as const;

const STOCK_OPTIONS = [
  { value: ALL_OPTION, label: 'All stock' },
  { value: STOCK_STATUSES.IN, label: 'In stock' },
  { value: STOCK_STATUSES.LOW, label: 'Low stock' },
  { value: STOCK_STATUSES.OUT, label: 'Out of stock' },
];

interface Option {
  value: string;
  label: string;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  pinned = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Option[];
  /** Listed first, above a separator (the "All" and "Unassigned" choices). */
  pinned?: readonly Option[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full gap-2 rounded-lg sm:w-auto" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {pinned.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {pinned.length > 0 && options.length > 0 && <SelectSeparator />}
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Two rows (`docs/design/product selected.png`): the search box beside Add product, then the category, supplier
 * (with "Unassigned") and stock-status selects, the Columns menu, and "Clear filters" while any filter is set.
 */
export function ProductsToolbar({
  list,
  columns,
  onAdd,
}: {
  list: ProductListState;
  columns: ColumnVisibility;
  onAdd: () => void;
}) {
  const categories = useCategories(PICKER_PARAMS).data?.items ?? [];
  const suppliers = useSuppliers(PICKER_PARAMS).data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <SearchInput
          value={list.search}
          onSearch={list.setSearch}
          placeholder="Search title or SKU…"
          className="h-10 rounded-lg"
        />
        <Can permission={PERMISSIONS.PRODUCTS_WRITE}>
          <Button className="h-10 rounded-lg" onClick={onAdd}>
            <Plus className="size-4" />
            Add product
          </Button>
        </Can>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <FilterSelect
          label="Category"
          value={list.category}
          onChange={list.setCategory}
          pinned={[{ value: ALL_OPTION, label: 'All categories' }]}
          options={categories.map((category) => ({ value: category.id, label: category.title }))}
        />
        <FilterSelect
          label="Supplier"
          value={list.supplier}
          onChange={list.setSupplier}
          pinned={[
            { value: ALL_OPTION, label: 'All suppliers' },
            { value: UNASSIGNED_SUPPLIER, label: 'Unassigned' },
          ]}
          options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
        />
        <FilterSelect label="Stock status" value={list.stockStatus} onChange={list.setStockStatus} options={STOCK_OPTIONS} />
        <ColumnsMenu {...columns} />
        {list.hasFilters && (
          <Button variant="ghost" className="h-10" onClick={list.clearFilters}>
            <X className="size-4" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
