import { SearchInput } from '@/components/SearchInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_PRESETS } from '../hooks/useCatalogSearchParams';

interface CatalogToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  sortPreset: string;
  onSortPreset: (value: string) => void;
  searchPlaceholder: string;
}

/** Search (debounced, written to the URL) and one "Sort by" select, on one row (DESIGN.md §5 Filters). */
export function CatalogToolbar({ search, onSearch, sortPreset, onSortPreset, searchPlaceholder }: CatalogToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <SearchInput value={search} onSearch={onSearch} placeholder={searchPlaceholder} />
      <Select value={sortPreset} onValueChange={onSortPreset}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Sort by">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          {SORT_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
