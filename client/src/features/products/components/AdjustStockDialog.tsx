import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADJUSTMENT_DIRECTIONS,
  STOCK_MOVEMENT_TYPES,
  signedDelta,
  stockMovementFormSchema,
  type AdjustmentDirection,
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
import { Label } from '@/components/ui/label';
import { getApiError } from '@/lib/apiError';
import { useRecordMovement } from '../hooks/useRecordMovement';

interface TypeCopy {
  label: string;
  description: string;
  note: string;
  notePlaceholder: string;
  submit: string;
}

/** What each movement asks for. Only an adjustment has a direction, and only its note (the reason) is required. */
const TYPES: Record<StockMovementType, TypeCopy> = {
  [STOCK_MOVEMENT_TYPES.RECEIVE]: {
    label: 'Receive',
    description: 'For goods that arrived, e.g. a delivery from a supplier.',
    note: 'Note (optional)',
    notePlaceholder: 'e.g. PO-2417',
    submit: 'Receive stock',
  },
  [STOCK_MOVEMENT_TYPES.SHIP]: {
    label: 'Ship',
    description: 'For goods that left, e.g. a customer order.',
    note: 'Note (optional)',
    notePlaceholder: 'e.g. Sales order SO-10423',
    submit: 'Ship stock',
  },
  [STOCK_MOVEMENT_TYPES.ADJUSTMENT]: {
    label: 'Adjustment',
    description: 'For stock that changed without a delivery or a sale.',
    note: 'Reason',
    notePlaceholder: 'e.g. Expired, past use-by date',
    submit: 'Record adjustment',
  },
};

const DIRECTIONS: Record<AdjustmentDirection, { label: string; when: string[] }> = {
  [ADJUSTMENT_DIRECTIONS.INCREASE]: { label: 'Increase', when: ['Found in a recount', 'Returned by a customer'] },
  [ADJUSTMENT_DIRECTIONS.DECREASE]: { label: 'Decrease', when: ['Stolen or lost', 'Expired or damaged'] },
};

/** A row of equal-width buttons, one of them chosen. */
function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, { label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const id = `choice-${label.toLowerCase()}`;
  return (
    <div className="space-y-2">
      <Label id={id}>{label}</Label>
      <div role="group" aria-labelledby={id} className="grid auto-cols-fr grid-flow-col gap-3">
        {(Object.keys(options) as T[]).map((option) => (
          <Button
            key={option}
            type="button"
            variant={option === value ? 'default' : 'outline'}
            aria-pressed={option === value}
            onClick={() => onChange(option)}
          >
            {options[option].label}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface AdjustStockDialogProps {
  /** The product as the table shows it now; the dialog is open while one is given. */
  product: Product | undefined;
  onOpenChange: (open: boolean) => void;
}

/** The server's PRODUCT_ARCHIVED message, also shown when the list already reports the product archived. */
const ARCHIVED_MESSAGE = 'This product is archived; its stock cannot change.';

/** Receive, Ship or Adjustment (Increase / Decrease) of one product (#31), through the same ledger as the inline −/+. */
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
 * the dialog for every movement: the reason shows at the top and nothing can be submitted, only cancelled.
 */
function AdjustStockContent({ product, onDone }: { product: Product; onDone: () => void }) {
  const [type, setType] = useState<StockMovementType>(STOCK_MOVEMENT_TYPES.RECEIVE);
  const [archivedMeanwhile, setArchivedMeanwhile] = useState(false);
  const frozen = archivedMeanwhile || product.status === 'archived';
  return (
    <>
      <DialogHeader>
        <DialogTitle>Adjust stock</DialogTitle>
        <DialogDescription>
          {product.title} · {product.quantity} {product.unitOfMeasure} on hand
        </DialogDescription>
      </DialogHeader>
      {frozen && (
        <p role="alert" className="rounded-md border border-destructive/50 px-3 py-2 text-sm text-destructive">
          {ARCHIVED_MESSAGE}
        </p>
      )}
      <div className="space-y-2">
        <ChoiceGroup label="Movement" options={TYPES} value={type} onChange={setType} />
        <p className="text-sm text-muted-foreground">{TYPES[type].description}</p>
      </div>
      {/* Keyed, so switching the movement starts a fresh form */}
      <MovementForm
        key={type}
        product={product}
        type={type}
        frozen={frozen}
        onArchived={() => setArchivedMeanwhile(true)}
        onDone={onDone}
      />
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
    defaultValues: { type, direction: ADJUSTMENT_DIRECTIONS.INCREASE, quantity: '', note: '' },
  });
  const direction = useWatch({ control: form.control, name: 'direction' }) ?? ADJUSTMENT_DIRECTIONS.INCREASE;
  const amount = Number(useWatch({ control: form.control, name: 'quantity' }));
  const copy = TYPES[type];
  const isAdjustment = type === STOCK_MOVEMENT_TYPES.ADJUSTMENT;
  const unit = product.unitOfMeasure;

  // Previewed from the count on screen; the server still decides (a colleague may have just received)
  const signed = isAdjustment && direction === ADJUSTMENT_DIRECTIONS.DECREASE ? -amount : amount;
  const onHandAfter = Number.isInteger(amount) && amount > 0 ? product.quantity + signedDelta(type, signed) : product.quantity;
  const goesNegative = onHandAfter < 0;

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
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
        {isAdjustment && (
          <div className="space-y-2">
            <ChoiceGroup
              label="Direction"
              options={DIRECTIONS}
              value={direction}
              onChange={(next) => form.setValue('direction', next)}
            />
            <div className="text-sm text-muted-foreground">
              <p>{DIRECTIONS[direction].label} when stock is:</p>
              <ul className="list-disc pl-6">
                {DIRECTIONS[direction].when.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <TextField control={form.control} name="quantity" label={`Quantity (${unit})`} />
        {goesNegative && (
          <Badge variant="warning" role="status" className="w-full justify-start rounded-md px-3 py-2 text-sm font-normal whitespace-normal">
            Only {product.quantity} on hand. This would take stock below 0 and will be refused.
          </Badge>
        )}
        <TextField control={form.control} name="note" label={copy.note} placeholder={copy.notePlaceholder} />
        <p className="text-sm" role="status">
          On hand after: <span className="font-semibold tabular-nums">{onHandAfter}</span> {unit}
        </p>
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
