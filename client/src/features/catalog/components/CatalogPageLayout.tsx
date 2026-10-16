import { useEffect, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { Paginated, Permission } from '@inventory/shared';
import { Can } from '@/features/auth/components/Can';
import { Button } from '@/components/ui/button';
import { useCatalogSearchParams } from '../hooks/useCatalogSearchParams';
import { CatalogGridMessage, CatalogGridSkeleton, GRID_CLASS } from './CatalogGridStates';
import { CatalogToolbar } from './CatalogToolbar';
import { Pager } from './Pager';

interface CatalogPageLayoutProps<T> {
  title: string;
  subtitle: string;
  /** e.g. "categories": used in the empty and error messages. */
  plural: string;
  searchPlaceholder: string;
  /** Shows the "Add …" button. */
  writePermission: Permission;
  createLabel: string;
  onCreate: () => void;
  list: ReturnType<typeof useCatalogSearchParams>;
  query: UseQueryResult<Paginated<T>>;
  renderItem: (item: T) => ReactNode;
  /** Dialogs (create/edit, delete). */
  children?: ReactNode;
}

/** The Categories / Suppliers page: header, search + sort, card grid (12 a page) and pager, all in the URL. */
export function CatalogPageLayout<T>({
  title,
  subtitle,
  plural,
  searchPlaceholder,
  writePermission,
  createLabel,
  onCreate,
  list,
  query,
  renderItem,
  children,
}: CatalogPageLayoutProps<T>) {
  const { data } = query;
  const { page, setPage } = list;

  // A delete or a stale link left us past the last page: go to the last one that exists
  useEffect(() => {
    if (data && !query.isPlaceholderData && page > data.totalPages) setPage(data.totalPages, { replace: true });
  }, [data, query.isPlaceholderData, page, setPage]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Can permission={writePermission}>
          <Button onClick={onCreate}>
            <Plus className="size-4" />
            {createLabel}
          </Button>
        </Can>
      </div>

      <CatalogToolbar
        search={list.search}
        onSearch={list.setSearch}
        sortPreset={list.sortPreset}
        onSortPreset={list.setSortPreset}
        searchPlaceholder={searchPlaceholder}
      />

      {query.isPending && <CatalogGridSkeleton />}
      {query.isError && !data && (
        <CatalogGridMessage>
          <span role="alert">Could not load {plural}. </span>
          <button className="text-foreground underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </CatalogGridMessage>
      )}
      {data && data.items.length === 0 && (
        <CatalogGridMessage>
          {list.search ? `No ${plural} match “${list.search}”.` : `No ${plural} yet.`}
        </CatalogGridMessage>
      )}
      {data && data.items.length > 0 && (
        <>
          <div className={GRID_CLASS}>{data.items.map(renderItem)}</div>
          <Pager meta={data} onPage={(next) => setPage(next)} />
        </>
      )}

      {children}
    </div>
  );
}
