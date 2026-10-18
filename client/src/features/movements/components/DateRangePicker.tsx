import { CalendarIcon } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDayRange } from '../dateRange';

interface DateRangePickerProps {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}

/** An outline button naming the picked days, opening a two-month range calendar. Clearing it lives in the toolbar. */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="Date range"
          className={cn('w-full justify-start font-normal lg:w-64', !value?.from && 'text-muted-foreground')}
        >
          <CalendarIcon className="size-4" />
          {value?.from ? formatDayRange(value.from, value.to) : 'Any date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={value}
          onSelect={onChange}
          numberOfMonths={2}
          defaultMonth={value?.from}
          disabled={{ after: new Date() }}
        />
      </PopoverContent>
    </Popover>
  );
}
