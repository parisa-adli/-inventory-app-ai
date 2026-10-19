import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { MovementsChartGranularity } from '@inventory/shared';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMoney } from '@/lib/money';
import { useSettings } from '@/lib/settings';
import { useMovementsChart } from '../hooks/useDashboard';
import { useDashboardRange } from '../hooks/useDashboardRange';
import { Widget, WidgetEmpty, WidgetError } from './Widget';

type Metric = 'units' | 'value';

const config = {
  in: { label: 'In', color: 'var(--chart-received)' },
  out: { label: 'Out', color: 'var(--chart-shipped)' },
} satisfies ChartConfig;

const units = new Intl.NumberFormat();
const labelFormats: Record<MovementsChartGranularity, Intl.DateTimeFormat> = {
  hour: new Intl.DateTimeFormat(undefined, { hour: 'numeric' }),
  day: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
  week: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
  month: new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }),
};
/** The axis names a bucket by its start in the viewer's zone ("14", "Oct 18", "Oct 2026"); the tooltip adds "Week of". */
const bucketLabel = (bucketStart: string, granularity: MovementsChartGranularity) =>
  labelFormats[granularity].format(new Date(bucketStart));

/**
 * Stock in vs out over the dashboard's range (C26): per hour, day, ISO week or month (the server picks), zero-filled,
 * adjustments left out. Units counts quantities across all products; Value is received × unit cost vs shipped × unit
 * price. The metric is a tab kept in `?chart=value` (units by default, left out of the URL).
 */
export function MovementsChartWidget() {
  const [searchParams, setSearchParams] = useSearchParams();
  const metric: Metric = searchParams.get('chart') === 'value' ? 'value' : 'units';
  const { params, label } = useDashboardRange();
  const { data, isPending, isError, refetch } = useMovementsChart(params);
  const formatMoney = useMoney();
  const { currency } = useSettings();
  // The value axis in short money ("$20K"), in the app currency
  const compactMoney = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact' }), [currency]);

  const setMetric = (value: string) =>
    setSearchParams(
      (search) => {
        if (value === 'value') search.set('chart', 'value');
        else search.delete('chart');
        return search;
      },
      { replace: true },
    );

  const rows = data?.buckets.map((bucket) => ({
    label: bucketLabel(bucket.bucketStart, data.granularity),
    tooltip: data.granularity === 'week' ? `Week of ${bucketLabel(bucket.bucketStart, 'day')}` : bucketLabel(bucket.bucketStart, data.granularity),
    in: metric === 'value' ? bucket.receivedValue : bucket.receivedUnits,
    out: metric === 'value' ? bucket.shippedValue : bucket.shippedUnits,
  }));
  // Per metric: shipments of free products have units but no value
  const hasBars = rows?.some((row) => row.in + row.out > 0);
  const formatValue = (value: number) => (metric === 'value' ? formatMoney(value) : units.format(value));

  return (
    <Widget
      title="Stock in vs out"
      description={
        <span className="flex gap-4">
          {(['in', 'out'] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: config[key].color }} aria-hidden />
              {config[key].label}
            </span>
          ))}
        </span>
      }
      action={
        <Tabs value={metric} onValueChange={setMetric}>
          <TabsList aria-label="Chart metric">
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="value">Value</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : isError ? (
        <WidgetError what="the chart" onRetry={() => void refetch()} />
      ) : rows && hasBars ? (
        <ChartContainer config={config} className="aspect-auto h-72 w-full">
          <BarChart accessibilityLayer data={rows} margin={{ left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis
              tickLine={false}
              axisLine={false}
              allowDecimals={metric === 'value'}
              tickFormatter={(value: number) => (metric === 'value' ? compactMoney.format(value) : units.format(value))}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dashed"
                  labelFormatter={(_, payload) => payload[0]?.payload.tooltip}
                  formatter={(value, name) => (
                    <div className="flex flex-1 items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: config[name as keyof typeof config].color }}
                          aria-hidden
                        />
                        {config[name as keyof typeof config].label}
                      </span>
                      <span className="font-medium tabular-nums text-foreground">{formatValue(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar dataKey="in" fill="var(--color-in)" radius={4} />
            <Bar dataKey="out" fill="var(--color-out)" radius={4} />
          </BarChart>
        </ChartContainer>
      ) : (
        <WidgetEmpty>No receipts or shipments in this range ({label}).</WidgetEmpty>
      )}
    </Widget>
  );
}
