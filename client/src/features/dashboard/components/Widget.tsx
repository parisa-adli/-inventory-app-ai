import { useId, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** A dashboard widget: a bordered card named by its title, with an optional muted line and a control on the right. */
export function Widget({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A widget's own error: what failed and a Retry that refetches only that widget (the others keep rendering). */
export function WidgetError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center text-sm text-muted-foreground">
      Could not load {what}.
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw aria-hidden />
        Retry
      </Button>
    </div>
  );
}

/** A widget's empty text: muted, centered (DESIGN.md §5). */
export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
