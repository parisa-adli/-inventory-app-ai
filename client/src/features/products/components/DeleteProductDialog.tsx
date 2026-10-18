import { useState } from 'react';
import { PERMISSIONS, type Product, type ProductHasMovementsDetails } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
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
import { useDeleteProduct } from '../hooks/useProducts';

interface DeleteProductDialogProps {
  /** The product to delete; null closes the dialog. */
  product: Product | null;
  onClose: () => void;
  /** "Archive instead", offered when the server refuses an active product that has history. */
  onArchiveInstead: (product: Product) => void;
}

const movementsLabel = (count: number) => `${count} stock movement${count === 1 ? '' : 's'}`;

/**
 * Confirm, then DELETE (#36). A 409 PRODUCT_HAS_MOVEMENTS keeps the dialog open and says why, with the
 * movement count and Archive as the way out; the mutation also toasts the error.
 */
export function DeleteProductDialog({ product, onClose, onArchiveInstead }: DeleteProductDialogProps) {
  const remove = useDeleteProduct();
  const [refused, setRefused] = useState<ProductHasMovementsDetails | null>(null);

  const close = () => {
    setRefused(null);
    onClose();
  };

  const confirm = async () => {
    if (!product) return;
    try {
      await remove.mutateAsync(product);
      close();
    } catch (err) {
      const { code, details } = getApiError(err);
      if (code === 'PRODUCT_HAS_MOVEMENTS' && details) setRefused(details as unknown as ProductHasMovementsDetails);
      else close();
    }
  };

  const archiveInstead = () => {
    if (!product) return;
    close();
    onArchiveInstead(product);
  };

  return (
    <AlertDialog open={product !== null} onOpenChange={(open: boolean) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{refused ? 'This product has stock history' : `Delete ${product?.title}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {refused ? (
              <>
                {product?.title} has {movementsLabel(refused.movementCount)}, and deleting it would erase that audit
                history.{' '}
                {product?.status === 'archived'
                  ? 'It is already archived, which keeps it out of the active list.'
                  : 'Archive it instead: it leaves the active list and keeps its history.'}
              </>
            ) : (
              'This cannot be undone. Only a product that never had a stock movement can be deleted.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{refused ? 'Close' : 'Cancel'}</AlertDialogCancel>
          {!refused && (
            <Button variant="destructive" disabled={remove.isPending} onClick={confirm}>
              {remove.isPending ? 'Deleting…' : 'Delete product'}
            </Button>
          )}
          {refused && product?.status !== 'archived' && (
            <Can permission={PERMISSIONS.PRODUCTS_ARCHIVE}>
              <Button onClick={archiveInstead}>Archive instead</Button>
            </Can>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
