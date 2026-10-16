import { useState } from 'react';
import { Link } from 'react-router';
import type { InUseDetails } from '@inventory/shared';
import { PATHS } from '@/app/paths';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getApiError } from '@/lib/apiError';
import { productCountLabel } from '../format';

interface DeleteRecordDialogProps {
  /** The record to delete; null closes the dialog. */
  record: { id: string; name: string } | null;
  /** 'category' or 'supplier': the label and the Products filter the link sets. */
  kind: 'category' | 'supplier';
  /** The 409 code that means "products still use it". */
  inUseCode: string;
  onConfirm: () => Promise<unknown>;
  isPending: boolean;
  onClose: () => void;
}

/** Products page link that shows the blocking products: active ones, or the Archived tab if all are archived. */
const blockingProductsHref = (kind: 'category' | 'supplier', id: string, usage: InUseDetails) => {
  const params = new URLSearchParams({ [kind]: id });
  if (usage.archivedCount === usage.productCount) params.set('status', 'archived');
  return `${PATHS.products}?${params}`;
};

/**
 * Confirm, then DELETE. A 409 (products still use the record) keeps the dialog open and says why, with a
 * link to those products; the mutation also toasts the error.
 */
export function DeleteRecordDialog({ record, kind, inUseCode, onConfirm, isPending, onClose }: DeleteRecordDialogProps) {
  const [usage, setUsage] = useState<InUseDetails | null>(null);

  const close = () => {
    setUsage(null);
    onClose();
  };

  const confirm = async () => {
    try {
      await onConfirm();
      close();
    } catch (err) {
      const { code, details } = getApiError(err);
      if (code === inUseCode && details) setUsage(details as unknown as InUseDetails);
      else close();
    }
  };

  return (
    <AlertDialog open={record !== null} onOpenChange={(open: boolean) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{usage ? 'Used by products' : `Delete ${record?.name}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {usage ? (
              <div className="space-y-2">
                <p>
                  {record?.name} is used by {productCountLabel(usage.productCount)}
                  {usage.archivedCount > 0 && ` (${usage.archivedCount} archived)`}. Move them to another {kind} or
                  delete them first.
                </p>
                {record && (
                  <Link className="text-foreground underline" to={blockingProductsHref(kind, record.id, usage)}>
                    Show these products
                  </Link>
                )}
              </div>
            ) : (
              <p>This cannot be undone. A {kind} that products still use cannot be deleted.</p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{usage ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {!usage && (
            <Button variant="destructive" disabled={isPending} onClick={confirm}>
              {isPending ? 'Deleting…' : `Delete ${kind}`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
