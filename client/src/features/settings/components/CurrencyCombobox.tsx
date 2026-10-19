import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CURRENCIES, currencyLabel } from '../currency';

interface CurrencyComboboxProps {
  value: string;
  onChange: (code: string) => void;
  /** From the form field, so the label and error message point at the trigger. */
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** A searchable list of currencies (code and name), in a popover under an outline trigger. */
export function CurrencyCombobox({ value, onChange, ...field }: CurrencyComboboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...field}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between rounded-lg font-normal sm:w-80"
        >
          <span className="truncate">{currencyLabel(value)}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Search currency…" />
          <CommandList>
            <CommandEmpty>No currency found.</CommandEmpty>
            {CURRENCIES.map(({ code, label }) => (
              <CommandItem
                key={code}
                value={label}
                onSelect={() => {
                  onChange(code);
                  setOpen(false);
                }}
              >
                <Check className={cn('size-4', code === value ? 'opacity-100' : 'opacity-0')} />
                {label}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
