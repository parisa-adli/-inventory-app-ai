import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SORT_PRESETS } from '../hooks/useCatalogSearchParams';

const SEARCH_DEBOUNCE_MS = 300;

interface CatalogToolbarProps {
  search: string;
  onSearch: (value: string) => void;
  sortPreset: string;
  onSortPreset: (value: string) => void;
  searchPlaceholder: string;
}

/** Search (debounced, written to the URL) and one "Sort by" select, on one row (DESIGN.md §5 Filters). */
export function CatalogToolbar({ search, onSearch, sortPreset, onSortPreset, searchPlaceholder }: CatalogToolbarProps) {
  const [draft, setDraft] = useState(search);
  const [shownSearch, setShownSearch] = useState(search);
  // What this box last wrote to the URL, so our own update never overwrites newer keystrokes
  const [sent, setSent] = useState(search);

  // Back/forward or a link changed the URL: show its search (adjusting state during render, not in an effect)
  if (search !== shownSearch) {
    setShownSearch(search);
    if (search !== sent && draft.trim() !== search) setDraft(search);
  }

  useEffect(() => {
    if (draft.trim() === search) return;
    const timer = setTimeout(() => {
      setSent(draft.trim());
      onSearch(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, search, onSearch]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label="Search"
          className="pl-8"
        />
      </div>
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
