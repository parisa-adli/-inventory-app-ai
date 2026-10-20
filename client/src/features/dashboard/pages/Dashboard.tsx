import { StockAlerts } from '../components/StockAlerts';
import { MovementsChartWidget } from '../components/MovementsChartWidget';
import { RangePicker } from '../components/RangePicker';
import { RecentMovements } from '../components/RecentMovements';
import { SummaryCards } from '../components/SummaryCards';

/**
 * The default landing page (#57): stock on hand now (the cards and the reorder alerts) and what moved in the range
 * picked in the header (the range's cards and the In-vs-Out chart), plus the latest movements. Each widget has its own
 * query, so one loads, fails and retries without the others. On mobile the range picker sits right above the chart; from
 * `sm` up the grid lifts it beside the title.
 */
export default function Dashboard() {
  return (
    <div className="grid gap-x-3 gap-y-6 sm:grid-cols-[1fr_auto]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Stock on hand now, and what moved in the range.</p>
      </div>
      <div className="sm:col-span-2">
        <SummaryCards />
      </div>
      <div className="sm:col-start-2 sm:row-start-1">
        <RangePicker />
      </div>
      <div className="sm:col-span-2">
        <MovementsChartWidget />
      </div>
      <div className="grid gap-6 sm:col-span-2 lg:grid-cols-2">
        <StockAlerts />
        <RecentMovements />
      </div>
    </div>
  );
}
