import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export const GRID_CLASS = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

export function CatalogGridSkeleton() {
  return (
    <div className={GRID_CLASS} role="status" aria-label="Loading">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

export function CatalogGridMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">{children}</div>
  );
}
