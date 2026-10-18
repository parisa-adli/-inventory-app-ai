import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useProducts } from '@/features/products/hooks/useProducts';
import { cn } from '@/lib/utils';

const SEARCH_DEBOUNCE_MS = 300;
const MATCHES_SHOWN = 10;

/** The picked product: its id filters the list, its title labels the button. */
export interface PickedProduct {
  id: string;
  title: string;
}

interface ProductComboboxProps {
  value: PickedProduct | null;
  onChange: (product: PickedProduct | null) => void;
}

/** A searchable product picker: typing searches title and SKU on the server (GET /api/products?search=). */
export function ProductCombobox({ value, onChange }: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const pick = (product: PickedProduct | null) => {
    onChange(product);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Product"
          className={cn('w-full justify-between font-normal lg:flex-1', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{value?.title ?? 'All products'}</span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        {/* Mounted only while open: nothing is fetched until then, and each opening starts with an empty search */}
        <ProductSearch value={value} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}

function ProductSearch({ value, onPick }: { value: PickedProduct | null; onPick: (product: PickedProduct | null) => void }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(draft.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const products = useProducts({ page: 1, limit: MATCHES_SHOWN, ...(search && { search }) });

  return (
    // The server filters, so cmdk must not filter again
    <Command shouldFilter={false}>
      <CommandInput value={draft} onValueChange={setDraft} placeholder="Search title or SKU…" />
      <CommandList>
        {products.isError ? (
          <p className="py-6 text-center text-sm text-destructive" role="alert">
            Could not load products.
          </p>
        ) : products.isPending ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            Searching…
          </p>
        ) : (
          <CommandEmpty>No products found.</CommandEmpty>
        )}
        <CommandGroup>
          {!search && (
            <CommandItem value="all" onSelect={() => onPick(null)}>
              <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} />
              All products
            </CommandItem>
          )}
          {products.data?.items.map((product) => (
            <CommandItem key={product.id} value={product.id} onSelect={() => onPick(product)}>
              <Check className={cn('size-4', value?.id === product.id ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{product.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{product.sku}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
