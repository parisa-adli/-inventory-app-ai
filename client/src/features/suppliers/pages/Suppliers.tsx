import { useState, type ReactNode } from 'react';
import { Mail, MapPin, Phone, UserRound } from 'lucide-react';
import { PERMISSIONS, type Supplier } from '@inventory/shared';
import { CatalogCard } from '@/features/catalog/components/CatalogCard';
import { CatalogPageLayout } from '@/features/catalog/components/CatalogPageLayout';
import { DeleteRecordDialog } from '@/features/catalog/components/DeleteRecordDialog';
import { useCatalogSearchParams } from '@/features/catalog/hooks/useCatalogSearchParams';
import { SupplierFormDialog } from '../components/SupplierFormDialog';
import { useDeleteSupplier, useSuppliers } from '../hooks/useSuppliers';

function Detail({ icon: Icon, children }: { icon: typeof Mail; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** Everyone sees the cards; staff and admins create and edit (SUPPLIERS_WRITE); admins also delete (SUPPLIERS_DELETE). */
export default function Suppliers() {
  const list = useCatalogSearchParams();
  const query = useSuppliers(list.params);
  const remove = useDeleteSupplier();
  // undefined: closed; null: creating; a supplier: editing it
  const [editing, setEditing] = useState<Supplier | null | undefined>(undefined);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);

  return (
    <CatalogPageLayout
      title="Suppliers"
      subtitle="Who you buy from. A supplier in use cannot be deleted."
      plural="suppliers"
      searchPlaceholder="Search name, contact person or email…"
      writePermission={PERMISSIONS.SUPPLIERS_WRITE}
      createLabel="Add supplier"
      onCreate={() => setEditing(null)}
      list={list}
      query={query}
      renderItem={(supplier) => (
        <CatalogCard
          key={supplier.id}
          title={supplier.name}
          createdAt={supplier.createdAt}
          productCount={supplier.productCount}
          writePermission={PERMISSIONS.SUPPLIERS_WRITE}
          deletePermission={PERMISSIONS.SUPPLIERS_DELETE}
          onEdit={() => setEditing(supplier)}
          onDelete={() => setToDelete(supplier)}
        >
          {supplier.contactPerson && <Detail icon={UserRound}>{supplier.contactPerson}</Detail>}
          {supplier.phone && (
            <Detail icon={Phone}>
              <a className="hover:underline" href={`tel:${supplier.phone.replace(/[^\d+]/g, '')}`}>
                {supplier.phone}
              </a>
            </Detail>
          )}
          {supplier.email && (
            <Detail icon={Mail}>
              <a className="hover:underline" href={`mailto:${supplier.email}`}>
                {supplier.email}
              </a>
            </Detail>
          )}
          {supplier.address && <Detail icon={MapPin}>{supplier.address}</Detail>}
          {supplier.notes && <p className="line-clamp-3 pt-1 text-muted-foreground">{supplier.notes}</p>}
        </CatalogCard>
      )}
    >
      <SupplierFormDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        supplier={editing}
      />
      <DeleteRecordDialog
        record={toDelete && { id: toDelete.id, name: toDelete.name }}
        kind="supplier"
        inUseCode="SUPPLIER_IN_USE"
        onConfirm={() => remove.mutateAsync(toDelete!)}
        isPending={remove.isPending}
        onClose={() => setToDelete(null)}
      />
    </CatalogPageLayout>
  );
}
