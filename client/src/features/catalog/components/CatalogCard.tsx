import type { ReactNode } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { Permission } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, productCountLabel } from '../format';


interface CatalogCardProps {
  title: string;
  createdAt: string;
  productCount: number;
  /** Edit and Delete are shown only with this permission. */
  managePermission: Permission;
  onEdit: () => void;
  onDelete: () => void;
  children?: ReactNode;
}

/** One category or supplier: title, a ⋯ menu for admins, details, then created date and product count. */
export function CatalogCard({
  title,
  createdAt,
  productCount,
  managePermission,
  onEdit,
  onDelete,
  children,
}: CatalogCardProps) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="break-words">{title}</CardTitle>
        <Can permission={managePermission}>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="-mt-2 -mr-2" aria-label={`Actions for ${title}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </Can>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 text-sm">{children}</CardContent>
      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>Created {formatDate(createdAt)}</span>
        <span className="tabular-nums">{productCountLabel(productCount)}</span>
      </CardFooter>
    </Card>
  );
}
