import { useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import type { Matcher } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DayPickerProps {
  value: Date | undefined;
  onChange: (day: Date | undefined) => void;
  /** The accessible name ("From", "To"). */
  label: string;
  /** Days that cannot be picked (the future, the wrong side of the other end). */
  disabled?: Matcher | Matcher[];
}

/** An outline button naming the picked day ("Any day"), opening a one-month calendar. Picking it again clears it. */
export function DayPicker({ value, onChange, label, disabled }: DayPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label={label}
          className={cn('h-10 min-w-0 flex-1 justify-start rounded-lg font-normal lg:w-48 lg:flex-none', !value && 'text-muted-foreground')}
        >
          <CalendarIcon className="size-4" />
          {value ? formatDate(value.toISOString()) : 'Any day'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(day) => {
            onChange(day);
            setOpen(false);
          }}
          defaultMonth={value}
          disabled={disabled}
        />
      </PopoverContent>
    </Popover>
  );
}
