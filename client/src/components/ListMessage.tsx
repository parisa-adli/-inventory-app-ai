import type { ReactNode } from 'react';

/** The empty and error state of a list page: muted text centered in a bordered box (DESIGN.md §5). */
export function ListMessage({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">{children}</div>;
}
