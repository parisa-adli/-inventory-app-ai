import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CatalogListParams, Paginated } from '@inventory/shared';
import api from '@/lib/axios';
import { getApiError } from '@/lib/apiError';

interface CatalogResource<TItem> {
  /** API path under /api and the query-key root: 'categories' or 'suppliers'. */
  resource: string;
  /** The record's display name, for toasts. */
  nameOf: (record: TItem) => string;
}

/**
 * Query + mutation hooks for a catalog record (categories, suppliers). Every mutation toasts and
 * invalidates the whole resource, so every page, search and sort refetches.
 */
export const createCatalogHooks = <TRecord, TListItem extends TRecord, TCreate, TUpdate>({
  resource,
  nameOf,
}: CatalogResource<TRecord>) => {
  const keys = {
    all: [resource] as const,
    list: (params: CatalogListParams) => [resource, 'list', params] as const,
  };

  const useList = (params: CatalogListParams) =>
    useQuery({
      queryKey: keys.list(params),
      queryFn: async () => (await api.get<Paginated<TListItem>>(`/${resource}`, { params })).data,
      placeholderData: keepPreviousData,
    });

  const useInvalidate = () => {
    const queryClient = useQueryClient();
    return () => queryClient.invalidateQueries({ queryKey: keys.all });
  };

  const useCreate = () => {
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: async (body: TCreate) => (await api.post<TRecord>(`/${resource}`, body)).data,
      onSuccess: (record) => {
        toast.success(`${nameOf(record)} was created`);
        return invalidate();
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  const useUpdate = () => {
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: async ({ id, body }: { id: string; body: TUpdate }) =>
        (await api.patch<TRecord>(`/${resource}/${id}`, body)).data,
      onSuccess: (record) => {
        toast.success(`${nameOf(record)} was saved`);
        return invalidate();
      },
      onError: (err) => toast.error(getApiError(err).message),
    });
  };

  const useDelete = () => {
    const invalidate = useInvalidate();
    return useMutation({
      mutationFn: async (record: TRecord & { id: string }) => {
        await api.delete(`/${resource}/${record.id}`);
        return record;
      },
      onSuccess: (record) => toast.success(`${nameOf(record)} was deleted`),
      onError: (err) => toast.error(getApiError(err).message),
      // Also on error: a 409 or 404 means the list on screen was stale
      onSettled: () => invalidate(),
    });
  };

  return { keys, useList, useCreate, useUpdate, useDelete };
};

/** Create body: empty optional inputs are left out. */
export const toCreateBody = <T extends Record<string, string>>(values: T) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '')) as Partial<T>;

/** PATCH body: an emptied optional input is sent as null, which clears it on the server. */
export const toUpdateBody = <T extends Record<string, string>>(values: T) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value])) as {
    [K in keyof T]: T[K] | null;
  };
