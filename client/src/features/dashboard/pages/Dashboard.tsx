import { StockAlerts } from '../components/StockAlerts';
import { MovementsChartWidget } from '../components/MovementsChartWidget';
import { RangePicker } from '../components/RangePicker';
import { RecentMovements } from '../components/RecentMovements';
import { SummaryCards } from '../components/SummaryCards';

/**
 * The default landing page (#57): stock on hand now (the cards and the reorder alerts) and what moved in the range
 * picked in the header (the range's cards and the In-vs-Out chart), plus the latest movements. Each widget has its own
 * query, so one loads, fails and retries without the others.
 */
export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Stock on hand now, and what moved in the range.</p>
        </div>
        <RangePicker />
      </div>
      <SummaryCards />
      <MovementsChartWidget />
      <div className="grid gap-6 lg:grid-cols-2">
        <StockAlerts />
        <RecentMovements />
      </div>
    </div>
  );
}
