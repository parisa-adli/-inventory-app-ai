import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const SEARCH_DEBOUNCE_MS = 300;

interface SearchInputProps {
  /** The search currently in the URL. */
  value: string;
  /** Called with the typed text once typing pauses. */
  onSearch: (value: string) => void;
  placeholder: string;
}

/** A debounced search box that writes to the URL and follows back/forward (DESIGN.md §5 Filters). */
export function SearchInput({ value, onSearch, placeholder }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  // What this box last wrote to the URL, so our own update never overwrites newer keystrokes
  const [sent, setSent] = useState(value);

  // Back/forward or a link changed the URL: show its search (adjusting state during render, not in an effect)
  if (value !== shownValue) {
    setShownValue(value);
    if (value !== sent) {
      // Not our own write: forget it, so returning to it later (Forward) also counts as a URL change
      setSent(value);
      if (draft.trim() !== value) setDraft(value);
    }
  }

  useEffect(() => {
    if (draft.trim() === value) return;
    const timer = setTimeout(() => {
      setSent(draft.trim());
      onSearch(draft);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, value, onSearch]);

  return (
    <div className="relative flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="pl-8"
      />
    </div>
  );
}
