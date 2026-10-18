import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  STOCK_MOVEMENT_TYPES,
  signedDelta,
  stockMovementFormSchema,
  type Product,
  type StockMovementFormInput,
  type StockMovementFormValues,
  type StockMovementType,
} from '@inventory/shared';
import { TextField } from '@/components/TextField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getApiError } from '@/lib/apiError';
import { useRecordMovement } from '../hooks/useRecordMovement';

interface TabCopy {
  tab: string;
  quantity: string;
  quantityHint?: string;
  note: string;
  noteHint: string;
  submit: string;
}

/** What each tab asks for. Only an adjustment is signed, and only its note (the reason) is required. */
const TABS: Record<StockMovementType, TabCopy> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: {
    tab: 'Receive',
    quantity: 'Quantity to receive',
    note: 'Note (optional)',
    noteHint: 'A delivery or purchase order reference.',
    submit: 'Receive stock',
  },
  [STOCK_MOVEMENT_TYPES.SHIP]: {
    tab: 'Ship',
    quantity: 'Quantity to ship',
    note: 'Note (optional)',
    noteHint: 'An order reference.',
    submit: 'Ship stock',
  },
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: {
    tab: 'Manual Adjustment',
    quantity: 'Change',
    quantityHint: 'A whole number: positive adds stock, negative removes it (e.g. -3).',
    note: 'Reason',
    noteHint: 'Why the count changed, e.g. a shelf count found a difference or goods were damaged.',
    submit: 'Record adjustment',
  },
};

interface AdjustStockDialogProps {
  /** The product as the table shows it now; the dialog is open while one is given. */
  product: Product | undefined;
  onOpenChange: (open: boolean) => void;
}

/** The server's PRODUCT_ARCHIVED message, also shown when the list already reports the product archived. */
const ARCHIVED_MESSAGE = 'This product is archived; its stock cannot change.';

/** Receive, Ship or Manual Adjustment of one product (#31), through the same ledger as the inline −/+. */
export function AdjustStockDialog({ product, onOpenChange }: AdjustStockDialogProps) {
  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* Keyed, so "archived meanwhile" is forgotten when the dialog closes or opens on another product */}
        {product && <AdjustStockContent key={product.id} product={product} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A product archived while the dialog is open (#36), learnt from a 409 PRODUCT_ARCHIVED or from a refetch, freezes
 * the dialog on every tab: the reason shows above the tabs and nothing can be submitted, only cancelled.
 */
function AdjustStockContent({ product, onDone }: { product: Product; onDone: () => void }) {
  const [archivedMeanwhile, setArchivedMeanwhile] = useState(false);
  const frozen = archivedMeanwhile || product.status === 'archived';
  return (
    <>
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {product.title} ({product.sku}): {product.quantity} {product.unitOfMeasure} on hand.
        </DialogDescription>
      </DialogHeader>
      {frozen && (
        <p role="alert" className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">
          {ARCHIVED_MESSAGE}
        </p>
      )}
      <Tabs defaultValue={STOCK_MOVEMENT_TYPES.RECEIVE}>
        <TabsList className="w-full">
          {Object.values(STOCK_MOVEMENT_TYPES).map((type) => (
            <TabsTrigger key={type} value={type}>
              {TABS[type].tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* Radix mounts only the active tab, so switching tabs starts a fresh form */}
        {Object.values(STOCK_MOVEMENT_TYPES).map((type) => (
          <TabsContent key={type} value={type}>
            <MovementForm
              product={product}
              type={type}
              frozen={frozen}
              onArchived={() => setArchivedMeanwhile(true)}
              onDone={onDone}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

interface MovementFormProps {
  product: Product;
  type: StockMovementType;
  /** The product is archived: the form cannot be submitted. */
  frozen: boolean;
  onArchived: () => void;
  onDone: () => void;
}

function MovementForm({ product, type, frozen, onArchived, onDone }: MovementFormProps) {
  const record = useRecordMovement();
  const form = useForm<StockMovementFormInput, unknown, StockMovementFormValues>({
    resolver: zodResolver(stockMovementFormSchema),
    mode: 'onTouched',
    defaultValues: { type, quantity: '', note: '' },
  });
  const amount = Number(useWatch({ control: form.control, name: 'quantity' }));
  const copy = TABS[type];

  // Warned before submitting, from the count on screen; the server still decides (a colleague may have just received)
  const goesNegative = Number.isInteger(amount) && product.quantity + signedDelta(type, amount) < 0;

  const submit = async (values: StockMovementFormValues) => {
    try {
      await record.mutateAsync({ productId: product.id, ...values });
      onDone();
    } catch (err) {
      // The mutation already toasted and refetched; the reason also stays next to what caused it
      const { code, message } = getApiError(err);
      if (code === 'PRODUCT_ARCHIVED') onArchived();
      else form.setError(code === 'INSUFFICIENT_STOCK' ? 'quantity' : 'root', { message });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4 pt-2" noValidate>
        <TextField control={form.control} name="quantity" label={copy.quantity} hint={copy.quantityHint} />
        {goesNegative && (
          <Badge variant="warning" role="status" className="w-full justify-start rounded-md px-3 py-2 text-sm font-normal whitespace-normal">
            Only {product.quantity} on hand. This would take stock below 0 and will be refused.
          </Badge>
        )}
        <TextField control={form.control} name="note" label={copy.note} hint={copy.noteHint} multiline />
        {form.formState.errors.root && (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={frozen || record.isPending}>
            {record.isPending ? 'Saving…' : copy.submit}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
