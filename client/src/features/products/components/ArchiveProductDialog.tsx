import type { Product } from '@inventory/shared';
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
import { useSetProductArchived } from '../hooks/useProducts';

interface ArchiveProductDialogProps {
  /** The product to archive (an active one) or unarchive (an archived one); null closes the dialog. */
  product: Product | null;
  onClose: () => void;
}

/**
 * Confirms an archive or unarchive (#36). Archiving with stock on hand is allowed, but the dialog warns that
 * those units leave the stock value. Either way the mutation toasts, and the dialog closes.
 */
export function ArchiveProductDialog({ product, onClose }: ArchiveProductDialogProps) {
  const archiveMutation = useSetProductArchived();
  const archiving = product?.status !== 'archived';

  const confirm = async () => {
    if (!product) return;
    try {
      await archiveMutation.mutateAsync({ id: product.id, archived: archiving });
    } catch {
      // Toasted by the mutation
    }
    onClose();
  };

  return (
    <AlertDialog open={product !== null} onOpenChange={(open: boolean) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{archiving ? `Archive ${product?.title}?` : `Unarchive ${product?.title}?`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {archiving ? (
                <>
                  <p>
                    It moves to the Archived tab and its stock is frozen: no receive, ship or adjustment until it is
                    unarchived. Its stock history is kept.
                  </p>
                  {product && product.quantity > 0 && (
                    <p className="font-medium text-foreground">
                      Its {product.quantity} {product.unitOfMeasure} on hand will leave the stock value.
                    </p>
                  )}
                </>
              ) : (
                <p>It returns to the active list and its stock can change again.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant={archiving ? 'destructive' : 'default'} disabled={archiveMutation.isPending} onClick={confirm}>
            {archiveMutation.isPending ? 'Saving…' : archiving ? 'Archive product' : 'Unarchive product'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
