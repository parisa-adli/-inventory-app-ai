import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HIDEABLE_COLUMNS, type ColumnVisibility } from '../hooks/useColumnVisibility';

/** The toolbar's "Columns" menu: one checkbox per column that can be hidden; it stays open while you toggle. */
export function ColumnsMenu({ columnVisibility, setColumnVisibility }: ColumnVisibility) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-10 rounded-lg">
          <Columns3 />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(HIDEABLE_COLUMNS).map(([id, label]) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={columnVisibility[id] !== false}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              setColumnVisibility({ ...columnVisibility, [id]: checked === true })
            }
            onSelect={(event: Event) => event.preventDefault()}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
