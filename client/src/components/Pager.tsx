import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@inventory/shared';
import { Button } from '@/components/ui/button';

/** "Showing 1–12 of 30" on the left, Previous · Page N of M · Next on the right (DESIGN.md §5). */
export function Pager({ meta, onPage }: { meta: PageMeta; onPage: (page: number) => void }) {
  const { page, limit, total, totalPages } = meta;
  if (total === 0) return null;
  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row">
      <span className="text-muted-foreground">
        Showing {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
