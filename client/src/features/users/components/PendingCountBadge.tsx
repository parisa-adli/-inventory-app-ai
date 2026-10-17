import { badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { usePendingCount } from '../hooks/useUsers';

/** How many accounts await approval; renders nothing at 0, while loading, or without `USERS_MANAGE`. */
export function PendingCountBadge({ className }: { className?: string }) {
  const { data: count } = usePendingCount();
  if (!count) return null;

  // A span, not <Badge> (a div): it sits inside the Pending tab's button
  return (
    <span className={cn(badgeVariants(), 'min-w-5 justify-center px-1.5 py-0 leading-5 hover:bg-primary', className)}>
      {count}
      <span className="sr-only"> awaiting approval</span>
    </span>
  );
}
