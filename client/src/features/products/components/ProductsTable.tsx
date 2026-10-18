import { createContext, use, type ReactNode } from 'react'
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronsUpDown,
  History,
  ImageIcon,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import {
  PERMISSIONS,
  PRODUCT_SORTS,
  STOCK_MOVEMENT_TYPES,
  STOCK_STATUSES,
  getStockStatus,
  type Product,
  type ProductSort,
  type ProductStatus,
  type SortOrder,
} from '@inventory/shared'
import { Can } from '@/features/auth/components/Can'
import { useCan } from '@/features/auth/hooks/useCan'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useRecordMovement } from '../hooks/useRecordMovement'

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })

// Module scope: TanStack Table v9 wants stable features and columns. Sorting is the feature's state and
// header APIs only: the server sorts (manualSorting), and the sort lives in the URL.
const features = tableFeatures({ rowSortingFeature })
const column = createColumnHelper<typeof features, Product>()

const STATUS_BADGES: Record<ProductStatus, { label: string; variant: BadgeProps['variant'] }> = {
  active: { label: 'Active', variant: 'outline' },
  archived: { label: 'Archived', variant: 'secondary' },
}

/** Right-aligned columns (DESIGN.md table pattern): the numbers and the actions. */
const RIGHT_ALIGNED = new Set(['costPrice', 'salePrice', 'quantity', 'actions'])

/** What the row actions open. The columns live at module scope, so the page hands its handlers down this way. */
interface ProductRowActions {
  onEdit: (product: Product) => void
  onAdjustStock: (product: Product) => void
  onStockHistory: (product: Product) => void
  /** Archive an active product or unarchive an archived one (admin). */
  onToggleArchive: (product: Product) => void
  onDelete: (product: Product) => void
}
const RowActionsContext = createContext<ProductRowActions | null>(null)

const columns = column.columns([
  column.accessor('title', {
    header: 'Title',
    cell: ({ row }) => <ProductCell product={row.original} />,
  }),
  column.accessor('sku', {
    header: 'SKU',
    cell: (info) => <span className="text-xs text-muted-foreground">{info.getValue()}</span>,
  }),
  column.accessor((product) => product.category.name, {
    id: 'category',
    header: 'Category',
    enableSorting: false,
    cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
  }),
  column.accessor((product) => product.supplier?.name ?? null, {
    id: 'supplier',
    header: 'Supplier',
    enableSorting: false,
    cell: (info) =>
      info.getValue() ?? (
        <Badge variant="outline" className="text-muted-foreground">
          Unassigned
        </Badge>
      ),
  }),
  // Numbers and dates sort highest/newest first on the first click, like the API's default order
  column.accessor('costPrice', {
    header: 'Cost',
    sortDescFirst: true,
    cell: (info) => money.format(info.getValue()),
  }),
  column.accessor('salePrice', {
    header: 'Sale',
    sortDescFirst: true,
    cell: (info) => money.format(info.getValue()),
  }),
  column.accessor('quantity', {
    header: 'Quantity',
    sortDescFirst: true,
    cell: ({ row }) => <QuantityCell product={row.original} />,
  }),
  column.accessor('unitOfMeasure', {
    header: 'Unit',
    enableSorting: false,
    cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
  }),
  column.accessor('createdAt', {
    header: 'Created',
    sortDescFirst: true,
    cell: (info) => (
      <span className="whitespace-nowrap text-muted-foreground">{formatDate(info.getValue())}</span>
    ),
  }),
  column.accessor('status', {
    header: 'Status',
    enableSorting: false,
    cell: (info) => {
      const { label, variant } = STATUS_BADGES[info.getValue()]
      return <Badge variant={variant}>{label}</Badge>
    },
  }),
  column.display({
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <RowActions product={row.original} />,
  }),
])

function ProductCell({ product }: { product: Product }) {
  return (
    <div className="flex items-center gap-3">
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt=""
          className="size-10 shrink-0 rounded-md border object-cover"
        />
      ) : (
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted"
          aria-hidden
        >
          <ImageIcon className="size-4 text-muted-foreground" />
        </div>
      )}
      <span className="font-medium">{product.title}</span>
    </div>
  )
}

/** Stock changes need STOCK_ADJUST, and archived products are frozen. */
const useCanChangeStock = (product: Product) =>
  useCan(PERMISSIONS.STOCK_ADJUST) && product.status !== 'archived'

function QuantityCell({ product }: { product: Product }) {
  const { quantity } = product
  const stock = getStockStatus(quantity)
  return (
    <div className="flex items-center justify-end gap-2">
      {stock === STOCK_STATUSES.LOW && <Badge variant="warning">Low stock</Badge>}
      {stock === STOCK_STATUSES.OUT && (
        <Badge variant="outline" className="text-muted-foreground">
          Out of stock
        </Badge>
      )}
      <QuantityStepper product={product}>
        <span className="min-w-6 text-center tabular-nums">{quantity}</span>
      </QuantityStepper>
    </div>
  )
}

/**
 * Inline −/+ (#30): a ship or a receive of 1, through the same ledger as every other stock change.
 * Not optimistic; both buttons wait while one runs. Archived products are frozen, so they get none.
 */
