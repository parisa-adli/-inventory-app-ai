import { useState } from 'react';
import { PERMISSIONS, type Category } from '@inventory/shared';
import { CatalogCard } from '@/features/catalog/components/CatalogCard';
import { CatalogPageLayout } from '@/features/catalog/components/CatalogPageLayout';
import { DeleteRecordDialog } from '@/features/catalog/components/DeleteRecordDialog';
import { useCatalogSearchParams } from '@/features/catalog/hooks/useCatalogSearchParams';
import { CategoryFormDialog } from '../components/CategoryFormDialog';
import { useCategories, useDeleteCategory } from '../hooks/useCategories';

/** Everyone sees the cards; admins (CATEGORIES_MANAGE) also create, edit and delete. */
export default function Categories() {
  const list = useCatalogSearchParams();
  const query = useCategories(list.params);
  const remove = useDeleteCategory();
  // undefined: closed; null: creating; a category: editing it
  const [editing, setEditing] = useState<Category | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  return (
    <CatalogPageLayout
      title="Categories"
      subtitle="Group products by category. A category in use cannot be deleted."
      plural="categories"
      searchPlaceholder="Search title or description…"
      managePermission={PERMISSIONS.CATEGORIES_MANAGE}
      createLabel="Add category"
      onCreate={() => setEditing(null)}
      list={list}
      query={query}
      renderItem={(category) => (
        <CatalogCard
          key={category.id}
          title={category.title}
          createdAt={category.createdAt}
          productCount={category.productCount}
          managePermission={PERMISSIONS.CATEGORIES_MANAGE}
          onEdit={() => setEditing(category)}
          onDelete={() => setToDelete(category)}
        >
          {category.description ? (
            <p className="line-clamp-3 text-muted-foreground">{category.description}</p>
          ) : (
            <p className="text-muted-foreground italic">No description</p>
          )}
        </CatalogCard>
      )}
    >
      <CategoryFormDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        category={editing}
      />
      <DeleteRecordDialog
        record={toDelete && { id: toDelete.id, name: toDelete.title }}
        kind="category"
        inUseCode="CATEGORY_IN_USE"
        onConfirm={() => remove.mutateAsync(toDelete!)}
        isPending={remove.isPending}
        onClose={() => setToDelete(null)}
      />
    </CatalogPageLayout>
  );
}
