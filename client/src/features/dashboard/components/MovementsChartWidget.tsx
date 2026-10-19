import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { MOVEMENTS_CHART_RANGES, type MovementsChartGranularity, type MovementsChartRange } from '@inventory/shared';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMovementsChart } from '../hooks/useDashboard';
import { Widget, WidgetEmpty, WidgetError } from './Widget';

const RANGES = Object.keys(MOVEMENTS_CHART_RANGES) as MovementsChartRange[];
const DEFAULT_RANGE: MovementsChartRange = '30d';
const isRange = (value: string | null): value is MovementsChartRange => RANGES.includes(value as MovementsChartRange);
/** "7d" → 7 */
const rangeDays = (range: MovementsChartRange) => Number.parseInt(range, 10);

/** The viewer's own zone: the server cuts the days and weeks at its midnights, so "today" is the viewer's today. */
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const config = {
  received: { label: 'Received', color: 'var(--chart-received)' },
  shipped: { label: 'Shipped', color: 'var(--chart-shipped)' },
} satisfies ChartConfig;

const units = new Intl.NumberFormat();
const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
/** "Oct 18", or "Week of Oct 13" for a weekly bucket (in the viewer's zone, where the bucket starts at midnight). */
const bucketLabel = (bucketStart: string, granularity: MovementsChartGranularity) => {
  const day = shortDay.format(new Date(bucketStart));
  return granularity === 'week' ? `Week of ${day}` : day;
};

/**
 * Units received vs shipped per day (7 / 30 days) or ISO week (90 days), zero-filled, adjustments left out (C26).
 * The range is a tab kept in `?range=` (30 days by default, left out of the URL), so a refresh keeps it.
 */
export function MovementsChartWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = searchParams.get('range');
  const range = isRange(rangeParam) ? rangeParam : DEFAULT_RANGE;
  const { data, isPending, isError, refetch } = useMovementsChart({ range, tz: TIME_ZONE });

  const setRange = (value: string) =>
    setSearchParams(
      (params) => {
        if (value === DEFAULT_RANGE) params.delete('range');
        else params.set('range', value);
        return params;
      },
      { replace: true },
    );

  const totals = data?.buckets.reduce(
    (sum, bucket) => ({ received: sum.received + bucket.received, shipped: sum.shipped + bucket.shipped }),
    { received: 0, shipped: 0 },
  );
  const rows = data?.buckets.map((bucket) => ({ ...bucket, label: bucketLabel(bucket.bucketStart, data.granularity) }));

  return (
    <Widget
      title="Received vs shipped"
      description="In units across all products; adjustments are left out."
      action={
        <Tabs value={range} onValueChange={setRange}>
          <TabsList>
            {RANGES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {rangeDays(value)} days
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
    >
      {isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : isError ? (
        <WidgetError what="the chart" onRetry={() => void refetch()} />
      ) : totals && rows && totals.received + totals.shipped > 0 ? (
        <>
          <dl className="flex gap-6">
            {(['received', 'shipped'] as const).map((key) => (
              <div key={key}>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ backgroundColor: config[key].color }} aria-hidden />
                  {config[key].label}
                </dt>
                <dd className="text-xl font-semibold tabular-nums" aria-label={`${config[key].label} in range`}>
                  {units.format(totals[key])}
                </dd>
              </div>
            ))}
          </dl>
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <BarChart accessibilityLayer data={rows} margin={{ left: -16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
              <Bar dataKey="received" fill="var(--color-received)" radius={4} />
              <Bar dataKey="shipped" fill="var(--color-shipped)" radius={4} />
            </BarChart>
          </ChartContainer>
        </>
      ) : (
        <WidgetEmpty>No receipts or shipments in the last {rangeDays(range)} days.</WidgetEmpty>
      )}
    </Widget>
  );
}
