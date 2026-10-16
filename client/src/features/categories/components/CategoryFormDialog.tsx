import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { categoryFormSchema, type Category, type CategoryFormValues } from '@inventory/shared';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { getApiError } from '@/lib/apiError';
import { toCreateBody, toUpdateBody } from '@/features/catalog/hooks/createCatalogHooks';
import { useCreateCategory, useUpdateCategory } from '../hooks/useCategories';

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this category; create a new one when absent. */
  category?: Category | null;
  /** Called with the saved category, e.g. to select it in the product form (P3). */
  onSaved?: (category: Category) => void;
}

/** Create or edit a category. The one save + validation path, reused by the product form in P3. */
export function CategoryFormDialog({ open, onOpenChange, category, onSaved }: CategoryFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed so reopening for another category starts from its values */}
        {open && (
          <CategoryForm key={category?.id ?? 'new'} category={category} onDone={onOpenChange} onSaved={onSaved} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  onDone,
  onSaved,
}: {
  category?: Category | null;
  onDone: (open: boolean) => void;
  onSaved?: (category: Category) => void;
}) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    mode: 'onTouched',
    defaultValues: { title: category?.title ?? '', description: category?.description ?? '' },
  });
  const isPending = create.isPending || update.isPending;

  const submit = async (values: CategoryFormValues) => {
    try {
      const saved = category
        ? await update.mutateAsync({ id: category.id, body: { ...toUpdateBody(values), title: values.title } })
        : await create.mutateAsync({ ...toCreateBody(values), title: values.title });
      onSaved?.(saved);
      onDone(false);
    } catch (err) {
      // The mutation already toasted; a duplicate also goes on the field
      const { code, message } = getApiError(err);
      if (code === 'DUPLICATE_CATEGORY') form.setError('title', { message });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>Products are grouped by category. Titles must be unique.</DialogDescription>
        </DialogHeader>
        <TextField control={form.control} name="title" label="Title" />
        <TextField control={form.control} name="description" label="Description" multiline />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving…' : category ? 'Save' : 'Create category'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
