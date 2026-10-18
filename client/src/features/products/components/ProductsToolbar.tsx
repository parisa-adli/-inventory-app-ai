import { X } from 'lucide-react';
import { STOCK_STATUSES, UNASSIGNED_SUPPLIER } from '@inventory/shared';
import { SearchInput } from '@/components/SearchInput';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories } from '@/features/categories/hooks/useCategories';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { ALL_OPTION, type ProductListState } from '../hooks/useProductListParams';

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
      <SelectTrigger className="h-9 w-full lg:w-44" aria-label={label}>
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

/** Search, category, supplier (with "Unassigned") and stock status on one row, plus "Clear filters" while any is set (DESIGN.md §5). */
export function ProductsToolbar({ list }: { list: ProductListState }) {
  const categories = useCategories(PICKER_PARAMS).data?.items ?? [];
  const suppliers = useSuppliers(PICKER_PARAMS).data?.items ?? [];

  return (
    <div className="flex flex-col gap-3 lg:flex-row">
      <SearchInput value={list.search} onSearch={list.setSearch} placeholder="Search title or SKU…" />
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
      {list.hasFilters && (
        <Button variant="ghost" onClick={list.clearFilters}>
          <X className="size-4" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
