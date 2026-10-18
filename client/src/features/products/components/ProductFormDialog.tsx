import { useState, type ReactNode } from 'react';
import { useForm, type Control, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import {
  PERMISSIONS,
  UNITS_OF_MEASURE,
  productFormSchema,
  type CreateProductInput,
  type Product,
  type ProductFormInput,
  type ProductFormValues,
  type UnitOfMeasure,
  type UpdateProductInput,
} from '@inventory/shared';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiError } from '@/lib/apiError';
import { Can } from '@/features/auth/components/Can';
import { CategoryFormDialog } from '@/features/categories/components/CategoryFormDialog';
import { useCategories } from '@/features/categories/hooks/useCategories';
import { SupplierFormDialog } from '@/features/suppliers/components/SupplierFormDialog';
import { useSuppliers } from '@/features/suppliers/hooks/useSuppliers';
import { useCreateProduct, useUpdateProduct } from '../hooks/useProducts';

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

/** The product's current values, as the inputs hold them. */
const toFormInput = (product: Product): ProductFormInput => ({
  title: product.title,
  sku: product.sku,
  category: product.category.id,
  supplier: product.supplier?.id ?? '',
  costPrice: String(product.costPrice),
  salePrice: String(product.salePrice),
  unitOfMeasure: product.unitOfMeasure,
  imageUrl: product.imageUrl ?? '',
});

/** Create body: no quantity (every product starts at 0); empty optional inputs are left out. */
const toCreateBody = ({ supplier, imageUrl, ...values }: ProductFormValues): CreateProductInput => ({
  ...values,
  ...(supplier && { supplier }),
  ...(imageUrl && { imageUrl }),
});

/** PATCH body: every field, an emptied supplier or image URL as null (clears it). Never a quantity. */
const toUpdateBody = ({ supplier, imageUrl, ...values }: ProductFormValues): UpdateProductInput => ({
  ...values,
  supplier: supplier || null,
  imageUrl: imageUrl || null,
});

interface Option {
  value: string;
  label: string;
}

/** The first 100 records by name, plus the selected one when it is not among them (or not refetched yet). */
const includeSelected = (options: Option[], extra: Option | null) =>
  extra && !options.some((option) => option.value === extra.value) ? [...options, extra] : options;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this product; create a new one when absent. */
  product?: Product | null;
}

/** Create or edit a product. Stock is never entered here: it changes only through a recorded movement. */
export function ProductFormDialog({ open, onOpenChange, product }: ProductFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* Keyed so reopening for another product starts from its values */}
        {open && <ProductForm key={product?.id ?? 'new'} product={product} onDone={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ product, onDone }: { product?: Product | null; onDone: (open: boolean) => void }) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const categories = useCategories(PICKER_PARAMS);
  const suppliers = useSuppliers(PICKER_PARAMS);
  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    mode: 'onTouched',
    defaultValues: product ? toFormInput(product) : EMPTY,
  });
  const isPending = create.isPending || update.isPending;
  // The record a select shows beyond the fetched list: the product's own, or one just made with "+ New"
  const [extraCategory, setExtraCategory] = useState<Option | null>(
    product ? { value: product.category.id, label: product.category.name } : null
  );
  const [extraSupplier, setExtraSupplier] = useState<Option | null>(
    product?.supplier ? { value: product.supplier.id, label: product.supplier.name } : null
  );
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSupplier, setCreatingSupplier] = useState(false);

  const pickCreated = (field: 'category' | 'supplier', option: Option) => {
    (field === 'category' ? setExtraCategory : setExtraSupplier)(option);
    form.setValue(field, option.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

  const submit = async (values: ProductFormValues) => {
    try {
      if (product) await update.mutateAsync({ id: product.id, body: toUpdateBody(values) });
      else await create.mutateAsync(toCreateBody(values));
      onDone(false);
    } catch (err) {
      // The mutation already toasted; a duplicate also goes on the field
      const { code, message } = getApiError(err);
      if (code === 'DUPLICATE_SKU') form.setError('sku', { message });
    }
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{product ? 'Edit product' : 'New product'}</DialogTitle>
            <DialogDescription>
              {product
                ? 'Stock is not edited here: use Adjust stock to receive, ship or correct it.'
                : 'Products start with 0 in stock. Receive stock once the product exists.'}
            </DialogDescription>
          </DialogHeader>
          <TextField control={form.control} name="title" label="Title" />
          <TextField control={form.control} name="sku" label="SKU" hint="Letters, digits and dashes. Saved in capitals." />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              control={form.control}
              name="category"
              label="Category"
              placeholder={categories.isPending ? 'Loading…' : 'Choose a category'}
              options={includeSelected(
                (categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.title })),
                extraCategory
              )}
              labelAction={
                <Can permission={PERMISSIONS.CATEGORIES_WRITE}>
                  <NewButton onClick={() => setCreatingCategory(true)}>New category</NewButton>
                </Can>
              }
            />
            <SelectField
              control={form.control}
              name="supplier"
              label="Supplier (optional)"
              placeholder="No supplier"
              options={[
                { value: NO_SUPPLIER, label: 'No supplier' },
                ...includeSelected(
                  (suppliers.data?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
                  extraSupplier
                ),
              ]}
              emptyValue={NO_SUPPLIER}
              labelAction={
                <Can permission={PERMISSIONS.SUPPLIERS_WRITE}>
                  <NewButton onClick={() => setCreatingSupplier(true)}>New supplier</NewButton>
                </Can>
              }
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
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : product ? 'Save' : 'Create product'}
            </Button>
          </DialogFooter>
        </form>
      </Form>
      {/* Outside the <form>: React bubbles a submit through portals, which would also submit the product */}
      <CategoryFormDialog
        open={creatingCategory}
        onOpenChange={setCreatingCategory}
        onSaved={(category) => pickCreated('category', { value: category.id, label: category.title })}
      />
      <SupplierFormDialog
        open={creatingSupplier}
        onOpenChange={setCreatingSupplier}
        onSaved={(supplier) => pickCreated('supplier', { value: supplier.id, label: supplier.name })}
      />
    </>
  );
}

function NewButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onClick}>
      <Plus className="size-3" />
      {children}
    </Button>
  );
}

interface SelectFieldProps {
  control: Control<ProductFormInput, unknown, ProductFormValues>;
  name: FieldPath<ProductFormInput>;
  label: string;
  placeholder?: string;
  options: Option[];
  /** The option that stands for the form's empty string. */
  emptyValue?: string;
  /** Shown on the right of the label row, e.g. "+ New category". */
  labelAction?: ReactNode;
}

function SelectField({ control, name, label, placeholder, options, emptyValue, labelAction }: SelectFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-2">
            <FormLabel>{label}</FormLabel>
            {labelAction}
          </div>
          <Select
            value={field.value === '' ? emptyValue ?? '' : String(field.value)}
            onValueChange={(value: string) => {
              // No item has the value '': it comes from Radix's hidden native select when the value is set
              // (e.g. by "+ New category") one render before its option exists, and would wipe the choice
              if (value !== '') field.onChange(value === emptyValue ? '' : value);
            }}
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
