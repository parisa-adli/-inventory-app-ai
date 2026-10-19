import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DASHBOARD_FIRST_DAY, DASHBOARD_RANGES, type DashboardRange } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDayRange, fromDay, toDay, useDashboardRange } from '../hooks/useDashboardRange';

const RANGES = Object.entries(DASHBOARD_RANGES) as [DashboardRange, string][];
const FIRST_DAY = fromDay(DASHBOARD_FIRST_DAY);
/** The Calendar lays two months side by side from `md`; below that they would stack. */
const TWO_MONTHS_QUERY = '(min-width: 768px)';

/**
 * The dashboard's time range: an outline button naming it ("All time", or the custom days) opening a menu with the
 * current choice checked on the right. Custom opens a range calendar under the button once the menu has closed (two
 * open layers would fight over focus); Apply keeps the picked days. Closing the calendar returns focus to the button.
 */
export function RangePicker() {
  const { range, custom, setRange } = useDashboardRange();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [twoMonths, setTwoMonths] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set when Custom is picked, read as the menu finishes closing
  const customPicked = useRef(false);
  // Set when the calendar closes because the button was pressed: the menu opens and takes focus instead
  const closedByTrigger = useRef(false);

  const openCalendar = () => {
    setDraft(custom ? { from: fromDay(custom.from), to: fromDay(custom.to) } : undefined);
    setTwoMonths(window.matchMedia(TWO_MONTHS_QUERY).matches);
    setCalendarOpen(true);
  };

  const apply = () => {
    if (!draft?.from) return;
    setRange({ from: toDay(draft.from), to: toDay(draft.to ?? draft.from) });
    setCalendarOpen(false);
  };

  const today = new Date();
  const triggerLabel = custom ? formatDayRange(custom.from, custom.to) : DASHBOARD_RANGES[range];

  return (
    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
      <DropdownMenu modal={false}>
        <PopoverAnchor asChild>
          <DropdownMenuTrigger asChild>
            <Button
              ref={triggerRef}
              variant="outline"
              aria-label={`Time range: ${triggerLabel}`}
              className="h-10 rounded-lg font-normal"
            >
              {triggerLabel}
              <ChevronDown className="text-muted-foreground" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </PopoverAnchor>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onCloseAutoFocus={(event: Event) => {
            if (!customPicked.current) return;
            customPicked.current = false;
            event.preventDefault();
            openCalendar();
          }}
        >
          {RANGES.map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              role="menuitemradio"
              aria-checked={value === range}
              onSelect={() => {
                if (value === 'custom') customPicked.current = true;
                else setRange(value);
              }}
              className={cn('justify-between', value === range && 'bg-accent/60')}
            >
              {label}
              {value === range && <Check aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <PopoverContent
        align="end"
        aria-label="Custom range"
        className="w-auto p-0"
        onInteractOutside={(event: Event) => {
          if (triggerRef.current?.contains(event.target as Node)) closedByTrigger.current = true;
        }}
        onCloseAutoFocus={(event: Event) => {
          event.preventDefault();
          if (!closedByTrigger.current) triggerRef.current?.focus();
          closedByTrigger.current = false;
        }}
      >
        <Calendar
          mode="range"
          selected={draft}
          onSelect={setDraft}
          numberOfMonths={twoMonths ? 2 : 1}
          defaultMonth={draft?.from ?? (twoMonths ? new Date(today.getFullYear(), today.getMonth() - 1) : today)}
          startMonth={FIRST_DAY}
          disabled={[{ before: FIRST_DAY }, { after: today }]}
        />
        <div className="flex items-center justify-between gap-3 border-t p-3">
          <p className="text-sm text-muted-foreground">
            {draft?.from ? formatDayRange(toDay(draft.from), toDay(draft.to ?? draft.from)) : 'Pick the first day'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCalendarOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={apply} disabled={!draft?.from}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
