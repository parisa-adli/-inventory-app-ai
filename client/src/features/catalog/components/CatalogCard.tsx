import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Permission } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { productCountLabel } from '../format';

interface CatalogCardProps {
  title: string;
  createdAt: string;
  productCount: number;
  /** The Edit icon button (staff and admins). */
  writePermission: Permission;
  /** The Delete icon button (admins). */
  deletePermission: Permission;
  onEdit: () => void;
  onDelete: () => void;
  children?: ReactNode;
}

/** One category or supplier: title with Edit (and, for admins, Delete) icon buttons, details, then created date and product count. */
export function CatalogCard({
  title,
  createdAt,
  productCount,
  writePermission,
  deletePermission,
  onEdit,
  onDelete,
  children,
}: CatalogCardProps) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="break-words">{title}</CardTitle>
        <CardAction className="-mt-2 -mr-2 flex gap-1">
          <Can permission={writePermission}>
            <Button variant="ghost" size="icon" aria-label={`Edit ${title}`} onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
          </Can>
          <Can permission={deletePermission}>
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label={`Delete ${title}`}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
          </Can>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1 space-y-1 text-sm">{children}</CardContent>
      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>Created {formatDate(createdAt)}</span>
        <span className="tabular-nums">{productCountLabel(productCount)}</span>
      </CardFooter>
    </Card>
  );
}