function QuantityStepper({ product, children }: { product: Product; children: ReactNode }) {
  const canChangeStock = useCanChangeStock(product)
  const record = useRecordMovement()
  if (!canChangeStock) return children

  const step = (type: typeof STOCK_MOVEMENT_TYPES.RECEIVE | typeof STOCK_MOVEMENT_TYPES.SHIP) =>
    record.mutate({ productId: product.id, type, quantity: 1 })
  return (
    <div className="flex items-center gap-1" aria-busy={record.isPending}>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`Ship 1 ${product.title}`}
        disabled={record.isPending || product.quantity === 0}
        onClick={() => step(STOCK_MOVEMENT_TYPES.SHIP)}
      >
        <Minus />
      </Button>
      {/* {children} */}
      <Button
        variant="outline"
        size="icon-xs"
        aria-label={`Receive 1 ${product.title}`}
        disabled={record.isPending}
        onClick={() => step(STOCK_MOVEMENT_TYPES.RECEIVE)}
      >
        <Plus />
      </Button>
    </div>
  )
}

/**
 * Ghost icon buttons (DESIGN.md): Edit (#35), Adjust stock (#31), Stock history (#32), then the admin's Archive or
 * Unarchive and Delete (#36). Archived products are frozen, so they get no Adjust stock, but they stay editable and
 * their history stays readable.
 */
function RowActions({ product }: { product: Product }) {
  const actions = use(RowActionsContext)
  const canEdit = useCan(PERMISSIONS.PRODUCTS_WRITE)
  const canChangeStock = useCanChangeStock(product)
  const archived = product.status === 'archived'
  if (!actions) return null
  return (
    <div className="flex justify-end gap-1">
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Edit ${product.title}`}
          onClick={() => actions.onEdit(product)}
        >
          <Pencil />
        </Button>
      )}
      {canChangeStock && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Adjust stock of ${product.title}`}
          onClick={() => actions.onAdjustStock(product)}
        >
          <ArrowLeftRight />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Stock history of ${product.title}`}
        onClick={() => actions.onStockHistory(product)}
      >
        <History />
      </Button>
      <Can permission={PERMISSIONS.PRODUCTS_ARCHIVE}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`${archived ? 'Unarchive' : 'Archive'} ${product.title}`}
          onClick={() => actions.onToggleArchive(product)}
        >
          {archived ? <ArchiveRestore /> : <Archive />}
        </Button>
      </Can>
      <Can permission={PERMISSIONS.PRODUCTS_DELETE}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${product.title}`}
          onClick={() => actions.onDelete(product)}
        >
          <Trash2 />
        </Button>
      </Can>
    </div>
  )
}

const SORT_ICONS = { asc: ArrowUp, desc: ArrowDown } as const
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

const isProductSort = (id: string): id is ProductSort =>
  (PRODUCT_SORTS as readonly string[]).includes(id)

/** The server-side sort the table shows and changes; the page keeps it in the URL. */
export interface ProductsSort {
  sort: ProductSort
  order: SortOrder
  onSort: (sort: ProductSort, order: SortOrder) => void
}

/**
 * The products list as a TanStack Table. Sorting and paging are server-side: a sortable header asks for a new
 * sort (one column at a time, never unsorted) and the page refetches. Quantity has inline −/+ (#30); Actions has
 * Edit (#35), Adjust stock (#31), Stock history (#32) and the admin's Archive / Unarchive and Delete (#36).
 */
export function ProductsTable({
  products,
  sort,
  order,
  onSort,
  ...actions
}: { products: Product[] } & ProductsSort & ProductRowActions) {
  const sorting: SortingState = [{ id: sort, desc: order === 'desc' }]
  const table = useTable({
    features,
    columns,
    data: products,
    getRowId: (product) => product.id,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    state: { sorting },
    onSortingChange: (updater: Updater<SortingState>) => {
      const [next] = typeof updater === 'function' ? updater(sorting) : updater
      if (next && isProductSort(next.id)) onSort(next.id, next.desc ? 'desc' : 'asc')
    },
  })

  return (
    <RowActionsContext value={actions}>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const { column } = header
                  const sorted = column.getIsSorted()
                  const SortIcon = sorted ? SORT_ICONS[sorted] : ChevronsUpDown
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(RIGHT_ALIGNED.has(column.id) && 'text-right')}
                      aria-sort={
                        column.getCanSort() ? (sorted ? ARIA_SORT[sorted] : 'none') : undefined
                      }
                    >
                      {header.isPlaceholder ? null : column.getCanSort() ? (
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-foreground',
                            RIGHT_ALIGNED.has(column.id) && 'flex-row-reverse'
                          )}
                          onClick={column.getToggleSortingHandler()}
                        >
                          <table.FlexRender header={header} />
                          <SortIcon
                            className={cn('size-3.5', !sorted && 'text-muted-foreground')}
                            aria-hidden
                          />
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(RIGHT_ALIGNED.has(cell.column.id) && 'text-right tabular-nums')}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </RowActionsContext>
  )
}
