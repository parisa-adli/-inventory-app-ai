import { Check, ChevronDown } from 'lucide-react';
import { DASHBOARD_FIRST_DAY, DASHBOARD_RANGES, type DashboardRange } from '@inventory/shared';
import { DayPicker } from '@/components/DayPicker';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { fromDay, toDay, useDashboardRange } from '../hooks/useDashboardRange';

const RANGES = Object.entries(DASHBOARD_RANGES) as [DashboardRange, string][];
const FIRST_DAY = fromDay(DASHBOARD_FIRST_DAY);
/** Custom starts as the 30 days up to today, which the From / To buttons then move. */
const CUSTOM_START_DAYS = 30;

/**
 * The dashboard's time range: an outline button naming it opening a menu with the current choice checked on the right.
 * Custom adds a From and a To day button beside it (as on the Movements page); both ends are always set.
 */
export function RangePicker() {
  const { range, custom, setRange } = useDashboardRange();
  const today = new Date();

  const pickCustom = () => {
    if (custom) return;
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (CUSTOM_START_DAYS - 1));
    setRange({ from: toDay(from), to: toDay(today) });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            aria-label={`Time range: ${DASHBOARD_RANGES[range]}`}
            className="h-10 rounded-lg font-normal"
          >
            {DASHBOARD_RANGES[range]}
            <ChevronDown className="text-muted-foreground" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {RANGES.map(([value, label]) => (
            <DropdownMenuItem
              key={value}
              role="menuitemradio"
              aria-checked={value === range}
              onSelect={() => (value === 'custom' ? pickCustom() : setRange(value))}
              className={cn('justify-between', value === range && 'bg-accent/60')}
            >
              {label}
              {value === range && <Check aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {custom && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm">From</span>
            <DayPicker
              label="From"
              value={fromDay(custom.from)}
              onChange={(day) => day && setRange({ from: toDay(day), to: custom.to })}
              disabled={[{ before: FIRST_DAY }, { after: fromDay(custom.to) }]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">To</span>
            <DayPicker
              label="To"
              value={fromDay(custom.to)}
              onChange={(day) => day && setRange({ from: custom.from, to: toDay(day) })}
              disabled={[{ before: fromDay(custom.from) }, { after: today }]}
            />
          </div>
        </>
      )}
    </div>
  );
}
