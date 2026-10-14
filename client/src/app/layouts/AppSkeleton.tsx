import { Skeleton } from '@/components/ui/skeleton';

/**
 * Shown on a cold load while the first session check runs. Deliberately neutral: no navigation
 * labels and no account data, so a guest never sees the shell before being sent to /login.
 */
export default function AppSkeleton() {
  return (
    <div className="flex min-h-screen bg-background" role="status" aria-label="Loading">
      <div className="hidden w-64 shrink-0 border-r bg-muted/40 p-4 md:block">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center justify-end border-b px-4">
          <Skeleton className="size-8 rounded-full" />
        </div>
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
