import { Link } from 'react-router'
import { STOCK_STATUSES } from '@inventory/shared'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StockBadge } from '@/features/products/components/StockStatusBadge'
import { useDashboardAlerts } from '../hooks/useDashboard'
import { productsLink } from '../productsLink'
import { Widget, WidgetEmpty, WidgetError } from './Widget'

/**
 * Active products to reorder (C26): out of stock first, then low by quantity. At most 5 rows (a muted line says how
 * many qualify when there are more), then links to the Products page under each stock-status filter.
 */
export function StockAlerts() {
  const { data, isPending, isError, refetch } = useDashboardAlerts()
  return (
    <Widget title="Stock alerts">
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : isError ? (
        <WidgetError what="stock alerts" onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <WidgetEmpty>Every product is above the low-stock threshold.</WidgetEmpty>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">
                      <Link to={productsLink({ sku: alert.sku })} className="hover:underline">
                        {alert.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {alert.quantity} <span className="text-muted-foreground">{alert.unit}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StockBadge status={alert.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {!isPending && !isError && (
        <p className="flex gap-4 text-sm">
          <Link
            to={productsLink({ stockStatus: STOCK_STATUSES.LOW })}
            className="font-medium hover:underline"
          >
            View low stock
          </Link>
          <Link
            to={productsLink({ stockStatus: STOCK_STATUSES.OUT })}
            className="font-medium hover:underline"
          >
            View out of stock
          </Link>
        </p>
      )}
    </Widget>
  )
}
