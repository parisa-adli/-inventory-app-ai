import { useForm, type Control, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  UNITS_OF_MEASURE,
  productFormSchema,
  type CreateProductInput,
  type ProductFormInput,
  type ProductFormValues,
  type UnitOfMeasure,
} from '@inventory/shared';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiError } from '@/lib/apiError';
import { useCategories } from '@/features/categories/hooks/useCategories';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useCreateProduct } from '../hooks/useProducts';

/** The product selects list every record by name (Phase 2: `limit=100&sort=name`). */
const PICKER_PARAMS = { limit: 100, sort: 'name' } as const;

/** Radix Select has no empty item value; this one stands for "no supplier" (the form's ''). */
const NO_SUPPLIER = 'none';

const UNIT_LABELS: Record<UnitOfMeasure, string> = {
  pcs: 'Pieces (pcs)',
  kg: 'Kilograms (kg)',
  box: 'Boxes (box)',
  l: 'Litres (l)',
  m: 'Metres (m)',
};

const EMPTY: ProductFormInput = {
  title: '',
  sku: '',
  category: '',
  supplier: '',
  costPrice: '',
  salePrice: '',
  unitOfMeasure: 'pcs',
  imageUrl: '',
};

/** Create body: no quantity (every product starts at 0); empty optional inputs are left out. */
const toCreateBody = ({ supplier, imageUrl, ...values }: ProductFormValues): CreateProductInput => ({
  ...values,
  ...(supplier && { supplier }),
  ...(imageUrl && { imageUrl }),
});

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Create a product. Stock is never entered here: it arrives through a recorded Receive. */
export function ProductFormDialog({ open, onOpenChange }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && <ProductForm onDone={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ onDone }: { onDone: (open: boolean) => void }) {
  const create = useCreateProduct();
  const categories = useCategories(PICKER_PARAMS);
  const suppliers = useSuppliers(PICKER_PARAMS);
  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    mode: 'onTouched',
    defaultValues: EMPTY,
  });

  const submit = async (values: ProductFormValues) => {
    try {
      await create.mutateAsync(toCreateBody(values));
      onDone(false);
    } catch (err) {
      // The mutation already toasted; a duplicate also goes on the field
      const { code, message } = getApiError(err);
      if (code === 'DUPLICATE_SKU') form.setError('sku', { message });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>Products start with 0 in stock. Receive stock once the product exists.</DialogDescription>
        </DialogHeader>
        <TextField control={form.control} name="title" label="Title" />
        <TextField control={form.control} name="sku" label="SKU" hint="Letters, digits and dashes. Saved in capitals." />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            control={form.control}
            name="category"
            label="Category"
            placeholder={categories.isPending ? 'Loading…' : 'Choose a category'}
            options={(categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.title }))}
          />
          <SelectField
            control={form.control}
            name="supplier"
            label="Supplier (optional)"
            placeholder="No supplier"
            options={[
              { value: NO_SUPPLIER, label: 'No supplier' },
              ...(suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
            ]}
            emptyValue={NO_SUPPLIER}
          />
          <TextField control={form.control} name="costPrice" label="Cost price" />
          <TextField control={form.control} name="salePrice" label="Sale price" />
          <SelectField
            control={form.control}
            name="unitOfMeasure"
            label="Unit"
            options={UNITS_OF_MEASURE.map((unit) => ({ value: unit, label: UNIT_LABELS[unit] }))}
          />
        </div>
        <TextField control={form.control} name="imageUrl" label="Image URL (optional)" hint="An http(s) link to the product photo." />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Create product'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

interface SelectFieldProps {
  control: Control<ProductFormInput, unknown, ProductFormValues>;
  name: FieldPath<ProductFormInput>;
  label: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  /** The option that stands for the form's empty string. */
  emptyValue?: string;
}

function SelectField({ control, name, label, placeholder, options, emptyValue }: SelectFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select
            value={field.value === '' ? emptyValue ?? '' : String(field.value)}
            onValueChange={(value: string) => field.onChange(value === emptyValue ? '' : value)}
          >
            <FormControl>
              <SelectTrigger className="w-full" onBlur={field.onBlur}>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
