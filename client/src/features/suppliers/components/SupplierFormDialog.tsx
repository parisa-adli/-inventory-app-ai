import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supplierFormSchema, type Supplier, type SupplierFormValues } from '@inventory/shared';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { getApiError } from '@/lib/apiError';
import { toCreateBody, toUpdateBody } from '@/features/catalog/hooks/createCatalogHooks';
import { useCreateSupplier, useUpdateSupplier } from '../hooks/useSuppliers';

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this supplier; create a new one when absent. */
  supplier?: Supplier | null;
  /** Called with the saved supplier, e.g. to select it in the product form (P3). */
  onSaved?: (supplier: Supplier) => void;
}

/** Create or edit a supplier. The one save + validation path, reused by the product form in P3. */
export function SupplierFormDialog({ open, onOpenChange, supplier, onSaved }: SupplierFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {/* Keyed so reopening for another supplier starts from its values */}
        {open && (
          <SupplierForm key={supplier?.id ?? 'new'} supplier={supplier} onDone={onOpenChange} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  supplier,
  onDone,
  onSaved,
}: {
  supplier?: Supplier | null;
  onDone: (open: boolean) => void;
  onSaved?: (supplier: Supplier) => void;
}) {
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    mode: 'onTouched',
    defaultValues: {
      name: supplier?.name ?? '',
      contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      notes: supplier?.notes ?? '',
    },
  });
  const isPending = create.isPending || update.isPending;

  const submit = async (values: SupplierFormValues) => {
    try {
      const saved = supplier
        ? await update.mutateAsync({ id: supplier.id, body: { ...toUpdateBody(values), name: values.name } })
        : await create.mutateAsync({ ...toCreateBody(values), name: values.name });
      onSaved?.(saved);
      onDone(false);
    } catch (err) {
      // The mutation already toasted; a duplicate also goes on the field
      const { code, message } = getApiError(err);
      if (code === 'DUPLICATE_SUPPLIER') form.setError('name', { message });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>{supplier ? 'Edit supplier' : 'New supplier'}</DialogTitle>
          <DialogDescription>Only the name is required. Names must be unique.</DialogDescription>
        </DialogHeader>
        <TextField control={form.control} name="name" label="Name" autoComplete="organization" />
        <TextField control={form.control} name="contactPerson" label="Contact person" autoComplete="name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="phone" label="Phone" type="tel" autoComplete="tel" />
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
        </div>
        <TextField control={form.control} name="address" label="Address" multiline autoComplete="street-address" />
        <TextField control={form.control} name="notes" label="Notes" multiline />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : supplier ? 'Save' : 'Create supplier'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
